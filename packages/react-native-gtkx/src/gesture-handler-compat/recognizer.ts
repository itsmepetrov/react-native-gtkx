// The recognizer: a state machine over RN's touch and responder props, which
// is what a `GestureDetector` actually is once both spellings of the builder
// are stripped away.
//
// THE SEAM THAT MAKES IT WORK, and it reads like a footnote: **View touch
// props fire independently of responder status**. So the machine runs off
// `onTouchStart`/`onTouchMove`, keeps its own
// UNDETERMINED -> BEGAN -> ACTIVE/FAILED progression, holds no lock while it
// is deciding, and returns `true` from `onMoveShouldSetResponder` at exactly
// the instant it activates. `onStartShouldSetResponder` returns false always
// — a pan that grabbed the interaction on press is a pan with no
// `activeOffset` at all, and deciding late is what every offset knob is for.
//
// `responder/system.ts` dispatches the touch props BEFORE it negotiates, in
// both `touchStart` and `touchMove`, so the machine's state is always current
// by the time the negotiation asks it anything. That ordering is load-bearing
// and predates this module.
//
// TWO LOCKS, AT TWO LEVELS, and this file is where they meet. The responder
// lock keeps its one job — one interaction, one holder, one irrevocable GTK
// `CLAIMED` on the source. Gesture arbitration is a second, JS-only registry
// (./orchestrator) that never talks to GTK, and `decide()` below is the one
// place a recognizer asks it for a turn. A gesture that is first to activate
// takes the responder as it always did; a gesture activating alongside one
// that already holds it does not ask, becomes ACTIVE in the registry, and is
// driven from the touch props.
//
// There are therefore two reasons a gesture can be ACTIVE without the lock —
// a kind that never takes it (`Native`, `claimsResponder: false`) and one that
// simply lost the race to a simultaneous partner — and exactly one test for
// both: `runtime.hasResponder`. A static per-kind flag cannot answer it,
// because whether a `Pan` holds the lock is a fact about this interaction.
import type { GestureResponderEvent } from "../responder/types"
import type { Orchestrator, Participant } from "./orchestrator"
import {
  GESTURE_STATE,
  POINTER_TYPE,
  TOUCH_EVENT_TYPE,
  type GestureEventPayload,
  type GestureHitSlop,
  type GestureKind,
  type GestureStateManagerApi,
  type GestureStateValue,
  type GestureTouchEvent,
  type RecognizerConfig,
  type TouchEventTypeValue,
} from "./types"

export type Rect = { x: number; y: number; width: number; height: number }

/**
 * What the recognizer needs from the world it is mounted in: where its view
 * is, and how to take the interaction when no touch event is in flight.
 */
export type RecognizerEnvironment = {
  /**
   * The gesture's own view in WINDOW coordinates, or null before it is laid
   * out. Window coordinates because that is the space RN's `pageX`/`pageY`
   * are in, so no conversion sits between a touch and a bounds test.
   */
  boundsInWindow: () => Rect | null
  /**
   * Ask for the responder outside a touch event. Returns whether it was
   * granted. See `ResponderSystem.requestResponder`.
   */
  requestResponder: () => boolean
  /**
   * The JS-only arbitration registry this gesture takes part in. Injected
   * rather than imported so a test can drive one loop in isolation, exactly
   * as the responder system is injected rather than imported.
   */
  orchestrator: Orchestrator
}

/** The read-only view of the runtime the predicates are allowed to see. */
export type RecognizerView = {
  /** Measured from the point of ACTIVATION once there is one; see `Runtime`. */
  translationX: number
  translationY: number
  /**
   * Straight-line travel from the PRESS, which outlives activation.
   *
   * `LongPress` needs this and translation will not do: it activates on a
   * timer, translation is re-based to the activation point, and upstream's
   * `maxDist` is measured from the press for the whole gesture — so a hold
   * that drifted 8px before the timer and 8px after it has travelled 16, not
   * twice-nearly-nothing.
   */
  distanceFromPress: number
  velocityX: number
  velocityY: number
  /** Whether this press's own timer has already fired. */
  timerElapsed: boolean
  /** Pointers down now, and the most this interaction has ever had at once. */
  pointerCount: number
  maxPointerCount: number
  /** Completed press-release cycles, including the one being decided. */
  taps: number
  /**
   * `Pinch`: the scale since GTK recognized the gesture, 1 at the start.
   * `Rotation`: radians since it did, 0 at the start and positive clockwise.
   *
   * Both are 1 and 0 for every pointer-driven kind, so a predicate that reads
   * them on the wrong kind gets the identity rather than a lie.
   */
  scale: number
  rotation: number
  /**
   * `ForceTouch`: the pressure, normalised to `[0, 1]`.
   *
   * 0 for every other kind — an input with no pressure axis reports no
   * pressure, and a predicate reading this on the wrong kind gets the number
   * that is true rather than one that looks plausible.
   */
  force: number
}

/**
 * The timer a recognizer arms on every press, and what its firing means.
 *
 * All three kinds want one and they disagree only about the outcome: `Pan`'s
 * `activateAfterLongPress` and `LongPress`'s `minDuration` mature the gesture,
 * `Tap`'s `maxDuration` is a deadline that kills it.
 */
export type RecognizerTimer = {
  delay: number
  elapsed: "activate" | "fail"
}

/** What lifting the pointer means to a gesture that is still BEGAN. */
export type ReleaseOutcome =
  | { kind: "activate" }
  | { kind: "fail" }
  /** Not over — wait this long for another press, then fail. */
  | { kind: "await"; delay: number }
  /**
   * Nothing at all: stay BEGAN, with no timer and no decision.
   *
   * `Manual` alone, and it is upstream's documented rule for it — "it will not
   * fail when all the pointers are lifted from the screen". A gesture the app
   * drives has no business being failed by a lift the app did not ask about.
   */
  | { kind: "hold" }

/**
 * What a recognizer kind contributes: predicates over the current state of
 * one press. Everything else — the state progression, the callbacks, the
 * responder plumbing, the bounds tests, the timer — is shared, which is what
 * makes `Tap` and `LongPress` an afternoon rather than a second machine.
 *
 * Only `shouldFail` and `shouldActivate` are required, and `Pan` implements
 * exactly those two: the rest exist because `Tap` activates on a RELEASE and
 * `LongPress` can be cancelled after it is already ACTIVE, and neither shape
 * was reachable from a pair of movement predicates.
 */
