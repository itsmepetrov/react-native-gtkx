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
