// The handlerTag -> mounted recognizer registry.
//
// This is the piece the original refusal (docs/api.md, "What stays
// refused") said this platform deliberately does not keep: a process-wide
// map from a gesture's numeric identity to the machine driving it, the
// shape upstream's native `NodeManager` is. It stayed absent because
// nothing reached for it — identity here is the mounted `GestureDetector`,
// and ./relations resolves an app's own gesture OBJECT to a tag lazily, at
// press, which is precisely what lets a cross-Root relation avoid ever
// looking anything up in a table that might not have both ends in it yet.
// That path is untouched: this file adds a second, independent registry,
// keyed the other way round (tag -> recognizer, not spec -> tag), for a
// consumer that only ever has the number.
//
// react-native-sortables' v3 gesture-handler adapter is that consumer
// (docs/research/upstream-libraries.md, "Wall 4, confirmed"): it calls the
// standalone `GestureStateManager.activate(event.handlerTag)` from inside
// its own `onTouchesMove`, reading the tag off the event rather than
// holding on to the manager `onTouchesDown` already handed it. There is no
// lazy resolution to fall back on for that call — the number is all
// upstream's own code gives it — so this map exists for exactly the export
// that needs it, ./gesture-state-manager, and nothing else reaches into it.
import type { Recognizer } from "./recognizer"

const mounted = new Map<number, Recognizer>()

/** Called by a `GestureDetector`'s runtime when it mints a recognizer. */
export const registerRecognizer = (
  tag: number,
  recognizer: Recognizer,
): void => {
  mounted.set(tag, recognizer)
}

/**
 * Called when that recognizer is disposed — its `GestureDetector` unmounted,
 * or the gesture composition changed shape and dropped it for a fresh one.
 */
export const unregisterRecognizer = (tag: number): void => {
  mounted.delete(tag)
}

/**
 * `undefined` for a tag with no mounted recognizer behind it: never minted,
 * already unmounted, or simply the wrong number. See ./gesture-state-manager
 * for what a miss does.
 */
export const recognizerForTag = (tag: number): Recognizer | undefined =>
  mounted.get(tag)
