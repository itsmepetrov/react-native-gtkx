// `Pinch` and `Rotation`: the semantics, driven through the real recognizer
// and the real orchestrator.
//
// What this file is NOT is a test that a touchpad pinch reaches GTK. Nothing
// in the vitest suite can be: the headless compositor each worker runs against
// is started with `WLR_BACKENDS=headless` and `WLR_LIBINPUT_NO_DEVICES=1`, so
// it enumerates no input devices, and a pinch is not injected — it is
// CONCLUDED by libinput from two fingers on a device it has classified as a
// touchpad. That chain is measured by probe 6
// (`spike/gesture-detector/run-session.sh`, against the desktop session's own
// compositor) and recorded in docs/research/gesture-detector.md.
//
// What IS covered here is everything from `GtkGestureZoom`'s signal inward:
// the numbers upstream promises, the thresholds it activates on, and the fact
// that these two take part in the ordinary arbitration rather than a second
// one. tests/gtk/gesture-handler/touchpad-gestures.gtk.test.tsx does the same
// against a REAL `GtkGestureZoom` attached to a REAL widget by the real
// detector, which is the layer above this one.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Gesture } from "../../../src/gesture-handler-compat/builder"
import {
  usePinchGesture,
  useRotationGesture,
} from "../../../src/gesture-handler-compat/hooks"
import { createOrchestrator } from "../../../src/gesture-handler-compat/orchestrator"
import {
  createRecognizer,
  type ControllerSample,
  type Recognizer,
  type RecognizerDecider,
  type Rect,
} from "../../../src/gesture-handler-compat/recognizer"
import { bindGestureTag } from "../../../src/gesture-handler-compat/relations"
import {
  PINCH_RECOGNITION_THRESHOLD,
  pinchDecider,
  ROTATION_RECOGNITION_THRESHOLD,
  rotationDecider,
} from "../../../src/gesture-handler-compat/touchpad"
import {
  GESTURE_STATE,
  type GestureEventPayload,
  type GestureSpec,
  type RecognizerConfig,
} from "../../../src/gesture-handler-compat/types"

/** The gesture's view, in window coordinates. */
const BOUNDS: Rect = { x: 100, y: 100, width: 200, height: 200 }

const sample = (over: Partial<ControllerSample> = {}): ControllerSample => ({
  scale: 1,
  rotation: 0,
  x: 60,
  y: 40,
  pointers: 2,
  ...over,
})

type Recorder = {
  begin: GestureEventPayload[]
  activate: GestureEventPayload[]
  update: GestureEventPayload[]
  change: GestureEventPayload[]
  deactivate: { event: GestureEventPayload; success: boolean }[]
  finalize: { event: GestureEventPayload; success: boolean }[]
}

const recorder = (): { calls: Recorder; config: RecognizerConfig } => {
  const calls: Recorder = {
    begin: [],
    activate: [],
    update: [],
    change: [],
    deactivate: [],
    finalize: [],
  }
  return {
    calls,
    config: {
      onBegin: (event) => calls.begin.push(event),
      onActivate: (event) => calls.activate.push(event),
      onUpdate: (event) => calls.update.push(event),
      onChange: (event) => calls.change.push(event),
      onDeactivate: (event, success) =>
        calls.deactivate.push({ event, success }),
      onFinalize: (event, success) => calls.finalize.push({ event, success }),
    },
  }
}

