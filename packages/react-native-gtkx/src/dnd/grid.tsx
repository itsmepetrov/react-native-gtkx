// `SortableGrid`, `SortableGridItem`, `useGridSortable` and
// `useGridSortableList` — the 2-D sibling of `Sortable`, same reorder-by-
// crossing mechanism, one more axis.
//
// Upstream lays every cell out `position: absolute`, at a `top`/`left` a
// `useAnimatedStyle` computes from `positions.value[id]`, and sizes the
// container to `calculateGridContentDimensions` for exactly that reason —
// nothing else would give the absolutely-positioned cells a scroll range.
// This mirror has no equivalent of that computed style (`docs/research/
// drag-and-drop.md`'s `Sortable` section explains why: no per-frame
// transform outside a real gesture), so the grid is a real Yoga FLEX-WRAP
// layout instead: the content container is a fixed-size cross axis (`columns`
// × `itemWidth` for a vertical grid, `rows` × `itemHeight` for a horizontal
// one) with `flexWrap: "wrap"`, and cells of a fixed `itemWidth`/`itemHeight`
// wrap themselves into rows or columns exactly the way the absolute
// positions upstream computes would place them — because both are the same
// arithmetic (`grid-order.ts`'s `calculateGridPosition`), just applied by two
// different engines. The one thing this could not reproduce either way is in
// docs/api.md: the grid's overall size is whatever Yoga measures, not
// `calculateGridContentDimensions`; `useGridSortableList` still reports that
// number for an app that wants upstream's own formula.
//
// WHAT DECIDES A CROSSING, and why it changed: see `sortable.tsx`'s own
// module comment for the full reasoning — the same change applies here, one
// more axis. This used to be GDK hit-testing the raw pointer against a
// neighbour cell's full rect (a cell's own `onEnter`) — grab-point
// DEPENDENT. It is now the dragged cell's own TRACKED position:
// `useEdgeAutoscroll`'s `onDragMotion` (this grid's shared motion
// controller) feeds `handleDragMotion` below, which tracks
// `calculateGridPosition(fromIndex, ...)` plus the pointer's delta on both
// axes since the drag began, and resolves the cell it lands on by ROUNDING
// both axes rather than `getGridCellFromCoordinates`'s own floor — the
// dragged cell's CENTRE against a slot's centre (`grid-order.ts`'s
// `resolveTrackedGridIndex`), not its top-left corner against the slot's
// origin. The origin is `DragSourceControllers`'s `onGrab`, converted to
// this grid's own container coordinates, never the first motion sample.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { MeasureHandle } from "../components/measure"
import { widgetForHandle } from "../components/measure"
import { ScrollView, type ScrollViewHandle } from "../components/scroll-view"
import { View } from "../components/view"
import { computePointIn, type Gtk } from "../gtkx/bridge/index"
import { useEdgeAutoscroll } from "./autoscroll"
import { DraggableContext, DraggableHandle } from "./draggable"
import {
  calculateGridContentDimensions,
  calculateGridPosition,
  gridPositionsToOrder,
  listToGridObject,
  reorderGridInsert,
  reorderGridSwap,
  resolveTrackedGridIndex,
} from "./grid-order"
import { DragSourceControllers, DropTargetControllers } from "./gtk-controllers"
import { keyOf, useOrder } from "./order-state"
import type { DragPayload } from "./payload"
import {
  GridOrientation,
  GridScrollDirection,
  GridStrategy,
  type GridItemPlumbing,
  type GridPositions,
  type SharedValueLike,
  type SortableData,
  type SortableGridItemProps,
  type SortableGridProps,
  type UseGridSortableListOptions,
  type UseGridSortableListReturn,
  type UseGridSortableOptions,
  type UseGridSortableReturn,
} from "./types"

export {
  calculateGridContentDimensions,
  calculateGridPosition,
  calculateIndexFromRowColumn,
  findItemIdAtIndex,
  getGridCellFromCoordinates,
  listToGridObject,
  reorderGridInsert,
  reorderGridSwap,
} from "./grid-order"

// --- the list ---------------------------------------------------------------

type GridItemCallbacks = {
  onMove?: (id: string, from: number, to: number) => void
  onDragStart?: (id: string, position: number) => void
  onDrop?: (id: string, position: number, allPositions?: GridPositions) => void
}

