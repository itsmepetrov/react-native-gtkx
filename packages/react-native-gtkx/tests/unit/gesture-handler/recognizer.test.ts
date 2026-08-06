// The recognizer — all three kinds of it — driven through the REAL responder
// system.
//
// Not a mock of the negotiation: `createResponderSystem` is the shipped one,
// with a fake host tree standing in for the GTK widget hierarchy exactly as
// tests/unit/responder/system.test.ts does it. That matters because the whole
// design rests on the recognizer holding no lock while it decides, and a fake
// responder system could be made to agree with any implementation.
//
// What is NOT covered here, by construction: rendering, real widgets and real
// pointers. That is tests/gtk/gesture-handler/gesture-detector.gtk.test.tsx,
// which drives the same code with an injected `zwlr_virtual_pointer_v1`.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Gesture } from "../../../src/gesture-handler-compat/builder"
import { DECIDERS } from "../../../src/gesture-handler-compat/deciders"
import {
  useFlingGesture,
  useHoverGesture,
  useLongPressGesture,
  useManualGesture,
  usePanGesture,
  useTapGesture,
} from "../../../src/gesture-handler-compat/hooks"
import { longPressDecider } from "../../../src/gesture-handler-compat/long-press"
import { createOrchestrator } from "../../../src/gesture-handler-compat/orchestrator"
import {
  asRange,
  DEFAULT_MIN_DISTANCE,
  effectiveMinDistance,
  panDecider,
} from "../../../src/gesture-handler-compat/pan"
import {
  createRecognizer,
  hitSlopRect,
  type RecognizerDecider,
  type Rect,
} from "../../../src/gesture-handler-compat/recognizer"
import { tapDecider } from "../../../src/gesture-handler-compat/tap"
import { GESTURE_STATE } from "../../../src/gesture-handler-compat/types"
import type {
  GestureKind,
  GestureStateValue,
  RecognizerConfig,
} from "../../../src/gesture-handler-compat/types"
import { createResponderSystem } from "../../../src/responder/system"
import type { NativeTouch } from "../../../src/responder/types"

type Node = { name: string }

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

/** The view the gesture is attached to, in window coordinates. */
const BOUNDS: Rect = { x: 100, y: 100, width: 200, height: 200 }

/**
 * One mounted `GestureDetector`, minus React and minus GTK: the recognizer's
 * handlers registered on a host, and a clock the caller advances by hand.
 */
const mount = (
  config: RecognizerConfig,
  bounds: Rect | null = BOUNDS,
  decider: RecognizerDecider = panDecider,
) => {
  const view: Node = { name: "view" }
  const root: Node = { name: "root" }
  const parents = new Map<object, object | null>([
    [view, root],
    [root, null],
  ])
  const onClaim = vi.fn()
  const system = createResponderSystem({
    parentOf: (host) => parents.get(host) ?? null,
    onClaim,
  })

  let current = config
  // A loop of its own per mount: these tests are about ONE recognizer, and a
  // shared registry would leak the previous test's participants into the next
  // one. tests/unit/gesture-handler/orchestrator.test.ts is where several
  // gestures share one.
  const orchestrator = createOrchestrator()
  const recognizer = createRecognizer(7, decider, () => current, {
    boundsInWindow: () => bounds,
    requestResponder: () => system.requestResponder(view),
    orchestrator,
  })
  system.register(view, () => recognizer.handlers)

  let time = 1000
  const at = (x: number, y: number) => touchAt(x, y, time)

  return {
    view,
    root,
    system,
    onClaim,
    recognizer,
    reconfigure: (next: RecognizerConfig) => {
      current = next
    },
    advance: (ms: number) => {
      time += ms
      vi.advanceTimersByTime(ms)
    },
    press: (x: number, y: number) => {
      system.touchStart(view, at(x, y))
    },
    moveTo: (x: number, y: number, stepMs = 16) => {
      time += stepMs
      system.touchMove(view, at(x, y))
    },
    release: (x: number, y: number) => {
      time += 16
      system.touchEnd(view, at(x, y))
    },
    holder: () => system.getResponder(),
  }
}

/** The centre of BOUNDS, which is where every press below lands. */
const CX = 200
const CY = 200

const tracer = () => {
  const trace: string[] = []
  const config: RecognizerConfig = {
    onBegin: () => trace.push("begin"),
    onActivate: () => trace.push("activate"),
    onUpdate: () => trace.push("update"),
    onDeactivate: (_event, success) => trace.push(`deactivate(${success})`),
    onFinalize: (_event, success) => trace.push(`finalize(${success})`),
  }
  return { trace, config }
}

/** The same rig, with Tap's predicates and Tap's own default. */
const mountTap = (config: RecognizerConfig, bounds: Rect | null = BOUNDS) =>
  mount({ shouldCancelWhenOutside: true, ...config }, bounds, tapDecider)

/** The same rig, with LongPress's predicates and LongPress's own default. */
const mountLongPress = (
  config: RecognizerConfig,
  bounds: Rect | null = BOUNDS,
) =>
  mount({ shouldCancelWhenOutside: true, ...config }, bounds, longPressDecider)

beforeEach(() => {
  vi.useFakeTimers()
})

// `State` is this object, re-exported under upstream's name from the package
// entry. It is referred to HERE by the internal name because loading the entry
// loads the components, and this file deliberately runs without GTK —
// `tests/gtk/gesture-handler/root-view.gtk.test.tsx` pins the export itself,
// under the name and through the import path an app really uses.
const State = GESTURE_STATE

