// `Gesture.ForceTouch()` — pressure, which is the one input in this module
// that no ordinary mouse can produce.
//
// READ THIS FIRST, because it is the honest label on the tin: **the pressure
// path is the least verified thing in this module**, and how far short it
// falls is recorded in docs/api.md rather than left to be discovered. Every
// other recognizer here is driven end to end by injected input in the test
// suite. This one is driven by `GtkGestureStylus`, which needs a tablet tool,
// and what could and could not be produced for it is written down rather than
// implied.
//
// UPSTREAM DOES NOT IMPLEMENT THIS OFF iOS AT ALL, which is worth stating
// before anything else, because it means there is no web behaviour to restate
// and the semantics below come from the documented contract rather than from a
// running implementation:
//
//   - there is no `src/web/handlers/ForceTouchGestureHandler.ts`. The web
//     `Gestures` registry has nine entries and this is not one of them, so
//     `Gesture.ForceTouch()` under a `GestureDetector` on web throws
//     `"ForceTouchGestureHandler is not supported on web"` at handler-creation
//     time;
//   - the LEGACY component is worse and is the failure mode this repo refuses
//     by name: `PlatformConstants.forceTouchAvailable` is hardcoded false off
//     iOS, so `ForceTouchGestureHandler` resolves to a `ForceTouchFallback`
//     that logs one warning and renders its children unchanged — a component
//     that accepts its props, mounts, and silently does nothing;
//   - **there is no v3 hook.** `src/v3/hooks/gestures/` has nine directories
//     and no `forceTouch`; `useForceTouchGesture` does not exist and the
//     `SingleGesture` union omits ForceTouch entirely. Upstream dropped it
//     from the API it is migrating to.
//
// So the config below is upstream's documented contract — `minForce` (docs say
// 0.2), `maxForce` (a ceiling that FAILS the gesture), `feedbackOnActivation`
// (haptics) — and the enforcement is this file's, because upstream's lives in
// Swift outside its own JS tree. Where a number had to be chosen rather than
// read, it is named here and in docs/api.md.
//
// WHERE THE PRESSURE COMES FROM. `GtkGestureStylus`, whose `down`/`motion`/
// `up`/`proximity` signals carry a `getAxis(Gdk.AxisUse.PRESSURE)` returning
// `[known, value]`, already normalised to `[0, 1]` by GDK — which is
// upstream's documented range for `minForce`/`maxForce`, so nothing is
// rescaled on the way in. `wl_pointer` has no pressure axis and never will;
// the tablet protocol (`zwp_tablet_v2`) does, and a stylus is the only device
// on this platform that can answer.
//
// IT NEVER TAKES THE RESPONDER, same as `Hover` and the touchpad kinds and for
// a related reason: the stylus gesture is its own GTK sequence, not the
// pointer session the responder lock arbitrates, and a gesture reporting
// pressure has no business suspending the scrollers under it.
import type { RecognizerDecider, RecognizerView } from "./recognizer"
import type { RecognizerConfig } from "./types"

/**
 * Upstream's documented default for `minForce`.
 *
 * A DOC COMMENT rather than a constant, and that is worth flagging: the `0.2`
 * appears only in the JSDoc on `ForceTouchGestureConfig.minForce`
 * (`src/handlers/ForceTouchGestureHandler.ts`), and no JavaScript in upstream
 * assigns it — the real default lives in iOS code this repo cannot read. It is
 * reproduced because a documented default is still upstream's answer, and
 * inventing a different one would be a silent divergence.
 */
export const DEFAULT_MIN_FORCE = 0.2

export const forceTouchDecider: RecognizerDecider = {
  kind: "forceTouch",

  // See the file header: the stylus gesture is not the pointer session, and a
  // pressure report must not switch the native scroller off.
  claimsResponder: false,
  source: "stylus",

  /**
   * `maxForce` is a CEILING and exceeding it fails the gesture, which is
   * upstream's documented behaviour ("If the pressure is greater, gesture
   * fails"). Unset means no ceiling, which is upstream's shape too — there is
   * no documented default for it.
   */
  shouldFail: (view: RecognizerView, config: RecognizerConfig): boolean =>
    config.maxForce !== undefined && view.force > config.maxForce,

  /**
   * Non-strict, matching every other activation threshold in this module: a
   * value sitting exactly on the bound activates rather than misses. The
   * asymmetry with `shouldFail`'s strict comparison above is the same one
   * `Pan` has and is deliberate in both.
   */
  shouldActivate: (view: RecognizerView, config: RecognizerConfig): boolean =>
    view.force >= (config.minForce ?? DEFAULT_MIN_FORCE),

  /**
   * The ceiling keeps applying after activation, which is the same shape
   * `LongPress`'s `maxDistance` has: pressing harder than `maxForce` is a
   * cancellation of a gesture that was legitimately running, not a failure of
   * one that never started.
   */
  shouldCancelWhileActive: (
    view: RecognizerView,
    config: RecognizerConfig,
  ): boolean => config.maxForce !== undefined && view.force > config.maxForce,
}
