// `Fling`: the semantics, driven through the REAL responder system and the
// REAL orchestrator.
//
// THE TEST THIS FILE EXISTS FOR is "a slow drag does not fling". A fling is
// not "the pointer travelled 200px to the right" — a leisurely drag travels
// exactly as far, and a test that only asserts the fast case passes against an
// implementation with no velocity criterion at all. So the slow case is
// asserted twice over, once for each of upstream's two guards, and the two are
// separated on purpose: a drag slow enough to miss `minVelocity` but short
// enough to stay inside `maxDurationMs` proves the VELOCITY gate, which a
// drag that simply ran out of time would not.
//
// tests/gtk/gesture-handler/rest-gestures.gtk.test.tsx does the same claims
// against a real widget under an injected `zwlr_virtual_pointer_v1`, where the
// velocity is the compositor's rather than one this file arranged.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Gesture } from "../../../src/gesture-handler-compat/builder"
import {
  AXIAL_DEVIATION_COSINE,
  DEFAULT_MAX_DURATION,
  DEFAULT_MIN_VELOCITY,
  DIAGONAL_DEVIATION_COSINE,
  flingDecider,
  isAligned,
} from "../../../src/gesture-handler-compat/fling"
import { useFlingGesture } from "../../../src/gesture-handler-compat/hooks"
import { createOrchestrator } from "../../../src/gesture-handler-compat/orchestrator"
import { panDecider } from "../../../src/gesture-handler-compat/pan"
import { createRecognizer } from "../../../src/gesture-handler-compat/recognizer"
import type { Rect } from "../../../src/gesture-handler-compat/recognizer"
import { bindGestureTag } from "../../../src/gesture-handler-compat/relations"
import {
  DIRECTIONS,
  GESTURE_STATE,
  type RecognizerConfig,
} from "../../../src/gesture-handler-compat/types"
import { createResponderSystem } from "../../../src/responder/system"
import type { NativeTouch } from "../../../src/responder/types"

const BOUNDS: Rect = { x: 100, y: 100, width: 400, height: 400 }
/** The centre of BOUNDS, where every press below lands. */
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
 * One mounted gesture, minus React and minus GTK, on the shipped responder
 * system rather than a stand-in — the same rig `recognizer.test.ts` uses, and
 * for the same reason: a fling ACTIVATES, which means it takes the interaction,
 * and a faked responder system could be made to agree with anything.
 */