export type RecognizerDecider = {
  /**
   * Which kind this is.
   *
   * Carried by the decider because the decider IS what tells the kinds apart,
   * and because the arbitration loop needs exactly one fact about a gesture
   * beyond its relations: whether it is `Gesture.Native()`, the one kind that
   * can cancel an already-active gesture.
   */
  kind: GestureKind
  shouldFail: (view: RecognizerView, config: RecognizerConfig) => boolean
  shouldActivate: (view: RecognizerView, config: RecognizerConfig) => boolean
  /** Absent means "no timer", which is `Pan` without `activateAfterLongPress`. */
  timer?: (config: RecognizerConfig) => RecognizerTimer | null
  /** Absent means an ACTIVE gesture is only ever ended by the pointer. */
  shouldCancelWhileActive?: (
    view: RecognizerView,
    config: RecognizerConfig,
  ) => boolean
  /** Absent means a lift while BEGAN is the end of it, which is `Pan`'s rule. */
  onRelease?: (view: RecognizerView, config: RecognizerConfig) => ReleaseOutcome
  /**
   * Whether activating means taking the responder. Absent means yes, which is
   * every recognizer that decides the interaction is React Native's.
   *
   * `Native` is the one that says no, and it is not an optimisation: taking
   * the responder is what makes the platform declare `CLAIMED` and suspend
   * every enclosing `GtkScrolledWindow`'s kinetics
   * (`responder/use-responder.ts`). A gesture whose entire meaning is "the
   * native widget is handling this" cannot be the thing that stops the native
   * widget from handling it.
   *
   * A recognizer that does not claim runs off the touch props alone — they
   * fire regardless of responder status, which is the same seam the BEGAN
   * phase already uses. It never receives `onResponderMove`, so its updates
   * come from `onTouchMove` and its ending from `onTouchEnd`/`onTouchCancel`.
   */
  claimsResponder?: boolean
  /**
   * Activating IS the whole gesture: end it, successfully, in the same breath.
   *
   * `Fling` alone, and it is upstream's own shape rather than a shortcut —
   * `FlingGestureHandler.activate()` is overridden to call `this.end()`
   * immediately after `super.activate()`. A fling is a verdict about a motion
   * that has already happened, so there is nothing left to report once it is
   * reached: BEGAN -> ACTIVE -> END, synchronously, with `onStart` and `onEnd`
   * one after the other and no `onUpdate` between them.
   */
  endsOnActivate?: boolean
  /**
   * Which entry surface drives this kind. Absent means `"pointer"`.
   *
   * The one structural concession this module makes, and it is about where
   * events COME FROM rather than about what happens to them. Three kinds of
   * input are simply not in the pointer stream:
   *
   *   - `"touchpad"` — `Pinch`/`Rotation`, fed by
   *     `GtkGestureZoom`/`GtkGestureRotate`, because a touchpad pinch presses
   *     no button and so opens no GTK sequence and no responder session;
   *   - `"hover"` — `Hover`, fed by `GtkEventControllerMotion`, because a
   *     pointer that is merely OVER a view has pressed nothing either, and
   *     RN's touch props fire only from a press;
   *   - `"stylus"` — `ForceTouch`, fed by `GtkGestureStylus`, because pressure
   *     is a tablet axis and `wl_pointer` has none.
   *
   * Everything downstream of the entry point is this same machine: the same
   * states, the same callbacks, the same payload, the same `tryActivate` and
   * the same relation maps. There is no second arbitration path.
   *
   * Exactly one surface is live per recognizer. A non-pointer kind's
   * touch/responder props are empty, so a mouse press cannot begin a pinch or
   * a hover; a `"pointer"` kind's controller channel is inert, so a pinch
   * cannot begin a pan.
   */
  source?: "pointer" | "touchpad" | "hover" | "stylus"
}

type Timer = ReturnType<typeof setTimeout> | null

type Runtime = {
  state: GestureStateValue
  oldState: GestureStateValue
  /**
   * WALL CLOCK at the press, which is what `duration` is measured against.
   * Not the event's own `timestamp`: that is GTK's event time, with no fixed
   * epoch, and a timer firing has no event to read one off anyway. Upstream
   * computes it the same way.
   */
  pressTime: number
  /** Where translation is measured FROM; reset to the activation point. */
  originX: number
  originY: number
  /** Where the press landed, which activation does NOT move. */
  pressX: number
  pressY: number
  lastX: number
  lastY: number
  lastTime: number
  velocityX: number
  velocityY: number
  /** The previous update's translation, for the change delta. */
  changeFromX: number
  changeFromY: number
  /** Whether any update has been emitted yet, for the first change delta. */
  hasEmittedUpdate: boolean
  /** Whether the gesture ever reached ACTIVE, which outlives the state itself. */
  hasActivated: boolean
  activationTimer: Timer
  timerElapsed: boolean
  pointerCount: number
  maxPointerCount: number
  /**
   * Completed press-release cycles, and the timer waiting for the next one.
   *
   * These two are the only state that survives a press, and the timer IS the
   * sequence: while it is armed the gesture is a multi-tap in progress, and
   * the next `onTouchStart` continues it instead of starting over.
   */
  taps: number
  delayTimer: Timer
  /**
   * The orchestrator cleared this gesture to become ACTIVE and it is waiting
   * for the responder lock to catch up.
   *
   * This is the ONLY thing `onMoveShouldSetResponder` answers from. It used to
   * mean "a timer or a callback asked to activate", which was the same thing
   * while there was nothing to arbitrate; now the difference is load-bearing,
   * because a gesture parked behind `requireExternalGestureToFail` wants to
   * activate and must not be allowed to take the lock.
   */
  authorized: boolean
  /**
   * Whether THIS gesture holds the responder, in THIS interaction.
   *
   * Which of two update pumps drives it: the holder reads `onResponderMove`,
   * anything else ACTIVE reads `onTouchMove`. Two different gestures end up on
   * the second pump and only this flag covers both — a kind that never takes
   * the lock (`claimsResponder: false`), and a kind that does but lost the
   * race to a simultaneous partner. Exactly one pump fires per gesture.
   */
  hasResponder: boolean
  forcedFailure: boolean
  /**
   * The touchpad gesture's own accumulators, and the values the previous
   * update reported — which is what `scaleChange`/`rotationChange` and
   * `velocity` are computed from.
   *
   * Held here rather than read back off the GTK controller so that a
   * recognizer measures what it was TOLD. `gtk_gesture_zoom_get_scale_delta`
   * returns 1 the moment the gesture is no longer active, so an `end` handler
   * that asked GTK would report the gesture undoing itself.
   */
  scale: number
  rotation: number
  scaleVelocity: number
  rotationVelocity: number
  changeFromScale: number
  changeFromRotation: number
  /** `ForceTouch`'s pressure, and the value the previous update reported. */
  force: number
  changeFromForce: number
  /** Wall clock of the last controller sample, for the per-second velocities. */
  lastSampleTime: number
}

const newRuntime = (): Runtime => ({
  state: GESTURE_STATE.UNDETERMINED,
  oldState: GESTURE_STATE.UNDETERMINED,
  pressTime: 0,
  originX: 0,
  originY: 0,
  pressX: 0,
  pressY: 0,
  lastX: 0,
  lastY: 0,
  lastTime: 0,
  velocityX: 0,
  velocityY: 0,
  changeFromX: 0,
  changeFromY: 0,
  hasEmittedUpdate: false,
  hasActivated: false,
  activationTimer: null,
  timerElapsed: false,
  pointerCount: 0,
  maxPointerCount: 0,
  taps: 0,
  delayTimer: null,
  authorized: false,
  hasResponder: false,
  forcedFailure: false,
  scale: 1,
  rotation: 0,
  scaleVelocity: 0,
  rotationVelocity: 0,
  changeFromScale: 1,
  changeFromRotation: 0,
  force: 0,
  changeFromForce: 0,
  lastSampleTime: 0,
})

/**
 * RNGH's `checkHitSlop`, restated: build the acceptable box in the view's own
 * coordinates, then test the pointer's offset into the view against it.
 *
 * Every side is "outward is positive", so a NEGATIVE value shrinks the box —
 * the capability RN's own View `hitSlop` does not have. Explicit sides
 * override `horizontal`/`vertical`, and `width`/`height` then anchor the
 * opposite edge to whichever side was named.
 *
 * The plain-number spelling is normalised into the four sides up front.
 * Upstream's web path does not do this and silently ignores a number, which
 * is a bug rather than a semantic worth reproducing — its own native paths
 * normalise exactly this way.
 */
