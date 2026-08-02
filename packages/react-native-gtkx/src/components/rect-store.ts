// Committed engine rects and animated offsets, keyed by the CHILD widget.
// Written by commit callbacks (use-layout-child) and by Animated bindings;
// read by the parent container's RnGtkxLayout allocate() hook. Pure data —
// no FFI here, so both writers and the bridge-side reader stay testable.
import { composeTransform, isTranslationOnly } from "../style/transform"
import type { Transform2D, TransformPart } from "../contracts"

export type StoredRect = {
  x: number
  y: number
  width: number
  height: number
}

// The visual transform of one child, split by cost. A pure translation stays
// `matrix: null` and is applied by simply offsetting the rect — the path that
// existed before rotate/scale and that costs no GskTransform. Anything that
// rotates or scales carries the whole composed matrix (translations
// included, so the RN ordering is preserved) and pays one gsk call per
// allocation. Both live in ONE record on purpose: the allocate hook already
// reads it per child, so a transform costs no extra WeakMap lookup.
export type StoredOffset = {
  dx: number
  dy: number
  matrix: Transform2D | null
  /**
   * The box an animated SIZE is currently driving this child to, or null when
   * nothing is. Composed here rather than written over the committed rect for
   * the reason the `dx`/`dy` above are: the committed rect belongs to the
   * engine and is rewritten by any flush, and an animation must not lose a
   * frame to one that had nothing to do with it.
   */
  driven: DrivenBox | null
}

/**
 * A partial rect: every field the animation is NOT driving stays null and the
 * engine's committed value is used instead.
 *
 * Partial rather than whole so that nothing can go stale. The animated node
 * overrides only the axis being driven — its origin and its other axis keep
 * following the engine, so a window resize mid-animation moves it exactly as
 * it moves everything else. Its descendants override the whole rect, which is
 * safe for the same reason: those are relative to the node, and re-laying its
 * subtree out is precisely what decides them.
 */
export type DrivenBox = {
  x: number | null
  y: number | null
  width: number | null
  height: number | null
}

const ZERO_OFFSET: StoredOffset = { dx: 0, dy: 0, matrix: null, driven: null }

const rects = new WeakMap<object, StoredRect>()
const offsets = new WeakMap<object, StoredOffset>()

/**
 * Told when a child's committed rect changes, which is the only moment a
 * layout transition can know it has something to animate: a moved child is
 * exactly a child whose engine rect is not the one it had.
 *
 * A WeakMap plus a counter rather than a Map, because the key is a widget and
 * an observer must never be the reason one stays alive; the counter is what
 * keeps `setStoredRect` free (one integer compare) for the overwhelming
 * majority of children, which have no observer.
 */
export type RectObserver = (
  next: StoredRect,
  previous: StoredRect | undefined,
) => void

const rectObservers = new WeakMap<object, RectObserver>()
let rectObserverCount = 0

/** Subscribes to `widget`'s committed rect. Returns the unsubscribe. */
export const observeStoredRect = (
  widget: object,
  observer: RectObserver,
): (() => void) => {
  if (!rectObservers.has(widget)) {
    rectObserverCount += 1
  }
  rectObservers.set(widget, observer)
  return () => {
    if (rectObservers.delete(widget)) {
      rectObserverCount -= 1
    }
  }
}

export const setStoredRect = (widget: object, rect: StoredRect): void => {
  if (rectObserverCount === 0) {
    rects.set(widget, rect)
    return
  }
  const previous = rects.get(widget)
  rects.set(widget, rect)
  rectObservers.get(widget)?.(rect, previous)
}

export const getStoredRect = (widget: object): StoredRect | undefined =>
  rects.get(widget)

export const setStoredOffset = (
  widget: object,
  dx: number,
  dy: number,
  matrix: Transform2D | null = null,
): void => {
  offsets.set(widget, { dx, dy, matrix, driven: null })
}

// The THIRD layer, and the one that is not a translation at all.
//
// An animated `width`/`height` in the subset where the change is confined to
// the node that owns it (../style/animated-size.ts) is driven by re-laying out
// that node's own subtree and putting the result HERE — one record for the
// node, one for each of its descendants, because a wider box re-wraps the text
// inside it and those rects move too.
//
// Deliberately not a write over the committed rect, which is what the recon
// spike did (docs/research/animated-size.md, "Not implemented"). The committed
// rect is the engine's: any flush may rewrite it, and a measure-backed leaf —
// every `Text` — is re-committed by every walk that reaches it whether its
// rect changed or not (layout/node.ts, `hasMeasure`). An animation that lost a
// frame to an unrelated `setState` somewhere else in the tree would be exactly
// the kind of bug nobody can reproduce. Kept apart, the engine writes what it
// computed, this layer writes what the animation is showing, and the allocate
// hook is the only place the two meet.
const drivenBoxes = new WeakMap<object, DrivenBox>()
let drivenBoxCount = 0

export const setStoredDrivenBox = (widget: object, box: DrivenBox): void => {
  if (!drivenBoxes.has(widget)) {
    drivenBoxCount += 1
  }
  drivenBoxes.set(widget, box)
}

