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
import { flingDecider } from "./fling"
import { forceTouchDecider } from "./force-touch"
import { hoverDecider } from "./hover"
import { longPressDecider } from "./long-press"
import { manualDecider } from "./manual"
import { nativeDecider } from "./native"
import { panDecider } from "./pan"
import type { RecognizerDecider } from "./recognizer"
import { tapDecider } from "./tap"
import { pinchDecider, rotationDecider } from "./touchpad"
import type { GestureKind } from "./types"

export const DECIDERS: Record<GestureKind, RecognizerDecider> = {
  pan: panDecider,
  tap: tapDecider,
  longPress: longPressDecider,
  native: nativeDecider,
  // Two predicates each and a `source`, which is the whole of what slice 5
  // added to the machine: `Pinch` and `Rotation` are fed by GTK because a
  // touchpad pinch is not in the pointer stream, and are otherwise ordinary.
  pinch: pinchDecider,
  rotation: rotationDecider,
  // The last four, and the map is the evidence for the claim the epic has been
  // making since slice 2: ten recognizers, one state machine. Each of these
  // is a pair of predicates and at most two flags —
  // `Fling` adds `endsOnActivate`, `Manual` adds a release outcome that
  // decides nothing, `Hover` and `ForceTouch` add a `source`. None of them
  // adds a state, an event stream, a grant channel or an arbitration rule.
  fling: flingDecider,
  manual: manualDecider,
  hover: hoverDecider,
  forceTouch: forceTouchDecider,
}
