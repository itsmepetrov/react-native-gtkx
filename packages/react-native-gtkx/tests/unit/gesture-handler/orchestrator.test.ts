// Cross-gesture arbitration — several REAL recognizers, one REAL responder
// system, and one arbitration loop between them.
//
// Nothing here is mocked but the widget tree. `createResponderSystem` is the
// shipped one, driven through a fake host hierarchy exactly as
// tests/unit/responder/system.test.ts does it, and every gesture is built by
// the public spelling an app would write. That matters more here than
// anywhere else in this module: the claim slice 3 has to defend is that TWO
// locks coexist — a JS registry that can hold several gestures active, over a
// responder lock that is single-holder and stays that way — and a faked
// responder system could be made to agree with any implementation.
//
// The pointer-injection half of the same claims is
// tests/gtk/gesture-handler/gesture-relations.gtk.test.tsx.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Gesture } from "../../../src/gesture-handler-compat/builder"
import { prepareGestures } from "../../../src/gesture-handler-compat/composition"
import { DECIDERS } from "../../../src/gesture-handler-compat/deciders"
import { usePanGesture } from "../../../src/gesture-handler-compat/hooks"
import {
  createOrchestrator,
  type Orchestrator,
} from "../../../src/gesture-handler-compat/orchestrator"
import { createRecognizer } from "../../../src/gesture-handler-compat/recognizer"
import { bindGestureTag } from "../../../src/gesture-handler-compat/relations"
import {
  mintHandlerTag,
  type AnyGestureSpec,
  type GestureSpec,
} from "../../../src/gesture-handler-compat/types"
import { createResponderSystem } from "../../../src/responder/system"
import type { NativeTouch } from "../../../src/responder/types"

type Host = { name: string }

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

/** Both views overlap: nested boxes, which is the shape every relation is for. */
const BOUNDS = { x: 0, y: 0, width: 400, height: 400 }
const CX = 200
const CY = 200

type Mounted = {
  host: Host
  tags: number[]
  trace: string[]
}

/**
 * A tree of hosts with `GestureDetector`s on them, minus React and minus GTK.
 *
 * `outer` is an ancestor of `inner`, which is the arrangement every real
 * cross-component relation has: `@gorhom/bottom-sheet`'s pan and the
 * scrollable inside it, a draggable row inside a list. Two SIBLINGS never see
 * the same pointer, so a relation between them has nothing to arbitrate — see
 * the islands tests at the bottom.
 */
const createStage = () => {
  const root: Host = { name: "root" }
  const outer: Host = { name: "outer" }
  const inner: Host = { name: "inner" }
  // A second `Root`: a host whose parent chain reaches nothing this
  // interaction travels through. `NestedRoot`/`IntrinsicRoot` mount an RN
  // engine into an arbitrary GTK slot, so this is not a hypothetical.
  const island: Host = { name: "island" }
  const parents = new Map<object, object | null>([
    [inner, outer],
    [outer, root],
    [root, null],
    [island, null],
  ])
  const onClaim = vi.fn()
  const system = createResponderSystem({
    parentOf: (host) => parents.get(host) ?? null,
    onClaim,
  })
  const orchestrator: Orchestrator = createOrchestrator()
  let time = 1000

  /** One `GestureDetector` worth of recognizers on one host. */
  const detector = (host: Host, gesture: AnyGestureSpec): Mounted => {
    const trace: string[] = []
    const prepared = prepareGestures(gesture)
    const recognizers = prepared.map((entry) => {
      const tag = mintHandlerTag()
      // Identity across components: the app's gesture object points at the tag
      // this mount minted, and every relation naming that object resolves
      // through here.
      bindGestureTag(entry.spec, tag)
      orchestrator.relations.configure(tag, entry.relations)
      return {
        tag,
        recognizer: createRecognizer(
          tag,
          DECIDERS[entry.spec.kind],
          () => entry.spec.config,
          {
            boundsInWindow: () => BOUNDS,
            requestResponder: () => system.requestResponder(host),
            orchestrator,
          },
        ),
      }
    })
    // The detector's trampolines: every recognizer on the host sees every
    // prop, and either one saying yes to a predicate is a yes.
    const handlers: Record<string, (event: never) => boolean | void> = {}
    for (const name of Object.keys(recognizers[0]!.recognizer.handlers)) {
      handlers[name] = (event: never) => {
        let wanted = false
        for (const { recognizer } of recognizers) {
          if (recognizer.handlers[name]?.(event) === true) {
            wanted = true
          }
        }
        return wanted
      }
    }
    system.register(host, () => handlers)
    return { host, tags: recognizers.map((one) => one.tag), trace }
  }

  const at = (x: number, y: number) => touchAt(x, y, time)

  return {
    root,
    outer,
    inner,
    island,
    system,
    orchestrator,
    onClaim,
    detector,
    /** Presses on the INNER host, which is what GTK's bubble chain produces. */
    press: (x = CX, y = CY) => {
      system.touchStart(inner, at(x, y))
    },
    moveTo: (x: number, y: number, stepMs = 16) => {
      time += stepMs
      system.touchMove(inner, at(x, y))
    },
    release: (x: number, y: number) => {
      time += 16
      system.touchEnd(inner, at(x, y))
    },
    holder: () => system.getResponder(),
  }
}