export const clearStoredDrivenBox = (widget: object): void => {
  if (drivenBoxes.delete(widget)) {
    drivenBoxCount -= 1
  }
}

/**
 * The box an animation is currently driving this widget to, if any. Read by
 * the container's own `measure` as well as by its parent's `allocate`, so the
 * widget's size request agrees with the size it is being given.
 */
export const getStoredDrivenBox = (widget: object): DrivenBox | undefined =>
  drivenBoxCount === 0 ? undefined : drivenBoxes.get(widget)

// The SECOND translation layer, and the reason there are two.
//
// The offset above belongs to the style: whatever `transform` the component
// declared, animated or not, and there is exactly one writer for it. A layout
// transition (Reanimated's `layout`/`LinearTransition`) is a different claim
// on the same child — "draw it where it used to be and walk it to where Yoga
// just put it" — and it has to survive alongside a style transform rather
// than overwrite it, because a reordering list whose rows also scale is not
// an exotic case. Composed here, in the one place both are read, so the
// allocate hook still does a single lookup per child and neither writer has
// to know the other exists.
//
// Translation only. A layout transition that changed a child's SIZE would
// need a Yoga pass per frame, which is refused on measured grounds
// (docs/research/animated-colors.md); the size lands immediately and the
// position is what animates.
const layoutOffsets = new WeakMap<object, { dx: number; dy: number }>()
let layoutOffsetCount = 0

export const setStoredLayoutOffset = (
  widget: object,
  dx: number,
  dy: number,
): void => {
  if (!layoutOffsets.has(widget)) {
    layoutOffsetCount += 1
  }
  layoutOffsets.set(widget, { dx, dy })
}

export const clearStoredLayoutOffset = (widget: object): void => {
  if (layoutOffsets.delete(widget)) {
    layoutOffsetCount -= 1
  }
}

/**
 * Where a layout transition currently has this child, relative to the rect
 * the engine gave it. Read when a transition is INTERRUPTED by another one:
 * the new run has to start from where the child is being drawn, not from
 * where it was before the first run began.
 */
export const getStoredLayoutOffset = (
  widget: object,
): { dx: number; dy: number } => layoutOffsets.get(widget) ?? { dx: 0, dy: 0 }

export const getStoredOffset = (widget: object): StoredOffset => {
  const base = offsets.get(widget) ?? ZERO_OFFSET
  const driven = drivenBoxCount === 0 ? undefined : drivenBoxes.get(widget)
  const extra = layoutOffsetCount === 0 ? undefined : layoutOffsets.get(widget)
  if (extra === undefined) {
    return driven === undefined ? base : { ...base, driven }
  }
  if (base.matrix === null) {
    return {
      dx: base.dx + extra.dx,
      dy: base.dy + extra.dy,
      matrix: null,
      driven: driven ?? null,
    }
  }
  // Added to the composed matrix's translation, which allocateChild applies
  // last and in the PARENT's coordinate space — so a rotated child still
  // slides along the parent's axes, which is what "it moved in the list"
  // means.
  return {
    dx: 0,
    dy: 0,
    matrix: {
      ...base.matrix,
      dx: base.matrix.dx + extra.dx,
      dy: base.matrix.dy + extra.dy,
    },
    driven: driven ?? null,
  }
}

/**
 * Stores a child's whole RN `transform` array, split the way the allocate
 * hook wants it: a pure translation keeps the positional path (offset the
 * rect, no GskTransform at all — the pre-rotate/scale behaviour), anything
 * that rotates or scales carries the composed matrix instead, translations
 * folded in so the array's order is preserved exactly.
 */
export const setStoredTransform = (
  widget: object,
  parts: readonly TransformPart[] | undefined,
): void => {
  if (!parts || parts.length === 0) {
    setStoredOffset(widget, 0, 0, null)
    return
  }
  const matrix = composeTransform(parts)
  if (isTranslationOnly(matrix)) {
    setStoredOffset(widget, matrix.dx, matrix.dy, null)
    return
  }
  setStoredOffset(widget, 0, 0, matrix)
}

// While a window-root allocate() pass runs the engine synchronously, commit
// callbacks must not queue GTK resizes mid-pass — the pass itself is about to
// place everything. Queue jobs are deferred (deduped per widget) and run once
// the pass ends; commits whose rect did not change never re-defer, so the
// follow-up converges.
let allocatePassDepth = 0
const deferredJobs = new Map<object, () => void>()

export const beginAllocatePass = (): void => {
  allocatePassDepth += 1
}

export const endAllocatePass = (): void => {
  allocatePassDepth -= 1
  if (allocatePassDepth === 0 && deferredJobs.size > 0) {
    const jobs = [...deferredJobs.values()]
    deferredJobs.clear()
    for (const job of jobs) {
      job()
    }
  }
}

// Returns true when the job was deferred (an allocate pass is running).
export const deferDuringAllocate = (
  widget: object,
  job: () => void,
): boolean => {
  if (allocatePassDepth === 0) {
    return false
  }
  deferredJobs.set(widget, job)
  return true
}