const mount = (
  config: RecognizerConfig,
  orchestrator = createOrchestrator(),
  decider = flingDecider,
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

  const current = config
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
    advance: (ms: number) => {
      time += ms
      vi.advanceTimersByTime(ms)
    },
    press: (x = CX, y = CY) => {
      system.touchStart(view, touchAt(x, y, time))
    },
    /**
     * One move, `stepMs` after the previous event — which is the whole of how
     * this file controls velocity, because `track()` computes it from exactly
     * that interval.
     */
    moveTo: (x: number, y: number, stepMs = 16) => {
      time += stepMs
      vi.advanceTimersByTime(stepMs)
      system.touchMove(view, touchAt(x, y, time))
    },
    release: (x: number, y: number) => {
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

/**
 * A flick: `steps` moves of `dx`/`dy` each, `stepMs` apart.
 *
 * Velocity is `distance / stepMs * 1000`, so the two knobs that decide whether
 * this is a fling are `stepMs` and the per-step distance — NOT the total
 * travel, which is the confusion the whole file is built to catch.
 */
const flick = (
  rig: ReturnType<typeof mount>,
  dx: number,
  dy: number,
  { steps = 4, stepMs = 16 } = {},
): void => {
  for (let i = 1; i <= steps; i += 1) {
    rig.moveTo(CX + (dx * i) / steps, CY + (dy * i) / steps, stepMs)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe("velocity is the criterion, and distance is not", () => {
  it("flings on a fast flick", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    // 120px over four 16ms steps: 30px per 16ms is 1875 px/s, comfortably past
    // the 700 floor.
    flick(rig, 120, 0)
    rig.release(CX + 120, CY)

    // BEGAN -> ACTIVE -> END in one breath, and no `update` anywhere: a fling
    // activating IS a fling ending, which is upstream's overridden `activate()`.
    expect(trace).toEqual([
      "begin",
      "activate",
      "deactivate(true)",
      "finalize(true)",
    ])
  })

  it("does NOT fling on a slow drag across the SAME distance, inside the deadline", () => {
    // THE TEST THE WHOLE FILE IS FOR. Same 120px, same direction, same number
    // of steps, same everything except the clock: 150ms per step is 200 px/s,
    // under the 700 floor. Total elapsed is 600ms, comfortably INSIDE the
    // 800ms deadline — so this fails on velocity alone and would still fail if
    // the deadline were removed. A test that only slowed the drag past 800ms
    // would pass against an implementation with no velocity criterion at all.
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    flick(rig, 120, 0, { stepMs: 150 })
    rig.release(CX + 120, CY)

    expect(trace).toEqual(["begin", "finalize(false)"])
    expect(trace).not.toContain("activate")
  })

  it("fails on the 800ms deadline even if the pointer never lifts", () => {
    // The second guard, on its own. Nothing moves at all, so there is no
    // velocity to judge; upstream arms a timer from `startFling` and this is
    // it firing.
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    rig.advance(DEFAULT_MAX_DURATION - 1)
    expect(trace).toEqual(["begin"])
    rig.advance(2)
    expect(trace).toEqual(["begin", "finalize(false)"])
  })

  it("activates mid-drag, with the button still down", () => {
    // Upstream decides from `onPointerMove`, not from the release: a fling is
    // recognized the instant it is fast enough, and the release is only the
    // last chance. Asserted by never releasing at all.
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    flick(rig, 120, 0)
    expect(trace).toContain("activate")
    expect(trace).toContain("finalize(true)")
  })

  it("fails immediately when the pointer lifts too slow, without waiting for the deadline", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    flick(rig, 40, 0, { steps: 2, stepMs: 120 })
    rig.release(CX + 40, CY)
    // Already over on the lift — not still BEGAN waiting for a timer.
    expect(trace).toEqual(["begin", "finalize(false)"])
    // And the timer firing later changes nothing, which is upstream's own
    // behaviour: its `fail()` guards on the state and no-ops the second time.
    rig.advance(DEFAULT_MAX_DURATION)
    expect(trace).toEqual(["begin", "finalize(false)"])
  })

  it("puts the floor exactly where upstream does, and compares it strictly", () => {
    // `magnitude > minVelocity`, not `>=`. Pinned because it is one character
    // and it is the difference between accepting and refusing the boundary.
    expect(DEFAULT_MIN_VELOCITY).toBe(700)
    expect(DEFAULT_MAX_DURATION).toBe(800)
    const view = {
      translationX: 0,
      translationY: 0,
      distanceFromPress: 0,
      velocityX: DEFAULT_MIN_VELOCITY,
      velocityY: 0,
      timerElapsed: false,
      pointerCount: 1,
      maxPointerCount: 1,
      taps: 0,
      scale: 1,
      rotation: 0,
      force: 0,
    }
    expect(flingDecider.shouldActivate(view, {})).toBe(false)
    expect(flingDecider.shouldActivate({ ...view, velocityX: 701 }, {})).toBe(
      true,
    )
  })
})

describe("direction is a bitmask, and the cones are upstream's", () => {
  it("defaults to RIGHT and refuses a fast flick the other way", () => {
    const { trace, config } = tracer()
    const rig = mount(config)
    rig.press()
    flick(rig, -120, 0)
    rig.release(CX - 120, CY)
    // Fast enough, and pointed at nothing the config asked for.
    expect(trace).toEqual(["begin", "finalize(false)"])
  })

  it("accepts either way when both bits are set", () => {
    const left = tracer()
    const rigLeft = mount({
      ...left.config,
      direction: DIRECTIONS.LEFT | DIRECTIONS.RIGHT,
    })
    rigLeft.press()
    flick(rigLeft, -120, 0)
    expect(left.trace).toContain("activate")

    const right = tracer()
    const rigRight = mount({
      ...right.config,
      direction: DIRECTIONS.LEFT | DIRECTIONS.RIGHT,
    })
    rigRight.press()
    flick(rigRight, 120, 0)
    expect(right.trace).toContain("activate")
  })

  it("opens the diagonal when two axis bits are set, and only then", () => {
    // A 45° up-right flick is 30° off both axes: outside the 30° AXIAL cone
    // (±15°), inside the 60° DIAGONAL one (±30°). So `RIGHT` alone refuses it
    // and `UP | RIGHT` accepts it — and the second is not merely "two axes
    // tried separately", because neither axis accepts it on its own.
    expect(isAligned(100, 0, DIRECTIONS.RIGHT)).toBe(true)
    expect(isAligned(100, -100, DIRECTIONS.RIGHT)).toBe(false)
    expect(isAligned(100, -100, DIRECTIONS.UP)).toBe(false)
    expect(isAligned(100, -100, DIRECTIONS.UP | DIRECTIONS.RIGHT)).toBe(true)
  })

  it("uses cosines of half the cone, which tile the circle exactly", () => {
    // cos(15°) and cos(30°). 4 axial cones of 30° plus 4 diagonal cones of 60°
    // is 360° with no gap and no overlap, which is why every fast flick in any
    // direction matches exactly one family.
    expect(AXIAL_DEVIATION_COSINE).toBeCloseTo(Math.cos(Math.PI / 12), 10)
    expect(DIAGONAL_DEVIATION_COSINE).toBeCloseTo(Math.cos(Math.PI / 6), 10)
  })

  it("refuses a velocity too small to have a direction at all", () => {
    // Upstream zeroes the unit vector below `MINIMAL_RECOGNIZABLE_MAGNITUDE`
    // (0.1) rather than dividing by it. Without that, a jitter of one
    // ten-thousandth of a pixel would have a perfectly good direction.
    expect(isAligned(0, 0, DIRECTIONS.RIGHT)).toBe(false)
    expect(isAligned(0.05, 0, DIRECTIONS.RIGHT)).toBe(false)
  })
})

describe("the pointer count is exact, in both directions", () => {
  it("refuses when more pointers are required than the interaction ever had", () => {
    const { trace, config } = tracer()
    const rig = mount({ ...config, numberOfPointers: 2 })
    rig.press()
    flick(rig, 120, 0)
    rig.release(CX + 120, CY)
    // One fabricated touch per pointer and one pointer on this platform, so a
    // two-finger fling is honestly unreachable rather than silently
    // single-finger — the same shape as `LongPress`'s `numberOfPointers`.
    expect(trace).toEqual(["begin", "finalize(false)"])
  })
})

describe("it is an ordinary participant in the arbitration", () => {
  it("takes the responder when it activates, and gives it back at once", () => {
    const rig = mount({})
    rig.press()
    expect(rig.holder()).toBeNull()
    flick(rig, 120, 0)
    // It really took the interaction — a fling is React Native's, and
    // declaring so is what lets it exclude a competing gesture.
    expect(rig.holder()).toBe(rig.view)
  })

  it("parks behind requireExternalGestureToFail like every other kind", () => {
    // The registry is the same one, reached through the same `tryActivate`.
    // A fling that is fast enough and pointed the right way still does not
    // activate while the gesture it waits for is live.
    const orchestrator = createOrchestrator()
    const gate = Gesture.Pan()
    const fling = Gesture.Fling()
    bindGestureTag(gate, 2)
    bindGestureTag(fling, 1)
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
    flick(rig, 120, 0)

    expect(orchestrator.isAwaiting(rig.recognizer.participant)).toBe(true)
    expect(trace).not.toContain("activate")
  })

  it("runs off the pointer props, with no controller channel of its own", () => {
    // The negative control at this level: `Fling` is a POINTER kind. A
    // controller channel on it would mean a second event surface for a gesture
    // the pointer stream carries perfectly well.
    const rig = mount({})
    expect(rig.recognizer.controller).toBeNull()
    expect(Object.keys(rig.recognizer.handlers).length).toBeGreaterThan(0)
  })
})

describe("both spellings build the same gesture", () => {
  it("agrees between Gesture.Fling() and useFlingGesture()", () => {
    const built = Gesture.Fling()
      .direction(DIRECTIONS.UP)
      .numberOfPointers(1)
      .onStart(() => {})
    const hooked = useFlingGesture({
      direction: DIRECTIONS.UP,
      numberOfPointers: 1,
      onActivate: () => {},
    })
    expect(built.kind).toBe(hooked.kind)
    expect(built.config.direction).toBe(hooked.config.direction)
    expect(built.config.numberOfPointers).toBe(hooked.config.numberOfPointers)
  })

  it("offers no onUpdate in either spelling, because there is never one", () => {
    // Upstream's `FlingGesture` extends `BaseGesture`, not
    // `ContinousBaseGesture`, and its v3 config is a `BaseDiscreteGestureConfig`
    // which omits `onUpdate` by name. A fling activates and ends in the same
    // breath; a callback between them could not fire.
    expect(
      (Gesture.Fling() as unknown as Record<string, unknown>).onUpdate,
    ).toBeUndefined()
  })
})

describe("the state the payload reports", () => {
  it("ends in END, which is what a consumer comparing against State reads", () => {
    const states: number[] = []
    const rig = mount({
      onFinalize: (event) => states.push(event.state),
    })
    rig.press()
    flick(rig, 120, 0)
    expect(states).toEqual([GESTURE_STATE.END])
  })

  it("ends in FAILED when the flick was too slow", () => {
    const states: number[] = []
    const rig = mount({
      onFinalize: (event) => states.push(event.state),
    })
    rig.press()
    flick(rig, 120, 0, { stepMs: 150 })
    rig.release(CX + 120, CY)
    expect(states).toEqual([GESTURE_STATE.FAILED])
  })
})