/** A pan wired to push its lifecycle into one array, in the builder spelling. */
const tracePan = (label: string, trace: string[]) =>
  Gesture.Pan()
    .onBegin(() => trace.push(`${label}:begin`))
    .onStart(() => trace.push(`${label}:start`))
    .onUpdate((event) => trace.push(`${label}:update(${event.translationY})`))
    .onEnd((_event, success) => trace.push(`${label}:end(${success})`))
    .onFinalize((_event, success) =>
      trace.push(`${label}:finalize(${success})`),
    )

beforeEach(() => {
  vi.useFakeTimers()
  return () => {
    vi.useRealTimers()
  }
})

describe("requireExternalGestureToFail", () => {
  it("holds the waiter in BEGAN, holding nothing, until the other fails", () => {
    const trace: string[] = []
    const stage = createStage()
    // The ancestor fails once the drag has gone far enough down; the
    // descendant is written to wait for exactly that.
    const scroller = tracePan("scroller", trace)
      .activeOffsetX([-10, 10])
      .failOffsetY([-25, 25])
    const sheet = tracePan("sheet", trace)
      .activeOffsetY([-10, 10])
      .requireExternalGestureToFail(scroller)

    stage.detector(stage.outer, scroller)
    const mounted = stage.detector(stage.inner, sheet)

    stage.press()
    // Bubble order is target-to-root, so the descendant is told first.
    expect(trace).toEqual(["sheet:begin", "scroller:begin"])

    // 15px down: the sheet's own criterion is met and the scroller's failure
    // bound is not. THE ASSERTION OF THE SLICE — the sheet is held in BEGAN,
    // it did not start, and it took nothing.
    stage.moveTo(CX, CY + 15)
    expect(trace).toEqual(["sheet:begin", "scroller:begin"])
    expect(stage.holder()).toBeNull()
    expect(stage.onClaim).not.toHaveBeenCalled()
    expect(stage.orchestrator.activeTags()).toEqual([])

    // 40px down: past the scroller's failOffsetY. It fails, and the sheet is
    // released by that failure in the same event.
    stage.moveTo(CX, CY + 40)
    expect(trace).toContain("scroller:finalize(false)")
    expect(trace).toContain("sheet:start")
    expect(stage.holder()).toBe(stage.inner)
    expect(stage.orchestrator.activeTags()).toEqual(mounted.tags)

    stage.moveTo(CX, CY + 70)
    stage.release(CX, CY + 70)
    expect(trace).toContain("sheet:end(true)")
  })

  it("cancels the waiter when the other one ENDS rather than fails", () => {
    // Rule 4's other half: FAILED releases the waiter, END cancels it. The
    // thing it was deferring to actually happened, so its turn never comes.
    const trace: string[] = []
    const stage = createStage()
    const first = tracePan("first", trace).activeOffsetY([-10, 10])
    const second = tracePan("second", trace)
      .activeOffsetY([-10, 10])
      .requireExternalGestureToFail(first)

    stage.detector(stage.outer, first)
    stage.detector(stage.inner, second)

    stage.press()
    stage.moveTo(CX, CY + 20)
    // `first` won it — the outer one is asked second on the bubble, but the
    // inner one is parked, so nothing competes with it.
    expect(trace).toContain("first:start")
    expect(trace).not.toContain("second:start")
    expect(stage.holder()).toBe(stage.outer)

    stage.release(CX, CY + 20)
    expect(trace).toContain("first:end(true)")
    expect(trace).toContain("second:finalize(false)")
    expect(trace).not.toContain("second:start")
  })

  it("does not wait for a gesture in another Root", () => {
    // THE ISLANDS ANSWER, at unit scale, and it is the reason gestures are
    // recorded on the PRESS rather than on mount. The relation is expressible
    // — the maps hold it, and it resolves to a real mounted tag — and it
    // simply never has an occasion to apply, because a gesture in another
    // `Root` is never live in this interaction. Recording on mount would have
    // made this exact line a permanent deadlock: a sheet that waits for a
    // gesture on another island, for ever.
    const trace: string[] = []
    const stage = createStage()
    const elsewhere = tracePan("elsewhere", trace)
    const here = tracePan("here", trace)
      .activeOffsetY([-10, 10])
      .requireExternalGestureToFail(elsewhere)

    stage.detector(stage.island, elsewhere)
    stage.detector(stage.inner, here)

    stage.press()
    stage.moveTo(CX, CY + 20)
    expect(trace).toContain("here:start")
    expect(stage.holder()).toBe(stage.inner)
    // And the island heard nothing at all — the negotiation path stops where
    // the widget tree does.
    expect(trace).not.toContain("elsewhere:begin")
  })

  it("arbitrates normally between Roots that nest", () => {
    // The other half of the islands answer. A `NestedRoot` inside another
    // island's view is still one GTK widget chain, so both gestures ARE on
    // one interaction path and the relation behaves exactly as it does inside
    // a single `Root`. Nothing about arbitration is `Root`-scoped; what is
    // scoped is which gestures an interaction can reach.
    const trace: string[] = []
    const stage = createStage()
    const outerIsland = tracePan("outerIsland", trace)
      .activeOffsetX([-10, 10])
      .failOffsetY([-25, 25])
    const innerIsland = tracePan("innerIsland", trace)
      .activeOffsetY([-10, 10])
      .requireExternalGestureToFail(outerIsland)

    stage.detector(stage.outer, outerIsland)
    stage.detector(stage.inner, innerIsland)

    stage.press()
    stage.moveTo(CX, CY + 15)
    expect(trace).not.toContain("innerIsland:start")
    stage.moveTo(CX, CY + 40)
    expect(trace).toContain("innerIsland:start")
  })
})

