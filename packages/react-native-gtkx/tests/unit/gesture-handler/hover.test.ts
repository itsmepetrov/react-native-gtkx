// `Hover` and `ForceTouch`: the semantics, driven through the real recognizer
// and the real orchestrator.
//
// The two are together because they share an entry surface — both are fed by a
// GTK controller rather than by the pointer props — and because what is worth
// asserting about that surface is the same for both. What is NOT the same is
// how well each is verified end to end, and this file's boundary is the honest
// one:
//
//   - `Hover` is covered from the GTK signal inward here and from a REAL
//     injected pointer in tests/gtk/gesture-handler/rest-gestures.gtk.test.tsx.
//     A mouse hovers, and `zwlr_virtual_pointer_v1` moves a mouse, so the whole
//     chain runs under the ordinary headless compositor in the ordinary suite;
//   - `ForceTouch` is covered from the GTK signal inward here, and NO FURTHER.
//     Pressure is a tablet axis; nothing in the vitest suite can produce one.
//     What that leaves unverified is written down in docs/api.md rather than
//     implied by a passing test file.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Gesture } from "../../../src/gesture-handler-compat/builder"
import {
  DEFAULT_MIN_FORCE,
  forceTouchDecider,
} from "../../../src/gesture-handler-compat/force-touch"
import { useHoverGesture } from "../../../src/gesture-handler-compat/hooks"
import { hoverDecider } from "../../../src/gesture-handler-compat/hover"
import { createOrchestrator } from "../../../src/gesture-handler-compat/orchestrator"
import { panDecider } from "../../../src/gesture-handler-compat/pan"
import {
  createRecognizer,
  type ControllerSample,
  type Recognizer,
  type RecognizerDecider,
  type Rect,
} from "../../../src/gesture-handler-compat/recognizer"
import { bindGestureTag } from "../../../src/gesture-handler-compat/relations"
import {
  GESTURE_STATE,
  POINTER_TYPE,
  type GestureEventPayload,
  type RecognizerConfig,
} from "../../../src/gesture-handler-compat/types"
import { createResponderSystem } from "../../../src/responder/system"
import type { NativeTouch } from "../../../src/responder/types"

const BOUNDS: Rect = { x: 100, y: 100, width: 200, height: 200 }

const sample = (over: Partial<ControllerSample> = {}): ControllerSample => ({
  x: 60,
  y: 40,
  pointers: 1,
  ...over,
})

type Recorder = {
  begin: GestureEventPayload[]
  activate: GestureEventPayload[]
  update: GestureEventPayload[]
  deactivate: { event: GestureEventPayload; success: boolean }[]
  finalize: { event: GestureEventPayload; success: boolean }[]
}

const recorder = (): { calls: Recorder; config: RecognizerConfig } => {
  const calls: Recorder = {
    begin: [],
    activate: [],
    update: [],
    deactivate: [],
    finalize: [],
  }
  return {
    calls,
    config: {
      onBegin: (event) => calls.begin.push(event),
      onActivate: (event) => calls.activate.push(event),
      onUpdate: (event) => calls.update.push(event),
      onDeactivate: (event, success) =>
        calls.deactivate.push({ event, success }),
      onFinalize: (event, success) => calls.finalize.push({ event, success }),
    },
  }
}

/**
 * One mounted controller recognizer, minus React and minus GTK.
 *
 * `requestResponder` throws rather than returning false, which is an assertion
 * in disguise: neither of these kinds may reach for the interaction lock,
 * because neither has a press and so neither has an interaction.
 */
const mount = (
  decider: RecognizerDecider,
  config: RecognizerConfig,
  orchestrator = createOrchestrator(),
  tag = 1,
  bounds: Rect | null = BOUNDS,
) => {
  let current = config
  const recognizer = createRecognizer(tag, decider, () => current, {
    boundsInWindow: () => bounds,
    requestResponder: () => {
      throw new Error("a controller gesture asked for the responder")
    },
    orchestrator,
  })
  return {
    recognizer,
    orchestrator,
    reconfigure: (next: RecognizerConfig) => {
      current = next
    },
    channel: (): NonNullable<Recognizer["controller"]> => {
      const channel = recognizer.controller
      if (channel === null) {
        throw new Error("this kind has no controller channel")
      }
      return channel
    },
  }
}

