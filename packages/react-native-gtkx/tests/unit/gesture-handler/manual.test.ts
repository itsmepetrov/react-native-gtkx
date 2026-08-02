// `Manual`: the recognizer with no criteria, driven the only way it can be —
// by an app calling the state manager from a touch callback.
//
// WHAT THIS FILE IS REALLY TESTING is the arbitration registry, from the
// outside. Every other kind reaches `tryActivate` from a predicate this module
// wrote, so a test of the registry is also a test of the predicate that woke
// it. Here the predicates are constants and the app decides, which is the only
// way to put a gesture into the loop at an instant no predicate would have
// chosen — and therefore the sharpest available check that the loop is the
// same loop and not a second path.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Gesture } from "../../../src/gesture-handler-compat/builder"
import { useManualGesture } from "../../../src/gesture-handler-compat/hooks"
import { manualDecider } from "../../../src/gesture-handler-compat/manual"
import { createOrchestrator } from "../../../src/gesture-handler-compat/orchestrator"
import { panDecider } from "../../../src/gesture-handler-compat/pan"
import {
  createRecognizer,
  type RecognizerDecider,
  type Rect,
} from "../../../src/gesture-handler-compat/recognizer"
import { bindGestureTag } from "../../../src/gesture-handler-compat/relations"
import {
  GESTURE_STATE,
  type GestureStateManagerApi,
  type RecognizerConfig,
} from "../../../src/gesture-handler-compat/types"
import { createResponderSystem } from "../../../src/responder/system"
import type { NativeTouch } from "../../../src/responder/types"

const BOUNDS: Rect = { x: 100, y: 100, width: 400, height: 400 }
const CX = 300
const CY = 300

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

type Node = { name: string }

/**
 * A mounted gesture on the shipped responder system, with the state manager
 * captured out of whichever touch callback the test asked for.
 *
 * The manager is deliberately reached the way an app reaches it — as the
 * second argument to `onTouchesDown`/`onTouchesMove`/`onTouchesUp` — rather
 * than pulled off the recognizer. That IS the public API for a manual gesture,
 * and a test that used a private handle would not be testing it.
 */
const mount = (
  config: RecognizerConfig,
  orchestrator = createOrchestrator(),
  decider: RecognizerDecider = manualDecider,
  tag = 1,
) => {
  const view: Node = { name: "view" }
  const root: Node = { name: "root" }
  const parents = new Map<object, object | null>([
    [view, root],
    [root, null],
  ])
  const system = createResponderSystem({
    parentOf: (host) => parents.get(host) ?? null,
    onClaim: vi.fn(),
  })

  let manager: GestureStateManagerApi | null = null
  const capture = (_event: unknown, given: GestureStateManagerApi): void => {
    manager = given
  }
  let current: RecognizerConfig = {
    onTouchesDown: capture,
    onTouchesMove: capture,
    onTouchesUp: capture,
    ...config,
  }
  // The caller's own touch callbacks still run; the manager is captured
  // alongside them rather than instead of them.
  for (const name of [
    "onTouchesDown",
    "onTouchesMove",
    "onTouchesUp",
  ] as const) {
    const theirs = config[name]
    current = {
      ...current,
      [name]: (event: never, given: GestureStateManagerApi) => {
        capture(event, given)
        theirs?.(event, given)
      },
    }
  }

  const recognizer = createRecognizer(tag, decider, () => current, {
    boundsInWindow: () => BOUNDS,
    requestResponder: () => system.requestResponder(view),
    orchestrator,
  })
  system.register(view, () => recognizer.handlers)

  let time = 1000
  return {
    view,
    system,
    orchestrator,
    recognizer,
    manager: (): GestureStateManagerApi => {
      if (manager === null) {
        throw new Error("no touch callback has run, so there is no manager yet")
      }
      return manager
    },
    press: (x = CX, y = CY) => {
      system.touchStart(view, touchAt(x, y, time))
    },
    moveTo: (x: number, y: number, stepMs = 16) => {
      time += stepMs
      vi.advanceTimersByTime(stepMs)
      system.touchMove(view, touchAt(x, y, time))
    },
    release: (x = CX, y = CY) => {
      time += 16
      vi.advanceTimersByTime(16)
      system.touchEnd(view, touchAt(x, y, time))
    },
    holder: () => system.getResponder(),
  }
}

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

beforeEach(() => {
  vi.useFakeTimers()
})

describe("it recognizes nothing on its own", () => {
  it("has two constant predicates and no timer", () => {
    // Stated directly rather than inferred from "nothing happened", because
    // "nothing happened" is also what a broken rig produces. A `Manual` that
    // quietly acquired a criterion would activate on its own, look like it
    // worked, and be wrong only where nobody drove it by hand.
    const view = {
      translationX: 500,
      translationY: 500,
      distanceFromPress: 700,
      velocityX: 5000,
      velocityY: 5000,
      timerElapsed: true,
      pointerCount: 1,
      maxPointerCount: 3,
      taps: 4,
      scale: 3,
      rotation: 3,
      force: 1,
    }
    expect(manualDecider.shouldActivate(view, {})).toBe(false)
    expect(manualDecider.shouldFail(view, {})).toBe(false)
    expect(manualDecider.timer).toBeUndefined()
  })

  it("begins on the press and then sits there through any amount of dragging", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    for (let i = 1; i <= 20; i += 1) {
      rig.moveTo(CX + i * 15, CY + i * 15)
    }
    // Far past every other kind's threshold, fast, and still only BEGAN.
    expect(trace).toEqual(["begin"])
    expect(rig.holder()).toBeNull()
  })

  it("does not fail when the pointer lifts — upstream's documented rule", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    rig.release()
    // Still BEGAN, holding nothing, with no timer running. Upstream says so in
    // as many words: "It will not fail when all the pointers are lifted from
    // the screen."
    expect(trace).toEqual(["begin"])
    vi.advanceTimersByTime(10_000)
    expect(trace).toEqual(["begin"])
  })
})

