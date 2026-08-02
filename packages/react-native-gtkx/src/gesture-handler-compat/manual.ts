// `Gesture.Manual()` — the recognizer that recognizes nothing.
//
// It is the smallest kind in the module and the only one whose predicates are
// both constant, because there is nothing for them to decide: the app drives
// the state machine itself through the `GestureStateManager` handed to the
// `onTouches*` callbacks. `.begin()`, `.activate()`, `.end()` and `.fail()`
// ARE the recognizer.
//
// WHY IT IS WORTH HAVING, beyond completing the surface: it exercises the
// arbitration registry from the OUTSIDE. Every other kind reaches
// `tryActivate` from a predicate this module wrote, so a test of the registry
// is also a test of the predicate that woke it. A `Manual` activated by an app
// at a moment the app chose is the same registry with the recognizer's own
// judgement removed — which is the only way to drive `requireExternalGestureToFail`,
// the broadcast cancel and the responder handoff at instants no predicate
// would have produced.
//
// AND IT GOES THROUGH THE SAME LOOP. `.activate()` does not set the state; it
// asks, exactly as a `Pan` crossing its `activeOffset` asks. It can come back
// parked behind another gesture, or cancelled, or granted — see
// `stateManager` in ./recognizer. Upstream is the same shape: its web state
// manager calls `handler.activate(true)`, and `activate` still routes through
// `moveToState` into the orchestrator. The `true` is only about bypassing
// `manualActivation`, not about bypassing arbitration.
//
// Restated from `src/web/handlers/ManualGestureHandler.ts` at 3.1.0, which is
// forty lines of which only one is a state transition: `begin()` on pointer
// down.
//
// ONE DELIBERATE DEVIATION, and this platform forces it. Upstream's Manual
// does not end when the pointers lift — its documentation says so explicitly
// ("It will not fail when all the pointers are lifted from the screen"). Half
// of that is reproduced exactly: a Manual still BEGAN when the pointer comes
// up stays BEGAN, holding nothing (`onRelease` below). The other half is not
// reachable. A gesture that is ACTIVE here is holding an INTERACTION — the
// responder lock, the GTK sequence, the suspended scrollers — and that
// interaction ends when the button does. Staying ACTIVE past it would mean
// holding a lock that no longer exists, receiving no further events of any
// kind, and never reporting an ending at all. So an ACTIVE Manual ends with
// the interaction, successfully. The app's own `onTouchesUp` fires FIRST and
// gets the state manager, so an app that wants a different ending has the
// event to write it in. docs/api.md records this.
import type { RecognizerDecider, ReleaseOutcome } from "./recognizer"

export const manualDecider: RecognizerDecider = {
  kind: "manual",

  /**
   * Never, from anything. Upstream's handler has no failure predicate at all —
   * `onPointerUp` removes the pointer from its tracker and does not touch the
   * state. `.fail()` is how a manual gesture fails.
   */
  shouldFail: (): boolean => false,

  /**
   * Never, from anything. This is the whole definition of the kind: no
   * distance, no velocity, no timer and no release criterion. `.activate()` is
   * the only way in.
   */
  shouldActivate: (): boolean => false,

  /** See the header: a lift decides nothing, so the gesture stays BEGAN. */
  onRelease: (): ReleaseOutcome => ({ kind: "hold" }),
}
