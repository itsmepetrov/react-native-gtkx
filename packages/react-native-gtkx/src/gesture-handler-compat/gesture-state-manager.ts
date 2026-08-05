// `GestureStateManager` — upstream's standalone export, reversed 2026-08-05.
//
// The refusal this replaces (docs/api.md, "What stays refused") described
// upstream's OLD, deprecated shape: `GestureStateManager.create(tag)`, a
// factory returning a begin/activate/fail/end object looked up in a global
// `NodeManager`. That is not what `react-native-gesture-handler` 3.1.0
// exports under this name — its package entry re-exports `./v3`'s
// `GestureStateManager` (`src/v3/gestureStateManager.ts`), three STATIC
// methods keyed by tag: `activate`, `fail`, `deactivate`. The `.create()`
// factory survives only as `LegacyGestureStateManagerType`, a TYPE the
// package no longer exports a value for. Read from the installed package
// rather than assumed — the previous refusal was written against a shape
// upstream had already moved on from.
//
// react-native-sortables' v3 gesture-handler adapter calls exactly this
// shape (docs/research/upstream-libraries.md, "Wall 4, confirmed"):
// `GestureStateManager.activate(event.handlerTag)` from its own
// `onTouchesMove`, once a drag survives `dragActivationDelay`. That is the
// ordinary case for any real drag, not an edge one, and this platform's
// export used to throw on the property READ before the call could even
// happen. ./tag-registry is the new fact that makes the reversal possible —
// a numeric tag can now be turned back into the recognizer that minted it.
//
// EACH METHOD ROUTES THROUGH THE SAME MACHINERY `Gesture.Manual()` already
// uses: ./recognizer's `stateManager`, the very object handed to
// `onTouchesDown`/`onTouchesMove`/`onTouchesUp`/`onTouchesCancel`. Nothing
// new is built. `.activate()` is still a REQUEST through the ordinary
// arbitration loop — it can come back parked behind
// `requireExternalGestureToFail`, or cancelled — and calling any of the
// three on a gesture that is not BEGAN/ACTIVE (already active, already
// failed, already ended) is the same no-op ./recognizer's own state checks
// already produce for `Gesture.Manual()`'s app-driven calls. `deactivate` is
// upstream's name for what ./recognizer calls `end()`; both mean BEGAN or
// ACTIVE -> END, successfully.
import { recognizerForTag } from "./tag-registry"

const isProduction =
  typeof process !== "undefined" && process.env.NODE_ENV === "production"

/**
 * A call naming a tag with no mounted recognizer behind it. Not thrown: a
 * `Manual` gesture's own `.activate()`/`.fail()`/`.end()` already no-op when
 * the state does not allow the transition, and a call arriving after its
 * `GestureDetector` unmounted is the same kind of stale request. Warned
 * rather than silent, because a tag that never resolves at all is more often
 * a bug than a race.
 */
const warnUnknownTag = (method: string, handlerTag: number): void => {
  if (!isProduction) {
    console.warn(
      `react-native-gtkx: GestureStateManager.${method}(${handlerTag}) named a handler tag ` +
        "with no mounted GestureDetector. Ignored.",
    )
  }
}

export const GestureStateManager = {
  activate: (handlerTag: number): void => {
    const recognizer = recognizerForTag(handlerTag)
    if (!recognizer) {
      warnUnknownTag("activate", handlerTag)
      return
    }
    recognizer.stateManager.activate()
  },

  fail: (handlerTag: number): void => {
    const recognizer = recognizerForTag(handlerTag)
    if (!recognizer) {
      warnUnknownTag("fail", handlerTag)
      return
    }
    recognizer.stateManager.fail()
  },

  deactivate: (handlerTag: number): void => {
    const recognizer = recognizerForTag(handlerTag)
    if (!recognizer) {
      warnUnknownTag("deactivate", handlerTag)
      return
    }
    recognizer.stateManager.end()
  },
}