describe("blocksExternalGesture", () => {
  it("is the same relation, declared from the other end", () => {
    // `a.blocksExternalGesture(b)` and `b.requireExternalGestureToFail(a)` are
    // one relation with two spellings, and the loop reads them as one
    // question. Nobody measured uses this method; it costs a map lookup.
    const trace: string[] = []
    const stage = createStage()
    const blocker = tracePan("blocker", trace)
      .activeOffsetX([-10, 10])
      .failOffsetY([-25, 25])
    const blocked = tracePan("blocked", trace).activeOffsetY([-10, 10])
    blocker.blocksExternalGesture(blocked)

    stage.detector(stage.outer, blocker)
    stage.detector(stage.inner, blocked)

    stage.press()
    stage.moveTo(CX, CY + 15)
    expect(trace).not.toContain("blocked:start")
    expect(stage.holder()).toBeNull()

    stage.moveTo(CX, CY + 40)
    expect(trace).toContain("blocker:finalize(false)")
    expect(trace).toContain("blocked:start")
  })
})

describe("simultaneousWithExternalGesture", () => {
  it("runs two gestures active at once, over a responder lock that stays single-holder", () => {
    // THE TEST THE SLICE EXISTS FOR, and it asserts both halves at once:
    // two gestures genuinely ACTIVE and receiving updates, and exactly one
    // responder, claimed exactly once. If the two locks had been merged into
    // one multi-holder lock, the second assertion is what would have broken —
    // and with it `PanResponder` and every RN-portable app on this platform.
    const trace: string[] = []
    const stage = createStage()
    const sheet = tracePan("sheet", trace).activeOffsetY([-10, 10])
    const content = tracePan("content", trace)
      .activeOffsetY([-10, 10])
      .simultaneousWithExternalGesture(sheet)

    const outerMount = stage.detector(stage.outer, sheet)
    const innerMount = stage.detector(stage.inner, content)

    stage.press()
    stage.moveTo(CX, CY + 20)

    // Both really are ACTIVE.
    expect(trace).toContain("sheet:start")
    expect(trace).toContain("content:start")
    expect(stage.orchestrator.activeTags().sort()).toEqual(
      [...innerMount.tags, ...outerMount.tags].sort(),
    )

    // AND the responder lock is still one holder, claimed once. The inner one
    // won it (bubble reaches the target first); the outer one is ACTIVE
    // without it.
    expect(stage.holder()).toBe(stage.inner)
    expect(stage.onClaim).toHaveBeenCalledTimes(1)

    // Both are driven. The holder reads `onResponderMove`, the other reads
    // `onTouchMove`, and they report the same travel.
    trace.length = 0
    stage.moveTo(CX, CY + 60)
    expect(trace).toContain("sheet:update(40)")
    expect(trace).toContain("content:update(40)")

    // Both end successfully, from two different callbacks.
    trace.length = 0
    stage.release(CX, CY + 60)
    expect(trace).toContain("sheet:end(true)")
    expect(trace).toContain("content:end(true)")
  })

  it("exempts the pair in either direction, declared once", () => {
    const trace: string[] = []
    const stage = createStage()
    const sheet = tracePan("sheet", trace).activeOffsetY([-10, 10])
    const content = tracePan("content", trace).activeOffsetY([-10, 10])
    // Declared on the ANCESTOR this time, naming the descendant.
    sheet.simultaneousWithExternalGesture(content)

    stage.detector(stage.outer, sheet)
    stage.detector(stage.inner, content)

    stage.press()
    stage.moveTo(CX, CY + 20)
    expect(trace).toContain("sheet:start")
    expect(trace).toContain("content:start")
    expect(stage.holder()).toBe(stage.inner)
  })

  it("without the relation, the first to activate cancels the other", () => {
    // Mutual exclusion is the DEFAULT, and this is the control for the test
    // above: the same two gestures, one relation removed.
    const trace: string[] = []
    const stage = createStage()
    const sheet = tracePan("sheet", trace).activeOffsetY([-10, 10])
    const content = tracePan("content", trace).activeOffsetY([-10, 10])

    stage.detector(stage.outer, sheet)
    stage.detector(stage.inner, content)

    stage.press()
    stage.moveTo(CX, CY + 20)
    expect(trace).toContain("content:start")
    expect(trace).not.toContain("sheet:start")
    expect(trace).toContain("sheet:finalize(false)")
    expect(stage.orchestrator.activeTags()).toHaveLength(1)
  })
})

