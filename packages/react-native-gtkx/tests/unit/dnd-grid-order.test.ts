// The grid arithmetic — the pure-logic half of `SortableGrid`, ported
// verbatim from upstream's `utils/gridCalculations` (worklets there, plain
// functions here; see order.ts for the same move on the plain list).
//
// `getGridCellFromCoordinates` is the one test worth reading closely: it
// FLOORS onto the cell whose top-left corner is at or before the point. That
// is upstream's own behaviour (`Math.floor(x / (itemWidth + columnGap))`),
// not a bug this port fixes — a point one pixel into a cell resolves to that
// cell, one pixel before it to the previous one.
import { expect, test } from "vitest"
import {
  calculateGridContentDimensions,
  calculateGridPosition,
  calculateIndexFromRowColumn,
  findItemIdAtIndex,
  getGridCellFromCoordinates,
  gridPositionsToOrder,
  listToGridObject,
  reorderGridInsert,
  reorderGridSwap,
  resolveTrackedGridIndex,
} from "../../src/dnd/grid-order"
import { GridOrientation } from "../../src/dnd/types"

const DIMENSIONS = {
  columns: 3,
  rows: 3,
  itemWidth: 100,
  itemHeight: 80,
  columnGap: 10,
  rowGap: 6,
}

test("calculateGridPosition lays out row-major for a vertical grid", () => {
  // 3 columns: 0,1,2 fill the first row, 3 starts the second.
  expect(
    calculateGridPosition(0, DIMENSIONS, GridOrientation.Vertical),
  ).toEqual({ index: 0, row: 0, column: 0, x: 0, y: 0 })
  expect(
    calculateGridPosition(2, DIMENSIONS, GridOrientation.Vertical),
  ).toEqual({ index: 2, row: 0, column: 2, x: 220, y: 0 })
  expect(
    calculateGridPosition(3, DIMENSIONS, GridOrientation.Vertical),
  ).toEqual({ index: 3, row: 1, column: 0, x: 0, y: 86 })
})

test("calculateGridPosition lays out column-major for a horizontal grid", () => {
  // 3 rows: 0,1,2 fill the first column, 3 starts the second.
  expect(
    calculateGridPosition(0, DIMENSIONS, GridOrientation.Horizontal),
  ).toEqual({ index: 0, row: 0, column: 0, x: 0, y: 0 })
  expect(
    calculateGridPosition(2, DIMENSIONS, GridOrientation.Horizontal),
  ).toEqual({ index: 2, row: 2, column: 0, x: 0, y: 172 })
  expect(
    calculateGridPosition(3, DIMENSIONS, GridOrientation.Horizontal),
  ).toEqual({ index: 3, row: 0, column: 1, x: 110, y: 0 })
})

test("calculateIndexFromRowColumn is calculateGridPosition's inverse", () => {
  for (const orientation of [
    GridOrientation.Vertical,
    GridOrientation.Horizontal,
  ]) {
    for (let index = 0; index < 9; index += 1) {
      const position = calculateGridPosition(index, DIMENSIONS, orientation)
      expect(
        calculateIndexFromRowColumn(
          position.row,
          position.column,
          DIMENSIONS,
          orientation,
        ),
      ).toBe(index)
    }
  }
})

test("listToGridObject assigns positions in list order", () => {
  const positions = listToGridObject(
    ["a", "b", "c", "d"],
    DIMENSIONS,
    GridOrientation.Vertical,
  )
  expect(positions.a).toEqual(
    calculateGridPosition(0, DIMENSIONS, GridOrientation.Vertical),
  )
  expect(positions.d).toEqual(
    calculateGridPosition(3, DIMENSIONS, GridOrientation.Vertical),
  )
})

