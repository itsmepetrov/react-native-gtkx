// `Race`, `Simultaneous` and `Exclusive` — list-builders over the three
// relation maps, and nothing else.
//
// This file is the evidence for a claim the recon made and this slice had to
// either prove or withdraw: **composition is sugar**. There is no composed
// state machine, no composed recognizer and no second arbitration path. Each
// composer decides which references land in which of two maps, `prepare`
// below writes them, and the loop in ./orchestrator reads exactly the same
// maps it reads for a hand-written relation. If that were false, this file
// would need a mechanism of its own; it needs none, and a test asserts that
// a composition and the equivalent hand-written relations behave identically.
//
// None of the four measured consumers calls a composer
// (docs/research/gesture-detector.md, probe 3). They are here because they are
// cheap over the maps, not because anything is waiting on them.
import {
  flattenGestures,
  isComposedGestureSpec,
  type AnyGestureSpec,
  type ComposedGestureKind,
  type ComposedGestureSpec,
  type GestureRef,
  type GestureRelations,
  type GestureSpec,
} from "./types"

/** One recognizer, with the relations it ends up with once composed. */
export type PreparedGesture = {
  spec: GestureSpec
  relations: GestureRelations
}

const prepareInto = (
  gesture: AnyGestureSpec,
  simultaneousWith: readonly GestureRef[],
  waitFor: readonly GestureRef[],
  out: PreparedGesture[],
): void => {
  if (!isComposedGestureSpec(gesture)) {
    out.push({
      spec: gesture,
      relations: {
        // What the gesture asked for itself comes first, then what the
        // composition adds. Built fresh rather than written back onto the
        // config: upstream mutates the gesture object in `prepare()` and had
        // to add a snapshot to stop the relations accumulating across renders
        // (#3763). A composition that computes instead of mutating cannot
        // accumulate anything.
        simultaneousHandlers: [
          ...(gesture.config.simultaneousHandlers ?? []),
          ...simultaneousWith,
        ],
        waitFor: [...(gesture.config.waitFor ?? []), ...waitFor],
        // `blocksHandlers` is deliberately NOT extended by any composer, and
        // that is upstream's own note: reversing the order of two gestures in
        // `Exclusive` already produces the same relation from the other end.
        blocksHandlers: gesture.config.blocksHandlers ?? [],
      },
    })
    return
  }

  const members = gesture.gestures

  if (gesture.composed === "simultaneous") {
    // Pairwise: each member becomes simultaneous with every OTHER member,
    // flattened. Flattened and not composed-as-a-unit, because a member that
    // is itself an `Exclusive` group must not have its own members made
    // simultaneous with each other — that would undo the exclusivity it was
    // written to express.
    members.forEach((member, index) => {
      const others = members
        .filter((_, other) => other !== index)
        .flatMap(flattenGestures)
      prepareInto(member, [...simultaneousWith, ...others], waitFor, out)
    })
    return
  }

  if (gesture.composed === "exclusive") {
    // A chain: every group waits for all the groups before it. So the first
    // one written wins if it can, and the last is the fallback — which is the
    // ordering `Gesture.Exclusive(doubleTap, singleTap)` reads as.
    let earlier: GestureSpec[] = []
    for (const member of members) {
      prepareInto(member, simultaneousWith, [...waitFor, ...earlier], out)
      earlier = [...earlier, ...flattenGestures(member)]
    }
    return
  }

  // `Race` adds nothing at all. It is the default — mutual exclusion between
  // gestures that share the interaction is what the loop does with no
  // relations recorded — so composing with it changes precisely one thing:
  // the gestures end up on the same detector.
  for (const member of members) {
    prepareInto(member, simultaneousWith, waitFor, out)
  }
}

/**
 * Flattens a gesture or a composition into the recognizers a detector has to
 * mount, each with the relations composition gave it.
 */
export const prepareGestures = (gesture: AnyGestureSpec): PreparedGesture[] => {
  const prepared: PreparedGesture[] = []
  prepareInto(gesture, [], [], prepared)
  return prepared
}

const compose = (
  composed: ComposedGestureKind,
  gestures: readonly AnyGestureSpec[],
): ComposedGestureSpec => {
  const flattened = gestures.flatMap(flattenGestures)
  if (new Set(flattened).size !== flattened.length) {
    // Upstream throws here too, and the reason is worth keeping: the same
    // gesture in two arms of one composition would be asked to be both
    // simultaneous with itself and to wait for itself, and the maps have no
    // way to say which was meant.
    throw new Error(
      "react-native-gtkx: each gesture can be used only once in a gesture composition.",
    )
  }
  return {
    composed,
    gestures,
    toGestureArray: () => flattened,
  }
}

/**
 * `Gesture.Race()` — the default, spelled out.
 *
 * Upstream's hook spelling calls this `useCompetingGestures`, which is the
 * better name for it: the gestures compete, the first to activate cancels the
 * rest, and that would have happened anyway.
 */
export const raceGestures = (
  ...gestures: AnyGestureSpec[]
): ComposedGestureSpec => compose("race", gestures)

/** `Gesture.Simultaneous()` — a pairwise fill of `simultaneousHandlers`. */
export const simultaneousGestures = (
  ...gestures: AnyGestureSpec[]
): ComposedGestureSpec => compose("simultaneous", gestures)

/** `Gesture.Exclusive()` — a chain fill of `waitFor`. */
export const exclusiveGestures = (
  ...gestures: AnyGestureSpec[]
): ComposedGestureSpec => compose("exclusive", gestures)