describe("State is upstream's enum, by value", () => {
  // The whole reason this slice touched `State` at all. Two of the four
  // libraries the epic targets compare it BY VALUE, so a number that is
  // silently different is the failure mode: `state === State.ACTIVE` goes on
  // compiling, goes on running, and quietly answers false. Nothing else in
  // this file would catch it.
  //
  // Transcribed from `react-native-gesture-handler` 3.1.0, `src/State.ts`,
  // which is the whole file:
  //
  //   export const State = {
  //     UNDETERMINED: 0, FAILED: 1, BEGAN: 2,
  //     CANCELLED: 3, ACTIVE: 4, END: 5,
  //   } as const
  it("has all six of upstream's members, with upstream's numbers", () => {
    expect(State).toEqual({
      UNDETERMINED: 0,
      FAILED: 1,
      BEGAN: 2,
      CANCELLED: 3,
      ACTIVE: 4,
      END: 5,
    })
    // `toEqual` on an object with extra members would still pass if a member
    // were REMOVED and the expectation edited to match, so the count is pinned
    // separately: six, no more and no fewer.
    expect(Object.keys(State)).toHaveLength(6)
  })

  it("reports the ending state a consumer compares against", () => {
    const states: GestureStateValue[] = []
    const gd = mount({
      onActivate: (event) => states.push(event.state),
      onFinalize: (event) => states.push(event.state),
    })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 40)
    gd.release(CX, CY + 40)
    expect(states).toEqual([State.ACTIVE, State.END])

    const failed: GestureStateValue[] = []
    const other = mountTap({
      maxDistance: 10,
      onFinalize: (event) => failed.push(event.state),
    })
    other.press(CX, CY)
    other.moveTo(CX + 40, CY)
    expect(failed).toEqual([State.FAILED])
  })
})

describe("the recognizer holds no lock while it is deciding", () => {
  it("never takes the responder on press", () => {
    const gd = mount({})
    gd.press(CX, CY)
    expect(gd.holder()).toBeNull()
    // A pan that grabbed the interaction on press could not honour an
    // activeOffset, which is the whole behaviour the offsets exist for.
    expect(gd.onClaim).not.toHaveBeenCalled()
  })

  it("takes it at the instant it activates, and claims GTK exactly once", () => {
    const gd = mount({})
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 4)
    expect(gd.holder()).toBeNull()

    gd.moveTo(CX, CY + DEFAULT_MIN_DISTANCE)
    expect(gd.holder()).toBe(gd.view)
    expect(gd.onClaim).toHaveBeenCalledTimes(1)

    gd.moveTo(CX, CY + 40)
    expect(gd.onClaim).toHaveBeenCalledTimes(1)
  })
})

describe("the four offset knobs", () => {
  it("activeOffsetY holds the gesture BEGAN below the threshold", () => {
    const { trace, config } = tracer()
    const gd = mount({ ...config, activeOffsetY: [-10, 10] })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 6)
    expect(trace).toEqual(["begin"])
    expect(gd.holder()).toBeNull()

    gd.moveTo(CX, CY + 60)
    expect(trace).toContain("activate")
    expect(gd.holder()).toBe(gd.view)
  })

  it("activeOffsetX ignores movement on the other axis entirely", () => {
    const gd = mount({ activeOffsetX: [-10, 10] })
    gd.press(CX, CY)
    // 80px of pure vertical travel: an axis-blind minDistance would have
    // activated four times over by here.
    gd.moveTo(CX, CY + 80)
    expect(gd.holder()).toBeNull()

    gd.moveTo(CX + 20, CY + 80)
    expect(gd.holder()).toBe(gd.view)
  })

  it("a single-number bound is directional, not symmetric", () => {
    expect(asRange(20)).toEqual([-Infinity, 20])
    expect(asRange(-20)).toEqual([-20, Infinity])

    // activeOffsetX(20) bounds the POSITIVE side only, so dragging left is
    // unbounded and never activates. Reading it as ±20 would make a one-way
    // drawer two-way, silently.
    const gd = mount({ activeOffsetX: 20 })
    gd.press(CX, CY)
    gd.moveTo(CX - 90, CY)
    expect(gd.holder()).toBeNull()
    gd.moveTo(CX + 30, CY)
    expect(gd.holder()).toBe(gd.view)
  })

  it("failOffsetX kills the pan, and a later vertical move cannot revive it", () => {
    const { trace, config } = tracer()
    const gd = mount({
      ...config,
      activeOffsetY: [-10, 10],
      failOffsetX: [-20, 20],
    })
    gd.press(CX, CY)
    gd.moveTo(CX + 40, CY)
    expect(trace).toEqual(["begin", "finalize(false)"])

    // The gesture is over. 60px straight down would have activated it.
    gd.moveTo(CX + 40, CY + 60)
    gd.release(CX + 40, CY + 60)
    expect(trace).toEqual(["begin", "finalize(false)"])
    expect(gd.holder()).toBeNull()
  })

  it("failOffset alone does not disable the distance rule", () => {
    // The correction to the spike this module grew out of: it treated any
    // failOffset as a custom activation criterion, which pinned minDistance
    // at infinity and left `Pan().failOffsetY(...)` unable to activate at all.
    expect(effectiveMinDistance({ failOffsetY: [-5, 5] })).toBe(
      DEFAULT_MIN_DISTANCE,
    )
    expect(effectiveMinDistance({ activeOffsetX: 10 })).toBe(Infinity)
    expect(effectiveMinDistance({ minDistance: 3 })).toBe(3)

    const gd = mount({ failOffsetY: [-500, 500] })
    gd.press(CX, CY)
    gd.moveTo(CX + 30, CY)
    expect(gd.holder()).toBe(gd.view)
  })
})

