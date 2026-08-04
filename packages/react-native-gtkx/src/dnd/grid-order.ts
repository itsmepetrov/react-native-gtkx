// The grid arithmetic, ported from upstream's `utils/gridCalculations`
// (worklets there, plain functions here — same reasoning as order.ts) and
// kept free of every GTK import, so the unit test project can exercise it
// without a display.
//
// `getGridCellFromCoordinates` FLOORS both axes onto the cell whose top-left
// corner is at or before the point — that is upstream's own behaviour
// (`Math.floor(x / (itemWidth + columnGap))`), not a bug this port fixes. A
// point one pixel into a cell resolves to that cell, one pixel before it to
// the previous one; there is no "nearest" rounding anywhere in the original.
import type {
  GridDimensions,
  GridOrientation,
  GridPosition,
  GridPositions,
  SortableData,
} from "./types"

const GRID_ORIENTATION_HORIZONTAL = "horizontal"

export const calculateGridPosition = (
  index: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
): GridPosition => {
  const {
    columns = 3,
    rows = 3,
    itemWidth,
    itemHeight,
    rowGap = 0,
    columnGap = 0,
  } = dimensions
  let row: number
  let column: number
  if ((orientation as string) === GRID_ORIENTATION_HORIZONTAL) {
    column = Math.floor(index / rows)
    row = index % rows
  } else {
    row = Math.floor(index / columns)
    column = index % columns
  }
  const x = column * (itemWidth + columnGap)
  const y = row * (itemHeight + rowGap)
  return { index, row, column, x, y }
}

export const calculateIndexFromRowColumn = (
  row: number,
  column: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
): number => {
  const { columns = 3, rows = 3 } = dimensions
  return (orientation as string) === GRID_ORIENTATION_HORIZONTAL
    ? column * rows + row
    : row * columns + column
}

/** `["a", "b"]` → `{ a: {index: 0, ...}, b: {index: 1, ...} }`. Upstream's
 *  takes objects with an `id`; both shapes are accepted so no call site has
 *  to convert. */