test("getGridCellFromCoordinates floors onto the cell at or before the point — parity, not a bug", () => {
  // Cell 0 spans x in [0, 100), cell 1 starts at x = 110 (100 + columnGap).
  expect(
    getGridCellFromCoordinates(0, 0, DIMENSIONS, GridOrientation.Vertical, 9),
  ).toEqual({ row: 0, column: 0, index: 0 })
  expect(
    getGridCellFromCoordinates(99, 0, DIMENSIONS, GridOrientation.Vertical, 9),
  ).toEqual({ row: 0, column: 0, index: 0 })
  // One pixel INTO the gap still floors onto column 0 — the gap has no
  // owner, and Math.floor(109/110) is still 0.
  expect(
    getGridCellFromCoordinates(109, 0, DIMENSIONS, GridOrientation.Vertical, 9),
  ).toEqual({ row: 0, column: 0, index: 0 })
  expect(
    getGridCellFromCoordinates(110, 0, DIMENSIONS, GridOrientation.Vertical, 9),
  ).toEqual({ row: 0, column: 1, index: 1 })
  // A point past the last item clamps rather than reporting an out-of-range
  // index.
  expect(
    getGridCellFromCoordinates(
      9999,
      9999,
      DIMENSIONS,
      GridOrientation.Vertical,
      5,
    ),
  ).toEqual({ row: 1, column: 1, index: 4 })
})

test("reorderGridInsert shifts everyone between the old and new index by one", () => {
  const positions = listToGridObject(
    ["a", "b", "c", "d", "e"],
    DIMENSIONS,
    GridOrientation.Vertical,
  )
  // Move "a" (index 0) onto "d"'s cell (index 3): b, c, d each shift down one.
  const next = reorderGridInsert(
    positions,
    "a",
    3,
    DIMENSIONS,
    GridOrientation.Vertical,
  )
  expect(gridPositionsToOrder(next)).toEqual(["b", "c", "d", "a", "e"])

  // And the reverse direction: move "d" (index 3) onto "a"'s cell (index 0).
  const back = reorderGridInsert(
    next,
    "a",
    0,
    DIMENSIONS,
    GridOrientation.Vertical,
  )
  expect(gridPositionsToOrder(back)).toEqual(["a", "b", "c", "d", "e"])
})

test("reorderGridSwap trades exactly two cells and leaves everyone else alone", () => {
  const positions = listToGridObject(
    ["a", "b", "c", "d"],
    DIMENSIONS,
    GridOrientation.Vertical,
  )
  const next = reorderGridSwap(
    positions,
    "a",
    "c",
    DIMENSIONS,
    GridOrientation.Vertical,
  )
  expect(gridPositionsToOrder(next)).toEqual(["c", "b", "a", "d"])
  // b and d kept their original positions entirely — same object, even.
  expect(next.b).toBe(positions.b)
  expect(next.d).toBe(positions.d)
})

test("calculateGridContentDimensions sizes the cross axis from columns/rows, the other from item count", () => {
  const vertical = calculateGridContentDimensions(
    7,
    DIMENSIONS,
    GridOrientation.Vertical,
  )
  // 3 columns of 100 + 2 gaps of 10; 3 rows (ceil(7/3)) of 80 + 2 gaps of 6.
  expect(vertical).toEqual({ width: 320, height: 252 })

  const horizontal = calculateGridContentDimensions(
    7,
    DIMENSIONS,
    GridOrientation.Horizontal,
  )
  // 3 rows of 80 + 2 gaps of 6; 3 columns (ceil(7/3)) of 100 + 2 gaps of 10.
  expect(horizontal).toEqual({ width: 320, height: 252 })
})

test("findItemIdAtIndex looks up the id occupying an index, or null", () => {
  const positions = listToGridObject(
    ["a", "b", "c"],
    DIMENSIONS,
    GridOrientation.Vertical,
  )
  expect(findItemIdAtIndex(positions, 1)).toBe("b")
  expect(findItemIdAtIndex(positions, 9)).toBeNull()
})