type SortableGridContextValue = {
  scope: string
  /** The dragged item's own callbacks live on ITS OWN `SortableGridItem`, not
   *  on `SortableGrid` (upstream has no list-level callbacks for the grid —
   *  `SortableGridProps` carries none). A reorder is decided by the grid's
   *  own reorder tracking (`handleDragMotion`), not by any one cell's
   *  component instance, so the dragged cell's own `onMove` is reached
   *  through this small registry rather than a closure `moveOnto` could
   *  capture directly. */
  registerCallbacks: (id: string, callbacks: GridItemCallbacks | null) => void
  /** Called from the grid's own reorder tracking when the dragged cell's
   *  tracked position resolves to a new slot — no longer from a cell's own
   *  `onEnter`, see the module comment. */
  moveOnto: (draggedId: string, targetId: string) => void
  /** `grabWidget`/`grabX`/`grabY` are `DragSourceControllers`'s `onGrab`,
   *  forwarded as-is — see `sortable.tsx`'s `SortableContextValue.beginDrag`
   *  for what this converts them into. Still returns the dragged cell's
   *  `fromIndex`, unchanged, for `onDragStart`. */
  beginDrag: (
    draggedId: string,
    grabWidget: Gtk.Widget | null,
    grabX: number,
    grabY: number,
  ) => number
  endDrag: (
    draggedId: string,
    dropped: boolean,
  ) => { index: number; positions: GridPositions } | null
}

const SortableGridContext = createContext<SortableGridContextValue | null>(null)

const useGridSharedBoxes = (
  order: string[],
  dimensions: GridItemPlumbing["dimensions"],
  orientation: GridOrientation,
  strategy: GridStrategy,
  autoScrollDirection: SharedValueLike<GridScrollDirection>,
) => {
  const positions = useMemo(
    (): SharedValueLike<GridPositions> => ({
      value: listToGridObject(order, dimensions, orientation),
    }),
    [order, dimensions, orientation],
  )
  const idle = useMemo(
    () => ({
      scrollY: { value: 0 },
      scrollX: { value: 0 },
    }),
    [],
  )
  const itemsCount = order.length

  return useMemo(
    () => ({
      positions,
      ...idle,
      plumbing: (): GridItemPlumbing => ({
        positions,
        scrollY: idle.scrollY,
        scrollX: idle.scrollX,
        autoScrollDirection,
        itemsCount,
        dimensions,
        orientation,
        strategy,
      }),
    }),
    [
      positions,
      idle,
      itemsCount,
      dimensions,
      orientation,
      strategy,
      autoScrollDirection,
    ],
  )
}

const gridDirectionFor = (
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
): GridScrollDirection => {
  if (dy < 0 && dx < 0) {
    return GridScrollDirection.UpLeft
  }
  if (dy < 0 && dx > 0) {
    return GridScrollDirection.UpRight
  }
  if (dy > 0 && dx < 0) {
    return GridScrollDirection.DownLeft
  }
  if (dy > 0 && dx > 0) {
    return GridScrollDirection.DownRight
  }
  if (dy < 0) {
    return GridScrollDirection.Up
  }
  if (dy > 0) {
    return GridScrollDirection.Down
  }
  if (dx < 0) {
    return GridScrollDirection.Left
  }
  if (dx > 0) {
    return GridScrollDirection.Right
  }
  return GridScrollDirection.None
}

/**
 * Owns the order of a sortable grid, for an app rendering its own container —
 * the grid's counterpart of `useSortableList`. **The order half only**, same
 * contract: rows still need to sit inside a `SortableGrid` for the drag
 * wiring, which travels through context. No autoscroll wiring either, for
 * the same reason `useSortableList` has none — this hook builds no
 * `ScrollView` of its own.
 */
export const useGridSortableList = <TData extends SortableData>(
  options: UseGridSortableListOptions<TData>,
): UseGridSortableListReturn<TData> => {
  const {
    dimensions,
    orientation = GridOrientation.Vertical,
    strategy = GridStrategy.Insert,
  } = options
  const { order, items } = useOrder(options.data, options.itemKeyExtractor)
  const idleAutoScroll = useMemo(
    (): SharedValueLike<GridScrollDirection> => ({
      value: GridScrollDirection.None,
    }),
    [],
  )
  const boxes = useGridSharedBoxes(
    order,
    dimensions,
    orientation,
    strategy,
    idleAutoScroll,
  )
  const dropProviderRef = useRef(null)
  const noop = useCallback(() => {}, [])
  const { width: contentWidth, height: contentHeight } =
    calculateGridContentDimensions(order.length, dimensions, orientation)

  return {
    positions: boxes.positions,
    scrollY: boxes.scrollY,
    scrollX: boxes.scrollX,
    autoScrollDirection: idleAutoScroll,
    dropProviderRef,
    handleScroll: noop,
    handleScrollEnd: noop,
    contentWidth,
    contentHeight,
    items,
    getItemProps: () => boxes.plumbing(),
  }
}