describe("activateAfterLongPress and the out-of-event grant", () => {
  it("refuses a drag that starts immediately", () => {
    const { trace, config } = tracer()
    const gd = mount({ ...config, activateAfterLongPress: 200 })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 30)
    expect(trace).toEqual(["begin", "finalize(false)"])
    expect(gd.holder()).toBeNull()
  })

  it("activates ON THE TIMER, with no pointer event in flight", () => {
    const { trace, config } = tracer()
    const gd = mount({ ...config, activateAfterLongPress: 200 })
    gd.press(CX, CY)
    expect(gd.holder()).toBeNull()

    // The extension under test. Nothing moves; the timer fires; the gesture
    // takes the interaction anyway. Without the out-of-event channel the
    // holder would still be null here and would stay null until the pointer
    // next moved — which for a press-and-hold is never.
    gd.advance(220)
    expect(trace).toEqual(["begin", "activate"])
    expect(gd.holder()).toBe(gd.view)
    expect(gd.onClaim).toHaveBeenCalledTimes(1)
  })

  it("measures translation from the press, because the grant no longer waits for a move", () => {
    const seen: number[] = []
    const gd = mount({
      activateAfterLongPress: 200,
      onUpdate: (event) => seen.push(event.translationY),
    })
    gd.press(CX, CY)
    gd.advance(220)
    gd.moveTo(CX, CY + 40)
    gd.moveTo(CX, CY + 120)

    // The spike this replaced activated on the first move AFTER the timer and
    // so lost that first step — 105 of an injected 120. Granting on the timer
    // puts the activation point ON the press point, and the whole travel
    // arrives.
    expect(seen).toEqual([40, 120])
  })

  it("does not fire after the pointer is already up", () => {
    const { trace, config } = tracer()
    const gd = mount({ ...config, activateAfterLongPress: 200 })
    gd.press(CX, CY)
    gd.release(CX, CY)
    gd.advance(400)
    expect(trace).toEqual(["begin", "finalize(false)"])
    expect(gd.holder()).toBeNull()
  })

  it("treats an explicit 0 as NO hold, which is what upstream's `> 0` means", () => {
    // Upstream's default for the option is the number 0 and both of its
    // implementations guard on `activateAfterLongPress > 0`, so `0` is "drag
    // straight away" rather than "hold for zero milliseconds". Read as the
    // latter, the failure test above kills the gesture on the first real move
    // — which is exactly what `activationDelay={0}` on upstream's own
    // `SortableGrid` asks for (docs/research/dnd-hover-flicker.md §6).
    const { trace, config } = tracer()
    const gd = mount({ ...config, activateAfterLongPress: 0 })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 30)
    expect(trace).toEqual(["begin", "activate"])
    expect(gd.holder()).toBe(gd.view)
  })
})

describe("the callbacks", () => {
  it("fire in upstream's order for a completed drag", () => {
    const { trace, config } = tracer()
    const gd = mount(config)
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 20)
    gd.moveTo(CX, CY + 40)
    gd.moveTo(CX, CY + 60)
    gd.release(CX, CY + 60)

    expect(trace).toEqual([
      "begin",
      "activate",
      "update",
      "update",
      "deactivate(true)",
      "finalize(true)",
    ])
  })

  it("give a gesture that never activated onFinalize and nothing else", () => {
    const { trace, config } = tracer()
    const gd = mount({ ...config, activeOffsetY: [-100, 100] })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 5)
    gd.release(CX, CY + 5)
    // No `deactivate`: that is what lets a consumer distinguish a drag that
    // finished from one that never happened. react-native-reanimated-dnd's
    // useSortable relies on exactly this.
    expect(trace).toEqual(["begin", "finalize(false)"])
  })

  it("report translation from the activation point, not from the press", () => {
    const seen: number[] = []
    const gd = mount({
      activeOffsetY: [-10, 10],
      onUpdate: (event) => seen.push(event.translationY),
    })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 20) // crosses the threshold: this is the activation
    gd.moveTo(CX, CY + 50)
    // A pan reporting 20px the moment it activated would jump the content by
    // the threshold on every single drag.
    expect(seen).toEqual([30])
  })

  it("compute changeX/changeY as the delta of translation, and the first equals it", () => {
    const changes: number[] = []
    const gd = mount({ onChange: (event) => changes.push(event.changeY) })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 10) // activation
    gd.moveTo(CX, CY + 35)
    gd.moveTo(CX, CY + 45)
    expect(changes).toEqual([25, 10])
  })

  it("report x/y relative to the gesture's own view", () => {
    const points: { x: number; y: number }[] = []
    const gd = mount({
      onUpdate: (event) => points.push({ x: event.x, y: event.y }),
    })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 20)
    gd.moveTo(CX + 5, CY + 30)
    // BOUNDS starts at (100, 100), so a pointer at (205, 230) is at (105, 130)
    // inside the view — NOT the locationX the event carried, which is
    // relative to whichever widget the event arrived on.
    expect(points).toEqual([{ x: 105, y: 130 }])
  })

  it("hand onTouchesDown a working state manager", () => {
    const { trace, config } = tracer()
    const gd = mount({
      ...config,
      // Nothing would activate this by movement.
      activeOffsetY: [-1000, 1000],
      onTouchesDown: (_event, manager) => {
        setTimeout(() => manager.activate(), 50)
      },
    })
    gd.press(CX, CY)
    expect(gd.holder()).toBeNull()
    gd.advance(60)
    // Same out-of-event channel, reached from a callback rather than from
    // activateAfterLongPress's own timer.
    expect(trace).toEqual(["begin", "activate"])
    expect(gd.holder()).toBe(gd.view)
  })
})

