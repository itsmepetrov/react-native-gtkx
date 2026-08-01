// LongPress's predicates, over the same machine `Pan` runs on.
//
// The shortest of the three, and the one that needed no new machinery at all:
// `Pan().activateAfterLongPress()` already activates on a timer through the
// out-of-event grant channel slice 1 added, and a long press is that, minus
// the pan. What it does add is the only case where an ALREADY ACTIVE gesture
// is cancelled by movement it would otherwise have reported — `maxDistance`
// keeps applying after the press has matured, and going past it then is a
// cancellation rather than a failure (upstream's `checkDistanceFail` branches
// on exactly that).
//
// The distance is measured from the PRESS and not from the activation point,
// which is why `RecognizerView` carries `distanceFromPress` at all. Upstream
// sets `startX`/`startY` on pointer-down and never moves them (its base
// `resetProgress()` is empty, unlike `Pan`'s), so a hold that drifts 8px
// before the timer and 8px after it has travelled 16 and is cancelled at a
// `maxDistance` of 10. Re-basing at activation would have let it drift twice.
//
// Restated from `src/web/handlers/LongPressGestureHandler.ts` at 3.1.0.
// `DEFAULT_MAX_DIST_DP * SCALING_FACTOR` there is 10 × 10 — a squared
// distance whose square root is the documented default of 10.
import type {
  RecognizerDecider,
  RecognizerTimer,
  RecognizerView,
} from "./recognizer"
import type { RecognizerConfig } from "./types"

/** Upstream's `DEFAULT_MIN_DURATION_MS`. */
export const DEFAULT_MIN_DURATION = 500
/** Upstream's `DEFAULT_MAX_DIST_DP`. */
export const DEFAULT_MAX_DISTANCE = 10

const travelledTooFar = (
  view: RecognizerView,
  config: RecognizerConfig,
): boolean =>
  view.distanceFromPress > (config.maxDistance ?? DEFAULT_MAX_DISTANCE)

export const longPressDecider: RecognizerDecider = {
  kind: "longPress",

  timer: (config: RecognizerConfig): RecognizerTimer => ({
    delay: config.minDuration ?? DEFAULT_MIN_DURATION,
    elapsed: "activate",
  }),

  shouldFail: travelledTooFar,

  shouldActivate: (view: RecognizerView, config: RecognizerConfig): boolean =>
    view.timerElapsed &&
    // Upstream arms its activation timer only while exactly this many pointers
    // are down, so a two-finger long press is unreachable on a platform that
    // fabricates one touch per pointer — honestly unreachable rather than
    // silently single-finger.
    view.pointerCount === (config.numberOfPointers ?? 1),

  shouldCancelWhileActive: travelledTooFar,
}