export const hitSlopRect = (
  bounds: Rect,
  hitSlop: GestureHitSlop | undefined,
): Rect => {
  if (hitSlop === undefined || hitSlop === null) {
    return bounds
  }
  const slop =
    typeof hitSlop === "number"
      ? { left: hitSlop, right: hitSlop, top: hitSlop, bottom: hitSlop }
      : hitSlop

  let left = 0
  let top = 0
  let right = bounds.width
  let bottom = bounds.height

  if (slop.horizontal !== undefined) {
    left -= slop.horizontal
    right += slop.horizontal
  }
  if (slop.vertical !== undefined) {
    top -= slop.vertical
    bottom += slop.vertical
  }
  if (slop.left !== undefined) {
    left = -slop.left
  }
  if (slop.right !== undefined) {
    right = bounds.width + slop.right
  }
  if (slop.top !== undefined) {
    top = -slop.top
  }
  if (slop.bottom !== undefined) {
    bottom = bounds.height + slop.bottom
  }
  if (slop.width !== undefined) {
    if (slop.left !== undefined) {
      right = left + slop.width
    } else if (slop.right !== undefined) {
      left = right - slop.width
    }
  }
  if (slop.height !== undefined) {
    if (slop.top !== undefined) {
      bottom = top + slop.height
    } else if (slop.bottom !== undefined) {
      top = bottom - slop.height
    }
  }

  return {
    x: bounds.x + left,
    y: bounds.y + top,
    width: right - left,
    height: bottom - top,
  }
}

const contains = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.x &&
  x <= rect.x + rect.width &&
  y >= rect.y &&
  y <= rect.y + rect.height

/**
 * One frame from whichever GTK controller feeds a non-pointer kind, in the
 * terms the recognizer reads.
 *
 * ONE sample type for three sources rather than three, because what the
 * machine needs from all of them is the same short list and only two fields
 * differ per kind. `scale` and `rotation` are CUMULATIVE since GTK recognized
 * the gesture, which is what `gtk_gesture_zoom_get_scale_delta` ("the zooming
 * difference since the gesture was recognized, hence the starting point is
 * considered 1:1") and `gtk_gesture_rotate_get_angle_delta` already are — the
 * same shape as upstream's own accumulators, so nothing is re-derived on the
 * way in.
 */
export type ControllerSample = {
  /**
   * Where the gesture is, in the gesture VIEW's own coordinates.
   *
   * A pinch's bounding-box centre, a hover's pointer, a stylus tip: three
   * names for the position the payload's `x`/`y`, `focalX`/`focalY` and
   * `anchorX`/`anchorY` are all filled from, which is why they are one pair
   * of fields and not three.
   */
  x: number
  y: number
  /** `Pinch`: 1 at the start of the gesture, above 1 for a spread. */
  scale?: number
  /** `Rotation`: 0 at the start; radians, positive clockwise. */
  rotation?: number
  /** `ForceTouch`: pressure normalised to `[0, 1]`. */
  force?: number
  /** Pointers GTK reported. A touchpad pinch is always two; a hover is one. */
  pointers: number
}

/**
 * The non-pointer entry surface, for the kinds GTK feeds rather than the
 * pointer stream. Null on every pointer kind — see `RecognizerDecider.source`.
 */
export type ControllerChannel = {
  begin: (sample: ControllerSample) => void
  update: (sample: ControllerSample) => void
  end: () => void
  cancel: () => void
}

export type Recognizer = {
  /** The responder props to put on the gesture's view. Empty for a controller kind. */
  handlers: Record<string, (event: GestureResponderEvent) => boolean | void>
  /**
   * Where `GtkGestureZoom`/`GtkGestureRotate`/`GtkEventControllerMotion`/
   * `GtkGestureStylus` deliver, or null for a pointer kind.
   */
  controller: ControllerChannel | null
  /** This gesture's seat in the arbitration loop. */
  participant: Participant
  /**
   * The four transitions an app may drive by hand, exposed rather than kept
   * private to the `onTouches*` closures below.
   *
   * Until ./tag-registry this was reachable only as the second argument
   * `onTouchesDown`/`onTouchesMove`/`onTouchesUp`/`onTouchesCancel` receive —
   * which is still how `Gesture.Manual()` itself works, unchanged. Putting
   * the same object here too is what lets a numeric handler tag be turned
   * back into it, which is the whole of what `GestureStateManager` needs.
   */
  stateManager: GestureStateManagerApi
  /** Cancels any pending timer and leaves the loop; called on unmount. */
  dispose: () => void
}

/**
 * Builds the machine. `readConfig` is called on every event rather than
 * captured, so a re-render that hands the detector a fresh gesture object —
 * which is what both spellings produce, every render — takes effect without
 * swapping the handler set mid-drag.
 */