describe("enabled, pointer counts and bounds", () => {
  it("ignores the press entirely when disabled", () => {
    const { trace, config } = tracer()
    const gd = mount({ ...config, enabled: false })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 60)
    expect(trace).toEqual([])
    expect(gd.holder()).toBeNull()
  })

  it("takes a change of `enabled` without remounting", () => {
    const { trace, config } = tracer()
    const gd = mount({ ...config, enabled: false })
    gd.press(CX, CY)
    expect(trace).toEqual([])

    // The responder system opened a session on that press even though the
    // recognizer refused it — it has no way to know — so the interaction has
    // to end before another can start.
    gd.release(CX, CY)

    // Both spellings rebuild their gesture object every render; the detector
    // reads it through a ref, so a re-render must take effect mid-flight
    // without swapping the handler set.
    gd.reconfigure({ ...config, enabled: true })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 40)
    expect(trace).toEqual(["begin", "activate"])
  })

  it("never activates when minPointers exceeds what this platform can deliver", () => {
    // Honest rather than silently ignored: there is no virtual-touch protocol
    // on wlroots, so the responder system fabricates exactly one touch. A
    // two-finger pan is unreachable, and pretending otherwise would be worse.
    const gd = mount({ minPointers: 2 })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 60)
    expect(gd.holder()).toBeNull()
  })

  it("refuses a press outside the view", () => {
    const { trace, config } = tracer()
    const gd = mount(config)
    gd.press(10, 10)
    expect(trace).toEqual([])
  })

  it("shouldCancelWhenOutside terminates an ACTIVE pan that leaves", () => {
    const { trace, config } = tracer()
    const gd = mount({ ...config, shouldCancelWhenOutside: true })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 20)
    expect(trace).toContain("activate")
    gd.moveTo(CX, CY + 400)
    // No `update` for the move that left: the position is outside the view,
    // and reporting it before cancelling would hand the consumer one frame of
    // travel it is about to be told never counted.
    expect(trace).toEqual([
      "begin",
      "activate",
      "deactivate(false)",
      "finalize(false)",
    ])
  })

  it("keeps an ACTIVE pan that leaves when the flag is off, which is the default", () => {
    const gd = mount({})
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 20)
    gd.moveTo(CX, CY + 400)
    expect(gd.holder()).toBe(gd.view)
  })
})

describe("hitSlop", () => {
  const bounds: Rect = { x: 0, y: 0, width: 100, height: 100 }

  it("grows on a positive number and SHRINKS on a negative one", () => {
    // The capability RN's own View hitSlop does not have.
    expect(hitSlopRect(bounds, 10)).toEqual({
      x: -10,
      y: -10,
      width: 120,
      height: 120,
    })
    expect(hitSlopRect(bounds, -20)).toEqual({
      x: 20,
      y: 20,
      width: 60,
      height: 60,
    })
  })

  it("anchors a width to whichever side was named", () => {
    // react-native-drawer-layout's closed-drawer edge strip, verbatim.
    expect(hitSlopRect(bounds, { left: 0, width: 32 })).toEqual({
      x: 0,
      y: 0,
      width: 32,
      height: 100,
    })
    expect(hitSlopRect(bounds, { right: 0, width: 32 })).toEqual({
      x: 68,
      y: 0,
      width: 32,
      height: 100,
    })
  })

  it("lets an explicit side override horizontal/vertical", () => {
    expect(hitSlopRect(bounds, { horizontal: 5, left: 40 })).toEqual({
      x: -40,
      y: 0,
      width: 145,
      height: 100,
    })
  })

  it("actually gates the press", () => {
    const { trace, config } = tracer()
    // The leftmost 20px of a view that starts at x=100.
    const gd = mount({ ...config, hitSlop: { left: 0, width: 20 } })
    // The centre of the view is now outside the gesture's area.
    gd.press(CX, CY)
    expect(trace).toEqual([])
    gd.release(CX, CY)

    // 10px in from the left edge is inside the 20px strip.
    gd.press(110, CY)
    expect(trace).toEqual(["begin"])
  })
})

describe("the two spellings are one implementation", () => {
  it("produce the same recognizer config for the same gesture", () => {
    const builder = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-20, 20])
      .activateAfterLongPress(200)
      .shouldCancelWhenOutside(false)
      .enabled(true)

    const hook = usePanGesture({
      activeOffsetY: [-10, 10],
      failOffsetX: [-20, 20],
      activateAfterLongPress: 200,
      shouldCancelWhenOutside: false,
      enabled: true,
    })

    expect(builder.kind).toBe(hook.kind)
    for (const key of [
      "activeOffsetY",
      "failOffsetX",
      "activateAfterLongPress",
      "shouldCancelWhenOutside",
      "enabled",
    ] as const) {
      expect(hook.config[key]).toEqual(builder.config[key])
    }
  })

  it("behave identically when driven", () => {
    const runWith = (config: RecognizerConfig) => {
      const gd = mount(config)
      gd.press(CX, CY)
      gd.moveTo(CX, CY + 6)
      const early = gd.holder()
      gd.moveTo(CX, CY + 60)
      return { early, late: gd.holder(), view: gd.view }
    }

    const fromBuilder = runWith(Gesture.Pan().activeOffsetY([-10, 10]).config)
    const fromHook = runWith(usePanGesture({ activeOffsetY: [-10, 10] }).config)

    expect(fromBuilder.early).toBeNull()
    expect(fromHook.early).toBeNull()
    expect(fromBuilder.late).toBe(fromBuilder.view)
    expect(fromHook.late).toBe(fromHook.view)
  })

  it("rename the callbacks exactly as upstream does", () => {
    // The builder's onStart/onEnd/onTouchesCancelled are the hook's
    // onActivate/onDeactivate/onTouchesCancel. Getting this wrong would make
    // one spelling a silent no-op.
    const start = vi.fn()
    const end = vi.fn()
    const builder = Gesture.Pan().onStart(start).onEnd(end)
    expect(builder.config.onActivate).toBe(start)
    expect(builder.config.onDeactivate).toBe(end)

    const hook = usePanGesture({ onActivate: start })
    expect(hook.config.onActivate).toBe(start)
  })

  it("give the hook spelling `canceled` instead of a success argument", () => {
    const onDeactivate = vi.fn()
    const gd = mount(usePanGesture({ onDeactivate }).config)
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 20)
    gd.release(CX, CY + 20)
    expect(onDeactivate).toHaveBeenCalledTimes(1)
    expect(onDeactivate.mock.calls[0]![0]).toMatchObject({ canceled: false })
  })

  it("refuse the configs upstream refuses, at the point of writing them", () => {
    expect(() => usePanGesture({ activeOffsetX: [10, 20] })).toThrow(
      /should be negative/,
    )
    expect(() =>
      usePanGesture({ minDistance: 5, failOffsetY: [-5, 5] }),
    ).toThrow(/not supported to use minDistance with failOffset/)
  })
})