/**
 * A grid whose cells reorder by dragging.
 *
 * ```tsx
 * <SortableGrid
 *   data={photos}
 *   dimensions={{ columns: 3, itemWidth: 100, itemHeight: 100, columnGap: 8, rowGap: 8 }}
 *   renderItem={({ item, id, ...rest }) => (
 *     <SortableGridItem key={id} id={id} data={item} {...rest}>
 *       <Image source={{ uri: item.uri }} style={{ flex: 1 }} />
 *     </SortableGridItem>
 *   )}
 * />
 * ```
 *
 * No list-level `onMove`/`onDragStart`/`onDrop`/`onDragging` — same as
 * upstream's own `SortableGridProps`, which carries none either; wire them on
 * each `SortableGridItem` instead.
 */
export const SortableGrid = <TData extends SortableData>({
  data,
  renderItem,
  dimensions,
  orientation = GridOrientation.Vertical,
  strategy = GridStrategy.Insert,
  style,
  contentContainerStyle,
  itemKeyExtractor,
  // `scrollEnabled` is accepted and ignored: this platform's `ScrollView` has
  // no prop to disable input the way upstream's does (`docs/api.md`), so
  // there is nothing here to forward it to — not destructured at all, rather
  // than bound and unused.
  testID,
}: SortableGridProps<TData>): ReactNode => {
  if (!dimensions.itemWidth || !dimensions.itemHeight) {
    throw new Error(
      "react-native-gtkx/dnd: SortableGrid requires itemWidth and itemHeight in dimensions",
    )
  }
  if (orientation === GridOrientation.Vertical && !dimensions.columns) {
    throw new Error(
      "react-native-gtkx/dnd: SortableGrid requires columns in dimensions when orientation is vertical",
    )
  }
  if (orientation === GridOrientation.Horizontal && !dimensions.rows) {
    throw new Error(
      "react-native-gtkx/dnd: SortableGrid requires rows in dimensions when orientation is horizontal",
    )
  }

  const { scope, order, setOrder, items } = useOrder(data, itemKeyExtractor)
  const isHorizontal = orientation === GridOrientation.Horizontal

  const containerRef = useRef<MeasureHandle | null>(null)
  const scrollViewRef = useRef<ScrollViewHandle | null>(null)

  const beforeDrag = useRef<string[] | null>(null)
  const orderRef = useRef(order)
  useEffect(() => {
    orderRef.current = order
  }, [order])

  const callbacks = useRef(new Map<string, GridItemCallbacks>())
  const registerCallbacks = useCallback(
    (id: string, cbs: GridItemCallbacks | null) => {
      if (cbs) {
        callbacks.current.set(id, cbs)
      } else {
        callbacks.current.delete(id)
      }
    },
    [],
  )

  const moveOnto = useCallback(
    (draggedId: string, targetId: string) => {
      setOrder((current) => {
        const positions = listToGridObject(current, dimensions, orientation)
        const activePosition = positions[draggedId]
        const targetPosition = positions[targetId]
        if (!activePosition || !targetPosition) {
          return current
        }
        const nextPositions =
          strategy === GridStrategy.Swap
            ? reorderGridSwap(
                positions,
                draggedId,
                targetId,
                dimensions,
                orientation,
              )
            : reorderGridInsert(
                positions,
                draggedId,
                targetPosition.index,
                dimensions,
                orientation,
              )
        const next = gridPositionsToOrder(nextPositions)
        if (
          next.length === current.length &&
          next.every((id, index) => id === current[index])
        ) {
          return current
        }
        callbacks.current
          .get(draggedId)
          ?.onMove?.(
            draggedId,
            activePosition.index,
            nextPositions[draggedId]!.index,
          )
        return next
      })
    },
    [setOrder, dimensions, orientation, strategy],
  )

  // The dragged cell's own tracked position — see `sortable.tsx`'s twin for
  // why this is a ref, and its `base` field's derivation.
  const tracking = useRef<{
    draggedId: string
    baseX: number
    baseY: number
    lastResolvedIndex: number
  } | null>(null)

  const handleDragMotion = useCallback(
    (x: number, y: number) => {
      const state = tracking.current
      if (!state) {
        return
      }
      const trackedX = x + state.baseX
      const trackedY = y + state.baseY
      const resolvedIndex = resolveTrackedGridIndex(
        trackedX,
        trackedY,
        dimensions,
        orientation,
        orderRef.current.length,
      )
      if (resolvedIndex === state.lastResolvedIndex) {
        return
      }
      state.lastResolvedIndex = resolvedIndex
      const targetId = orderRef.current[resolvedIndex]
      if (targetId !== undefined && targetId !== state.draggedId) {
        moveOnto(state.draggedId, targetId)
      }
    },
    [dimensions, orientation, moveOnto],
  )

  const autoscroll = useEdgeAutoscroll<GridScrollDirection>({
    containerRef,
    scrollViewRef,
    axes: "both",
    none: GridScrollDirection.None,
    directionFor: gridDirectionFor,
    onDragMotion: handleDragMotion,
  })

  const boxes = useGridSharedBoxes(
    order,
    dimensions,
    orientation,
    strategy,
    autoscroll.direction,
  )

  const beginDrag = useCallback(
    (
      draggedId: string,
      grabWidget: Gtk.Widget | null,
      grabX: number,
      grabY: number,
    ): number => {
      beforeDrag.current = orderRef.current
      autoscroll.setActive(true)
      const fromIndex = orderRef.current.indexOf(draggedId)

      tracking.current = null
      const container = widgetForHandle(containerRef.current)
      if (grabWidget && container && fromIndex !== -1) {
        const origin = computePointIn(grabWidget, container, grabX, grabY)
        if (origin) {
          // Unlike the plain list, a grid cell's size is not measured: it is
          // already a real, enforced Yoga size — `SortableGridItem` styles
          // every cell to exactly `dimensions.itemWidth`/`itemHeight`
          // (grid.tsx below), so the same numbers this component was
          // already handed are what the tracked position's slots use too.
          const rest = calculateGridPosition(fromIndex, dimensions, orientation)
          tracking.current = {
            draggedId,
            baseX: rest.x - origin.x,
            baseY: rest.y - origin.y,
            lastResolvedIndex: fromIndex,
          }
        }
      }
      return fromIndex
    },
    [autoscroll, dimensions, orientation],
  )

  const endDrag = useCallback(
    (
      draggedId: string,
      dropped: boolean,
    ): { index: number; positions: GridPositions } | null => {
      autoscroll.setActive(false)
      tracking.current = null
      const restore = beforeDrag.current
      beforeDrag.current = null
      if (!dropped) {
        if (restore) {
          setOrder(() => restore)
        }
        return null
      }
      const settled = orderRef.current
      const positions = listToGridObject(settled, dimensions, orientation)
      return { index: positions[draggedId]?.index ?? -1, positions }
    },
    [setOrder, dimensions, orientation, autoscroll],
  )

  const contextValue = useMemo<SortableGridContextValue>(
    () => ({ scope, registerCallbacks, moveOnto, beginDrag, endDrag }),
    [scope, registerCallbacks, moveOnto, beginDrag, endDrag],
  )

  const { width: crossAxisWidth } = calculateGridContentDimensions(
    order.length,
    dimensions,
    GridOrientation.Vertical,
  )
  const { height: crossAxisHeight } = calculateGridContentDimensions(
    order.length,
    dimensions,
    GridOrientation.Horizontal,
  )

  return (
    <SortableGridContext.Provider value={contextValue}>
      <View
        ref={containerRef}
        style={{ flex: 1 }}
      >
        {autoscroll.controllers}
        <ScrollView
          ref={scrollViewRef}
          horizontal={isHorizontal}
          style={style}
          contentContainerStyle={[
            isHorizontal
              ? {
                  flexDirection: "column",
                  flexWrap: "wrap",
                  height: crossAxisHeight,
                  columnGap: dimensions.columnGap,
                  rowGap: dimensions.rowGap,
                }
              : {
                  flexDirection: "row",
                  flexWrap: "wrap",
                  width: crossAxisWidth,
                  columnGap: dimensions.columnGap,
                  rowGap: dimensions.rowGap,
                },
            contentContainerStyle,
          ]}
          testID={testID}
        >
          {items.map((item, index) =>
            renderItem({
              item,
              index,
              id: keyOf(item, index, itemKeyExtractor),
              ...boxes.plumbing(),
            }),
          )}
        </ScrollView>
      </View>
    </SortableGridContext.Provider>
  )
}