export const createRecognizer = (
  handlerTag: number,
  decider: RecognizerDecider,
  readConfig: () => RecognizerConfig,
  env: RecognizerEnvironment,
): Recognizer => {
  let runtime = newRuntime()

  const isEnabled = (): boolean => readConfig().enabled !== false

  /**
   * What kind of device this gesture's events come from.
   *
   * `MOUSE` for everything except `ForceTouch`, and that is not a default with
   * a hole in it: this platform has one pointer and no touch injection, so
   * every other kind really is a mouse. A pressure reading can only have come
   * from a tablet tool, so the one kind that reads pressure reports `STYLUS`.
   */
  const pointerType =
    decider.source === "stylus" ? POINTER_TYPE.STYLUS : POINTER_TYPE.MOUSE

  const setState = (next: GestureStateValue): void => {
    runtime.oldState = runtime.state
    runtime.state = next
  }

  const viewOf = (): RecognizerView => ({
    translationX: runtime.lastX - runtime.originX,
    translationY: runtime.lastY - runtime.originY,
    distanceFromPress: Math.hypot(
      runtime.lastX - runtime.pressX,
      runtime.lastY - runtime.pressY,
    ),
    velocityX: runtime.velocityX,
    velocityY: runtime.velocityY,
    timerElapsed: runtime.timerElapsed,
    pointerCount: runtime.pointerCount,
    maxPointerCount: runtime.maxPointerCount,
    taps: runtime.taps,
    scale: runtime.scale,
    rotation: runtime.rotation,
    force: runtime.force,
  })

  /**
   * One payload, from a point rather than from an event.
   *
   * A timer has no event to build one from and every one of the three kinds
   * has a timer that can end the gesture — `Tap`'s `maxDuration` and
   * `maxDelay` both finalize with no pointer in flight. Fabricating a
   * `GestureResponderEvent` to feed an event-shaped builder would have put an
   * invented event into the responder system's own vocabulary; taking the
   * three numbers the payload actually needs does not.
   */
  const payloadAt = (
    pageX: number,
    pageY: number,
    pointerCount: number,
    fallback?: { locationX: number; locationY: number },
  ): GestureEventPayload => {
    const bounds = env.boundsInWindow()
    const translationX = pageX - runtime.originX
    const translationY = pageY - runtime.originY
    return {
      handlerTag,
      numberOfPointers: pointerCount,
      pointerType,
      state: runtime.state,
      oldState: runtime.oldState,
      // RNGH's `x`/`y` are relative to the GESTURE's view. The responder
      // event's own `locationX` is relative to whichever widget carried the
      // event, which is the deepest one with a controller and not always this
      // one — so it is recomputed rather than passed through.
      x: bounds ? pageX - bounds.x : (fallback?.locationX ?? pageX),
      y: bounds ? pageY - bounds.y : (fallback?.locationY ?? pageY),
      absoluteX: pageX,
      absoluteY: pageY,
      translationX,
      translationY,
      velocityX: runtime.velocityX,
      velocityY: runtime.velocityY,
      // On the first update the change IS the translation, which is
      // upstream's rule rather than an approximation of it.
      changeX: runtime.hasEmittedUpdate
        ? translationX - runtime.changeFromX
        : translationX,
      changeY: runtime.hasEmittedUpdate
        ? translationY - runtime.changeFromY
        : translationY,
      duration: Date.now() - runtime.pressTime,
      scale: runtime.scale,
      // A RATIO, not a difference — scale composes by multiplication, and
      // upstream's `changeEventCalculator` for `Pinch` divides where the one
      // for `Rotation` subtracts. On the first update it is the scale itself,
      // which is upstream's rule for both and the same rule `changeX` follows.
      scaleChange: runtime.hasEmittedUpdate
        ? runtime.scale / runtime.changeFromScale
        : runtime.scale,
      // The focal point IS the position for these two kinds: the touchpad
      // channel writes the gesture's bounding-box centre into the same
      // last-position fields the pointer kinds write a touch into, so `x`/`y`
      // and `focalX`/`focalY` are the same number arrived at the same way.
      focalX: bounds ? pageX - bounds.x : (fallback?.locationX ?? pageX),
      focalY: bounds ? pageY - bounds.y : (fallback?.locationY ?? pageY),
      rotation: runtime.rotation,
      rotationChange: runtime.hasEmittedUpdate
        ? runtime.rotation - runtime.changeFromRotation
        : runtime.rotation,
      anchorX: bounds ? pageX - bounds.x : (fallback?.locationX ?? pageX),
      anchorY: bounds ? pageY - bounds.y : (fallback?.locationY ?? pageY),
      force: runtime.force,
      // A DIFFERENCE, like `rotationChange` and unlike `scaleChange`, because
      // upstream's `changeEventCalculator` for `ForceTouch` subtracts. On the
      // first update it is the force itself, which is upstream's rule there
      // and the same rule `changeX` follows.
      forceChange: runtime.hasEmittedUpdate
        ? runtime.force - runtime.changeFromForce
        : runtime.force,
      velocity:
        decider.kind === "rotation"
          ? runtime.rotationVelocity
          : runtime.scaleVelocity,
    }
  }

  const payloadOf = (event: GestureResponderEvent): GestureEventPayload => {
    const { pageX, pageY, locationX, locationY } = event.nativeEvent
    return payloadAt(pageX, pageY, event.nativeEvent.touches.length, {
      locationX,
      locationY,
    })
  }

  /** The payload for a decision a timer made, from the last known position. */
  const payloadNow = (): GestureEventPayload =>
    payloadAt(runtime.lastX, runtime.lastY, runtime.pointerCount)

  const touchEventOf = (
    event: GestureResponderEvent,
    eventType: TouchEventTypeValue,
  ): GestureTouchEvent => {
    const bounds = env.boundsInWindow()
    const toData = (touch: {
      identifier: number
      pageX: number
      pageY: number
    }) => ({
      id: touch.identifier,
      x: bounds ? touch.pageX - bounds.x : touch.pageX,
      y: bounds ? touch.pageY - bounds.y : touch.pageY,
      absoluteX: touch.pageX,
      absoluteY: touch.pageY,
    })
    return {
      handlerTag,
      numberOfTouches: event.nativeEvent.touches.length,
      eventType,
      allTouches: event.nativeEvent.touches.map(toData),
      changedTouches: event.nativeEvent.changedTouches.map(toData),
      state: runtime.state,
      pointerType,
    }
  }

  const clearActivationTimer = (): void => {
    if (runtime.activationTimer !== null) {
      clearTimeout(runtime.activationTimer)
      runtime.activationTimer = null
    }
  }

  const clearDelayTimer = (): void => {
    if (runtime.delayTimer !== null) {
      clearTimeout(runtime.delayTimer)
      runtime.delayTimer = null
    }
  }

  const track = (event: GestureResponderEvent): void => {
    const { pageX, pageY, timestamp } = event.nativeEvent
    const elapsed = timestamp - runtime.lastTime
    if (elapsed > 0) {
      runtime.velocityX = ((pageX - runtime.lastX) / elapsed) * 1000
      runtime.velocityY = ((pageY - runtime.lastY) / elapsed) * 1000
    }
    runtime.lastX = pageX
    runtime.lastY = pageY
    runtime.lastTime = timestamp
    countPointers(event)
  }

  const countPointers = (event: GestureResponderEvent): void => {
    runtime.pointerCount = event.nativeEvent.touches.length
    runtime.maxPointerCount = Math.max(
      runtime.maxPointerCount,
      runtime.pointerCount,
    )
  }

  /**
   * Every exit from a live gesture goes through here exactly once, and this is
   * where the tap sequence dies: `newRuntime()` drops `taps` along with
   * everything else, so a finalized multi-tap starts counting from zero.
   */
  const finalize = (
    payloadFor: () => GestureEventPayload,
    success: boolean,
  ): void => {
    if (runtime.state === GESTURE_STATE.UNDETERMINED) {
      // Already over. The responder system dispatches `onResponderRelease` to
      // whoever holds the lock at the end of the interaction, and a gesture
      // can have cancelled itself while still holding it — a `LongPress` that
      // wandered past `maxDistance`, or one the orchestrator cancelled. One
      // exit per gesture, and this is where the second one stops.
      return
    }
    const config = readConfig()
    clearActivationTimer()
    clearDelayTimer()
    // Read the flag, not the state: a cancellation sets the state to
    // CANCELLED on its way in, and an ACTIVE gesture that gets cancelled must
    // still be told it deactivated.
    const wasActive = runtime.hasActivated
    if (success) {
      setState(GESTURE_STATE.END)
    }
    // Built AFTER the transition, so `event.state` is the state the gesture
    // ended in — which is what a consumer comparing it against `State` reads.
    const payload = payloadFor()
    // The deactivation callback is the ACTIVE gesture's ending. A gesture
    // that never activated gets `onFinalize` and nothing else, which is what
    // lets a consumer distinguish a drag that finished from one that never
    // happened — `react-native-reanimated-dnd` relies on exactly that.
    if (wasActive) {
      config.onDeactivate?.(payload, success)
    }
    config.onFinalize?.(payload, success)
    // Told AFTER the callbacks and BEFORE the reset. After, so a gesture this
    // failure releases from `awaiting` starts where the previous one left off
    // rather than in the middle of it; before, so the loop is handed the state
    // the gesture actually ended in — END releases nobody and cancels the
    // waiters, FAILED and CANCELLED release them.
    env.orchestrator.finished(participant, runtime.state)
    runtime = newRuntime()
  }

  const finalizeAt = (event: GestureResponderEvent, success: boolean): void => {
    finalize(() => payloadOf(event), success)
  }

  const fail = (event: GestureResponderEvent): void => {
    clearActivationTimer()
    setState(GESTURE_STATE.FAILED)
    finalize(() => payloadOf(event), false)
  }

  /** A timer decided this, so there is no event and the position is the last one. */
  const failNow = (): void => {
    clearActivationTimer()
    setState(GESTURE_STATE.FAILED)
    finalize(payloadNow, false)
  }

  /** Whether this kind takes the interaction when it activates. */
  const claimsResponder = decider.claimsResponder !== false

  /**
   * Everything becoming ACTIVE means, from a position rather than an event.
   *
   * Three ways in now, and the third is the whole of slice 3: `onResponderGrant`
   * for a recognizer that took the lock, `authorize()` for one that never will
   * (`claimsResponder: false`), and `authorize()` again for one that WOULD have
   * but was told the interaction is already held by a gesture it is
   * simultaneous with. Everything after the transition is identical, because
   * being ACTIVE is a fact about the gesture and not about the lock.
   */
  const enterActive = (pageX: number, pageY: number): void => {
    setState(GESTURE_STATE.ACTIVE)
    runtime.authorized = false
    clearActivationTimer()
    clearDelayTimer()
    // Translation is measured from where the gesture BECAME ACTIVE, not
    // from the press: a pan with `activeOffsetY([-10, 10])` that reported
    // 10px of travel the moment it started would jump the content by the
    // threshold on every drag. With `activateAfterLongPress` the pointer
    // has not moved when the timer grants, so the two origins coincide —
    // which is only true because the grant no longer waits for a move.
    runtime.originX = pageX
    runtime.originY = pageY
    runtime.lastX = pageX
    runtime.lastY = pageY
    runtime.changeFromX = 0
    runtime.changeFromY = 0
    runtime.hasEmittedUpdate = false
    runtime.hasActivated = true
  }

  /**
   * `Fling`'s ending, which is the same instant as its activation.
   *
   * Called at the tail of every path into ACTIVE, so the one-shot kind behaves
   * identically however it got there — a grant, an authorization without one,
   * or a controller channel. Upstream reaches this by overriding `activate()`
   * to call `end()`; a flag on the decider is the same statement without a
   * subclass to put it on.
   */
  const endIfOneShot = (): void => {
    if (decider.endsOnActivate === true) {
      finalize(payloadNow, true)
    }
  }

  /** Becoming ACTIVE without a grant to carry the position or the payload. */
  const activateHere = (): void => {
    enterActive(runtime.lastX, runtime.lastY)
    const payload = payloadNow()
    // Mutual exclusion is enforced here rather than at the moment permission
    // was given, because permission is not always the same instant: a gesture
    // that has to take the responder becomes ACTIVE only if the negotiation
    // grants it, and an ancestor can still win.
    env.orchestrator.activated(participant)
    readConfig().onActivate?.(payload)
    endIfOneShot()
  }

  /**
   * The orchestrator's answer, and the only place the two locks touch.
   *
   * `needsResponder` false means another gesture already holds the interaction
   * and this one was cleared to run alongside it. It does NOT ask for the
   * responder: the lock is single-holder by design, GTK has already been told
   * everything it can be told, and winning the lock would take the interaction
   * away from the gesture this one was written to accompany.
   *
   * A recognizer that never claims takes the same path for its own reason —
   * it is not asking for the interaction, it is reporting that the widget
   * underneath it has taken one.
   */
  const authorize = (needsResponder: boolean): void => {
    if (runtime.state !== GESTURE_STATE.BEGAN) {
      return
    }
    runtime.authorized = true
    if (!claimsResponder || !needsResponder) {
      activateHere()
      return
    }
    // The out-of-event channel, asked from inside a touch event as well as
    // from a timer, and that uniformity is not laziness. Slice 1 could leave
    // an in-event activation to the negotiation the responder system runs
    // after the touch props, because there was only ever one gesture asking.
    // With two, both would defer into the same negotiation, exactly one would
    // win it, and the loser would sit authorized and never activate — so
    // `Simultaneous` would silently be a race. Asking here settles the lock
    // before the second gesture is even consulted, which is what lets it be
    // told the interaction is already taken.
    //
    // It is the same negotiation either way: `requestResponder` reuses
    // `negotiateAndTransfer` unchanged, so capture still beats bubble and an
    // ancestor can still win.
    env.requestResponder()
  }

  /**
   * The one place a recognizer asks to become active, and therefore the seam
   * the orchestrator sits in.
   *
   * Every path that used to take the responder now goes through here first:
   * the gesture's own criteria being met is a request, not a decision. What
   * comes back is `authorize()` (with or without the lock), a parking in
   * `awaiting` that leaves the gesture BEGAN holding nothing, or a
   * cancellation. `Native` goes through it too — a gesture that never takes
   * the lock still takes part in arbitration, and it is the one kind that can
   * cancel an already-active gesture.
   */
  const decide = (): void => {
    if (runtime.authorized || runtime.state !== GESTURE_STATE.BEGAN) {
      return
    }
    env.orchestrator.tryActivate(participant)
  }

  /** Cancelled by the loop: another gesture won, or the one it waited for ended. */
  const cancelFromOrchestrator = (): void => {
    if (
      runtime.state !== GESTURE_STATE.BEGAN &&
      runtime.state !== GESTURE_STATE.ACTIVE
    ) {
      return
    }
    setState(GESTURE_STATE.CANCELLED)
    finalize(payloadNow, false)
  }

  const participant: Participant = {
    tag: handlerTag,
    kind: decider.kind,
    authorize,
    holdsResponder: () => runtime.hasResponder,
    cancel: cancelFromOrchestrator,
  }

  /**
   * The state, read through a call.
   *
   * Not decoration: `decide()` can change the state before it returns — the
   * orchestrator may activate the gesture, or cancel it, synchronously — and a
   * narrowed `runtime.state` read straight afterwards is a fact the compiler
   * believes and the runtime does not.
   */
  const stateNow = (): GestureStateValue => runtime.state

  /**
   * The four transitions an app may drive by hand — upstream's
   * `GestureStateManager`, and the whole of what `Gesture.Manual()` is.
   *
   * These used to be two real transitions and two deferrals: `fail()` and
   * `end()` both set a flag that the next `onTouchMove` noticed, which was
   * enough while the only caller was a `Pan` narrowing its own criteria, and
   * is not enough for a gesture that has NO criteria. `Manual` is driven
   * entirely from here, so each of the four has to mean what upstream's means,
   * at the moment it is called:
   *
   *   begin     UNDETERMINED -> BEGAN
   *   activate  BEGAN -> ACTIVE, through the orchestrator like every other
   *             activation — a manual gesture takes part in arbitration
   *             rather than bypassing it, which is the point of having it
   *   end       BEGAN or ACTIVE -> END, successfully
   *   fail      BEGAN or ACTIVE -> FAILED
   *
   * `activate()` is FORCED past `manualActivation`, exactly as upstream's web
   * state manager calls `handler.activate(true)`: that flag exists to stop the
   * gesture's own predicates activating it, and this is not them.
   */
  const stateManager: GestureStateManagerApi = {
    begin: () => {
      if (runtime.state === GESTURE_STATE.UNDETERMINED) {
        setState(GESTURE_STATE.BEGAN)
        readConfig().onBegin?.(payloadNow())
      }
    },
    activate: () => {
      // Upstream forces the BEGAN step first when asked to activate a gesture
      // that never began, "to preserve the correct state transition flow" —
      // and here it also matters that the orchestrator has been told about the
      // gesture, which `record()` on the press is what does.
      if (runtime.state === GESTURE_STATE.UNDETERMINED) {
        setState(GESTURE_STATE.BEGAN)
        env.orchestrator.record(participant)
        readConfig().onBegin?.(payloadNow())
      }
      if (runtime.state === GESTURE_STATE.BEGAN) {
        decide()
      }
    },
    fail: () => {
      if (
        runtime.state === GESTURE_STATE.BEGAN ||
        runtime.state === GESTURE_STATE.ACTIVE
      ) {
        // Kept as well as acted on: a gesture failed from inside
        // `onTouchesDown` has not reached the move that would have consulted
        // its predicates, and the flag is what stops a later move reviving it.
        runtime.forcedFailure = true
        failNow()
      }
    },
    end: () => {
      if (
        runtime.state === GESTURE_STATE.BEGAN ||
        runtime.state === GESTURE_STATE.ACTIVE
      ) {
        runtime.forcedFailure = true
        finalize(payloadNow, true)
      }
    },
  }

  const outsideBounds = (event: GestureResponderEvent): boolean => {
    const bounds = env.boundsInWindow()
    if (bounds === null) {
      // Before the first layout there is no truth to test against, and
      // refusing every press would be worse than accepting them.
      return false
    }
    const { pageX, pageY } = event.nativeEvent
    return !contains(hitSlopRect(bounds, readConfig().hitSlop), pageX, pageY)
  }

  const pointerCountAllowed = (event: GestureResponderEvent): boolean => {
    const config = readConfig()
    const count = event.nativeEvent.touches.length
    return (
      count >= (config.minPointers ?? 1) && count <= (config.maxPointers ?? 10)
    )
  }

  /**
   * One ACTIVE gesture's reaction to the pointer moving, from whichever
   * channel reached it: `onResponderMove` for the lock's holder,
   * `onTouchMove` for a recognizer that never takes it.
   *
   * Returns nothing; the gesture may have finalized itself on the way out.
   */
  const advance = (event: GestureResponderEvent): void => {
    track(event)
    const config = readConfig()
    if (
      (config.shouldCancelWhenOutside === true && outsideBounds(event)) ||
      // `LongPress` is the one kind that can be cancelled by movement it has
      // already accepted: `maxDistance` keeps applying once the press has
      // matured, and travelling past it while ACTIVE is a cancellation
      // rather than a failure.
      decider.shouldCancelWhileActive?.(viewOf(), config) === true
    ) {
      setState(GESTURE_STATE.CANCELLED)
      finalizeAt(event, false)
      return
    }
    const payload = payloadOf(event)
    // The event that GRANTED the responder reaches here too — the system
    // dispatches the move to whoever holds the lock after the handoff, in
    // the same event. Emitting it would be an update of zero travel that
    // `onActivate` has just reported the position of, and it would make
    // upstream's rule that the FIRST change equals the translation vacuous:
    // that first delta would always be zero. So the activation event is not
    // an update, and the first real move is.
    if (
      !runtime.hasEmittedUpdate &&
      payload.translationX === 0 &&
      payload.translationY === 0
    ) {
      return
    }
    config.onUpdate?.(payload)
    config.onChange?.(payload)
    runtime.changeFromX = payload.translationX
    runtime.changeFromY = payload.translationY
    runtime.hasEmittedUpdate = true
  }

  const handlers = {
    // Always false. A pan that takes the interaction on press cannot honour
    // an `activeOffset`, and letting a sibling or an ancestor win instead is
    // the behaviour every offset knob exists to produce.
    onStartShouldSetResponder: () => false,

    onTouchStart: (event: GestureResponderEvent) => {
      const config = readConfig()
      if (!isEnabled() || outsideBounds(event)) {
        return
      }
      // A tap sequence in progress carries its count across the press. The
      // delay timer's existence IS the sequence — while it is armed the
      // gesture is between taps, still BEGAN, and this press is the next one
      // rather than a fresh gesture.
      const continuing =
        runtime.delayTimer !== null && runtime.state === GESTURE_STATE.BEGAN
      const carriedTaps = continuing ? runtime.taps : 0
      clearDelayTimer()
      runtime = newRuntime()
      runtime.taps = carriedTaps

      const { pageX, pageY, timestamp } = event.nativeEvent
      runtime.pressTime = Date.now()
      runtime.originX = pageX
      runtime.originY = pageY
      runtime.pressX = pageX
      runtime.pressY = pageY
      runtime.lastX = pageX
      runtime.lastY = pageY
      runtime.lastTime = timestamp
      countPointers(event)
      setState(GESTURE_STATE.BEGAN)
      // Recorded on the press, not on mount. That is the whole islands answer
      // in one line: a gesture takes part in an interaction only when the
      // interaction's pointer reaches it, so a relation naming a gesture in
      // another `Root` — or one the pointer never went near — never has an
      // occasion to apply and can never park anything for ever. Recording on
      // mount would have made `requireExternalGestureToFail` across two
      // islands a permanent deadlock. See docs/api.md.
      env.orchestrator.record(participant)
      // Upstream begins once per SEQUENCE, not once per tap: its `begin()` is
      // reached only from the UNDETERMINED branch, so the second press of a
      // double tap gets no second `onBegin`.
      if (!continuing) {
        config.onBegin?.(payloadOf(event))
      }
      config.onTouchesDown?.(
        touchEventOf(event, TOUCH_EVENT_TYPE.TOUCHES_DOWN),
        stateManager,
      )

      const timer = decider.timer?.(config) ?? null
      if (timer !== null) {
        runtime.activationTimer = setTimeout(() => {
          runtime.activationTimer = null
          if (runtime.state !== GESTURE_STATE.BEGAN) {
            return
          }
          runtime.timerElapsed = true
          if (timer.elapsed === "fail") {
            // `Tap`'s `maxDuration`: the pointer is still down and the tap is
            // already too slow. There is no event to fail with.
            failNow()
            return
          }
          if (readConfig().manualActivation === true) {
            return
          }
          // Asked rather than assumed: the timer maturing is one criterion
          // among the kind's own, and `LongPress` also wants the right number
          // of pointers down before it will take the gesture.
          if (!decider.shouldActivate(viewOf(), readConfig())) {
            return
          }
          // THE OUT-OF-EVENT GRANT. Without it the gesture could not take the
          // interaction until the pointer next moved — one frame late for a
          // drag, and never for a press-and-hold that stays still. This is
          // the single extension slice 1 makes to the responder model;
          // docs/research/gestures.md records it with its reason.
          decide()
        }, timer.delay)
      }

      // A recognizer that never claims may activate on the press itself, and
      // `Gesture.Native().shouldActivateOnStart(true)` is the shape that
      // wants to: a native BUTTON takes the press at once rather than waiting
      // to see whether the pointer travels.
      //
      // Deliberately not asked for the claiming kinds, and that is the same
      // rule `onStartShouldSetResponder` states by always answering false — a
      // gesture that grabbed the interaction on press cannot honour an
      // `activeOffset`, and deciding late is what every offset knob is for.
      // Nothing is being decided late here, because nothing is being taken.
      if (
        !claimsResponder &&
        config.manualActivation !== true &&
        decider.shouldActivate(viewOf(), config)
      ) {
        decide()
      }
    },

    onTouchMove: (event: GestureResponderEvent) => {
      if (runtime.state === GESTURE_STATE.ACTIVE) {
        // A gesture that does not hold the lock has no `onResponderMove`
        // coming, so this is where its updates live. One that does is driven
        // from there instead, and emitting here as well would double every
        // update it reports.
        //
        // Two kinds of gesture end up here and the flag covers both: one that
        // never takes the lock (`claimsResponder: false`), and one that would
        // have but is ACTIVE alongside a gesture it is `Simultaneous` with.
        // Without the second, `Simultaneous` would be a state with no events
        // attached to it.
        if (!runtime.hasResponder) {
          advance(event)
        }
        return
      }
      if (runtime.state !== GESTURE_STATE.BEGAN) {
        // A finished gesture is not tracked at all.
        return
      }
      track(event)
      const config = readConfig()
      config.onTouchesMove?.(
        touchEventOf(event, TOUCH_EVENT_TYPE.TOUCHES_MOVE),
        stateManager,
      )
      const view = viewOf()
      // Failure is tested before activation, and the comparisons differ —
      // failure is strict, activation is not — so a translation sitting
      // exactly on a bound activates rather than fails. That asymmetry is
      // upstream's and is reproduced rather than tidied.
      if (
        runtime.forcedFailure ||
        !pointerCountAllowed(event) ||
        // Upstream fails a BEGAN handler that leaves the view, not just an
        // ACTIVE one — `onPointerLeave` splits exactly that way. It is the
        // default for `Tap` and `LongPress`, which is why it surfaces here;
        // `Pan` leaves the flag off unless an app sets it.
        (config.shouldCancelWhenOutside === true && outsideBounds(event)) ||
        decider.shouldFail(view, config)
      ) {
        fail(event)
        return
      }
      if (config.manualActivation === true) {
        return
      }
      if (decider.shouldActivate(view, config)) {
        decide()
      }
    },

    // The instant of decision. Everything above ran holding nothing.
    onMoveShouldSetResponder: () => {
      // `Native` never answers yes: winning here is what makes the platform
      // claim the GTK sequence and suspend the scroller it is reporting on.
      if (!claimsResponder) {
        return false
      }
      if (runtime.state !== GESTURE_STATE.BEGAN || !isEnabled()) {
        return false
      }
      // The orchestrator's answer and nothing else. Slice 1 asked the decider
      // a second time from here, on the reasoning that a move arriving while
      // another view held the responder had not reached the decision above —
      // which was never true (system.ts dispatches the touch props BEFORE it
      // negotiates, in both entry points) and is now actively wrong: a gesture
      // parked behind `requireExternalGestureToFail` still meets its own
      // criteria, and answering them here would let it take the lock it was
      // told to wait for.
      return runtime.authorized
    },

    onResponderGrant: (event: GestureResponderEvent) => {
      // The host holds the responder whoever asked for it — the recognizer's
      // props are merged into the child's, so a child with responder props of
      // its own can be the reason this fired.
      runtime.hasResponder = true
      if (!runtime.authorized) {
        // Not this gesture's grant. Becoming ACTIVE is the orchestrator's to
        // authorize, and it has not.
        return
      }
      enterActive(event.nativeEvent.pageX, event.nativeEvent.pageY)
      const payload = payloadOf(event)
      env.orchestrator.activated(participant)
      readConfig().onActivate?.(payload)
      endIfOneShot()
    },

    onResponderMove: (event: GestureResponderEvent) => {
      if (runtime.state !== GESTURE_STATE.ACTIVE) {
        return
      }
      advance(event)
    },

    onResponderRelease: (event: GestureResponderEvent) => {
      runtime.hasResponder = false
      finalizeAt(event, true)
    },

    onResponderTerminate: (event: GestureResponderEvent) => {
      runtime.hasResponder = false
      // The interaction went somewhere this registry cannot follow — an
      // ancestor took the responder, the window lost focus, a scroller moved
      // under it. Anything running alongside this gesture was riding on a lock
      // that is gone, and there is no callback of its own coming to tell it.
      env.orchestrator.interactionLost(participant)
      if (runtime.state === GESTURE_STATE.UNDETERMINED) {
        // Already over: this gesture cancelled itself while still holding the
        // lock, and the system is telling the HOST the interaction ended.
        return
      }
      setState(GESTURE_STATE.CANCELLED)
      finalizeAt(event, false)
    },

    onTouchEnd: (event: GestureResponderEvent) => {
      readConfig().onTouchesUp?.(
        touchEventOf(event, TOUCH_EVENT_TYPE.TOUCHES_UP),
        stateManager,
      )
      // The responder holder is finalized by `onResponderRelease`, which the
      // system dispatches AFTER the touch props. A gesture that is ACTIVE
      // without holding the lock — a `Native`, or a `Simultaneous` partner
      // that lost the race for it — has no responder callback coming, and
      // this is where its successful ending is.
      if (runtime.state === GESTURE_STATE.ACTIVE) {
        if (!runtime.hasResponder) {
          finalizeAt(event, true)
        }
        return
      }
      if (runtime.state !== GESTURE_STATE.BEGAN) {
        return
      }
      const config = readConfig()
      runtime.taps += 1
      const outcome = decider.onRelease?.(viewOf(), config) ?? { kind: "fail" }

      if (outcome.kind === "hold") {
        // `Manual`: the pointer lifting decides nothing, because nothing about
        // this gesture is decided by the pointer. It stays BEGAN, holding no
        // lock and running no timer, until the app says otherwise — and the
        // `onTouchesUp` above has just given it the state manager to say it
        // with. The next press resets it, as it resets any BEGAN gesture.
        return
      }

      if (outcome.kind === "await") {
        // Not over. The gesture stays BEGAN with its count intact, holding no
        // lock, and the next press continues it — or this timer fails it.
        clearActivationTimer()
        runtime.delayTimer = setTimeout(() => {
          runtime.delayTimer = null
          if (runtime.state === GESTURE_STATE.BEGAN) {
            failNow()
          }
        }, outcome.delay)
        return
      }

      if (outcome.kind === "fail") {
        // `fail()` rather than a bare `finalizeAt(..., false)`, because the
        // payload has to carry the state the gesture ENDED in and this path
        // was reporting BEGAN. Upstream's `fail()` moves to FAILED first, and
        // a consumer comparing `event.state` against `State.FAILED` — which is
        // exactly what two of the four target libraries do with `State` — was
        // being told the gesture was still deciding. `Fling` made it visible
        // because failing on the lift is its ordinary ending rather than an
        // edge case, but `Tap` and `Pan` were reporting it too.
        fail(event)
        return
      }

      // `Tap` activating: this is the one kind whose activation criterion is
      // the pointer coming back UP, so the grant is asked for here rather than
      // from a move. The responder system dispatches the touch props before it
      // clears the session, so the out-of-event channel still has an
      // interaction to negotiate over — and the `onResponderRelease` that
      // follows in the same event is what ends the gesture with success.
      clearActivationTimer()
      decide()
      if (stateNow() === GESTURE_STATE.ACTIVE) {
        if (!runtime.hasResponder) {
          // It activated alongside a gesture that holds the lock, so no
          // `onResponderRelease` is coming for it either.
          finalizeAt(event, true)
        }
        return
      }
      // Nobody granted it — an ancestor holds the interaction, the gesture is
      // not on its path, or the orchestrator parked it behind another. There
      // is no release callback coming, and a discrete gesture whose pointer
      // has lifted cannot be woken later: the interaction it would have taken
      // is over.
      finalizeAt(event, false)
    },

    onTouchCancel: (event: GestureResponderEvent) => {
      readConfig().onTouchesCancel?.(
        touchEventOf(event, TOUCH_EVENT_TYPE.TOUCHES_CANCEL),
        stateManager,
      )
      // THIS is where a stolen sequence lands, and why the responder system
      // learned to tell `->DENIED` from an ordinary `drag-end`
      // (`responder/use-responder.ts`). A native ancestor claiming mid-drag
      // used to arrive here as `onTouchEnd`, which for an ACTIVE `Native`
      // gesture would have reported a clean, successful ending of a drag that
      // was actually taken away.
      //
      // An ACTIVE gesture that DID hold the lock is cancelled by
      // `onResponderTerminate`, which the system dispatches after these touch
      // props — finalizing here too would end it twice.
      if (
        runtime.state === GESTURE_STATE.BEGAN ||
        (!runtime.hasResponder && runtime.state === GESTURE_STATE.ACTIVE)
      ) {
        setState(GESTURE_STATE.CANCELLED)
        finalizeAt(event, false)
      }
    },
  }

  /**
   * The second entry surface: a GTK controller, for the kinds the pointer
   * stream cannot carry.
   *
   * THREE sources arrive here and the machine cannot tell them apart, which is
   * the point — `GtkGestureZoom`/`GtkGestureRotate` for `Pinch`/`Rotation`,
   * `GtkEventControllerMotion` for `Hover`, `GtkGestureStylus` for
   * `ForceTouch`. What they have in common is everything that matters: no
   * button goes down, so there is no GTK sequence, no responder session and
   * nothing to claim; and the numbers they carry are already in the shape the
   * payload wants.
   *
   * Everything below the entry point is the machine above, unchanged. `begin`
   * does what `onTouchStart` does (record with the orchestrator, BEGAN,
   * `onBegin`), `update` does what `onTouchMove` and `advance` do between them
   * (test the kind's predicate, `decide()`, emit), and `end` does what
   * `onTouchEnd` does. `decide()` is the same call into the same
   * `tryActivate`, and `finalize` is the same one exit.
   *
   * ONE DIFFERENCE FROM `Pan`, and it is upstream's: `scale`, `rotation` and
   * `force` are NOT re-based when the gesture activates. Translation is,
   * because a pan that reported its `activeOffset` as travel would jump the
   * content by the threshold on every drag. Upstream's `scale` is not —
   * `resetProgress()` resets it only while the handler is not yet ACTIVE, so
   * the value that crossed the activation threshold is the value the first
   * `onUpdate` reports. GTK measures from its own recognition point for the
   * same reason, so the two origins already agree and nothing is re-derived.
   */
  const controller: ControllerChannel = {
    begin: (sample: ControllerSample): void => {
      if (!isEnabled() || runtime.state !== GESTURE_STATE.UNDETERMINED) {
        return
      }
      const bounds = env.boundsInWindow()
      const pageX = (bounds?.x ?? 0) + sample.x
      const pageY = (bounds?.y ?? 0) + sample.y
      if (
        bounds !== null &&
        !contains(hitSlopRect(bounds, readConfig().hitSlop), pageX, pageY)
      ) {
        return
      }
      runtime = newRuntime()
      runtime.pressTime = Date.now()
      runtime.lastSampleTime = runtime.pressTime
      runtime.originX = pageX
      runtime.originY = pageY
      runtime.pressX = pageX
      runtime.pressY = pageY
      runtime.lastX = pageX
      runtime.lastY = pageY
      runtime.scale = sample.scale ?? 1
      runtime.rotation = sample.rotation ?? 0
      runtime.force = sample.force ?? 0
      runtime.pointerCount = sample.pointers
      runtime.maxPointerCount = sample.pointers
      setState(GESTURE_STATE.BEGAN)
      // On the gesture, not on mount — the same rule and the same line as
      // `onTouchStart`, and the same islands answer follows from it.
      env.orchestrator.record(participant)
      readConfig().onBegin?.(payloadNow())
      // `Hover` activates on the crossing itself: upstream's
      // `onPointerMoveOver` calls `begin()` and `activate()` one after the
      // other, because a pointer that is over the view IS the gesture and
      // there is nothing further to wait for. Asked through the decider rather
      // than flagged, so it is the same question `onTouchStart` asks of a
      // `Native` that activates on the press.
      if (
        readConfig().manualActivation !== true &&
        decider.shouldActivate(viewOf(), readConfig())
      ) {
        decide()
      }
    },

    update: (sample: ControllerSample): void => {
      if (
        runtime.state !== GESTURE_STATE.BEGAN &&
        runtime.state !== GESTURE_STATE.ACTIVE
      ) {
        return
      }
      const scale = sample.scale ?? 1
      const rotation = sample.rotation ?? 0
      const now = Date.now()
      const elapsed = now - runtime.lastSampleTime
      if (elapsed > 0) {
        // Per SECOND, which upstream documents and neither of its web paths
        // computes. See `GestureEventPayload.velocity`.
        runtime.scaleVelocity = ((scale - runtime.scale) / elapsed) * 1000
        runtime.rotationVelocity =
          ((rotation - runtime.rotation) / elapsed) * 1000
        runtime.lastSampleTime = now
      }
      runtime.scale = scale
      runtime.rotation = rotation
      runtime.force = sample.force ?? 0
      runtime.pointerCount = sample.pointers
      runtime.maxPointerCount = Math.max(
        runtime.maxPointerCount,
        sample.pointers,
      )
      const bounds = env.boundsInWindow()
      runtime.lastX = (bounds?.x ?? 0) + sample.x
      runtime.lastY = (bounds?.y ?? 0) + sample.y

      const config = readConfig()
      // A kind that can be cancelled by its own numbers while ACTIVE gets the
      // same treatment `advance` gives `LongPress` — `ForceTouch` is the one
      // that wants it, because `maxForce` keeps applying after activation.
      if (
        runtime.state === GESTURE_STATE.ACTIVE &&
        decider.shouldCancelWhileActive?.(viewOf(), config) === true
      ) {
        setState(GESTURE_STATE.CANCELLED)
        finalize(payloadNow, false)
        return
      }
      if (runtime.state === GESTURE_STATE.BEGAN) {
        if (decider.shouldFail(viewOf(), config)) {
          failNow()
          return
        }
        if (config.manualActivation === true) {
          return
        }
        if (!decider.shouldActivate(viewOf(), config)) {
          return
        }
        // The same request into the same loop every other kind makes. It can
        // come back as an activation, as a parking behind
        // `requireExternalGestureToFail`, or as a cancellation.
        decide()
        if (stateNow() !== GESTURE_STATE.ACTIVE) {
          return
        }
        // `onActivate` has just reported this sample; emitting it again as an
        // update would double it, exactly as `advance` refuses the event that
        // granted the responder.
        runtime.changeFromScale = runtime.scale
        runtime.changeFromRotation = runtime.rotation
        runtime.changeFromForce = runtime.force
        return
      }
      const payload = payloadNow()
      config.onUpdate?.(payload)
      config.onChange?.(payload)
      runtime.changeFromX = payload.translationX
      runtime.changeFromY = payload.translationY
      runtime.changeFromScale = runtime.scale
      runtime.changeFromRotation = runtime.rotation
      runtime.changeFromForce = runtime.force
      runtime.hasEmittedUpdate = true
    },

    /** GTK's `end`: a success if it activated, a failure if it never did. */
    end: (): void => {
      if (runtime.state === GESTURE_STATE.ACTIVE) {
        finalize(payloadNow, true)
        return
      }
      if (runtime.state === GESTURE_STATE.BEGAN) {
        setState(GESTURE_STATE.FAILED)
        finalize(payloadNow, false)
      }
    },

    /** GTK's `cancel`: the sequence was taken away. */
    cancel: (): void => {
      if (
        runtime.state === GESTURE_STATE.BEGAN ||
        runtime.state === GESTURE_STATE.ACTIVE
      ) {
        setState(GESTURE_STATE.CANCELLED)
        finalize(payloadNow, false)
      }
    },
  }

  const drivenByController =
    decider.source !== undefined && decider.source !== "pointer"

  return {
    // Exactly one surface is live. A controller kind that also answered the
    // touch props would begin on a mouse press — `onBegin` on every click, on
    // a gesture that cannot happen — and a pointer kind with a live controller
    // channel would pan on a pinch.
    handlers: drivenByController ? {} : handlers,
    controller: drivenByController ? controller : null,
    participant,
    stateManager,
    dispose: () => {
      clearActivationTimer()
      clearDelayTimer()
      env.orchestrator.forget(participant)
    },
  }
}