describe("Gesture.Native", () => {
  it("blocks an ordinary gesture from activating while it is active", () => {
    // THE ONE RULE THE RELATION REGISTRY CONTRIBUTES, and the reason `Native`
    // is special rather than just another recognizer: a gesture that is
    // already ACTIVE, or parked, is cancelled by nothing except an active
    // native one — and one that WANTS to activate is refused by it. It was
    // unreachable until `Gesture.Native()` shipped, because nothing else
    // reports `kind === "native"`.
    const trace: string[] = []
    const stage = createStage()
    const scroller = Gesture.Native()
      // A native BUTTON takes the press at once, which is how this gets to be
      // active before anything else has had a chance.
      .shouldActivateOnStart(true)
      .onStart(() => trace.push("scroller:start"))
    const sheet = tracePan("sheet", trace).activeOffsetY([-10, 10])

    stage.detector(stage.inner, scroller)
    stage.detector(stage.outer, sheet)

    stage.press()
    expect(trace).toContain("scroller:start")
    // And it took nothing: a gesture whose meaning is "the native widget is
    // handling this" cannot be the thing that switches the native widget off.
    expect(stage.holder()).toBeNull()
    expect(stage.onClaim).not.toHaveBeenCalled()

    stage.moveTo(CX, CY + 20)
    expect(trace).not.toContain("sheet:start")
    expect(trace).toContain("sheet:finalize(false)")
    expect(stage.holder()).toBeNull()
  })

  it("runs alongside it when the two are declared simultaneous", () => {
    // `@gorhom/bottom-sheet`'s exact configuration: a `Native` around the
    // scrollable, declared simultaneous with the sheet's pan, so the list can
    // scroll while the pan watches for a drag on the handle. Same two
    // gestures as the test above with one relation added.
    const trace: string[] = []
    const stage = createStage()
    const scroller = Gesture.Native()
      .shouldActivateOnStart(true)
      .onStart(() => trace.push("scroller:start"))
    const sheet = tracePan("sheet", trace)
      .activeOffsetY([-10, 10])
      .simultaneousWithExternalGesture(scroller)

    stage.detector(stage.inner, scroller)
    stage.detector(stage.outer, sheet)

    stage.press()
    stage.moveTo(CX, CY + 20)
    expect(trace).toContain("scroller:start")
    expect(trace).toContain("sheet:start")
    // Both active, and the responder is the PAN's alone — the native gesture
    // never asks for it, so the single holder is the one that wanted it.
    expect(stage.orchestrator.activeTags()).toHaveLength(2)
    expect(stage.holder()).toBe(stage.outer)
    expect(stage.onClaim).toHaveBeenCalledTimes(1)
  })
})

