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

const systemFor = (parents: Map<object, object | null>, onGrant = vi.fn()) =>
  createResponderSystem({
    parentOf: (host) => parents.get(host) ?? null,
    onGrant,
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
    const onGrant = vi.fn()
    const system = systemFor(parents, onGrant)
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
    expect(onGrant).toHaveBeenCalledWith(leaf)
    // The move that granted does not also deliver onResponderMove — the
    // grant is the event.
    expect(onResponderMove).not.toHaveBeenCalled()

    system.touchMove(leaf, touchAt(30, 0, 4))
    expect(onResponderMove).toHaveBeenCalledTimes(1)
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
