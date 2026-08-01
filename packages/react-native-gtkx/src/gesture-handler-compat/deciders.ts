// Which pair of predicates the one machine runs, per kind.
//
// The whole of what tells the four kinds apart. There is no second state
// machine, no second event stream and no second grant channel —
// `docs/research/gesture-detector.md` predicted that `Tap` and `LongPress`
// would be an afternoon over slice 1's core, and this map is the shape of that
// claim.
//
// `Native` stretched it by exactly one flag rather than one machine: it wants
// the same progression without the responder grant, because taking the
// interaction is the one thing a gesture that stands for the native widget
// must not do. See ./native and `RecognizerDecider.claimsResponder`.
//
// Its own file, and free of every platform import, so a test can mount a
// recognizer of any kind without pulling in GTK — which is what lets the
// arbitration tests drive several real recognizers off Linux.
import { longPressDecider } from "./long-press"
import { nativeDecider } from "./native"
import { panDecider } from "./pan"
import type { RecognizerDecider } from "./recognizer"
import { tapDecider } from "./tap"
import type { GestureKind } from "./types"

export const DECIDERS: Record<GestureKind, RecognizerDecider> = {
  pan: panDecider,
  tap: tapDecider,
  longPress: longPressDecider,
  native: nativeDecider,
}
