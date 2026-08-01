// Tap's predicates, over the same machine `Pan` runs on.
//
// A tap is the one kind whose activation criterion is the pointer coming back
// UP, and the whole of it is three numbers and a counter:
//
//   - `maxDuration` is a deadline armed on every press. It fires while the
//     pointer is still down, and firing kills the tap — a press held too long
//     is not a tap, it is a press.
//   - `maxDelay` is the gap between taps. On a release that has not completed
//     the sequence the gesture stays BEGAN, holding nothing, and this timer is
//     what eventually gives up.
//   - `maxDistance` / `maxDeltaX` / `maxDeltaY` fail a press that travelled.
//     This is the tap-vs-drag disambiguation and it is the reason a tap and a
//     pan can share a view at all.
//
// Restated from `src/web/handlers/TapGestureHandler.ts` at 3.1.0, not
// transcribed. Two of its details are worth naming because they look like
// bugs and are not:
//
//   - there is **no default `maxDistance`**. Upstream initialises all three
//     distance limits to `Number.MIN_SAFE_INTEGER` and treats that as "unset",
//     so an unconfigured tap accepts any travel that stays inside the view and
//     lifts in time. `shouldCancelWhenOutside` (which `Gesture.Tap()` turns on
//     in its constructor) is what actually bounds it. Inventing a default here
//     would refuse taps upstream accepts;
//   - `minPointers` is checked against the MOST pointers the interaction ever
//     had at once, not the count at release, which by then is zero.
import type {
  RecognizerDecider,
  RecognizerTimer,
  RecognizerView,
  ReleaseOutcome,
} from "./recognizer"
import type { RecognizerConfig } from "./types"

/** Upstream's `DEFAULT_MAX_DURATION_MS`. */
export const DEFAULT_MAX_DURATION = 500
/** Upstream's `DEFAULT_MAX_DELAY_MS`. */
export const DEFAULT_MAX_DELAY = 500

const exceeds = (value: number, limit: number | undefined): boolean =>
  limit !== undefined && Math.abs(value) > limit

export const tapDecider: RecognizerDecider = {
  kind: "tap",

  /** The deadline, re-armed on every press of the sequence. */
  timer: (config: RecognizerConfig): RecognizerTimer => ({
    delay: config.maxDuration ?? DEFAULT_MAX_DURATION,
    elapsed: "fail",
  }),

  shouldFail: (view: RecognizerView, config: RecognizerConfig): boolean =>
    exceeds(view.translationX, config.maxDeltaX) ||
    exceeds(view.translationY, config.maxDeltaY) ||
    exceeds(view.distanceFromPress, config.maxDistance),

  // Never from movement: a tap that activated while the pointer was still
  // down would be a press, and would take the interaction away from whatever
  // pan is watching the same view.
  shouldActivate: (): boolean => false,

  onRelease: (
    view: RecognizerView,
    config: RecognizerConfig,
  ): ReleaseOutcome => {
    const wanted = config.numberOfTaps ?? 1
    if (
      view.taps >= wanted &&
      view.maxPointerCount >= (config.minPointers ?? 1)
    ) {
      return { kind: "activate" }
    }
    return { kind: "await", delay: config.maxDelay ?? DEFAULT_MAX_DELAY }
  },
}