/**
 * The reorder half of the module, as a hook, for a cell that owns its own
 * view.
 */
export const useGridSortable = <TData,>(
  options: UseGridSortableOptions<TData>,
): UseGridSortableReturn => {
  const { id, onMove, onDragStart, onDrop, onDragging } = options
  const grid = useContext(SortableGridContext)
  if (grid === null) {
    throw new Error(
      "react-native-gtkx/dnd: SortableGridItem/useGridSortable must be inside a SortableGrid",
    )
  }
  const [isMoving, setIsMoving] = useState(false)
  const [hasHandle, setHasHandle] = useState(false)

  const registerHandle = useCallback((registered: boolean) => {
    setHasHandle(registered)
  }, [])

  useEffect(() => {
    grid.registerCallbacks(id, { onMove, onDragStart, onDrop })
    return () => grid.registerCallbacks(id, null)
  }, [grid, id, onMove, onDragStart, onDrop])

  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  // Same list only, including this cell itself — see sortable.tsx's
  // `useSortable` for why refusing a self-drop is wrong on this platform.
  const accepts = useCallback(
    (payload: DragPayload) => payload.scope === grid.scope,
    [grid],
  )

  // `DragSourceControllers`'s own grab point — see sortable.tsx's
  // `useSortable` for the same field and why it is captured here rather than
  // read from the first motion sample.
  const grab = useRef<{ widget: Gtk.Widget | null; x: number; y: number }>({
    widget: null,
    x: 0,
    y: 0,
  })

  const dragControllers = (
    <DragSourceControllers
      payload={{ scope: grid.scope, id }}
      onGrab={(x, y, widget) => {
        grab.current = { widget, x, y }
      }}
      onDragBegin={() => {
        setIsMoving(true)
        const position = grid.beginDrag(
          id,
          grab.current.widget,
          grab.current.x,
          grab.current.y,
        )
        onDragStart?.(id, position)
      }}
      onDragEnd={(dropped) => {
        setIsMoving(false)
        const result = grid.endDrag(id, dropped)
        if (result) {
          onDrop?.(id, result.index, result.positions)
        }
      }}
    />
  )

  const dropControllers = (
    <DropTargetControllers
      accepts={accepts}
      // No `onEnter` any more — the reorder decision is the grid's own
      // tracking (`handleDragMotion`), not this cell's drop target. This
      // target still has to exist and accept, or GDK would refuse the drop;
      // `onMotion` still reports the public `onDragging` callback.
      onMotion={(payload, x, y) => {
        onDragging?.(payload.id, id, x, y)
      }}
      onDrop={() => {}}
    />
  )

  return {
    animatedStyle: undefined,
    isMoving,
    hasHandle,
    registerHandle,
    dragControllers,
    children: (
      <>
        {mounted && !hasHandle ? dragControllers : null}
        {dropControllers}
      </>
    ),
  }
}