describe("what is not implemented stays loud", () => {
  it("builds all ten recognizers, and the namespace has nothing left that throws", () => {
    // This assertion has been inverted, which is the point of keeping it. It
    // used to name the four `Gesture.*` statics that threw; there are none.
    // The last four shipped for four different reasons — `Fling` and `Manual`
    // were reachable and merely unwritten, `Hover` was refused on a judgement
    // about the rig that was wrong (a mouse hovers, and the virtual pointer
    // moves a mouse), and `ForceTouch` ships with upstream's documented
    // semantics over `GtkGestureStylus`.
    expect(Gesture.Pan().kind).toBe("pan")
    expect(Gesture.Tap().kind).toBe("tap")
    expect(Gesture.LongPress().kind).toBe("longPress")
    expect(Gesture.Native().kind).toBe("native")
    expect(Gesture.Pinch().kind).toBe("pinch")
    expect(Gesture.Rotation().kind).toBe("rotation")
    expect(Gesture.Fling().kind).toBe("fling")
    expect(Gesture.Manual().kind).toBe("manual")
    expect(Gesture.Hover().kind).toBe("hover")
    expect(Gesture.ForceTouch().kind).toBe("forceTouch")

    // Every kind in the union has a decider, and every decider is one of the
    // kinds — the map is what makes "ten recognizers, one state machine" a
    // fact rather than a claim, so a kind added without predicates would be
    // caught here rather than at the first press.
    for (const kind of Object.keys(DECIDERS) as GestureKind[]) {
      expect(DECIDERS[kind].kind).toBe(kind)
    }
    expect(Object.keys(DECIDERS)).toHaveLength(10)
  })

  it("keeps the hook spelling exactly as wide as upstream's, and no wider", () => {
    // Nine hooks, not ten. Upstream's `src/v3/hooks/gestures/` has nine
    // directories and no `forceTouch`, its `SingleGesture` union omits
    // ForceTouch, and `useForceTouchGesture` does not exist anywhere in 3.1.0
    // — so `Gesture.ForceTouch()` is the whole API upstream offers for it and
    // the whole API offered here. Inventing the missing hook would make this
    // the one kind whose second spelling this platform made up. The entry
    // surface asserts the absence; this asserts the three that do exist.
    expect(useFlingGesture().kind).toBe("fling")
    expect(useManualGesture().kind).toBe("manual")
    expect(useHoverGesture().kind).toBe("hover")
  })

  it("accepts the knobs upstream itself ignores off-platform", () => {
    // runOnJS asks for the JS runtime; there is one runtime here, so every
    // callback already runs where it is asking. @gorhom/bottom-sheet sets it.
    expect(() =>
      Gesture.Pan().runOnJS(true).averageTouches(true).mouseButton(1),
    ).not.toThrow()
  })

  it("gives the discrete kinds no onUpdate, because upstream does not", () => {
    // `Tap` and `LongPress` extend `BaseGesture` upstream, not
    // `ContinousBaseGesture`. Offering the method would invite a callback that
    // can never fire, which is the silent-no-op failure this module refuses.
    expect("onUpdate" in Gesture.Pan()).toBe(true)
    expect("onUpdate" in Gesture.Tap()).toBe(false)
    expect("onUpdate" in Gesture.LongPress()).toBe(false)
    expect("onChange" in Gesture.LongPress()).toBe(false)
  })
})

