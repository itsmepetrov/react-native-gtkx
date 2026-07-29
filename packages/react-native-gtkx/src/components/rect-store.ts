// Committed engine rects and animated offsets, keyed by the CHILD widget.
// Written by commit callbacks (use-layout-child) and by Animated bindings;
// read by the parent container's RnGtkxLayout allocate() hook. Pure data —
// no FFI here, so both writers and the bridge-side reader stay testable.
export type StoredRect = {
  x: number
  y: number
  width: number
  height: number
}

export type StoredOffset = { dx: number; dy: number }

const ZERO_OFFSET: StoredOffset = { dx: 0, dy: 0 }

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
): void => {
  offsets.set(widget, { dx, dy })
}

export const getStoredOffset = (widget: object): StoredOffset =>
  offsets.get(widget) ?? ZERO_OFFSET

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