describe("the composers are list-builders", () => {
  it("Race adds no relation at all, because racing is the default", () => {
    const pan = Gesture.Pan()
    const tap = Gesture.Tap()
    const prepared = prepareGestures(Gesture.Race(pan, tap))

    expect(prepared.map((entry) => entry.spec)).toEqual([pan, tap])
    for (const entry of prepared) {
      expect(entry.relations).toEqual({
        waitFor: [],
        simultaneousHandlers: [],
        blocksHandlers: [],
      })
    }
  })

  it("Simultaneous is a pairwise fill of one map, and nothing else", () => {
    const a = Gesture.Pan()
    const b = Gesture.Pan()
    const c = Gesture.Pan()
    const prepared = prepareGestures(Gesture.Simultaneous(a, b, c))

    expect(
      prepared.map((entry) => entry.relations.simultaneousHandlers),
    ).toEqual([
      [b, c],
      [a, c],
      [a, b],
    ])
    for (const entry of prepared) {
      expect(entry.relations.waitFor).toEqual([])
      expect(entry.relations.blocksHandlers).toEqual([])
    }
  })

  it("Exclusive is a chain fill of the other map — every group waits for the ones before it", () => {
    const first = Gesture.Tap()
    const second = Gesture.Tap()
    const third = Gesture.Tap()
    const prepared = prepareGestures(Gesture.Exclusive(first, second, third))

    expect(prepared.map((entry) => entry.relations.waitFor)).toEqual([
      [],
      [first],
      [first, second],
    ])
    for (const entry of prepared) {
      expect(entry.relations.simultaneousHandlers).toEqual([])
    }
  })

  it("keeps an Exclusive group exclusive inside a Simultaneous one", () => {
    // The reason `Simultaneous` flattens the OTHER members rather than
    // composing them as units: a nested `Exclusive` must not have its own
    // members made simultaneous with each other, which would undo it.
    const pan = Gesture.Pan()
    const double = Gesture.Tap()
    const single = Gesture.Tap()
    const prepared = prepareGestures(
      Gesture.Simultaneous(pan, Gesture.Exclusive(double, single)),
    )

    const [panEntry, doubleEntry, singleEntry] = prepared
    expect(panEntry!.relations.simultaneousHandlers).toEqual([double, single])
    expect(doubleEntry!.relations.simultaneousHandlers).toEqual([pan])
    expect(singleEntry!.relations.simultaneousHandlers).toEqual([pan])
    // ...and the exclusivity survives.
    expect(doubleEntry!.relations.waitFor).toEqual([])
    expect(singleEntry!.relations.waitFor).toEqual([double])
  })

  it("behaves exactly as the hand-written relation does", () => {
    // The claim in one assertion: a composition and the relation methods it
    // is sugar for produce the same run, because they produce the same maps.
    const run = (compose: boolean) => {
      const trace: string[] = []
      const stage = createStage()
      const sheet = tracePan("sheet", trace).activeOffsetY([-10, 10])
      const content = tracePan("content", trace).activeOffsetY([-10, 10])
      if (compose) {
        stage.detector(stage.outer, Gesture.Simultaneous(sheet, content))
      } else {
        sheet.simultaneousWithExternalGesture(content)
        stage.detector(stage.outer, sheet)
        stage.detector(stage.inner, content)
      }
      stage.press()
      stage.moveTo(CX, CY + 20)
      stage.moveTo(CX, CY + 60)
      stage.release(CX, CY + 60)
      return { trace: trace.sort(), claims: stage.onClaim.mock.calls.length }
    }

    const composed = run(true)
    const written = run(false)
    expect(composed.trace).toEqual(written.trace)
    // And one GTK claim either way, which is the fact the whole design rests
    // on: composition changed which gestures are active, never how many locks.
    expect(composed.claims).toBe(1)
    expect(written.claims).toBe(1)
  })

  it("refuses the same gesture twice in one composition", () => {
    const pan = Gesture.Pan()
    expect(() => Gesture.Simultaneous(pan, pan)).toThrow(
      /can be used only once/,
    )
  })
})

