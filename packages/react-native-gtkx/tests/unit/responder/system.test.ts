// The responder negotiation, driven without GTK. The whole point of keeping
// system.ts free of @gtkx imports is that this file can run anywhere: the
// capture/bubble order and the grant lifecycle are where responder
// implementations historically go wrong, and they are pure logic.
import { describe, expect, it, vi } from "vitest"
import type { NativeTouch } from "../../../src/components/press-event"
import { createResponderSystem } from "../../../src/responder/system"
import type { ResponderProps } from "../../../src/responder/types"

// A fake host tree: plain objects with an explicit parent map, standing in
// for the GTK widget hierarchy.
type Node = { name: string }

const tree = () => {
  const root: Node = { name: "root" }
  const middle: Node = { name: "middle" }
  const leaf: Node = { name: "leaf" }
  const parents = new Map<object, object | null>([
    [leaf, middle],
    [middle, root],
    [root, null],
  ])
  return { root, middle, leaf, parents }
}

const touchAt = (x: number, y: number, timestamp: number): NativeTouch => ({
  identifier: 0,
  target: 1,
  locationX: x,
  locationY: y,
  pageX: x,
  pageY: y,
  timestamp,
  force: 0,
})

const systemFor = (parents: Map<object, object | null>, onClaim = vi.fn()) =>
  createResponderSystem({
    parentOf: (host) => parents.get(host) ?? null,
    onClaim,
  })

