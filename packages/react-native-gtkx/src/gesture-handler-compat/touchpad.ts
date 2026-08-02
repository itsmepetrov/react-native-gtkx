// `Gesture.Pinch()` and `Gesture.Rotation()` — the two recognizers whose raw
// numbers come from GTK rather than from the pointer stream.
//
// WHY THEY ARE DIFFERENT AT ALL, and it is one sentence: this platform has one
// pointer. Upstream's `PinchGestureHandler` runs a `ScaleGestureDetector` over
// two tracked pointers and needs two real touches; there are none here and no
// protocol to synthesize one. What there IS instead is better —
// `gtk_gesture_zoom_filter_event` lets `GDK_TOUCHPAD_PINCH` through when
// `gdk_touchpad_event_get_n_fingers() == 2` and `_gtk_gesture_zoom_get_distance`
// reads `gdk_touchpad_event_get_pinch_scale()` straight off the event rather
// than computing it from two points. So a TOUCHPAD pinch drives
// `GtkGestureZoom` with no touchscreen involved, which is a path RNGH's own
// single-runtime implementation does not have.
//
// WHAT IS SHARED, which is everything that matters: the state machine, the
// callbacks, the payload, `tryActivate`, the relation maps, `makeActive`'s
// broadcast cancel and `finished`. ./recognizer runs one machine with two
// entry surfaces — the touch/responder props for the pointer kinds, and
// `Recognizer.controller` for the kinds a GTK controller feeds — and only the
// entry surface differs. There is no second arbitration path and no second
// registry. `Hover` and `ForceTouch` arrive on that same channel from
// `GtkEventControllerMotion` and `GtkGestureStylus`, which is why it is named
// for the controller rather than for the touchpad.
//
// THEY NEVER TAKE THE RESPONDER (`claimsResponder: false`), for a reason that
// is structural rather than a policy: the responder lock is a lock over an
// INTERACTION, and an interaction here starts with a press. A touchpad pinch
// has no button down, so there is no session to take, nothing to transfer and
// no GTK sequence to claim. `Native` reaches the same flag from the opposite
// direction — it has a sequence and must not claim it — and both end up on the
// touch-prop update pump, which is why one flag covers both.
import type { RecognizerDecider, RecognizerView } from "./recognizer"
import type { RecognizerConfig } from "./types"

/**
 * Upstream's `ROTATION_RECOGNITION_THRESHOLD`
 * (`src/web/handlers/RotationGestureHandler.ts` at 3.1.0), reproduced exactly:
 * five degrees of accumulated rotation activates the gesture.
 */
export const ROTATION_RECOGNITION_THRESHOLD = Math.PI / 36

/**
 * Five percent of scale change activates a pinch — and this number is OURS,
 * which is the one place these two recognizers do not restate upstream.
 *
 * Upstream's gate is two stages of pixels: `ScaleGestureDetector` reports
 * nothing until the span between the two touches has changed by more than
 * `spanSlop` (`DEFAULT_TOUCH_SLOP * 2`, 30px), and `PinchGestureHandler` then
 * activates after a further `DEFAULT_TOUCH_SLOP` (15px) from wherever that
 * opened. Both are arithmetic over two touch POSITIONS, and a touchpad pinch
 * has none: libinput hands the compositor a ratio and GDK hands GTK a ratio,
 * so there is no span in pixels anywhere in this chain to measure 45 of.
 *
 * What makes a small threshold the right restatement rather than a weaker one
 * is where upstream's slop sits in the pipeline. Upstream's is the FIRST
 * decision that a pinch is happening at all — nothing below it filters. Here
 * libinput has already made that decision: it will not emit
 * `GESTURE_PINCH_BEGIN` until it has classified the two fingers' motion as a
 * pinch rather than a two-finger scroll, which is a threshold of its own and a
 * stricter one. Measured with the virtual touchpad, the first `scale-changed`
 * after `begin` already reports about 1.09. So this gate is a second, smaller
 * one, and setting it at upstream's effective magnitude would refuse pinches
 * the platform has already accepted.
 */
export const PINCH_RECOGNITION_THRESHOLD = 0.05

const magnitude = (view: RecognizerView): number => Math.abs(view.scale - 1)

export const pinchDecider: RecognizerDecider = {
  kind: "pinch",
  // See the file header: there is no press, so there is no interaction lock
  // to take. Every update arrives through `Recognizer.touchpad` instead.
  claimsResponder: false,
  source: "touchpad",

  /**
   * Never from the gesture itself. Upstream's pinch has no failure predicate
   * over movement at all, and it goes further: `PinchGestureHandler.init` sets
   * `shouldCancelWhenOutside = false` explicitly, so a pinch whose focal point
   * wanders off the view keeps running. It fails when GTK ends the gesture
   * before it ever activated, which is the shared machine's own rule.
   */
  shouldFail: (): boolean => false,

  shouldActivate: (view: RecognizerView): boolean =>
    magnitude(view) >= PINCH_RECOGNITION_THRESHOLD,
}

export const rotationDecider: RecognizerDecider = {
  kind: "rotation",
  claimsResponder: false,
  source: "touchpad",

  shouldFail: (): boolean => false,

  shouldActivate: (view: RecognizerView): boolean =>
    Math.abs(view.rotation) >= ROTATION_RECOGNITION_THRESHOLD,
}

/**
 * Upstream sets `shouldCancelWhenOutside = false` from both handlers' `init`,
 * against a base class that defaults it on for several other kinds. Applied
 * from the builders' constructors here, which is where this module puts every
 * other constructor-set default.
 */
export const TOUCHPAD_DEFAULTS: Partial<RecognizerConfig> = {
  shouldCancelWhenOutside: false,
}
