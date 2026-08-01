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
// Arbitration is deliberately absent. One interaction, one holder, one
// irrevocable GTK `CLAIMED` on the source — the responder lock's single job.
// The JS-only registry that lets two gestures be ACTIVE at once is its own
// slice; the seam for it is `decide()` below, the one place a recognizer asks
// to become active.
import type { GestureResponderEvent } from "../responder/types"
import {
  GESTURE_STATE,
  POINTER_TYPE,
  TOUCH_EVENT_TYPE,
  type GestureHitSlop,
  type GestureStateManagerApi,
  type GestureStateValue,
  type GestureTouchEvent,
  type PanEventPayload,
  type PanRecognizerConfig,
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
}

/** The read-only view of the runtime the predicates are allowed to see. */
export type RecognizerView = {
  translationX: number
  translationY: number
  velocityX: number
  velocityY: number
  longPressElapsed: boolean
}

/**
 * What a recognizer kind contributes: two predicates over the current
 * translation. Everything else — the state progression, the callbacks, the
 * responder plumbing, the bounds tests — is shared, which is what makes
 * `Tap` and `LongPress` a later afternoon rather than a second machine.
 */
export type RecognizerDecider = {
  shouldFail: (view: RecognizerView, config: PanRecognizerConfig) => boolean
  shouldActivate: (view: RecognizerView, config: PanRecognizerConfig) => boolean
}

type Runtime = {
  state: GestureStateValue
  oldState: GestureStateValue
  pressTime: number
  /** Where translation is measured FROM; reset to the activation point. */
  originX: number
  originY: number
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
  longPressTimer: ReturnType<typeof setTimeout> | null
  longPressElapsed: boolean
  /** A timer or a callback asked to activate. */
  wantsActivation: boolean
  forcedFailure: boolean
}