describe("the state manager is the whole API", () => {
  it("activates on .activate(), through the ordinary loop", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    rig.manager().activate()
    expect(trace).toEqual(["begin", "activate"])
    // And it really took the interaction, which is what makes it a gesture
    // rather than a bookkeeping entry.
    expect(rig.holder()).toBe(rig.view)
  })

  it("ends successfully on .end()", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    rig.manager().activate()
    rig.manager().end()
    expect(trace).toEqual([
      "begin",
      "activate",
      "deactivate(true)",
      "finalize(true)",
    ])
  })

  it("fails on .fail(), and a later move cannot revive it", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    rig.manager().fail()
    expect(trace).toEqual(["begin", "finalize(false)"])
    rig.moveTo(CX + 200, CY)
    rig.manager?.()
    expect(trace).toEqual(["begin", "finalize(false)"])
  })

  it("reports the state it ended in, not the one it was deciding from", () => {
    const states: number[] = []
    const rig = mount({ onFinalize: (event) => states.push(event.state) })
    rig.press()
    rig.manager().fail()
    expect(states).toEqual([GESTURE_STATE.FAILED])

    const ended: number[] = []
    const other = mount({ onFinalize: (event) => ended.push(event.state) })
    other.press()
    other.manager().activate()
    other.manager().end()
    expect(ended).toEqual([GESTURE_STATE.END])
  })

  it("gives an ACTIVE manual gesture its updates from the pointer", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    rig.manager().activate()
    rig.moveTo(CX + 40, CY)
    rig.moveTo(CX + 80, CY)
    expect(trace.filter((entry) => entry === "update")).toHaveLength(2)
  })

  it("ends with the interaction when the pointer lifts while ACTIVE", () => {
    // THE ONE DELIBERATE DEVIATION from upstream, asserted rather than left to
    // be discovered. Upstream leaves an ACTIVE Manual active after the lift;
    // here the gesture is holding an INTERACTION — the responder lock, the GTK
    // sequence, the suspended scrollers — and that interaction ends with the
    // button. Staying ACTIVE would mean holding a lock that no longer exists
    // and never reporting an ending at all.
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    rig.manager().activate()
    rig.release()
    expect(trace).toEqual([
      "begin",
      "activate",
      "deactivate(true)",
      "finalize(true)",
    ])
  })
})

describe("it takes part in arbitration like anything else", () => {
  it("is parked by requireExternalGestureToFail even when the app says activate", () => {
    // The registry decides, not the caller. `.activate()` is a REQUEST — this
    // is the assertion that there is no second path into ACTIVE for a gesture
    // the app happens to own.
    const orchestrator = createOrchestrator()
    const gate = Gesture.Pan()
    const manual = Gesture.Manual()
    bindGestureTag(gate, 2)
    bindGestureTag(manual, 1)
    orchestrator.relations.configure(1, {
      waitFor: [gate],
      simultaneousHandlers: [],
      blocksHandlers: [],
    })

    const { trace, config } = tracer()
    const rig = mount(config, orchestrator)
    const gateRig = mount({}, orchestrator, panDecider, 2)

    gateRig.press()
    rig.press()
    rig.manager().activate()

    expect(trace).toEqual(["begin"])
    expect(orchestrator.isAwaiting(rig.recognizer.participant)).toBe(true)
  })

  it("activates when the gesture it waited for fails", () => {
    const orchestrator = createOrchestrator()
    const gate = Gesture.Pan()
    const manual = Gesture.Manual()
    bindGestureTag(gate, 2)
    bindGestureTag(manual, 1)
    orchestrator.relations.configure(1, {
      waitFor: [gate],
      simultaneousHandlers: [],
      blocksHandlers: [],
    })

    const { trace, config } = tracer()
    const rig = mount(config, orchestrator)
    const gateRig = mount({ failOffsetX: [-5, 5] }, orchestrator, panDecider, 2)

    gateRig.press()
    rig.press()
    rig.manager().activate()
    expect(trace).toEqual(["begin"])

    // The pan crosses its failure bound and dies, which releases the waiter —
    // and the waiter activates without the app asking a second time.
    gateRig.moveTo(CX + 60, CY)
    expect(trace).toEqual(["begin", "activate"])
  })

  it("cancels a competing gesture when it activates, mutual exclusion being the default", () => {
    const orchestrator = createOrchestrator()
    const manualTrace = tracer()
    const panTrace = tracer()
    const rig = mount(manualTrace.config, orchestrator)
    const panRig = mount(panTrace.config, orchestrator, panDecider, 2)

    panRig.press()
    rig.press()
    rig.manager().activate()

    expect(manualTrace.trace).toContain("activate")
    expect(panTrace.trace).toContain("finalize(false)")
  })
})

describe("both spellings build the same gesture", () => {
  it("agrees between Gesture.Manual() and useManualGesture()", () => {
    expect(Gesture.Manual().kind).toBe("manual")
    expect(useManualGesture().kind).toBe("manual")
    // No configuration of its own in either spelling, which is upstream's
    // shape: `ManualGesture` adds zero builder methods and v3's
    // `ManualGestureProperties` is `Record<string, never>`.
    expect(Object.keys(Gesture.Manual().config)).toHaveLength(0)
  })
})