/**
 * A `Pan` sitting in BEGAN, on its own responder system.
 *
 * Pressed rather than merely recorded, and that distinction is the reason this
 * helper exists: `record()` puts a participant in the registry, but a gesture
 * the orchestrator cancels only reacts if it is BEGAN or ACTIVE. A recorded but
 * unpressed gesture would absorb the cancel silently and the test would pass
 * against a hover that arbitrated with nothing.
 */
const pressedPan = (
  orchestrator: ReturnType<typeof createOrchestrator>,
  config: RecognizerConfig,
  tag = 2,
) => {
  const view = { name: "pan-view" }
  const root = { name: "pan-root" }
  const parents = new Map<object, object | null>([
    [view, root],
    [root, null],
  ])
  const system = createResponderSystem({
    parentOf: (host) => parents.get(host) ?? null,
    onClaim: vi.fn(),
  })
  const recognizer = createRecognizer(tag, panDecider, () => config, {
    boundsInWindow: () => BOUNDS,
    requestResponder: () => system.requestResponder(view),
    orchestrator,
  })
  system.register(view, () => recognizer.handlers)
  const touch: NativeTouch = {
    identifier: 0,
    target: 1,
    locationX: 100,
    locationY: 100,
    pageX: 200,
    pageY: 200,
    timestamp: 1000,
    force: 0,
  }
  system.touchStart(view, touch)
  return recognizer
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe("Hover: the crossing is the gesture", () => {
  it("goes BEGAN and ACTIVE on the same enter, with no threshold", () => {
    const { calls, config } = recorder()
    const rig = mount(hoverDecider, config)
    rig.channel().begin(sample())
    // Upstream's `onPointerMoveOver` calls `begin()` then `activate()` in one
    // synchronous breath. There is no distance to travel and nothing to
    // disambiguate a hover from, so a threshold would only add latency.
    expect(calls.begin).toHaveLength(1)
    expect(calls.activate).toHaveLength(1)
    expect(calls.activate[0]!.state).toBe(GESTURE_STATE.ACTIVE)
  })

  it("reports the pointer position in the view's own coordinates", () => {
    const { calls, config } = recorder()
    const rig = mount(hoverDecider, config)
    rig.channel().begin(sample({ x: 60, y: 40 }))
    rig.channel().update(sample({ x: 90, y: 70 }))

    const event = calls.update[0]!
    // GTK hands the motion controller widget-local coordinates, which is
    // already the space upstream's `x`/`y` are in — nothing is converted.
    expect(event.x).toBe(90)
    expect(event.y).toBe(70)
    // And the window-relative pair is the view's origin plus that.
    expect(event.absoluteX).toBe(BOUNDS.x + 90)
    expect(event.absoluteY).toBe(BOUNDS.y + 70)
  })

  it("gives changeX/changeY the delta, and the first one the translation", () => {
    const { calls, config } = recorder()
    const rig = mount(hoverDecider, config)
    rig.channel().begin(sample({ x: 60, y: 40 }))
    rig.channel().update(sample({ x: 70, y: 40 }))
    rig.channel().update(sample({ x: 100, y: 40 }))

    // Upstream's `changeEventCalculator` for Hover: the first change IS the
    // position delta since activation, and later ones are differences.
    expect(calls.update[0]!.changeX).toBe(10)
    expect(calls.update[1]!.changeX).toBe(30)
  })

  it("ends — not cancels — when the pointer leaves", () => {
    const { calls, config } = recorder()
    const rig = mount(hoverDecider, config)
    rig.channel().begin(sample())
    rig.channel().update(sample({ x: 80, y: 50 }))
    rig.channel().end()

    expect(calls.deactivate).toHaveLength(1)
    expect(calls.deactivate[0]!.success).toBe(true)
    expect(calls.finalize[0]!.event.state).toBe(GESTURE_STATE.END)
  })

  it("never asks for the responder, however long it runs", () => {
    // `mount` throws if it does. A hover has no press, so there is no
    // interaction to lock, no GTK sequence to claim and nothing to transfer —
    // which is also why a hover cannot exclude a press.
    const rig = mount(hoverDecider, {})
    rig.channel().begin(sample())
    for (let i = 0; i < 20; i += 1) {
      rig.channel().update(sample({ x: 60 + i, y: 40 }))
    }
    rig.channel().end()
    expect(rig.recognizer.participant.holdsResponder()).toBe(false)
  })

  it("answers no touch props at all, so a press cannot begin a hover", () => {
    // The negative control at this level, and the mirror of the one the
    // touchpad kinds have: a hover that also answered `onTouchStart` would
    // fire `onBegin` on every click.
    const rig = mount(hoverDecider, {})
    expect(rig.recognizer.handlers).toEqual({})
    expect(rig.recognizer.controller).not.toBeNull()
  })

  it("refuses a crossing outside its own bounds", () => {
    const { calls, config } = recorder()
    const rig = mount(hoverDecider, config)
    // 400 is past the 200-wide view. GTK would not normally deliver this, and
    // the bounds test is what keeps a mis-attached controller from inventing
    // a hover the pointer never made.
    rig.channel().begin(sample({ x: 400, y: 400 }))
    expect(calls.begin).toHaveLength(0)
  })

  it("honours hitSlop, including the shrinking kind", () => {
    const { calls, config } = recorder()
    const rig = mount(hoverDecider, { ...config, hitSlop: -50 })
    // A negative slop pulls every edge inward, so the corner is outside.
    rig.channel().begin(sample({ x: 10, y: 10 }))
    expect(calls.begin).toHaveLength(0)
    rig.channel().begin(sample({ x: 100, y: 100 }))
    expect(calls.begin).toHaveLength(1)
  })

  it("takes part in the ordinary arbitration", () => {
    // Mutual exclusion is upstream's default and is reproduced: a hover that
    // activates cancels a BEGAN gesture it is not simultaneous with. This is
    // the behaviour apps have to know about, so it is pinned rather than left
    // implicit — docs/api.md says to declare `simultaneousWithExternalGesture`
    // between a hover and anything sharing its screen, which upstream's own
    // Pressable works around the same way.
    const orchestrator = createOrchestrator()
    const hoverCalls = recorder()
    const panCalls = recorder()
    const hover = mount(hoverDecider, hoverCalls.config, orchestrator, 1)
    pressedPan(orchestrator, panCalls.config)

    hover.channel().begin(sample())
    expect(hoverCalls.calls.activate).toHaveLength(1)
    expect(panCalls.calls.finalize).toHaveLength(1)
    expect(panCalls.calls.finalize[0]!.success).toBe(false)
  })

  it("does not cancel a gesture declared simultaneous with it", () => {
    const orchestrator = createOrchestrator()
    const hoverSpec = Gesture.Hover()
    const panSpec = Gesture.Pan()
    bindGestureTag(hoverSpec, 1)
    bindGestureTag(panSpec, 2)
    orchestrator.relations.configure(1, {
      waitFor: [],
      simultaneousHandlers: [panSpec],
      blocksHandlers: [],
    })

    const hoverCalls = recorder()
    const panCalls = recorder()
    const hover = mount(hoverDecider, hoverCalls.config, orchestrator, 1)
    pressedPan(orchestrator, panCalls.config)

    hover.channel().begin(sample())
    expect(hoverCalls.calls.activate).toHaveLength(1)
    expect(panCalls.calls.finalize).toHaveLength(0)
  })

  it("reports MOUSE as the pointer type, because that is what it is", () => {
    const { calls, config } = recorder()
    const rig = mount(hoverDecider, config)
    rig.channel().begin(sample())
    expect(calls.begin[0]!.pointerType).toBe(POINTER_TYPE.MOUSE)
  })

  it("accepts .effect() and does nothing with it, as upstream does off iOS", () => {
    // `hoverEffect` is referenced by upstream's TYPES and by nothing in its web
    // handler. Recorded so the config describes what the app asked for.
    const gesture = Gesture.Hover().effect(2)
    expect(gesture.config.hoverEffect).toBe(2)
    expect(useHoverGesture({ effect: 2 }).config.hoverEffect).toBe(2)
  })
})

describe("ForceTouch: pressure, and the thresholds around it", () => {
  it("does not activate below minForce, and does at it", () => {
    const { calls, config } = recorder()
    const rig = mount(forceTouchDecider, config)
    rig.channel().begin(sample({ force: 0 }))
    rig.channel().update(sample({ force: 0.19 }))
    expect(calls.activate).toHaveLength(0)
    // Non-strict at the bound, matching every other activation threshold here.
    rig.channel().update(sample({ force: DEFAULT_MIN_FORCE }))
    expect(calls.activate).toHaveLength(1)
  })

  it("uses upstream's documented default of 0.2", () => {
    // A DOC COMMENT upstream rather than a constant — no JavaScript in 3.1.0
    // assigns it, because the real default lives in iOS code. Reproduced
    // because a documented default is still upstream's answer.
    expect(DEFAULT_MIN_FORCE).toBe(0.2)
  })

  it("fails above maxForce before it ever activates", () => {
    const { calls, config } = recorder()
    const rig = mount(forceTouchDecider, { ...config, maxForce: 0.5 })
    rig.channel().begin(sample({ force: 0 }))
    rig.channel().update(sample({ force: 0.9 }))
    expect(calls.activate).toHaveLength(0)
    expect(calls.finalize).toHaveLength(1)
    expect(calls.finalize[0]!.event.state).toBe(GESTURE_STATE.FAILED)
  })

  it("cancels an ALREADY ACTIVE gesture that is pressed past maxForce", () => {
    // The ceiling keeps applying after activation, which is the shape
    // `LongPress`'s `maxDistance` has: pressing too hard cancels a gesture that
    // was legitimately running rather than failing one that never started.
    const { calls, config } = recorder()
    const rig = mount(forceTouchDecider, { ...config, maxForce: 0.5 })
    rig.channel().begin(sample({ force: 0 }))
    rig.channel().update(sample({ force: 0.3 }))
    expect(calls.activate).toHaveLength(1)
    rig.channel().update(sample({ force: 0.8 }))
    expect(calls.deactivate).toHaveLength(1)
    expect(calls.deactivate[0]!.success).toBe(false)
    expect(calls.finalize[0]!.event.state).toBe(GESTURE_STATE.CANCELLED)
  })

  it("carries force and forceChange on every payload", () => {
    const { calls, config } = recorder()
    const rig = mount(forceTouchDecider, config)
    rig.channel().begin(sample({ force: 0 }))
    rig.channel().update(sample({ force: 0.4 }))
    rig.channel().update(sample({ force: 0.7 }))

    expect(calls.activate[0]!.force).toBeCloseTo(0.4, 10)
    // The FIRST update reports the force itself as the change, which is
    // upstream's rule for every one of these fields (`changeEventCalculator`
    // returns `current` when there is no previous UPDATE to subtract — the
    // activation is a state change, not an update).
    expect(calls.update[0]!.force).toBeCloseTo(0.7, 10)
    expect(calls.update[0]!.forceChange).toBeCloseTo(0.7, 10)

    // And from the second update on it is a DIFFERENCE, not a ratio:
    // upstream's calculator for ForceTouch subtracts where the one for Pinch
    // divides, because pressure composes by addition and scale does not.
    rig.channel().update(sample({ force: 0.9 }))
    expect(calls.update[1]!.forceChange).toBeCloseTo(0.2, 10)
  })

  it("reports STYLUS as the pointer type, which no other kind does", () => {
    // The one kind whose events are honestly not a mouse. Every other
    // recognizer here reports MOUSE because that is all this platform has.
    const { calls, config } = recorder()
    const rig = mount(forceTouchDecider, config)
    rig.channel().begin(sample({ force: 0.5 }))
    expect(calls.begin[0]!.pointerType).toBe(POINTER_TYPE.STYLUS)
  })

  it("never asks for the responder", () => {
    const rig = mount(forceTouchDecider, {})
    rig.channel().begin(sample({ force: 0.5 }))
    rig.channel().update(sample({ force: 0.6 }))
    rig.channel().end()
    expect(rig.recognizer.participant.holdsResponder()).toBe(false)
  })

  it("answers no touch props, so a mouse press cannot begin a force touch", () => {
    // This is the assertion that keeps a machine with no tablet from producing
    // a ForceTouch at force 0. The controller is `stylusOnly`, and the touch
    // props are empty — there is no path from a mouse into this recognizer.
    const rig = mount(forceTouchDecider, {})
    expect(rig.recognizer.handlers).toEqual({})
  })

  it("accepts feedbackOnActivation and does nothing with it", () => {
    // Haptics. There is no haptic device on this platform, and upstream
    // implements it in iOS code only.
    const gesture = Gesture.ForceTouch()
      .minForce(0.3)
      .maxForce(0.9)
      .feedbackOnActivation(true)
    expect(gesture.config.minForce).toBe(0.3)
    expect(gesture.config.maxForce).toBe(0.9)
    expect(gesture.config.feedbackOnActivation).toBe(true)
  })
})
