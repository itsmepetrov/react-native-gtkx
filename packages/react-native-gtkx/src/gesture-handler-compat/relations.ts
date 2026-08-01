// The three relation maps, and the identity that makes them mean something.
//
// This is upstream's `InteractionManager` under a different name. The rename
// is not cosmetic: RN's OWN `InteractionManager` ships on this platform too
// (src/apis), and two unrelated things called the same thing inside one
// package is a trap somebody eventually falls into. What upstream calls
// `InteractionManager` is a relation registry and nothing else, so that is
// what it is called here.
//
// IT NEVER TALKS TO GTK, and that is the whole point of the slice. The
// responder lock is a single global interaction lock with one irrevocable
// `CLAIMED` on the source; it cannot express `Simultaneous` and must not try,
// because making it multi-holder would break `PanResponder` and every
// RN-portable app on this platform. So there are two locks at two levels: the
// responder lock decides that an interaction belongs to React Native, and
// this registry — plus the loop in ./orchestrator — decides which gestures
// are active inside it. Every relation resolves in JS before anything is
// claimed. See docs/research/gesture-detector.md, "Can the responder lock
// express this? No — and it should not try".
//
// There are exactly three relations and composition is sugar over them:
//
//   waitFor             this gesture must wait for those to fail
//   simultaneousHandlers  these two may both be active
//   blocksHandlers      those must wait for THIS one
//
// Nothing is vendored, adapted or transcribed from `src/web/`; what is
// reproduced is the behaviour, which docs/research/gesture-detector.md
// restated as a specification.
import {
  isComposedGestureSpec,
  type GestureRef,
  type GestureRelations,
} from "./types"

/**
 * Which MOUNTED gesture a spec object stands for.
 *
 * A relation names another gesture by handing over its spec object — that is
 * upstream's `GestureRef` and it is the only identity an app ever holds. The
 * spec is rebuilt on every render by both spellings, so the object cannot BE
 * the identity; what it can do is point at one. A mounted detector binds each
 * of its specs to the handler tag it minted, and the binding is never
 * removed on re-render, so a memoized gesture holding a reference to last
 * render's spec object still resolves to the right live gesture.
 *
 * Weak on purpose: a spec object from a render nobody remembers must not keep
 * anything alive.
 */
const tagOfSpec = new WeakMap<object, number>()

/** Called by a mounted detector for each gesture it drives, on every render. */
export const bindGestureTag = (spec: object, tag: number): void => {
  tagOfSpec.set(spec, tag)
}

/** Called when a detector unmounts. Hygiene: a stale tag is never recorded. */
export const unbindGestureTag = (spec: object): void => {
  tagOfSpec.delete(spec)
}

/**
 * Every handler tag one relation reference stands for.
 *
 * Three spellings, all upstream's: the gesture itself, a ref built with
 * `withRef()` holding it, or a raw handler tag. A COMPOSED gesture stands for
 * every gesture in it, which is what makes
 * `requireExternalGestureToFail(Gesture.Simultaneous(a, b))` mean what it
 * reads like.
 */
export const resolveGestureTags = (reference: GestureRef): number[] => {
  if (typeof reference === "number") {
    return [reference]
  }
  if (reference === null || typeof reference !== "object") {
    return []
  }
  if (isComposedGestureSpec(reference)) {
    return reference.toGestureArray().flatMap(resolveGestureTags)
  }
  const direct = tagOfSpec.get(reference)
  if (direct !== undefined) {
    return [direct]
  }
  // `withRef(ref)` puts the gesture into an ordinary React ref, and upstream's
  // relation methods accept that ref in place of the gesture.
  const current = (reference as { current?: unknown }).current
  return current !== null && typeof current === "object"
    ? resolveGestureTags(current as GestureRef)
    : []
}

const containsTag = (
  references: readonly GestureRef[] | undefined,
  tag: number,
): boolean =>
  references !== undefined &&
  references.some((reference) => resolveGestureTags(reference).includes(tag))

export type RelationRegistry = {
  /**
   * Replaces every relation recorded for one gesture. Replaces rather than
   * merges, because the config is rebuilt from scratch on every render and a
   * merge would accumulate references to gestures nobody holds any more —
   * upstream shipped exactly that leak (#3763).
   */
  configure: (tag: number, relations: Partial<GestureRelations>) => void
  drop: (tag: number) => void
  /** `tag` must wait for `otherTag` to fail before it may activate. */
  shouldWaitForFailure: (tag: number, otherTag: number) => boolean
  /** `tag` and `otherTag` may both be ACTIVE at once. */
  shouldRecognizeSimultaneously: (tag: number, otherTag: number) => boolean
  /** `otherTag` must wait for `tag` — the same relation, declared from the other end. */
  blocks: (tag: number, otherTag: number) => boolean
  reset: () => void
}

/**
 * References are stored raw and resolved on every question, rather than
 * resolved to tags once at configure time.
 *
 * That is deliberate and it is what makes cross-component relations work at
 * all: React mounts children before parents and siblings in tree order, so a
 * gesture routinely names one whose detector has not minted its tag yet.
 * Resolving lazily means the answer is correct as soon as both ends are
 * mounted, in whatever order that happened, with no second pass.
 */
export const createRelationRegistry = (): RelationRegistry => {
  const waitForRelations = new Map<number, readonly GestureRef[]>()
  const simultaneousRelations = new Map<number, readonly GestureRef[]>()
  const blocksHandlersRelations = new Map<number, readonly GestureRef[]>()

  const set = (
    map: Map<number, readonly GestureRef[]>,
    tag: number,
    references: readonly GestureRef[] | undefined,
  ): void => {
    if (references === undefined || references.length === 0) {
      map.delete(tag)
      return
    }
    map.set(tag, references)
  }

  return {
    configure: (tag, relations) => {
      set(waitForRelations, tag, relations.waitFor)
      set(simultaneousRelations, tag, relations.simultaneousHandlers)
      set(blocksHandlersRelations, tag, relations.blocksHandlers)
    },

    drop: (tag) => {
      waitForRelations.delete(tag)
      simultaneousRelations.delete(tag)
      blocksHandlersRelations.delete(tag)
    },

    shouldWaitForFailure: (tag, otherTag) =>
      containsTag(waitForRelations.get(tag), otherTag),

    shouldRecognizeSimultaneously: (tag, otherTag) =>
      containsTag(simultaneousRelations.get(tag), otherTag),

    blocks: (tag, otherTag) =>
      containsTag(blocksHandlersRelations.get(tag), otherTag),

    reset: () => {
      waitForRelations.clear()
      simultaneousRelations.clear()
      blocksHandlersRelations.clear()
    },
  }
}
