// `resolveTrackedIndex` — `sortable.tsx`'s own live reorder trigger for the
// plain list, the 1-D sibling of `resolveTrackedGridIndex`
// (dnd-grid-order.test.ts). Proves the symmetry claim with numbers: rounding
// a tracked top/left position onto a slot needs about half the slot's own
// size to cross a neighbour, in EITHER direction — unlike upstream's own
// `Math.floor(positionY / itemHeight)`, which needs the full size one way and
// about a pixel the other (docs/research/dnd-collision-feel.md).
import { expect, test } from "vitest"
import { resolveTrackedIndex } from "../../src/dnd/order"

test("resolveTrackedIndex resolves the tracked position back to its own slot at rest", () => {
  // Row 2 of 5 (itemHeight 100, no gap): its own rest position is 2*100=200.
  expect(resolveTrackedIndex(200, 100, 5)).toBe(2)
})

test("resolveTrackedIndex needs about half a slot's travel, BOTH directions", () => {
  // Short of the threshold either way: no crossing.
  expect(resolveTrackedIndex(200 + 49, 100, 5)).toBe(2)
  expect(resolveTrackedIndex(200 - 49, 100, 5)).toBe(2)
  // Past it: crosses AWAY from index 0 and TOWARD it at essentially the same
  // distance (~half the slot), not upstream's own full-size/one-pixel split.
  expect(resolveTrackedIndex(200 + 51, 100, 5)).toBe(3)
  expect(resolveTrackedIndex(200 - 51, 100, 5)).toBe(1)
})

test("resolveTrackedIndex's threshold follows slotSize, whatever it is folded from (row size + gap)", () => {
  // A 140px slot (matching a real row's measured height plus a real Yoga
  // gap, e.g. 130 + 10) — half of it, 70, is the threshold.
  expect(resolveTrackedIndex(2 * 140 + 69, 140, 5)).toBe(2)
  expect(resolveTrackedIndex(2 * 140 + 71, 140, 5)).toBe(3)
  expect(resolveTrackedIndex(2 * 140 - 69, 140, 5)).toBe(2)
  expect(resolveTrackedIndex(2 * 140 - 71, 140, 5)).toBe(1)
})

test("resolveTrackedIndex clamps to a valid index past either end", () => {
  expect(resolveTrackedIndex(999999, 100, 5)).toBe(4)
  expect(resolveTrackedIndex(-999999, 100, 5)).toBe(0)
})
