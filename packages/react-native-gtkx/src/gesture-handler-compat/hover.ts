// `Gesture.Hover()` — the pointer being OVER a view, with no button involved.
//
// THE REFUSAL THIS REPLACES WAS WRONG, and it is worth writing down why rather
// than quietly deleting it. `docs/research/gesture-detector.md` grouped `Hover`
// with `Pinch`/`Rotation`/`ForceTouch` as "no input to run on". That was a
// reasonable reading of a rig whose only injection protocol was
// `zwlr_virtual_pointer_v1` — but it is the wrong test for this gesture,
// because a hover needs no protocol the rig lacked. A mouse hovers. The
// virtual pointer moves a mouse. `motion_absolute` with no `button` request is
// already a hover, and it always was: `Pressable` has shipped hover on
// `GtkEventControllerMotion` since long before this epic, and the gallery has
// hovered rows on screen. The refusal was inherited from its neighbours rather
// than measured, and measuring it takes one injected move.
//
// SO IT IS THE MOST TESTABLE of the four rather than the least: everything
// here runs under the ordinary headless compositor in the ordinary test suite,
// with a real pointer and a real crossing, which is more than `Pinch` and
// `Rotation` can say.
//
// WHERE IT COMES FROM. `GtkEventControllerMotion`'s `enter`/`motion`/`leave`,
// the same controller `components/pressable.tsx` already uses, attached by
// ./detector-runtime and pumped into `Recognizer.controller`. Not the touch
// props: those fire from a PRESS, and the defining property of a hover is that
// there is no press. That is the same reason `Pinch` needed a channel of its
// own, and it is the same channel.
//
// IT NEVER TAKES THE RESPONDER (`claimsResponder: false`), for exactly the
// structural reason the touchpad kinds do not: the responder lock is a lock
// over an INTERACTION, an interaction here starts with a press, and a hover
// has none. There is no session to take, no GTK sequence to claim and nothing
// to transfer. A hover therefore cannot exclude a press, which is the correct
// behaviour and also the only reachable one.
//
// Restated from `src/web/handlers/HoverGestureHandler.ts` at 3.1.0. Two
// details are worth naming:
//
//   - **it activates on the crossing itself.** `onPointerMoveOver` calls
//     `begin()` and then `activate()` in the same synchronous breath, so a
//     hover is BEGAN and ACTIVE within one event and there is no threshold of
//     any kind. `shouldActivate` returning a constant `true` IS that;
//   - **no button is consulted anywhere on the path.** Upstream's other
//     handlers gate `onPointerDown` on `isButtonInConfig`; the three hover
//     entry points never call it. `mouseButton` is inert for this kind, on
//     both platforms and for the same reason.
//
// UPSTREAM'S DEFAULT IS MUTUAL EXCLUSION AND THAT IS REPRODUCED, which is the
// one thing to know before putting a hover next to something. A gesture that
// activates cancels every recorded gesture it is not simultaneous with, and a
// hover activates whenever the pointer crosses in — so a hover entering while
// a pan on another view is still BEGAN will cancel that pan. Upstream behaves
// the same way and works around it per-use: its own `Pressable` sets
// `manualActivation` on the hover recognizer precisely to stop it blocking a
// `Gesture.Native()`. Inventing an exemption here would be a second
// arbitration rule that upstream does not have; declaring
// `simultaneousWithExternalGesture` is the answer, and it is the answer the
// relation registry exists to give. docs/api.md says so where an app will
// read it.
import type { RecognizerDecider } from "./recognizer"

export const hoverDecider: RecognizerDecider = {
  kind: "hover",

  // See the header: no press, so no interaction lock to take. Every event
  // arrives through `Recognizer.controller` instead.
  claimsResponder: false,
  source: "hover",

  /**
   * Never. A hover has no failure mode of its own — the pointer is either over
   * the view or it is not, and leaving is an END rather than a failure
   * (upstream's `onPointerMoveOut` calls `end()`). The controller channel's
   * own `end` is what reports it.
   */
  shouldFail: (): boolean => false,

  /**
   * Always. The crossing IS the gesture: there is no distance to travel, no
   * time to wait and nothing to disambiguate it from. Returning a constant is
   * upstream's `begin(); activate();` on the enter event, stated as the
   * predicate the shared machine asks for.
   */
  shouldActivate: (): boolean => true,
}