describe("responder negotiation", () => {
  it("grants to the deepest view that claims on bubble", () => {
    const { root, middle, leaf, parents } = tree()
    const system = systemFor(parents)
    const order: string[] = []

    const claiming = (name: string): ResponderProps => ({
      onStartShouldSetResponder: () => {
        order.push(name)
        return true
      },
    })
    system.register(root, () => claiming("root"))
    system.register(middle, () => claiming("middle"))
    system.register(leaf, () => claiming("leaf"))

    system.touchStart(leaf, touchAt(0, 0, 1))

    // Bubble runs deepest first and stops at the first claim: the ancestors
    // are never asked.
    expect(order).toEqual(["leaf"])
    expect(system.getResponder()).toBe(leaf)
  })

  it("lets an ancestor win in the capture phase before any bubble handler", () => {
    const { root, leaf, parents } = tree()
    const system = systemFor(parents)
    const order: string[] = []

    system.register(root, () => ({
      onStartShouldSetResponderCapture: () => {
        order.push("root:capture")
        return true
      },
    }))
    system.register(leaf, () => ({
      onStartShouldSetResponder: () => {
        order.push("leaf:bubble")
        return true
      },
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))

    expect(order).toEqual(["root:capture"])
    expect(system.getResponder()).toBe(root)
  })

  it("runs every capture handler when none of them claims", () => {
    const { root, middle, leaf, parents } = tree()
    const system = systemFor(parents)
    const order: string[] = []

    // PanResponder depends on this: its capture handlers are where
    // gestureState is initialised, so they must run even when nobody claims.
    const passive = (name: string): ResponderProps => ({
      onStartShouldSetResponderCapture: () => {
        order.push(name)
        return false
      },
    })
    system.register(root, () => passive("root"))
    system.register(middle, () => passive("middle"))
    system.register(leaf, () => passive("leaf"))

    system.touchStart(leaf, touchAt(0, 0, 1))

    expect(order).toEqual(["root", "middle", "leaf"])
    expect(system.getResponder()).toBeNull()
  })

  it("grants on move when nothing claimed on press", () => {
    const { leaf, parents } = tree()
    const onClaim = vi.fn()
    const system = systemFor(parents, onClaim)
    const onResponderMove = vi.fn()

    system.register(leaf, () => ({
      onStartShouldSetResponder: () => false,
      onMoveShouldSetResponder: (event) =>
        Math.abs(event.nativeEvent.pageX) > 10,
      onResponderMove,
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    expect(system.getResponder()).toBeNull()

    system.touchMove(leaf, touchAt(4, 0, 2))
    expect(system.getResponder()).toBeNull()

    system.touchMove(leaf, touchAt(20, 0, 3))
    expect(system.getResponder()).toBe(leaf)
    expect(onClaim).toHaveBeenCalledWith(leaf)
    // The move that granted ALSO delivers onResponderMove. RN dispatches
    // start/move to whoever holds the lock after the negotiation, not
    // before it, so the granting event is not swallowed — PanResponder
    // would otherwise lose the first frame of every pan.
    expect(onResponderMove).toHaveBeenCalledTimes(1)

    system.touchMove(leaf, touchAt(30, 0, 4))
    expect(onResponderMove).toHaveBeenCalledTimes(2)
  })

  it("claims on the event source, not on the view that won the responder", () => {
    const { root, middle, leaf, parents } = tree()
    const onClaim = vi.fn()
    const system = systemFor(parents, onClaim)

    system.register(root, () => ({ onMoveShouldSetResponder: () => true }))
    system.register(middle, () => ({}))
    system.register(leaf, () => ({ onStartShouldSetResponder: () => false }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    system.touchMove(leaf, touchAt(20, 0, 2))

    expect(system.getResponder()).toBe(root)
    // What GTK is told is which gesture is carrying the interaction, and
    // that is the leaf's — claiming on the ancestor would deny the sequence
    // on the source underneath it and the drag would go silent.
    expect(onClaim).toHaveBeenCalledTimes(1)
    expect(onClaim).toHaveBeenCalledWith(leaf)
  })

  it("makes the GTK claim once per interaction, not once per grant", () => {
    const { root, leaf, parents } = tree()
    const onClaim = vi.fn()
    const system = systemFor(parents, onClaim)

    system.register(root, () => ({ onMoveShouldSetResponder: () => true }))
    system.register(leaf, () => ({ onStartShouldSetResponder: () => true }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    expect(system.getResponder()).toBe(leaf)
    system.touchMove(leaf, touchAt(20, 0, 2))
    expect(system.getResponder()).toBe(root)

    // Two grants, one claim: a transfer moves a JS lock and has nothing new
    // to tell GTK, whose CLAIMED is irrevocable anyway.
    expect(onClaim).toHaveBeenCalledTimes(1)
  })

  it("runs the grant/start/move/end/release lifecycle in RN's order", () => {
    const { leaf, parents } = tree()
    const system = systemFor(parents)
    const order: string[] = []
    const record = (name: string) => (): void => {
      order.push(name)
    }

    system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
      onResponderGrant: record("grant"),
      onResponderStart: record("start"),
      onResponderMove: record("move"),
      onResponderEnd: record("end"),
      onResponderRelease: record("release"),
      onResponderTerminate: record("terminate"),
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    system.touchMove(leaf, touchAt(5, 0, 2))
    system.touchEnd(leaf, touchAt(5, 0, 3))

    expect(order).toEqual(["grant", "start", "move", "end", "release"])
    expect(system.getResponder()).toBeNull()
  })

  it("terminates rather than releases when GTK cancels the sequence", () => {
    const { leaf, parents } = tree()
    const system = systemFor(parents)
    const onResponderTerminate = vi.fn()
    const onResponderRelease = vi.fn()

    system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
      onResponderTerminate,
      onResponderRelease,
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    system.touchCancel(leaf, touchAt(0, 0, 2))

    expect(onResponderTerminate).toHaveBeenCalledTimes(1)
    expect(onResponderRelease).not.toHaveBeenCalled()
    expect(system.getResponder()).toBeNull()
  })

  it("ignores the same press arriving again from an ancestor's gesture", () => {
    const { root, leaf, parents } = tree()
    const system = systemFor(parents)
    const rootShould = vi.fn(() => true)
    const leafShould = vi.fn(() => false)

    system.register(root, () => ({ onStartShouldSetResponder: rootShould }))
    system.register(leaf, () => ({ onStartShouldSetResponder: leafShould }))

    // GTK's bubble chain delivers one press to every ancestor's gesture in
    // turn. Only the first report may open a session, or the negotiation
    // would run once per level.
    system.touchStart(leaf, touchAt(0, 0, 1))
    system.touchStart(root, touchAt(0, 0, 1))

    expect(leafShould).toHaveBeenCalledTimes(1)
    expect(rootShould).toHaveBeenCalledTimes(1)
    expect(system.getResponder()).toBe(root)
  })

  it("drops the lock when the responder unmounts mid-gesture", () => {
    const { leaf, parents } = tree()
    const system = systemFor(parents)
    const unregister = system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    expect(system.getResponder()).toBe(leaf)

    unregister()
    expect(system.getResponder()).toBeNull()
  })

  it("only walks registered nodes, so native widgets between views are skipped", () => {
    const root: Node = { name: "root" }
    const nativeInBetween: Node = { name: "native" }
    const leaf: Node = { name: "leaf" }
    const parents = new Map<object, object | null>([
      [leaf, nativeInBetween],
      [nativeInBetween, root],
      [root, null],
    ])
    const system = systemFor(parents)
    const rootCapture = vi.fn(() => true)

    // nativeInBetween is deliberately NOT registered — an RN island here can
    // have real GTK widgets in the middle of its own hierarchy.
    system.register(root, () => ({
      onStartShouldSetResponderCapture: rootCapture,
    }))
    system.register(leaf, () => ({ onStartShouldSetResponder: () => true }))

    system.touchStart(leaf, touchAt(0, 0, 1))

    expect(rootCapture).toHaveBeenCalledTimes(1)
    expect(system.getResponder()).toBe(root)
  })
})

// RN's handoff: the interaction lock moves UPWARDS while pointers stay down,
// and only with the holder's consent. The asymmetry is the whole point — a
// scroll container has to be able to take a gesture away from a row it is
// scrolling, and a row must never be able to take one from the scroller.
describe("responder transfer", () => {
  const transferTree = () => {
    const { root, middle, leaf, parents } = tree()
    const events: string[] = []
    const system = systemFor(parents)
    return { root, middle, leaf, parents, events, system }
  }

  it("hands the lock to an ancestor that asks for it mid-gesture", () => {
    const { root, leaf, events, system } = transferTree()

    system.register(root, () => ({
      onMoveShouldSetResponder: (event) => event.nativeEvent.pageX > 15,
      onResponderGrant: () => {
        events.push("root:grant")
      },
      onResponderMove: () => {
        events.push("root:move")
      },
    }))
    system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
      onResponderGrant: () => {
        events.push("leaf:grant")
      },
      onResponderMove: () => {
        events.push("leaf:move")
      },
      onResponderTerminate: () => {
        events.push("leaf:terminate")
      },
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    system.touchMove(leaf, touchAt(5, 0, 2))
    system.touchMove(leaf, touchAt(20, 0, 3))

    expect(system.getResponder()).toBe(root)
    // The order is RN's own documented one: the holder is terminated, the
    // winner is granted, and the event that caused the handoff is then
    // delivered to the new holder.
    expect(events).toEqual([
      "leaf:grant",
      "leaf:move",
      "leaf:terminate",
      "root:grant",
      "root:move",
    ])
  })

  it("leaves the lock alone when the holder refuses to yield", () => {
    const { root, leaf, events, system } = transferTree()

    system.register(root, () => ({
      onMoveShouldSetResponder: () => true,
      onResponderGrant: () => {
        events.push("root:grant")
      },
      onResponderReject: () => {
        events.push("root:reject")
      },
    }))
    system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
      onResponderTerminationRequest: () => false,
      onResponderMove: () => {
        events.push("leaf:move")
      },
      onResponderTerminate: () => {
        events.push("leaf:terminate")
      },
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    system.touchMove(leaf, touchAt(20, 0, 2))

    expect(system.getResponder()).toBe(leaf)
    // The candidate hears "no" and is never granted — react-native-web asks
    // before granting, which is the order RN's own state diagram shows.
    expect(events).toEqual(["root:reject", "leaf:move"])
  })

  it("yields by default: a holder with no termination request always gives way", () => {
    const { root, leaf, system } = transferTree()

    system.register(root, () => ({ onMoveShouldSetResponder: () => true }))
    system.register(leaf, () => ({ onStartShouldSetResponder: () => true }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    system.touchMove(leaf, touchAt(20, 0, 2))

    expect(system.getResponder()).toBe(root)
  })

  it("never lets a descendant take the lock from its ancestor", () => {
    const { root, leaf, system } = transferTree()
    const leafShould = vi.fn(() => true)

    system.register(root, () => ({ onStartShouldSetResponder: () => true }))
    system.register(leaf, () => ({ onMoveShouldSetResponder: leafShould }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    expect(system.getResponder()).toBe(root)

    system.touchMove(leaf, touchAt(20, 0, 2))

    // Pruning the path to the holder's ancestors means the leaf is not even
    // asked. RN's rule is "transferred (only) to ancestors of the current
    // responder"; a descendant is off the path by construction.
    expect(leafShould).not.toHaveBeenCalled()
    expect(system.getResponder()).toBe(root)
  })

  it("never asks the holder whether it wants what it already has", () => {
    const { middle, leaf, system } = transferTree()
    const middleShould = vi.fn(() => true)

    system.register(middle, () => ({
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: middleShould,
      onMoveShouldSetResponderCapture: middleShould,
    }))
    system.register(leaf, () => ({}))

    system.touchStart(leaf, touchAt(0, 0, 1))
    expect(system.getResponder()).toBe(middle)

    system.touchMove(leaf, touchAt(20, 0, 2))

    expect(middleShould).not.toHaveBeenCalled()
    expect(system.getResponder()).toBe(middle)
  })
})

// Everything that ends a gesture without being a pointer event.
describe("responder termination", () => {
  it("terminates on window blur without asking", () => {
    const { leaf, parents } = tree()
    const system = systemFor(parents)
    const onResponderTerminationRequest = vi.fn(() => false)
    const onResponderTerminate = vi.fn()

    system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
      onResponderTerminationRequest,
      onResponderTerminate,
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    expect(system.terminate("blur")).toBe(true)

    // The window is gone whatever the answer would have been, so the
    // question is not asked — react-native-web does not ask on blur either.
    expect(onResponderTerminationRequest).not.toHaveBeenCalled()
    expect(onResponderTerminate).toHaveBeenCalledTimes(1)
    expect(system.getResponder()).toBeNull()
  })

  it("lets the holder refuse an ancestor scroll", () => {
    const { leaf, parents } = tree()
    const system = systemFor(parents)
    const onResponderTerminate = vi.fn()

    system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
      onResponderTerminationRequest: () => false,
      onResponderTerminate,
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))

    expect(system.terminate("scroll")).toBe(false)
    expect(onResponderTerminate).not.toHaveBeenCalled()
    expect(system.getResponder()).toBe(leaf)
  })

  it("terminates on an ancestor scroll the holder does not refuse", () => {
    const { leaf, parents } = tree()
    const system = systemFor(parents)
    const onResponderEnd = vi.fn()
    const onResponderTerminate = vi.fn()

    system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
      onResponderEnd,
      onResponderTerminate,
    }))

    system.touchStart(leaf, touchAt(3, 4, 1))
    expect(system.terminate("scroll")).toBe(true)

    // End pairs with a touch actually ending; a termination that is not a
    // pointer event goes straight to Terminate, as it does in RN.
    expect(onResponderEnd).not.toHaveBeenCalled()
    expect(onResponderTerminate).toHaveBeenCalledTimes(1)
    // The event still carries the last known position — nothing downstream
    // should have to special-case a terminate.
    expect(onResponderTerminate.mock.calls[0]?.[0].nativeEvent.pageX).toBe(3)
  })

  it("does nothing when no view holds the responder", () => {
    const { leaf, parents } = tree()
    const system = systemFor(parents)

    system.register(leaf, () => ({ onStartShouldSetResponder: () => false }))
    system.touchStart(leaf, touchAt(0, 0, 1))

    // A scroll or a focus change with nobody holding the lock is just a
    // scroll or a focus change.
    expect(system.terminate("scroll")).toBe(false)
    expect(system.terminate("blur")).toBe(false)
  })

  it("ends the interaction, so the drag that is still under way is ignored", () => {
    const { leaf, parents } = tree()
    const system = systemFor(parents)
    const onResponderMove = vi.fn()
    const onResponderRelease = vi.fn()

    system.register(leaf, () => ({
      onStartShouldSetResponder: () => true,
      onResponderMove,
      onResponderRelease,
    }))

    system.touchStart(leaf, touchAt(0, 0, 1))
    system.terminate("blur")
    system.touchMove(leaf, touchAt(20, 0, 2))
    system.touchEnd(leaf, touchAt(20, 0, 3))

    expect(onResponderMove).not.toHaveBeenCalled()
    expect(onResponderRelease).not.toHaveBeenCalled()
    expect(system.getSource()).toBeNull()
  })
})