// `resolveTrackedGridIndex` is grid.tsx's own live reorder trigger — the
// symmetric replacement for `getGridCellFromCoordinates`'s top-left floor,
// proven here with no gaps (matching the gallery's own pinned GTK numbers,
// tests/gtk/dnd/collision-thresholds.gtk.test.tsx) and again WITH gaps, to
// show the divisor (`itemSize + gap`) keeps the symmetry rather than only
// happening to hold at gap = 0.
const NO_GAP = { columns: 3, itemWidth: 100, itemHeight: 100 }

test("resolveTrackedGridIndex resolves the tracked rect back to its own cell at rest", () => {
  // Cell 4 of a 3x3 grid: row 1, column 1 — a neighbour on all four sides.
  const rest = calculateGridPosition(4, NO_GAP, GridOrientation.Vertical)
  expect(
    resolveTrackedGridIndex(
      rest.x,
      rest.y,
      NO_GAP,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(4)
})

test("resolveTrackedGridIndex needs about half a cell's travel, BOTH directions, BOTH axes — the symmetry getGridCellFromCoordinates does not have", () => {
  const rest = calculateGridPosition(4, NO_GAP, GridOrientation.Vertical)
  // Short of the threshold either way on the row axis: no crossing.
  expect(
    resolveTrackedGridIndex(
      rest.x,
      rest.y + 49,
      NO_GAP,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(4)
  expect(
    resolveTrackedGridIndex(
      rest.x,
      rest.y - 49,
      NO_GAP,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(4)
  // Past it: crosses DOWN (away from index 0 on this axis) and UP (toward
  // it) at essentially the SAME distance — upstream's own floor needs the
  // full 100px one way and about 1px the other (docs/research/
  // dnd-collision-feel.md); this needs ~50px either way.
  expect(
    resolveTrackedGridIndex(
      rest.x,
      rest.y + 51,
      NO_GAP,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(7) // row 2, column 1
  expect(
    resolveTrackedGridIndex(
      rest.x,
      rest.y - 51,
      NO_GAP,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(1) // row 0, column 1
  // Same shape on the column axis.
  expect(
    resolveTrackedGridIndex(
      rest.x + 51,
      rest.y,
      NO_GAP,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(5) // row 1, column 2
  expect(
    resolveTrackedGridIndex(
      rest.x - 51,
      rest.y,
      NO_GAP,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(3) // row 1, column 0
})

test("resolveTrackedGridIndex's threshold follows itemSize + gap, not itemSize alone", () => {
  // DIMENSIONS: itemWidth 100 + columnGap 10 = a 110px column period, itemHeight
  // 80 + rowGap 6 = an 86px row period — half of each is the threshold.
  const rest = calculateGridPosition(4, DIMENSIONS, GridOrientation.Vertical)
  expect(
    resolveTrackedGridIndex(
      rest.x,
      rest.y + 42,
      DIMENSIONS,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(4) // 42 < 43 (86 / 2): short of the row threshold
  expect(
    resolveTrackedGridIndex(
      rest.x,
      rest.y + 44,
      DIMENSIONS,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(7) // 44 > 43: crosses
  expect(
    resolveTrackedGridIndex(
      rest.x + 54,
      rest.y,
      DIMENSIONS,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(4) // 54 < 55 (110 / 2): short of the column threshold
  expect(
    resolveTrackedGridIndex(
      rest.x + 56,
      rest.y,
      DIMENSIONS,
      GridOrientation.Vertical,
      9,
    ),
  ).toBe(5) // 56 > 55: crosses
})

test("resolveTrackedGridIndex clamps to a valid index past either end", () => {
  expect(
    resolveTrackedGridIndex(9999, 9999, NO_GAP, GridOrientation.Vertical, 9),
  ).toBe(8)
  expect(
    resolveTrackedGridIndex(-9999, -9999, NO_GAP, GridOrientation.Vertical, 9),
  ).toBe(0)
})
