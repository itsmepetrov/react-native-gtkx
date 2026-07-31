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

export const setStoredRect = (widget: object, rect: StoredRect): void => {
  rects.set(widget, rect)
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

export const getStoredOffset = (widget: object): StoredOffset =>
  offsets.get(widget) ?? ZERO_OFFSET

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
