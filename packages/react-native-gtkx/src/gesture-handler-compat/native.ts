// `Gesture.Native()` — the recognizer that stands for the widget underneath
// it rather than for anything React Native is doing.
//
// WHAT IT IS FOR. Upstream's `NativeViewGestureHandler` wraps a native
// scrollable, a button or a switch and puts THAT into the arbitration, so a
// JS gesture can be declared simultaneous with the platform's own scrolling
// instead of racing it. `@gorhom/bottom-sheet` is the canonical use and the
// reason this exists here: it builds
// `Gesture.Native().simultaneousWithExternalGesture(sheetPan)` around its
// scrollable so the list can scroll while the sheet's pan watches for a drag
// on the handle.
//
// THE PREDICATES ARE UPSTREAM'S, restated from `src/web/handlers/
// NativeViewGestureHandler.ts` at 3.1.0: BEGAN on press; ACTIVE once the
// pointer has travelled `DEFAULT_TOUCH_SLOP` (15 px) from it, because that is
// the point at which a native scrollable would have started scrolling;
// immediately ACTIVE instead when `shouldActivateOnStart` is set, which is how
// a button-shaped native view takes the press at once; `shouldCancelWhenOutside`
// on by default, as upstream's `init` sets it; and a lift before activation is
// a failure rather than an end.
//
// THE ONE THING THAT IS NOT UPSTREAM'S, and it is the whole point of putting
// this in the slice that also fixed `->DENIED`: **this recognizer never takes
// the responder** (`claimsResponder: false`). On this platform taking it is
// what makes `responder/use-responder.ts` declare `CLAIMED` on the GTK
// sequence and call `setKineticScrolling(false)` on every enclosing
// `GtkScrolledWindow` — RN's `setIsJSResponder`, which exists to stop a native
// scroller stealing a JS drag. A gesture whose entire meaning is "the native
// scroller is handling this" cannot be the thing that switches the native
// scroller off. So it reports, and yields.
//
// The consequence is that it runs off the touch props, which fire regardless
// of responder status — and therefore that its ending is `onTouchEnd` or
// `onTouchCancel`. Which is exactly why the `->DENIED` correction had to land
// with it: before that fix a native ancestor claiming the sequence mid-drag
// reached JS as `onTouchEnd`, and this gesture would have reported a clean,
// successful end to a drag that had been taken away from it.
import type { RecognizerDecider, RecognizerView } from "./recognizer"
import type { RecognizerConfig } from "./types"

/**
 * Upstream's `DEFAULT_TOUCH_SLOP` (`src/web/constants.ts`), the travel at
 * which a wrapped native view is taken to have started handling the gesture.
 */
export const NATIVE_TOUCH_SLOP = 15

export const nativeDecider: RecognizerDecider = {
  // Reporting, not competing: it never takes the interaction, so it never
  // suspends the scroller it is reporting on. See the file header.
  claimsResponder: false,

  /**
   * Never on its own. Upstream's native handler has no failure predicate over
   * movement at all — a native view that is being dragged is a native view
   * doing its job. It still fails when the pointer lifts before it activated
   * (the shared machine's default `onRelease`), when the pointer leaves and
   * `shouldCancelWhenOutside` is on, and when the pointer count is refused.
   */
  shouldFail: (): boolean => false,

  shouldActivate: (view: RecognizerView, config: RecognizerConfig): boolean => {
    if (config.shouldActivateOnStart === true) {
      return true
    }
    // From the PRESS rather than from the translation origin, matching
    // upstream's `startX`/`startY` — a native view has no notion of being
    // re-based, and nothing has activated yet for translation to be measured
    // from anyway.
    return view.distanceFromPress >= NATIVE_TOUCH_SLOP
  },
}