describe("Tap", () => {
  it("activates on the RELEASE, and takes the interaction only then", () => {
    const { trace, config } = tracer()
    const gd = mountTap(config)
    gd.press(CX, CY)
    // Nothing yet: a tap that grabbed the interaction on press would take it
    // away from every pan watching the same pointer, for a gesture that has
    // not happened. Upstream's tap activates from `endTap`.
    expect(trace).toEqual(["begin"])
    expect(gd.holder()).toBeNull()

    gd.release(CX, CY)
    expect(trace).toEqual([
      "begin",
      "activate",
      "deactivate(true)",
      "finalize(true)",
    ])
    // It did claim GTK, once, at the instant it activated.
    expect(gd.onClaim).toHaveBeenCalledTimes(1)
  })

  it("FAILS a press that moves past maxDistance — the tap-vs-drag rule", () => {
    // The assertion this slice exists to make. A press that turns into a drag
    // is not a tap, and nothing else distinguishes the two.
    const { trace, config } = tracer()
    const gd = mountTap({ ...config, maxDistance: 10 })
    gd.press(CX, CY)
    gd.moveTo(CX + 6, CY)
    expect(trace).toEqual(["begin"])

    gd.moveTo(CX + 40, CY)
    expect(trace).toEqual(["begin", "finalize(false)"])

    // And coming back does not revive it: the gesture is over.
    gd.moveTo(CX, CY)
    gd.release(CX, CY)
    expect(trace).toEqual(["begin", "finalize(false)"])
    expect(gd.holder()).toBeNull()
  })

  it("measures maxDistance as a radius, and maxDeltaX per axis", () => {
    const diagonal = mountTap({ maxDistance: 10 })
    diagonal.press(CX, CY)
    // 8px on each axis is 11.3px of travel: under both limits taken alone,
    // over the radius. Reading maxDistance per-axis would have let this pass.
    diagonal.moveTo(CX + 8, CY + 8)
    diagonal.release(CX + 8, CY + 8)
    expect(diagonal.onClaim).not.toHaveBeenCalled()

    const perAxis = mountTap({ maxDeltaX: 10 })
    perAxis.press(CX, CY)
    // 40px of pure VERTICAL travel, and maxDeltaX says nothing about it.
    perAxis.moveTo(CX, CY + 40)
    perAxis.release(CX, CY + 40)
    expect(perAxis.onClaim).toHaveBeenCalledTimes(1)
  })

  it("accepts any travel when no distance limit is configured", () => {
    // Upstream's own default, and it reads like an oversight: all three
    // distance limits start at a MIN_SAFE_INTEGER sentinel meaning "unset", so
    // shouldCancelWhenOutside is what actually bounds an unconfigured tap.
    // Guessing a default here would refuse taps upstream accepts.
    const gd = mountTap({})
    gd.press(CX, CY)
    gd.moveTo(CX + 60, CY + 60)
    gd.release(CX + 60, CY + 60)
    expect(gd.onClaim).toHaveBeenCalledTimes(1)
  })

  it("fails a press held past maxDuration, with the pointer still down", () => {
    const { trace, config } = tracer()
    const gd = mountTap({ ...config, maxDuration: 200 })
    gd.press(CX, CY)
    gd.advance(260)
    // The timer decided it with no event in flight — a press this slow is a
    // press, not a tap.
    expect(trace).toEqual(["begin", "finalize(false)"])

    gd.release(CX, CY)
    expect(trace).toEqual(["begin", "finalize(false)"])
  })

  it("fails a press that leaves the view, which is Tap's default", () => {
    const { trace, config } = tracer()
    const gd = mountTap(config)
    gd.press(CX, CY)
    // BOUNDS is 200x200 at (100, 100); 400px down is well outside it.
    gd.moveTo(CX, CY + 400)
    expect(trace).toEqual(["begin", "finalize(false)"])
  })

  it("numberOfTaps: 2 needs two presses, and begins only once", () => {
    const { trace, config } = tracer()
    const gd = mountTap({ ...config, numberOfTaps: 2 })
    gd.press(CX, CY)
    gd.release(CX, CY)
    // Between the taps: still BEGAN, still holding nothing, no callback.
    expect(trace).toEqual(["begin"])
    expect(gd.holder()).toBeNull()

    gd.advance(100)
    gd.press(CX, CY)
    // No second `onBegin`: upstream reaches `begin()` from the UNDETERMINED
    // branch only, so a sequence begins once however many taps it takes.
    expect(trace).toEqual(["begin"])

    gd.release(CX, CY)
    expect(trace).toEqual([
      "begin",
      "activate",
      "deactivate(true)",
      "finalize(true)",
    ])
  })

  it("gives up on the second tap after maxDelay", () => {
    const { trace, config } = tracer()
    const gd = mountTap({ ...config, numberOfTaps: 2, maxDelay: 200 })
    gd.press(CX, CY)
    gd.release(CX, CY)
    expect(trace).toEqual(["begin"])

    gd.advance(260)
    expect(trace).toEqual(["begin", "finalize(false)"])

    // And the tap that arrives too late starts its own sequence rather than
    // completing the dead one.
    gd.press(CX, CY)
    gd.release(CX, CY)
    expect(trace).toEqual(["begin", "finalize(false)", "begin"])
  })

  it("restarts the duration deadline on each tap of a sequence", () => {
    const { trace, config } = tracer()
    // 200ms per tap, 400ms between them. A deadline armed once for the whole
    // sequence would have killed this before the second press.
    const gd = mountTap({
      ...config,
      numberOfTaps: 2,
      maxDuration: 200,
      maxDelay: 600,
    })
    gd.press(CX, CY)
    gd.advance(120)
    gd.release(CX, CY)
    gd.advance(400)
    gd.press(CX, CY)
    gd.advance(120)
    gd.release(CX, CY)
    expect(trace).toContain("activate")
  })

  it("never activates when minPointers exceeds what this platform delivers", () => {
    const { trace, config } = tracer()
    const gd = mountTap({ ...config, minPointers: 2, maxDelay: 100 })
    gd.press(CX, CY)
    gd.release(CX, CY)
    gd.advance(160)
    expect(trace).toEqual(["begin", "finalize(false)"])
  })
})