export const listToGridObject = <T extends SortableData>(
  list: readonly (string | T)[],
  dimensions: GridDimensions,
  orientation: GridOrientation,
): GridPositions => {
  const positions: GridPositions = {}
  list.forEach((item, index) => {
    const id = typeof item === "string" ? item : item.id
    positions[id] = calculateGridPosition(index, dimensions, orientation)
  })
  return positions
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

export const getGridCellFromCoordinates = (
  x: number,
  y: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
  totalItems: number,
): { row: number; column: number; index: number } => {
  const { itemWidth, itemHeight, rowGap = 0, columnGap = 0 } = dimensions
  const column = Math.floor(x / (itemWidth + columnGap))
  const row = Math.floor(y / (itemHeight + rowGap))
  const index = calculateIndexFromRowColumn(
    row,
    column,
    dimensions,
    orientation,
  )
  const clampedIndex = clamp(index, 0, totalItems - 1)
  const clampedPosition = calculateGridPosition(
    clampedIndex,
    dimensions,
    orientation,
  )
  return {
    row: clampedPosition.row,
    column: clampedPosition.column,
    index: clampedIndex,
  }
}

/**
 * Resolves a TRACKED cell rect (`grid.tsx`'s `useGridSortable`: the cell's
 * own top-left, `calculateGridPosition(fromIndex, ...)` plus the pointer's
 * delta since the drag began — never a measured layout) onto the nearest
 * cell, ROUNDING rather than flooring both axes.
 *
 * The 2-D sibling of `resolveTrackedIndex` in `order.ts` — see its comment
 * for why rounding this exact quantity is mathematically the same as
 * resolving by the dragged cell's own CENTRE against each slot's centre,
 * regardless of `columnGap`/`rowGap`, rather than `getGridCellFromCoordinates`'s
 * OWN top-left floor above (upstream's own behaviour, kept faithfully there
 * — this is a DIFFERENT function, the mirror's own live reorder trigger, not
 * a replacement for it).
 */
export const resolveTrackedGridIndex = (
  trackedX: number,
  trackedY: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
  totalItems: number,
): number => {
  const { itemWidth, itemHeight, rowGap = 0, columnGap = 0 } = dimensions
  const column = Math.round(trackedX / (itemWidth + columnGap))
  const row = Math.round(trackedY / (itemHeight + rowGap))
  const index = calculateIndexFromRowColumn(
    row,
    column,
    dimensions,
    orientation,
  )
  return clamp(index, 0, totalItems - 1)
}

/** Every id shifts by one slot between the dragged item's old and new index
 *  (`Insert` strategy) — the same "make room" reorder `Sortable`'s own
 *  `objectMove` does for a plain list, generalised to row/column. */
export const reorderGridInsert = (
  positions: GridPositions,
  activeId: string,
  targetIndex: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
): GridPositions => {
  const newPositions: GridPositions = {}
  const activePosition = positions[activeId]
  if (!activePosition) {
    return positions
  }
  const fromIndex = activePosition.index
  if (fromIndex === targetIndex) {
    return positions
  }
  const movingUp = targetIndex < fromIndex
  for (const id in positions) {
    const currentIndex = positions[id]!.index
    if (id === activeId) {
      newPositions[id] = calculateGridPosition(
        targetIndex,
        dimensions,
        orientation,
      )
    } else if (
      movingUp &&
      currentIndex >= targetIndex &&
      currentIndex < fromIndex
    ) {
      newPositions[id] = calculateGridPosition(
        currentIndex + 1,
        dimensions,
        orientation,
      )
    } else if (
      !movingUp &&
      currentIndex <= targetIndex &&
      currentIndex > fromIndex
    ) {
      newPositions[id] = calculateGridPosition(
        currentIndex - 1,
        dimensions,
        orientation,
      )
    } else {
      newPositions[id] = positions[id]!
    }
  }
  return newPositions
}

/* eslint-disable @typescript-eslint/no-unused-vars --
   `dimensions`/`orientation` keep `reorderGridSwap` the same shape as
   `reorderGridInsert`, which needs both to recompute a shifted cell's
   row/column — a straight swap of two existing `GridPosition` objects needs
   no arithmetic at all. */
/** Only the two cells trade places — nobody else moves. */
export const reorderGridSwap = (
  positions: GridPositions,
  activeId: string,
  targetId: string,
  dimensions: GridDimensions,
  orientation: GridOrientation,
): GridPositions => {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const activePosition = positions[activeId]
  const targetPosition = positions[targetId]
  if (!activePosition || !targetPosition) {
    return positions
  }
  return {
    ...positions,
    [activeId]: targetPosition,
    [targetId]: activePosition,
  }
}

export const calculateGridContentDimensions = (
  itemsCount: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
): { width: number; height: number } => {
  const {
    columns = 3,
    rows = 3,
    itemWidth,
    itemHeight,
    rowGap = 0,
    columnGap = 0,
  } = dimensions
  if ((orientation as string) === GRID_ORIENTATION_HORIZONTAL) {
    const totalColumns = Math.ceil(itemsCount / rows)
    const width = totalColumns * itemWidth + (totalColumns - 1) * columnGap
    const height = rows * itemHeight + (rows - 1) * rowGap
    return { width, height }
  }
  const totalRows = Math.ceil(itemsCount / columns)
  const width = columns * itemWidth + (columns - 1) * columnGap
  const height = totalRows * itemHeight + (totalRows - 1) * rowGap
  return { width, height }
}

export const findItemIdAtIndex = (
  positions: GridPositions,
  index: number,
): string | null => {
  for (const id in positions) {
    if (positions[id]!.index === index) {
      return id
    }
  }
  return null
}

/** `GridPositions` → an order array sorted by `.index`, which is the
 *  representation `SortableGrid`/`useGridSortableList` actually keep as
 *  React state (see order-state.ts) — deriving it back from a `GridPositions`
 *  map is what lets a reorder decision go through `reorderGridInsert` /
 *  `reorderGridSwap` unchanged rather than a second, hand-rolled splice. */
export const gridPositionsToOrder = (positions: GridPositions): string[] =>
  Object.keys(positions).sort(
    (left, right) => positions[left]!.index - positions[right]!.index,
  )