/** One cell of a {@link SortableGrid}. Both a drag source and a drop target:
 *  the cell you drag onto is the position the dragged cell takes (or trades
 *  with, under `GridStrategy.Swap`). */
export const SortableGridItem = <TData,>({
  id,
  data,
  dimensions,
  children,
  style,
  animatedStyle,
  testID,
  onMove,
  onDragStart,
  onDrop,
  onDragging,
}: SortableGridItemProps<TData>): ReactNode => {
  const sortable = useGridSortable<TData>({
    id,
    data,
    onMove,
    onDragStart,
    onDrop,
    onDragging,
  } as UseGridSortableOptions<TData>)

  const handleContext = useMemo(
    () => ({
      source: sortable.dragControllers,
      registerHandle: sortable.registerHandle,
    }),
    [sortable.dragControllers, sortable.registerHandle],
  )

  const cellSize = dimensions
    ? { width: dimensions.itemWidth, height: dimensions.itemHeight }
    : undefined

  return (
    <View
      style={
        animatedStyle ? [cellSize, style, animatedStyle] : [cellSize, style]
      }
      testID={testID}
    >
      <DraggableContext.Provider value={handleContext}>
        {sortable.children}
        {children}
      </DraggableContext.Provider>
    </View>
  )
}

SortableGridItem.Handle = DraggableHandle