describe("LongPress", () => {
  it("activates ON THE TIMER without the pointer moving", () => {
    const { trace, config } = tracer()
    const gd = mountLongPress({ ...config, minDuration: 200 })
    gd.press(CX, CY)
    expect(gd.holder()).toBeNull()

    // The same out-of-event grant channel `activateAfterLongPress` uses. A
    // press-and-hold never moves again, so waiting for a move is waiting
    // forever.
    gd.advance(220)
    expect(trace).toEqual(["begin", "activate"])
    expect(gd.holder()).toBe(gd.view)
    expect(gd.onClaim).toHaveBeenCalledTimes(1)

    gd.release(CX, CY)
    expect(trace).toEqual([
      "begin",
      "activate",
      "deactivate(true)",
      "finalize(true)",
    ])
  })

  it("gives a release before minDuration onFinalize and nothing else", () => {
    const { trace, config } = tracer()
    const gd = mountLongPress({ ...config, minDuration: 200 })
    gd.press(CX, CY)
    gd.advance(100)
    gd.release(CX, CY)
    expect(trace).toEqual(["begin", "finalize(false)"])
    expect(gd.holder()).toBeNull()
  })

  it("fails a press that travels past maxDistance before it matures", () => {
    const { trace, config } = tracer()
    const gd = mountLongPress({ ...config, minDuration: 200 })
    gd.press(CX, CY)
    // The default maxDistance is 10.
    gd.moveTo(CX + 4, CY + 4)
    gd.advance(50)
    expect(trace).toEqual(["begin"])

    gd.moveTo(CX + 20, CY)
    expect(trace).toEqual(["begin", "finalize(false)"])
    gd.advance(300)
    expect(trace).toEqual(["begin", "finalize(false)"])
  })

  it("CANCELS an already-active hold that travels past maxDistance", () => {
    const { trace, config } = tracer()
    const gd = mountLongPress({ ...config, minDuration: 200, maxDistance: 12 })
    gd.press(CX, CY)
    gd.advance(220)
    expect(trace).toEqual(["begin", "activate"])

    gd.moveTo(CX, CY + 30)
    // Cancelled rather than ended: `onDeactivate(false)`, which is how a
    // consumer tells a hold that was abandoned from one that completed.
    expect(trace).toEqual([
      "begin",
      "activate",
      "deactivate(false)",
      "finalize(false)",
    ])
  })

  it("measures maxDistance from the PRESS, not from the activation point", () => {
    // Upstream's `startX`/`startY` are set on pointer-down and never moved —
    // its base `resetProgress()` is empty, unlike Pan's. So drift before the
    // timer and drift after it are the same budget. Re-basing at activation
    // would let a hold wander twice as far.
    const { trace, config } = tracer()
    const gd = mountLongPress({ ...config, minDuration: 200, maxDistance: 10 })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 8)
    gd.advance(220)
    expect(trace).toEqual(["begin", "activate"])

    // 8 more, for 16 from the press — over the budget, under it if measured
    // from where the timer granted.
    gd.moveTo(CX, CY + 16)
    expect(trace).toContain("deactivate(false)")
  })

  it("reports how long the press has lasted", () => {
    let atActivation = 0
    const gd = mountLongPress({
      minDuration: 200,
      onActivate: (event) => {
        atActivation = event.duration
      },
    })
    gd.press(CX, CY)
    gd.advance(220)
    // Upstream's LongPress payload is the only one carrying `duration`, and
    // it is the point of the gesture.
    expect(atActivation).toBeGreaterThanOrEqual(200)
    expect(atActivation).toBeLessThan(260)
  })

  it("never activates when numberOfPointers exceeds one", () => {
    const { trace, config } = tracer()
    const gd = mountLongPress({
      ...config,
      minDuration: 200,
      numberOfPointers: 2,
    })
    gd.press(CX, CY)
    gd.advance(300)
    // Honest rather than silently single-finger: this platform fabricates one
    // touch per pointer and has no virtual-touch protocol to test more with.
    expect(trace).toEqual(["begin"])
    expect(gd.holder()).toBeNull()
    gd.release(CX, CY)
    expect(trace).toEqual(["begin", "finalize(false)"])
  })
})

describe("Tap and LongPress are two spellings each, over one machine", () => {
  it("build the same config from the builder and the hook", () => {
    const tapBuilder = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(300)
      .maxDelay(250)
      .maxDistance(8)
    const tapHook = useTapGesture({
      numberOfTaps: 2,
      maxDuration: 300,
      maxDelay: 250,
      maxDistance: 8,
    })
    expect(tapBuilder.kind).toBe("tap")
    expect(tapHook.kind).toBe("tap")
    for (const key of [
      "numberOfTaps",
      "maxDuration",
      "maxDelay",
      "maxDistance",
      // Upstream's own hook forgets this one even though its builder sets it;
      // both spellings agree here, because two spellings of one gesture
      // disagreeing about it is a slip rather than a semantic.
      "shouldCancelWhenOutside",
    ] as const) {
      expect(tapHook.config[key]).toEqual(tapBuilder.config[key])
    }

    const holdBuilder = Gesture.LongPress().minDuration(300).maxDistance(20)
    const holdHook = useLongPressGesture({ minDuration: 300, maxDistance: 20 })
    expect(holdBuilder.kind).toBe("longPress")
    expect(holdHook.kind).toBe("longPress")
    for (const key of [
      "minDuration",
      "maxDistance",
      "shouldCancelWhenOutside",
    ] as const) {
      expect(holdHook.config[key]).toEqual(holdBuilder.config[key])
    }
  })

  it("behave identically when driven", () => {
    const runTap = (config: RecognizerConfig) => {
      const gd = mountTap(config)
      gd.press(CX, CY)
      gd.moveTo(CX + 40, CY)
      gd.release(CX + 40, CY)
      return gd.onClaim.mock.calls.length
    }
    expect(runTap(Gesture.Tap().maxDistance(10).config)).toBe(0)
    expect(runTap(useTapGesture({ maxDistance: 10 }).config)).toBe(0)
    expect(runTap(Gesture.Tap().config)).toBe(1)
    expect(runTap(useTapGesture().config)).toBe(1)

    const runHold = (config: RecognizerConfig) => {
      const gd = mountLongPress(config)
      gd.press(CX, CY)
      gd.advance(320)
      const held = gd.holder()
      gd.release(CX, CY)
      return held
    }
    expect(runHold(Gesture.LongPress().minDuration(300).config)).not.toBeNull()
    expect(
      runHold(useLongPressGesture({ minDuration: 300 }).config),
    ).not.toBeNull()
  })

  it("renames the ending callback exactly as upstream's hook does", () => {
    const onFinalize = vi.fn()
    const gd = mountTap(useTapGesture({ maxDistance: 5, onFinalize }).config)
    gd.press(CX, CY)
    gd.moveTo(CX + 40, CY)
    expect(onFinalize).toHaveBeenCalledTimes(1)
    expect(onFinalize.mock.calls[0]![0]).toMatchObject({ canceled: true })
  })
})

