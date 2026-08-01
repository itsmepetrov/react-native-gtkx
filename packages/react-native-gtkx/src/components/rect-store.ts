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
}

const ZERO_OFFSET: StoredOffset = { dx: 0, dy: 0, matrix: null }

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
  offsets.set(widget, { dx, dy, matrix })
}

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
  if (layoutOffsetCount === 0) {
    return base
  }
  const extra = layoutOffsets.get(widget)
  if (extra === undefined) {
    return base
  }
  if (base.matrix === null) {
    return { dx: base.dx + extra.dx, dy: base.dy + extra.dy, matrix: null }
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