/**
 * One mounted touchpad recognizer, minus React and minus GTK.
 *
 * `requestResponder` throws rather than returning false, which is an assertion
 * in disguise: these two kinds must never reach for the interaction lock,
 * because a touchpad pinch has no press and therefore no interaction to lock.
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
      throw new Error("a touchpad gesture asked for the responder")
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
        throw new Error("this kind has no touchpad channel")
      }
      return channel
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe("the touchpad entry surface", () => {
  it("is the ONLY surface a Pinch has — a mouse press cannot begin one", () => {
    const { recognizer } = mount(pinchDecider, {})
    // The negative control at this level. A touchpad kind that also answered
    // the touch props would fire `onBegin` on every click, for a gesture that
    // cannot happen; `detector-runtime` merges these props into the child
    // unconditionally, so an empty set is what stops it.
    expect(Object.keys(recognizer.handlers)).toEqual([])
    expect(recognizer.controller).not.toBeNull()
  })

  it("is absent on every pointer kind, so a pinch cannot drive a pan", () => {
    const spec = Gesture.Pan()
    expect(spec.kind).toBe("pan")
    const { recognizer } = mount(
      { kind: "pan", shouldFail: () => false, shouldActivate: () => false },
      {},
    )
    expect(recognizer.controller).toBeNull()
    expect(Object.keys(recognizer.handlers).length).toBeGreaterThan(0)
  })
})

describe("Pinch", () => {
  it("begins on GTK's begin and does not activate there", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    channel().begin(sample())

    expect(calls.begin).toHaveLength(1)
    expect(calls.activate).toHaveLength(0)
    expect(calls.begin[0]!.state).toBe(GESTURE_STATE.BEGAN)
    // Upstream's `scale` starts at 1 and its `rotation` at 0, which are the
    // identities a consumer multiplies and adds by.
    expect(calls.begin[0]!.scale).toBe(1)
    expect(calls.begin[0]!.rotation).toBe(0)
  })

  it("activates only once the scale has moved past the threshold", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    channel().begin(sample())

    channel().update(sample({ scale: 1 + PINCH_RECOGNITION_THRESHOLD / 2 }))
    expect(calls.activate).toHaveLength(0)
    expect(calls.update).toHaveLength(0)

    channel().update(sample({ scale: 1 + PINCH_RECOGNITION_THRESHOLD }))
    expect(calls.activate).toHaveLength(1)
    // The sample that activated is not ALSO an update: `onActivate` has just
    // reported it, and emitting it twice would make the first `scaleChange`
    // vacuous. Same rule `advance()` applies to the granting move.
    expect(calls.update).toHaveLength(0)
  })

  it("activates on a squeeze as well as on a spread", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    channel().begin(sample())
    channel().update(sample({ scale: 1 - PINCH_RECOGNITION_THRESHOLD }))
    expect(calls.activate).toHaveLength(1)
  })

  it("reports upstream's cumulative scale, and a RATIO for the change", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    channel().begin(sample())
    channel().update(sample({ scale: 1.2 }))
    channel().update(sample({ scale: 1.5 }))
    channel().update(sample({ scale: 3 }))

    expect(calls.update.map((event) => event.scale)).toEqual([1.5, 3])
    // Upstream's `changeEventCalculator` divides for Pinch and subtracts for
    // Rotation, because scale composes by multiplication. The first firing is
    // the scale itself rather than 1 — also upstream's, in both the deprecated
    // calculator and v3's `diffCalculator`.
    expect(calls.update[0]!.scaleChange).toBeCloseTo(1.5, 10)
    expect(calls.update[1]!.scaleChange).toBeCloseTo(2, 10)
    // `onChange` sees the same payload; this module has one payload and
    // `scaleChange` is always on it.
    expect(calls.change.map((event) => event.scaleChange)).toEqual(
      calls.update.map((event) => event.scaleChange),
    )
  })

  it("does NOT re-base the scale at activation, unlike Pan's translation", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    channel().begin(sample())
    channel().update(sample({ scale: 1.4 }))
    channel().update(sample({ scale: 1.6 }))

    // A pan measures translation from where it activated, because reporting
    // the activation threshold as travel would jump the content. Upstream's
    // pinch does not: `resetProgress()` resets `scale` only while the handler
    // is not yet ACTIVE, so 1.6 means 1.6 relative to the START.
    expect(calls.activate[0]!.scale).toBe(1.4)
    expect(calls.update[0]!.scale).toBe(1.6)
  })

  it("reports velocity in scale per SECOND", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    const start = Date.now()
    vi.setSystemTime(start)
    channel().begin(sample())
    vi.setSystemTime(start + 100)
    channel().update(sample({ scale: 1.1 }))
    vi.setSystemTime(start + 200)
    channel().update(sample({ scale: 1.3 }))

    // 0.2 of scale in 100ms is 2.0 per second. Upstream's web path divides by
    // a millisecond delta and never by 1000 — see `GestureEventPayload.velocity`
    // for why the documented unit wins here.
    expect(calls.update[0]!.velocity).toBeCloseTo(2, 6)
  })

  it("puts the focal point in the VIEW's coordinates", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    channel().begin(sample({ x: 60, y: 40 }))
    channel().update(sample({ scale: 1.3, x: 60, y: 40 }))

    const event = calls.activate[0]!
    expect(event.focalX).toBe(60)
    expect(event.focalY).toBe(40)
    // And the absolute pair is the window position, which is the view's
    // origin plus that — the same relationship Pan's `x`/`absoluteX` have.
    expect(event.absoluteX).toBe(BOUNDS.x + 60)
    expect(event.absoluteY).toBe(BOUNDS.y + 40)
    expect(event.numberOfPointers).toBe(2)
  })

  it("ends successfully when it activated and fails when it did not", () => {
    const activated = recorder()
    const stillborn = recorder()
    const one = mount(pinchDecider, activated.config)
    const two = mount(pinchDecider, stillborn.config)

    one.channel().begin(sample())
    one.channel().update(sample({ scale: 1.4 }))
    one.channel().end()
    expect(activated.calls.deactivate).toHaveLength(1)
    expect(activated.calls.deactivate[0]!.success).toBe(true)
    expect(activated.calls.finalize[0]!.success).toBe(true)
    expect(activated.calls.finalize[0]!.event.state).toBe(GESTURE_STATE.END)

    two.channel().begin(sample())
    two.channel().update(sample({ scale: 1.001 }))
    two.channel().end()
    // A gesture that never activated gets `onFinalize` and nothing else —
    // which is how a consumer tells "the pinch finished" from "there was no
    // pinch", exactly as for the pointer kinds.
    expect(stillborn.calls.deactivate).toHaveLength(0)
    expect(stillborn.calls.finalize).toHaveLength(1)
    expect(stillborn.calls.finalize[0]!.success).toBe(false)
    expect(stillborn.calls.finalize[0]!.event.state).toBe(GESTURE_STATE.FAILED)
  })

  it("is cancelled when GTK cancels the sequence", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    channel().begin(sample())
    channel().update(sample({ scale: 1.4 }))
    channel().cancel()

    expect(calls.deactivate[0]!.success).toBe(false)
    expect(calls.finalize[0]!.event.state).toBe(GESTURE_STATE.CANCELLED)
  })

  it("refuses to begin at all when disabled", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, { ...config, enabled: false })
    channel().begin(sample())
    channel().update(sample({ scale: 2 }))
    expect(calls.begin).toHaveLength(0)
    expect(calls.activate).toHaveLength(0)
  })

  it("refuses a focal point outside the view's hit slop", () => {
    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, { ...config, hitSlop: -50 })
    // 10px into a 200px view, with every edge pulled 50px inwards.
    channel().begin(sample({ x: 10, y: 10 }))
    expect(calls.begin).toHaveLength(0)

    channel().begin(sample({ x: 100, y: 100 }))
    expect(calls.begin).toHaveLength(1)
  })

  it("never asks for the responder — there is no interaction to take", () => {
    // The contract, stated: the orchestrator authorizes with
    // `needsResponder = true` whenever no other gesture holds the interaction,
    // which is every touchpad gesture's normal case. `claimsResponder: false`
    // is the only thing between that and `requestResponder()`.
    expect(pinchDecider.claimsResponder).toBe(false)
    expect(rotationDecider.claimsResponder).toBe(false)

    const { calls, config } = recorder()
    const { channel } = mount(pinchDecider, config)
    // And the behaviour: `mount`'s `requestResponder` throws, so reaching for
    // the lock fails this test rather than silently working.
    expect(() => {
      channel().begin(sample())
      channel().update(sample({ scale: 2 }))
      channel().end()
    }).not.toThrow()
    expect(calls.activate).toHaveLength(1)
  })
})

describe("Rotation", () => {
  it("activates at exactly upstream's five degrees", () => {
    expect(ROTATION_RECOGNITION_THRESHOLD).toBe(Math.PI / 36)

    const { calls, config } = recorder()
    const { channel } = mount(rotationDecider, config)
    channel().begin(sample())
    channel().update(
      sample({ rotation: ROTATION_RECOGNITION_THRESHOLD * 0.99 }),
    )
    expect(calls.activate).toHaveLength(0)
    channel().update(sample({ rotation: ROTATION_RECOGNITION_THRESHOLD }))
    expect(calls.activate).toHaveLength(1)
  })

  it("activates on an anticlockwise rotation too", () => {
    const { calls, config } = recorder()
    const { channel } = mount(rotationDecider, config)
    channel().begin(sample())
    channel().update(sample({ rotation: -ROTATION_RECOGNITION_THRESHOLD }))
    expect(calls.activate).toHaveLength(1)
    // Sign preserved: upstream's convention is positive CLOCKWISE, which is
    // also libinput's and GDK's, so nothing is negated on the way through.
    expect(calls.activate[0]!.rotation).toBeCloseTo(
      -ROTATION_RECOGNITION_THRESHOLD,
      10,
    )
  })

  it("reports radians cumulatively, and a DIFFERENCE for the change", () => {
    const { calls, config } = recorder()
    const { channel } = mount(rotationDecider, config)
    channel().begin(sample())
    channel().update(sample({ rotation: 0.2 }))
    channel().update(sample({ rotation: 0.5 }))
    channel().update(sample({ rotation: 0.9 }))

    expect(calls.update.map((event) => event.rotation)).toEqual([0.5, 0.9])
    expect(calls.update[0]!.rotationChange).toBeCloseTo(0.5, 10)
    expect(calls.update[1]!.rotationChange).toBeCloseTo(0.4, 10)
  })

  it("reports velocity in radians per SECOND", () => {
    const { calls, config } = recorder()
    const { channel } = mount(rotationDecider, config)
    const start = Date.now()
    vi.setSystemTime(start)
    channel().begin(sample())
    vi.setSystemTime(start + 250)
    channel().update(sample({ rotation: 0.5 }))
    vi.setSystemTime(start + 500)
    channel().update(sample({ rotation: 1 }))

    expect(calls.update[0]!.velocity).toBeCloseTo(2, 6)
  })

  it("puts the anchor in the VIEW's coordinates", () => {
    const { calls, config } = recorder()
    const { channel } = mount(rotationDecider, config)
    channel().begin(sample({ x: 30, y: 90 }))
    channel().update(sample({ rotation: 0.5, x: 30, y: 90 }))
    expect(calls.activate[0]!.anchorX).toBe(30)
    expect(calls.activate[0]!.anchorY).toBe(90)
  })

  it("does not report a scale, and Pinch does not report a rotation", () => {
    const pinch = recorder()
    const rotate = recorder()
    const one = mount(pinchDecider, pinch.config)
    const two = mount(rotationDecider, rotate.config)

    const start = Date.now()
    vi.setSystemTime(start)
    one.channel().begin(sample())
    two.channel().begin(sample())
    vi.setSystemTime(start + 1000)
    one.channel().update(sample({ scale: 1.5 }))
    two.channel().update(sample({ rotation: 0.5 }))

    expect(pinch.calls.activate[0]!.rotation).toBe(0)
    expect(rotate.calls.activate[0]!.scale).toBe(1)
    // `velocity` is per-kind: the scale one for a Pinch, the angle one for a
    // Rotation, which is how upstream can give both the same field name. Same
    // elapsed second, and each reports its own quantity's rate.
    expect(pinch.calls.activate[0]!.velocity).toBeCloseTo(0.5, 6)
    expect(rotate.calls.activate[0]!.velocity).toBeCloseTo(0.5, 6)
    // And neither leaks into the other's slot: a Pinch whose `velocity` were
    // the angle rate would read 0 here, and a Rotation whose `velocity` were
    // the scale rate would read 0 too. Both are non-zero, which is only true
    // when each is reading its own accumulator.
    expect(pinch.calls.activate[0]!.velocity).not.toBe(0)
    expect(rotate.calls.activate[0]!.velocity).not.toBe(0)
  })
})

describe("both spellings produce the same gesture", () => {
  it("Gesture.Pinch() and usePinchGesture() build the same spec", () => {
    const built = Gesture.Pinch()
    const hooked = usePinchGesture()
    expect(built.kind).toBe("pinch")
    expect(hooked.kind).toBe("pinch")
    // `PinchGestureHandler.init` sets this off upstream, against a base class
    // that turns it on for Tap and LongPress.
    expect(built.config.shouldCancelWhenOutside).toBe(false)
    expect(hooked.config.shouldCancelWhenOutside).toBe(false)
  })

  it("Gesture.Rotation() and useRotationGesture() build the same spec", () => {
    expect(Gesture.Rotation().kind).toBe("rotation")
    expect(useRotationGesture().kind).toBe("rotation")
    expect(Gesture.Rotation().config.shouldCancelWhenOutside).toBe(false)
    expect(useRotationGesture().config.shouldCancelWhenOutside).toBe(false)
  })

  it("carries the callbacks through both spellings", () => {
    const onUpdate = vi.fn()
    expect(Gesture.Pinch().onUpdate(onUpdate).config.onUpdate).toBe(onUpdate)
    expect(usePinchGesture({ onUpdate }).config.onUpdate).toBe(onUpdate)
  })
})

describe("they are ordinary gestures to the arbitration registry", () => {
  const record = (
    orchestrator: ReturnType<typeof createOrchestrator>,
    spec: GestureSpec,
    tag: number,
  ): void => {
    bindGestureTag(spec, tag)
  }

  it("a Pinch and a Pan that race cancel each other the usual way", () => {
    const orchestrator = createOrchestrator()
    const pinch = recorder()
    const rotation = recorder()
    const one = mount(pinchDecider, pinch.config, orchestrator, 1)
    const two = mount(rotationDecider, rotation.config, orchestrator, 2)

    one.channel().begin(sample())
    two.channel().begin(sample())
    one.channel().update(sample({ scale: 1.5 }))
    two.channel().update(sample({ rotation: 0.5 }))

    // Mutual exclusion is the default and there is no relation between these
    // two, so the first to activate broadcasts a cancel at the second. This is
    // `makeActive`, unchanged, reached through the same `tryActivate`.
    expect(pinch.calls.activate).toHaveLength(1)
    expect(rotation.calls.activate).toHaveLength(0)
    expect(rotation.calls.finalize[0]!.event.state).toBe(
      GESTURE_STATE.CANCELLED,
    )
  })

  it("a Simultaneous Pinch and Rotation are both ACTIVE and both update", () => {
    const orchestrator = createOrchestrator()
    const pinch = recorder()
    const rotation = recorder()
    const pinchSpec = Gesture.Pinch()
    const rotationSpec = Gesture.Rotation()
    record(orchestrator, pinchSpec, 1)
    record(orchestrator, rotationSpec, 2)

    const one = mount(
      pinchDecider,
      { ...pinch.config, simultaneousHandlers: [rotationSpec] },
      orchestrator,
      1,
    )
    const two = mount(
      rotationDecider,
      { ...rotation.config, simultaneousHandlers: [pinchSpec] },
      orchestrator,
      2,
    )
    orchestrator.relations.configure(1, {
      waitFor: [],
      simultaneousHandlers: [rotationSpec],
      blocksHandlers: [],
    })
    orchestrator.relations.configure(2, {
      waitFor: [],
      simultaneousHandlers: [pinchSpec],
      blocksHandlers: [],
    })

    one.channel().begin(sample())
    two.channel().begin(sample())
    one.channel().update(sample({ scale: 1.5 }))
    two.channel().update(sample({ rotation: 0.5 }))
    one.channel().update(sample({ scale: 2 }))
    two.channel().update(sample({ rotation: 0.9 }))

    // The `Gesture.Simultaneous(pinch, rotation)` an app writes for a
    // pinch-to-zoom-and-rotate photo view. Both active, both updating.
    expect(pinch.calls.activate).toHaveLength(1)
    expect(rotation.calls.activate).toHaveLength(1)
    expect(pinch.calls.update).toHaveLength(1)
    expect(rotation.calls.update).toHaveLength(1)
  })

  it("a Pinch parked behind requireExternalGestureToFail stays BEGAN", () => {
    const orchestrator = createOrchestrator()
    const pinch = recorder()
    const rotation = recorder()
    const rotationSpec = Gesture.Rotation()
    record(orchestrator, rotationSpec, 2)

    const one = mount(pinchDecider, pinch.config, orchestrator, 1)
    const two = mount(rotationDecider, rotation.config, orchestrator, 2)
    orchestrator.relations.configure(1, {
      waitFor: [rotationSpec],
      simultaneousHandlers: [],
      blocksHandlers: [],
    })

    two.channel().begin(sample())
    one.channel().begin(sample())
    one.channel().update(sample({ scale: 2 }))

    expect(pinch.calls.activate).toHaveLength(0)
    expect(pinch.calls.finalize).toHaveLength(0)

    // The rotation failing releases the waiter, which then activates on its
    // own criteria — the same release path every other kind uses.
    two.channel().end()
    expect(rotation.calls.finalize[0]!.success).toBe(false)
    one.channel().update(sample({ scale: 2.2 }))
    expect(pinch.calls.activate).toHaveLength(1)
  })
})