describe("the two libraries this slice exists to unblock", () => {
  // Both chains are transcribed from the shipped packages, not paraphrased:
  // react-native-drawer-layout 4.2.9's `src/views/Drawer.native.tsx` and
  // react-native-reanimated-dnd 2.0.0's `lib/hooks/useDraggable.js`. What is
  // asserted is that the CHAIN builds and DRIVES, which is the acceptance
  // criterion; what else each package needs is recorded in
  // docs/architecture/gestures.md.
  const SWIPE_MIN_OFFSET = 5

  it("builds and drives react-native-drawer-layout's pan", () => {
    const seen: string[] = []
    const startX = { value: 0 }
    const translationX = { value: 0 }
    // Typed as the union rather than inferred as the literal 0, which is
    // exactly the shared value react-native-drawer-layout declares.
    const gestureState: { value: GestureStateValue } = {
      value: GESTURE_STATE.UNDETERMINED,
    }

    const pan = Gesture.Pan()
      .onBegin((event) => {
        startX.value = translationX.value
        gestureState.value = event.state
        seen.push("begin")
      })
      .onStart(() => seen.push("start"))
      .onChange((event) => {
        translationX.value = startX.value + event.translationX
        gestureState.value = event.state
      })
      .onEnd((event, success) => {
        gestureState.value = event.state
        seen.push(`end(${success})`)
      })
      .activeOffsetX([-SWIPE_MIN_OFFSET, SWIPE_MIN_OFFSET])
      .failOffsetY([-SWIPE_MIN_OFFSET, SWIPE_MIN_OFFSET])
      .hitSlop({ left: 0, width: 32 })
      .enabled(true)

    // The drawer grabs from the leftmost 32px of its view, which starts at
    // x=100 — so x=110 is inside the strip and the centre is not.
    const gd = mount(pan.config)
    gd.press(110, CY)
    gd.moveTo(150, CY)
    gd.moveTo(200, CY)
    gd.release(200, CY)

    expect(seen).toEqual(["begin", "start", "end(true)"])
    expect(translationX.value).toBeGreaterThan(0)
    // The comparison the library actually makes. `State` throwing was the
    // last runtime symbol standing between drawer-layout and this platform.
    expect(gestureState.value).toBe(GESTURE_STATE.END)
    expect(GESTURE_STATE.ACTIVE).toBe(4)
  })

  it("builds and drives react-native-reanimated-dnd's useDraggable pan", () => {
    const seen: string[] = []
    const translateY = { value: 0 }

    const pan = Gesture.Pan()
      .activateAfterLongPress(200)
      .shouldCancelWhenOutside(false)
      .onStart(() => seen.push("start"))
      .onUpdate((event) => {
        translateY.value = event.translationY
      })
      .onFinalize(() => seen.push("finalize"))
      .enabled(true)

    const gd = mount(pan.config)
    gd.press(CX, CY)
    // Drag before the press matures: refused, exactly as a long-press drag
    // handle should be.
    gd.moveTo(CX, CY + 40)
    expect(seen).toEqual(["finalize"])

    seen.length = 0
    gd.release(CX, CY + 40)
    gd.press(CX, CY)
    gd.advance(220)
    gd.moveTo(CX, CY + 60)
    gd.release(CX, CY + 60)

    expect(seen).toEqual(["start", "finalize"])
    expect(translateY.value).toBe(60)
  })
})

describe("a second drag on an already-moved view", () => {
  // The bug this reproduces was reported by hand: after moving a card, a NEW
  // drag on it made it snap before it followed. Two candidate causes, and
  // they predict different numbers — so they are separated by measurement
  // rather than by argument.
  //
  //   1. the CONSUMER writes `y = translationY` instead of
  //      `y = start + translationY`, so the view snaps back toward its origin
  //      by whatever it had accumulated. Predicts a jump proportional to the
  //      previous offset.
  //   2. the RECOGNIZER reports travel since touch-down rather than since
  //      activation, so activating at the threshold reports the threshold.
  //      Predicts a jump equal to the activation threshold, whatever the
  //      history.
  //
  // Upstream settles what correct is: `PanGestureHandler.activate()` calls
  // `resetProgress()`, which sets `startX = lastX` and does NOT touch
  // `offsetX`, while `getTranslationX()` is `lastX - startX + offsetX`. So
  // translation is zero at activation. Cause 2 is not a thing.

  it("reports zero translation at the moment of activation, whatever the threshold", () => {
    const seen: number[] = []
    const gd = mount({
      activeOffsetY: [-10, 10],
      onActivate: (event) => seen.push(event.translationY),
    })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 40)
    // Crossed the bound by 40px, and activation still reports 0 — the
    // threshold is not handed to the consumer as travel. This is the
    // measurement that rules cause 2 out.
    expect(seen).toEqual([0])
  })

  it("starts a re-grab from zero, so the accumulated offset is the consumer's to keep", () => {
    // The documented pattern, and the one every example must show.
    const offset = { value: 0 }
    const start = { value: 0 }
    const config: RecognizerConfig = {
      onActivate: () => {
        start.value = offset.value
      },
      onUpdate: (event) => {
        offset.value = start.value + event.translationY
      },
    }

    const gd = mount(config)
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 20)
    gd.moveTo(CX, CY + 70)
    gd.release(CX, CY + 70)
    const afterFirst = offset.value
    expect(afterFirst).toBeGreaterThan(40)

    // Re-grab, and the very first update must not move it at all.
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 15)
    const atActivation = offset.value
    expect(atActivation).toBe(afterFirst)

    gd.moveTo(CX, CY + 45)
    expect(offset.value).toBe(afterFirst + 30)
  })

  it("shows the jump the naive consumer pattern produces, and its size", () => {
    // `y = translationY`, with no accumulation: the shape the spike shipped.
    const offset = { value: 0 }
    const gd = mount({
      onUpdate: (event) => {
        offset.value = event.translationY
      },
    })
    gd.press(CX, CY)
    gd.moveTo(CX, CY + 20)
    gd.moveTo(CX, CY + 90)
    gd.release(CX, CY + 90)
    const accumulated = offset.value
    expect(accumulated).toBe(70)

    gd.press(CX, CY)
    gd.moveTo(CX, CY + 15) // activation: translation 0, so no update
    gd.moveTo(CX, CY + 20)
    // It snapped back to near its origin. The jump is 65 of the 70 it had
    // accumulated — proportional to the HISTORY, not the 10px activation
    // threshold, which is cause 1 measured rather than argued.
    expect(offset.value).toBe(5)
    expect(accumulated - offset.value).toBe(65)
  })
})