const newRuntime = (): Runtime => ({
  state: GESTURE_STATE.UNDETERMINED,
  oldState: GESTURE_STATE.UNDETERMINED,
  pressTime: 0,
  originX: 0,
  originY: 0,
  lastX: 0,
  lastY: 0,
  lastTime: 0,
  velocityX: 0,
  velocityY: 0,
  changeFromX: 0,
  changeFromY: 0,
  hasEmittedUpdate: false,
  hasActivated: false,
  longPressTimer: null,
  longPressElapsed: false,
  wantsActivation: false,
  forcedFailure: false,
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

export type Recognizer = {
  /** The responder props to put on the gesture's view. */
  handlers: Record<string, (event: GestureResponderEvent) => boolean | void>
  /** Cancels any pending timer; called when the detector unmounts. */
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
  readConfig: () => PanRecognizerConfig,
  env: RecognizerEnvironment,
): Recognizer => {
  let runtime = newRuntime()

  const isEnabled = (): boolean => readConfig().enabled !== false

  const setState = (next: GestureStateValue): void => {
    runtime.oldState = runtime.state
    runtime.state = next
  }

  const viewOf = (): RecognizerView => ({
    translationX: runtime.lastX - runtime.originX,
    translationY: runtime.lastY - runtime.originY,
    velocityX: runtime.velocityX,
    velocityY: runtime.velocityY,
    longPressElapsed: runtime.longPressElapsed,
  })

  const payloadOf = (event: GestureResponderEvent): PanEventPayload => {
    const { pageX, pageY } = event.nativeEvent
    const bounds = env.boundsInWindow()
    const translationX = pageX - runtime.originX
    const translationY = pageY - runtime.originY
    return {
      handlerTag,
      numberOfPointers: event.nativeEvent.touches.length,
      pointerType: POINTER_TYPE.MOUSE,
      state: runtime.state,
      oldState: runtime.oldState,
      // RNGH's `x`/`y` are relative to the GESTURE's view. The responder
      // event's own `locationX` is relative to whichever widget carried the
      // event, which is the deepest one with a controller and not always this
      // one — so it is recomputed rather than passed through.
      x: bounds ? pageX - bounds.x : event.nativeEvent.locationX,
      y: bounds ? pageY - bounds.y : event.nativeEvent.locationY,
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
    }
  }

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
      pointerType: POINTER_TYPE.MOUSE,
    }
  }

  const clearLongPress = (): void => {
    if (runtime.longPressTimer !== null) {
      clearTimeout(runtime.longPressTimer)
      runtime.longPressTimer = null
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
  }

  /** Every exit from a live gesture goes through here exactly once. */
  const finalize = (event: GestureResponderEvent, success: boolean): void => {
    const config = readConfig()
    clearLongPress()
    // Read the flag, not the state: a cancellation sets the state to
    // CANCELLED on its way in, and an ACTIVE gesture that gets cancelled must
    // still be told it deactivated.
    const wasActive = runtime.hasActivated
    if (success) {
      setState(GESTURE_STATE.END)
    }
    const payload = payloadOf(event)
    // The deactivation callback is the ACTIVE gesture's ending. A gesture
    // that never activated gets `onFinalize` and nothing else, which is what
    // lets a consumer distinguish a drag that finished from one that never
    // happened — `react-native-reanimated-dnd` relies on exactly that.
    if (wasActive) {
      config.onDeactivate?.(payload, success)
    }
    config.onFinalize?.(payload, success)
    runtime = newRuntime()
  }

  const fail = (event: GestureResponderEvent): void => {
    clearLongPress()
    setState(GESTURE_STATE.FAILED)
    finalize(event, false)
  }

  /**
   * The one place a recognizer asks to become active, and therefore the seam
   * the orchestrator (slice 3) will sit in: today it records the want, and
   * the responder system is asked either by the negotiation already in flight
   * or — for a timer — through the out-of-event channel.
   */
  const decide = (insideTouchEvent: boolean): void => {
    runtime.wantsActivation = true
    if (!insideTouchEvent) {
      env.requestResponder()
    }
  }

  const stateManager: GestureStateManagerApi = {
    begin: () => {
      if (runtime.state === GESTURE_STATE.UNDETERMINED) {
        setState(GESTURE_STATE.BEGAN)
      }
    },
    activate: () => {
      if (runtime.state === GESTURE_STATE.BEGAN) {
        decide(false)
      }
    },
    fail: () => {
      runtime.forcedFailure = true
    },
    end: () => {
      runtime.forcedFailure = true
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
      runtime = newRuntime()
      const { pageX, pageY, timestamp } = event.nativeEvent
      runtime.pressTime = timestamp
      runtime.originX = pageX
      runtime.originY = pageY
      runtime.lastX = pageX
      runtime.lastY = pageY
      runtime.lastTime = timestamp
      setState(GESTURE_STATE.BEGAN)
      config.onBegin?.(payloadOf(event))
      config.onTouchesDown?.(
        touchEventOf(event, TOUCH_EVENT_TYPE.TOUCHES_DOWN),
        stateManager,
      )

      if (config.activateAfterLongPress !== undefined) {
        runtime.longPressTimer = setTimeout(() => {
          runtime.longPressTimer = null
          if (runtime.state !== GESTURE_STATE.BEGAN) {
            return
          }
          runtime.longPressElapsed = true
          if (readConfig().manualActivation === true) {
            return
          }
          // THE OUT-OF-EVENT GRANT. Without it the gesture could not take the
          // interaction until the pointer next moved — one frame late for a
          // drag, and never for a press-and-hold that stays still. This is
          // the single extension slice 1 makes to the responder model;
          // docs/research/gestures.md records it with its reason.
          decide(false)
        }, config.activateAfterLongPress)
      }
    },

    onTouchMove: (event: GestureResponderEvent) => {
      if (runtime.state !== GESTURE_STATE.BEGAN) {
        // An ACTIVE gesture is driven by `onResponderMove`, where velocity is
        // tracked. A finished one is not tracked at all.
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
        decider.shouldFail(view, config)
      ) {
        fail(event)
        return
      }
      if (config.manualActivation === true) {
        return
      }
      if (decider.shouldActivate(view, config)) {
        decide(true)
      }
    },

    // The instant of decision. Everything above ran holding nothing.
    onMoveShouldSetResponder: () => {
      if (runtime.state !== GESTURE_STATE.BEGAN || !isEnabled()) {
        return false
      }
      if (runtime.wantsActivation) {
        return true
      }
      if (readConfig().manualActivation === true) {
        return false
      }
      // A move that arrived while another view held the responder never
      // reached the decision above — the touch props fire either way, so this
      // is the same question asked from the negotiation's side rather than a
      // second code path.
      return decider.shouldActivate(viewOf(), readConfig())
    },

    onResponderGrant: (event: GestureResponderEvent) => {
      setState(GESTURE_STATE.ACTIVE)
      runtime.wantsActivation = false
      clearLongPress()
      // Translation is measured from where the gesture BECAME ACTIVE, not
      // from the press: a pan with `activeOffsetY([-10, 10])` that reported
      // 10px of travel the moment it started would jump the content by the
      // threshold on every drag. With `activateAfterLongPress` the pointer
      // has not moved when the timer grants, so the two origins coincide —
      // which is only true because the grant no longer waits for a move.
      runtime.originX = event.nativeEvent.pageX
      runtime.originY = event.nativeEvent.pageY
      runtime.lastX = event.nativeEvent.pageX
      runtime.lastY = event.nativeEvent.pageY
      runtime.changeFromX = 0
      runtime.changeFromY = 0
      runtime.hasEmittedUpdate = false
      runtime.hasActivated = true
      readConfig().onActivate?.(payloadOf(event))
    },

    onResponderMove: (event: GestureResponderEvent) => {
      if (runtime.state !== GESTURE_STATE.ACTIVE) {
        return
      }
      track(event)
      const config = readConfig()
      if (config.shouldCancelWhenOutside === true && outsideBounds(event)) {
        setState(GESTURE_STATE.CANCELLED)
        finalize(event, false)
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
    },

    onResponderRelease: (event: GestureResponderEvent) => {
      finalize(event, true)
    },

    onResponderTerminate: (event: GestureResponderEvent) => {
      setState(GESTURE_STATE.CANCELLED)
      finalize(event, false)
    },

    onTouchEnd: (event: GestureResponderEvent) => {
      readConfig().onTouchesUp?.(
        touchEventOf(event, TOUCH_EVENT_TYPE.TOUCHES_UP),
        stateManager,
      )
      // An ACTIVE gesture is finalized by `onResponderRelease`, which the
      // system dispatches AFTER the touch props. A gesture that never took
      // the lock has no responder callback coming and ends here.
      if (runtime.state === GESTURE_STATE.BEGAN) {
        finalize(event, false)
      }
    },

    onTouchCancel: (event: GestureResponderEvent) => {
      readConfig().onTouchesCancel?.(
        touchEventOf(event, TOUCH_EVENT_TYPE.TOUCHES_CANCEL),
        stateManager,
      )
      if (runtime.state === GESTURE_STATE.BEGAN) {
        setState(GESTURE_STATE.CANCELLED)
        finalize(event, false)
      }
    },
  }

  return {
    handlers,
    dispose: () => {
      clearLongPress()
    },
  }
}