describe("both spellings, one implementation", () => {
  it("reads the hook spelling's relations into the same maps", () => {
    const trace: string[] = []
    const stage = createStage()
    const scroller = tracePan("scroller", trace)
      .activeOffsetX([-10, 10])
      .failOffsetY([-25, 25])
    // The hook spelling of `requireExternalGestureToFail`, with the hook
    // spelling's callback names to match.
    const sheet: GestureSpec = usePanGesture({
      activeOffsetY: [-10, 10],
      requireToFail: scroller,
      onActivate: () => trace.push("sheet:start"),
      onFinalize: (event) => trace.push(`sheet:finalize(${!event.canceled})`),
    })

    stage.detector(stage.outer, scroller)
    stage.detector(stage.inner, sheet)

    stage.press()
    stage.moveTo(CX, CY + 15)
    expect(trace).not.toContain("sheet:start")
    expect(stage.holder()).toBeNull()

    stage.moveTo(CX, CY + 40)
    expect(trace).toContain("sheet:start")
  })

  it("accepts a `withRef` handle in place of the gesture", () => {
    const trace: string[] = []
    const stage = createStage()
    const ref: { current: unknown } = { current: null }
    const scroller = tracePan("scroller", trace)
      .activeOffsetX([-10, 10])
      .failOffsetY([-25, 25])
      .withRef(ref)
    const sheet = tracePan("sheet", trace)
      .activeOffsetY([-10, 10])
      .requireExternalGestureToFail(ref)

    stage.detector(stage.outer, scroller)
    stage.detector(stage.inner, sheet)

    stage.press()
    stage.moveTo(CX, CY + 15)
    expect(trace).not.toContain("sheet:start")
    stage.moveTo(CX, CY + 40)
    expect(trace).toContain("sheet:start")
  })
})

describe("identity", () => {
  it("resolves a relation written before either end was mounted", () => {
    // Relations are resolved on every question rather than once at configure
    // time, because React mounts children before parents: a gesture routinely
    // names one whose detector has not minted a tag yet. Mounting the
    // REFERENCING gesture first is the case that would break a registry that
    // resolved eagerly.
    const trace: string[] = []
    const stage = createStage()
    const scroller = tracePan("scroller", trace)
      .activeOffsetX([-10, 10])
      .failOffsetY([-25, 25])
    const sheet = tracePan("sheet", trace)
      .activeOffsetY([-10, 10])
      .requireExternalGestureToFail(scroller)

    stage.detector(stage.inner, sheet)
    stage.detector(stage.outer, scroller)

    stage.press()
    stage.moveTo(CX, CY + 15)
    expect(trace).not.toContain("sheet:start")
    stage.moveTo(CX, CY + 40)
    expect(trace).toContain("sheet:start")
  })
})
