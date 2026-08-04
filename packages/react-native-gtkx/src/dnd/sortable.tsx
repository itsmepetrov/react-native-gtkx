// `Sortable`, `SortableItem`, `useSortable`, `useSortableList` and their
// horizontal counterparts (`useHorizontalSortable`, `useHorizontalSortableList`)
// — the drag-to-reorder list, which is the shape most apps actually reach
// for, in either direction.
//
// The reorder is LIVE: crossing another row moves the dragged row into its
// place immediately, so the list rearranges under the drag icon. That is
// upstream's behaviour too — its `onMove` fires as rows cross, not at the
// end — minus the spring, because here the rows are laid out by Yoga rather
// than transformed. The mechanism does not care which axis the list scrolls
// along, which is why `SortableDirection.Horizontal` is a render-time branch
// here (a horizontal `ScrollView`, `leftBound`/`autoScrollHorizontalDirection`
// plumbing) rather than a second implementation.
//
// WHAT DECIDES A CROSSING, and why it changed: this used to be GDK
// hit-testing the raw pointer against a neighbour row's full rect (a row's
// own `onEnter`) — grab-point DEPENDENT, unlike upstream's own item-rect
// reasoning (`docs/research/dnd-collision-feel.md`). It is now the dragged
// row's own TRACKED position, upstream's shape without upstream's asymmetry:
// `useEdgeAutoscroll`'s `GtkDropControllerMotion` (already watching every
// motion event for edge-autoscroll) also reports each one here via
// `onDragMotion`, and `handleDragMotion` below tracks `fromIndex * slotSize +
// (pointer delta since the drag began)`, resolving the row it lands on by
// ROUNDING rather than upstream's own floor — the dragged row's CENTRE
// against a slot's centre, not its top-left corner against the slot's origin
// — see `order.ts`'s `resolveTrackedIndex` for the arithmetic. The origin
// that delta is measured from is `DragSourceControllers`'s `onGrab`,
// converted to the list's own container coordinates with `computePointIn`,
// NEVER the first motion sample: a fast drag's first sample arrives already
// displaced past GDK's own drag-start threshold, undercounting travel.
// `SortableItem`'s own `onEnter` no longer drives a reorder at all — only
// `onMotion` still does, for the public `onDragging`/`onDraggingHorizontal`
// callbacks, unrelated to this decision.
//
// The component owns the order, exactly as upstream requires ("do NOT update
// external state in `onMove`"). An app reads the settled order from
// `onDrop`'s `allPositions`.
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
import { DragSourceControllers, DropTargetControllers } from "./gtk-controllers"
import { listToObject, resolveTrackedIndex } from "./order"
import { keyOf, useOrder } from "./order-state"
import type { DragPayload } from "./payload"
import {
  HorizontalScrollDirection,
  ScrollDirection,
  SortableDirection,
  type SharedValueLike,
  type SortableData,
  type SortableItemPlumbing,
  type SortableItemProps,
  type SortableProps,
  type UseHorizontalSortableListOptions,
  type UseHorizontalSortableListReturn,
  type UseHorizontalSortableOptions,
  type UseHorizontalSortableReturn,
  type UseSortableListOptions,
  type UseSortableListReturn,
  type UseSortableOptions,
  type UseSortableReturn,
} from "./types"

// Upstream exports these from the same entry point as the components, so
// they are re-exported here rather than moved; the implementations live in
// ./order, which imports nothing from GTK.
export { clamp, listToObject, objectMove } from "./order"

// --- the list ---------------------------------------------------------------

type SortableContextValue = {
  /** Namespaces this list's payloads, so dragging a row does not light up
   *  every `Droppable` on the screen. */
  scope: string
  direction: SortableDirection
  /** Called from the list's own reorder tracking (`handleDragMotion` below)
   *  when the dragged row's tracked position resolves to a new slot — no
   *  longer from a row's own `onEnter`, see the module comment. */
  moveOnto: (draggedId: string, targetId: string) => void
  /** `grabWidget`/`grabX`/`grabY` are `DragSourceControllers`'s `onGrab`,
   *  forwarded as-is: the widget-local grab point this converts (via
   *  `computePointIn`) into the container-relative origin the reorder
   *  tracking measures every subsequent motion event against. Taken from the
   *  grab, never the first motion sample — see the module comment for why. */
  beginDrag: (
    draggedId: string,
    grabWidget: Gtk.Widget | null,
    grabX: number,
    grabY: number,
  ) => void
  endDrag: (draggedId: string, cancelled: boolean) => void
  onDragging?: (id: string, overItemId: string | null, coord: number) => void
  onDraggingHorizontal?: (
    id: string,
    overItemId: string | null,
    coord: number,
  ) => void
}

const SortableContext = createContext<SortableContextValue | null>(null)

/** The `SharedValue`-shaped boxes upstream hands to `renderItem`. Real,
 *  readable and writable here — just not animated. See `SharedValueLike`. */
const useSharedBoxes = (
  order: string[],
  direction: SortableDirection,
  autoScrollDirection: SharedValueLike<
    ScrollDirection | HorizontalScrollDirection
  >,
) => {
  // Rebuilt when the order changes rather than mutated in place. Upstream's
  // box keeps its identity and changes its `.value`; here the identity tracks
  // the value, which is the closest thing available without a mutable cell
  // React allows to be written during a render. The practical difference is
  // that an app using `positions` as an effect dependency re-runs on a
  // reorder — which is what it wanted from a SharedValue anyway.
  const positions = useMemo(
    (): SharedValueLike<Record<string, number>> => ({
      value: listToObject(order),
    }),
    [order],
  )
  // Two of these three this platform never writes: there is no UI-thread
  // scroll position and no measured row heights, because Yoga lays rows out
  // at their natural height. `autoScrollDirection` IS written now — see
  // `autoscroll.tsx` — which is why it comes in as a parameter rather than
  // living in this idle bag.
  const idle = useMemo(
    () => ({
      scrollY: { value: 0 },
      scrollX: { value: 0 },
      itemHeights: { value: {} as Record<string, number> },
    }),
    [],
  )

  const itemsCount = order.length

  return useMemo(
    () => ({
      positions,
      ...idle,
      plumbing: (
        itemWidth?: number,
        gap?: number,
        paddingHorizontal?: number,
      ): SortableItemPlumbing =>
        direction === SortableDirection.Horizontal
          ? {
              positions,
              leftBound: idle.scrollX,
              autoScrollHorizontalDirection:
                autoScrollDirection as SharedValueLike<HorizontalScrollDirection>,
              itemsCount,
              itemWidth,
              gap,
              paddingHorizontal,
            }
          : {
              positions,
              lowerBound: idle.scrollY,
              autoScrollDirection:
                autoScrollDirection as SharedValueLike<ScrollDirection>,
              itemHeights: idle.itemHeights,
              itemsCount,
            },
    }),
    [positions, idle, itemsCount, direction, autoScrollDirection],
  )
}

const noneDirectionFor = (
  direction: SortableDirection,
): ScrollDirection | HorizontalScrollDirection =>
  direction === SortableDirection.Horizontal
    ? HorizontalScrollDirection.None
    : ScrollDirection.None

const directionForDelta =
  (direction: SortableDirection) =>
  (
    dx: -1 | 0 | 1,
    dy: -1 | 0 | 1,
  ): ScrollDirection | HorizontalScrollDirection => {
    if (direction === SortableDirection.Horizontal) {
      if (dx < 0) {
        return HorizontalScrollDirection.Left
      }
      if (dx > 0) {
        return HorizontalScrollDirection.Right
      }
      return HorizontalScrollDirection.None
    }
    if (dy < 0) {
      return ScrollDirection.Up
    }
    if (dy > 0) {
      return ScrollDirection.Down
    }
    return ScrollDirection.None
  }

/**
 * Owns the order of a sortable list, for an app rendering its own container.
 *
 * **The order half only.** Upstream's rows get their drag wiring through the
 * props `getItemProps` hands them; here it travels in context, which only
 * `Sortable` provides — so rows still have to be inside a `Sortable`, and a
 * `SortableItem` outside one throws rather than quietly not dragging. This
 * hook is for reading the order and the `SharedValueLike` boxes, which is
 * what most callers of it actually want.
 *
 * No autoscroll wiring: this hook builds no `ScrollView` of its own to drive
 * one, hence the no-op `handleScroll`/`handleScrollEnd` below, unchanged from
 * before. `Sortable` is where the edge autoscroll in `autoscroll.tsx` lives.
 */
export const useSortableList = <TData extends SortableData>(
  options: UseSortableListOptions<TData>,
): UseSortableListReturn<TData> => {
  const { order, items } = useOrder(options.data, options.itemKeyExtractor)
  const idleAutoScroll = useMemo(
    (): SharedValueLike<ScrollDirection> => ({ value: ScrollDirection.None }),
    [],
  )
  const boxes = useSharedBoxes(
    order,
    SortableDirection.Vertical,
    idleAutoScroll,
  )
  const dropProviderRef = useRef(null)
  const noop = useCallback(() => {}, [])

  return {
    positions: boxes.positions,
    scrollY: boxes.scrollY,
    autoScroll: idleAutoScroll,
    itemHeights: boxes.itemHeights,
    dropProviderRef,
    handleScroll: noop,
    handleScrollEnd: noop,
    contentHeight: 0,
    isDynamicHeight: false,
    items,
    getItemProps: () => boxes.plumbing(),
  }
}

/**
 * The horizontal counterpart of {@link useSortableList} — its own hook
 * upstream, so its own hook here, even though the order state underneath
 * (`order-state.ts`) is identical.
 */
export const useHorizontalSortableList = <TData extends SortableData>(
  options: UseHorizontalSortableListOptions<TData>,
): UseHorizontalSortableListReturn<TData> => {
  const { order, items } = useOrder(options.data, options.itemKeyExtractor)
  const idleAutoScroll = useMemo(
    (): SharedValueLike<HorizontalScrollDirection> => ({
      value: HorizontalScrollDirection.None,
    }),
    [],
  )
  const boxes = useSharedBoxes(
    order,
    SortableDirection.Horizontal,
    idleAutoScroll,
  )
  const dropProviderRef = useRef(null)
  const noop = useCallback(() => {}, [])
  const {
    itemWidth,
    gap = 0,
    paddingHorizontal = 0,
    itemKeyExtractor,
  } = options

  const getItemProps = useCallback(
    (item: TData, index: number) => {
      const plumbing = boxes.plumbing(itemWidth, gap, paddingHorizontal)
      return {
        id: keyOf(item, index, itemKeyExtractor),
        positions: plumbing.positions,
        leftBound: plumbing.leftBound!,
        autoScrollDirection: idleAutoScroll,
        itemsCount: plumbing.itemsCount,
        itemWidth: itemWidth ?? 0,
        gap,
        paddingHorizontal,
      }
    },
    [
      boxes,
      itemWidth,
      gap,
      paddingHorizontal,
      itemKeyExtractor,
      idleAutoScroll,
    ],
  )

  return {
    positions: boxes.positions,
    scrollX: boxes.scrollX,
    autoScroll: idleAutoScroll,
    dropProviderRef,
    handleScroll: noop,
    handleScrollEnd: noop,
    contentWidth: 0,
    items,
    getItemProps,
  }
}

/**
 * A list whose rows reorder by dragging.
 *
 * ```tsx
 * <Sortable
 *   data={tasks}
 *   onDrop={(id, position, all) => save(all)}
 *   renderItem={({ item, id, ...rest }) => (
 *     <SortableItem key={id} id={id} data={item} {...rest}>
 *       <View style={styles.row}>
 *         <Text>{item.title}</Text>
 *         <SortableItem.Handle>
 *           <Text>⠿</Text>
 *         </SortableItem.Handle>
 *       </View>
 *     </SortableItem>
 *   )}
 * />
 * ```
 *
 * The rows carry a real GTK drag icon — a picture of the row itself, lifted
 * at the point it was grabbed — and the list rearranges live underneath it.
 * Near either end of the visible list, the drag keeps the `ScrollView`
 * scrolling toward it for as long as it stays there (`autoscroll.tsx`).
 */
export const Sortable = <TData extends SortableData>({
  data,
  renderItem,
  itemKeyExtractor,
  style,
  contentContainerStyle,
  testID,
  direction = SortableDirection.Vertical,
  itemWidth,
  gap,
  paddingHorizontal,
  onMove,
  onDragStart,
  onDrop,
  onDragging,
  onDraggingHorizontal,
}: SortableProps<TData>): ReactNode => {
  const { scope, order, setOrder, items } = useOrder(data, itemKeyExtractor)
  const isHorizontal = direction === SortableDirection.Horizontal

  const containerRef = useRef<MeasureHandle | null>(null)
  const scrollViewRef = useRef<ScrollViewHandle | null>(null)

  // The order as it was when the drag began, so a cancelled drag puts the
  // list back rather than leaving it wherever the pointer happened to be.
  const beforeDrag = useRef<string[] | null>(null)
  // The drag callbacks below run from GTK signals, long after any commit, so
  // reading the order through a ref updated in an effect is both current and
  // free of the stale-closure problem `useCallback` would otherwise have.
  const orderRef = useRef(order)
  useEffect(() => {
    orderRef.current = order
  }, [order])

  const moveOnto = useCallback(
    (draggedId: string, targetId: string) => {
      setOrder((current) => {
        const from = current.indexOf(draggedId)
        const to = current.indexOf(targetId)
        if (from === -1 || to === -1 || from === to) {
          return current
        }
        const next = [...current]
        next.splice(from, 1)
        next.splice(to, 0, draggedId)
        onMove?.(draggedId, from, to)
        return next
      })
    },
    [setOrder, onMove],
  )

  // The dragged row's own tracked position, and the slot it last resolved
  // to — null whenever no drag from this list is in flight, or `beginDrag`
  // could not establish an origin (see below). A ref, not state: written
  // from a GTK motion callback outside React's commit cycle, exactly like
  // `beforeDrag`/`orderRef` above.
  const tracking = useRef<{
    draggedId: string
    /** `fromIndex * slotSize - origin`, folded into one constant so
     *  `handleDragMotion` only ever adds the CURRENT motion coordinate to
     *  it — see the module comment for the arithmetic this is derived
     *  from. */
    base: number
    slotSize: number
    lastResolvedIndex: number
  } | null>(null)

  const handleDragMotion = useCallback(
    (x: number, y: number) => {
      const state = tracking.current
      if (!state) {
        return
      }
      const trackedPosition = (isHorizontal ? x : y) + state.base
      const resolvedIndex = resolveTrackedIndex(
        trackedPosition,
        state.slotSize,
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
    [isHorizontal, moveOnto],
  )

  const autoscroll = useEdgeAutoscroll<
    ScrollDirection | HorizontalScrollDirection
  >({
    containerRef,
    scrollViewRef,
    axes: isHorizontal ? "horizontal" : "vertical",
    none: noneDirectionFor(direction),
    directionFor: directionForDelta(direction),
    onDragMotion: handleDragMotion,
  })

  const boxes = useSharedBoxes(order, direction, autoscroll.direction)

  const beginDrag = useCallback(
    (
      draggedId: string,
      grabWidget: Gtk.Widget | null,
      grabX: number,
      grabY: number,
    ) => {
      beforeDrag.current = orderRef.current
      autoscroll.setActive(true)
      const fromIndex = orderRef.current.indexOf(draggedId)
      onDragStart?.(draggedId, fromIndex)

      tracking.current = null
      const container = widgetForHandle(containerRef.current)
      if (grabWidget && container && fromIndex !== -1) {
        const origin = computePointIn(grabWidget, container, grabX, grabY)
        if (origin) {
          // The row's own real size, measured rather than a hint: rows are
          // Yoga-natural-height (docs/api.md), so there is no `itemHeight`
          // prop to trust — the dragged row's own allocation, at the moment
          // it was grabbed, is what the tracked position's slots are sized
          // to. `gap` (a real Yoga gap on the content container either
          // direction) folds into the slot period the same way upstream's
          // own `itemHeight` would if it accounted for one.
          const rawSize = isHorizontal
            ? grabWidget.getWidth()
            : grabWidget.getHeight()
          const slotSize = rawSize + (gap ?? 0)
          const origin1D = isHorizontal ? origin.x : origin.y
          tracking.current = {
            draggedId,
            base: fromIndex * slotSize - origin1D,
            slotSize,
            lastResolvedIndex: fromIndex,
          }
        }
      }
    },
    [onDragStart, autoscroll, isHorizontal, gap],
  )

  const endDrag = useCallback(
    (draggedId: string, cancelled: boolean) => {
      autoscroll.setActive(false)
      tracking.current = null
      const restore = beforeDrag.current
      beforeDrag.current = null
      if (cancelled) {
        if (restore) {
          setOrder(() => restore)
        }
        return
      }
      const settled = orderRef.current
      onDrop?.(draggedId, settled.indexOf(draggedId), listToObject(settled))
    },
    [setOrder, onDrop, autoscroll],
  )

  const contextValue = useMemo<SortableContextValue>(
    () => ({
      scope,
      direction,
      moveOnto,
      beginDrag,
      endDrag,
      onDragging,
      onDraggingHorizontal,
    }),
    [
      scope,
      direction,
      moveOnto,
      beginDrag,
      endDrag,
      onDragging,
      onDraggingHorizontal,
    ],
  )

  return (
    <SortableContext.Provider value={contextValue}>
      <View
        ref={containerRef}
        style={{ flex: 1 }}
      >
        {autoscroll.controllers}
        <ScrollView
          ref={scrollViewRef}
          horizontal={isHorizontal}
          style={style}
          // No `alignItems: "stretch"` override here any more. It used to be
          // needed because this platform's ScrollView content container
          // defaulted to `flex-start`, which shrank every row to its intrinsic
          // width and collapsed the `flex: 1` text column inside it. That
          // default was a parity bug — RN's content container is a plain
          // `View`, whose default `alignItems` is `stretch` — and it is fixed
          // at the source now (components/scroll-view.tsx), so a `Sortable`
          // gets full-width rows the same way any other RN list does.
          //
          // An app that wants the old behaviour writes it, exactly as it
          // would on iOS and Android: `contentContainerStyle={{ alignItems:
          // "flex-start" }}`.
          contentContainerStyle={[
            { gap, paddingHorizontal },
            contentContainerStyle,
          ]}
          testID={testID}
        >
          {items.map((item, index) =>
            renderItem({
              item,
              index,
              id: keyOf(item, index, itemKeyExtractor),
              direction,
              ...boxes.plumbing(itemWidth, gap, paddingHorizontal),
            }),
          )}
        </ScrollView>
      </View>
    </SortableContext.Provider>
  )
}

/**
 * The reorder half of the module, as a hook, for a row that owns its own
 * view.
 *
 * Shared by both directions: which coordinate reaches `onDragging`/
 * `onDraggingHorizontal` (and which of the two fires at all) comes from the
 * enclosing `Sortable`'s own `direction`, read through context — the reorder
 * itself (cross into another cell's drop target) never looks at an axis.
 */
export const useSortable = <TData,>(
  options: UseSortableOptions<TData>,
): UseSortableReturn => {
  const { id, onDragging, onDraggingHorizontal } = options
  const list = useContext(SortableContext)
  if (list === null) {
    // Loudly, because a silent no-op is the worst failure mode this repo has
    // met: docs/research/gestures.md records `Animated.View` accepting the
    // responder props and ignoring them, which compiled, ran, and did
    // nothing. Unlike upstream — where a row gets its wiring through the
    // props `getItemProps` hands it — the wiring here is in context, so a row
    // outside its list has no drag at all rather than a degraded one.
    throw new Error(
      "react-native-gtkx/dnd: SortableItem/useSortable must be inside a Sortable",
    )
  }
  const [isMoving, setIsMoving] = useState(false)
  const [hasHandle, setHasHandle] = useState(false)

  const registerHandle = useCallback((registered: boolean) => {
    setHasHandle(registered)
  }, [])

  // Same reasoning as draggable.tsx: a handle registers one commit late, so
  // the row's own copy waits for it rather than briefly mounting a second
  // drag source.
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  // Same list only — and INCLUDING this row itself. Refusing the self-drop
  // looks right and is wrong: the reorder tracking (`Sortable`'s own
  // `handleDragMotion`) can settle the dragged row back onto its OWN slot,
  // so by the time the pointer releases it may well be over the DRAGGED row.
  // A row that refuses its own payload leaves GDK with no target, cancels
  // the drag, and the list snaps back to where it started. Accepting is also
  // the honest reading: dropping a row on its own current position means
  // "leave it here", which is a completed drag, not an abandoned one.
  const accepts = useCallback(
    (payload: DragPayload) => payload.scope === list.scope,
    [list],
  )

  // `DragSourceControllers`'s own grab point (widget-local), captured here
  // and forwarded to `beginDrag` — see the module comment for why this, and
  // never the first motion sample, is the reorder tracking's origin.
  const grab = useRef<{ widget: Gtk.Widget | null; x: number; y: number }>({
    widget: null,
    x: 0,
    y: 0,
  })

  const dragControllers = (
    <DragSourceControllers
      payload={{ scope: list.scope, id }}
      onGrab={(x, y, widget) => {
        grab.current = { widget, x, y }
      }}
      onDragBegin={() => {
        setIsMoving(true)
        list.beginDrag(id, grab.current.widget, grab.current.x, grab.current.y)
      }}
      onDragEnd={(dropped) => {
        setIsMoving(false)
        list.endDrag(id, !dropped)
      }}
    />
  )

  const dropControllers = (
    <DropTargetControllers
      accepts={accepts}
      // No `onEnter` any more: crossing this row's drop target used to be
      // what moved the dragged row into its place. That decision is now
      // `Sortable`'s own `handleDragMotion`, driven by the list's shared
      // motion controller rather than each row's own — see the module
      // comment. This target still has to exist and accept, or GDK would
      // refuse the drop and snap the drag back; `onMotion` below still
      // reports the public `onDragging`/`onDraggingHorizontal` callbacks,
      // unrelated to the reorder decision.
      onMotion={(payload, x, y) => {
        if (list.direction === SortableDirection.Horizontal) {
          list.onDraggingHorizontal?.(payload.id, id, x)
          onDraggingHorizontal?.(payload.id, id, x)
        } else {
          list.onDragging?.(payload.id, id, y)
          onDragging?.(payload.id, id, y)
        }
      }}
      // Nothing left to do: the order is already right, and `drag-end` on the
      // source is what settles it.
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

/**
 * The horizontal counterpart of {@link useSortable} — upstream's own separate
 * hook, kept separate here too, though it is the same implementation under a
 * shape matching `UseHorizontalSortableOptions`. Must be inside a
 * `<Sortable direction="horizontal">`, same as `useSortable` must be inside a
 * `Sortable`.
 */
export const useHorizontalSortable = <TData,>(
  options: UseHorizontalSortableOptions<TData>,
): UseHorizontalSortableReturn =>
  useSortable<TData>({
    id: options.id,
    data: options.data,
    positions: options.positions,
    itemsCount: options.itemsCount,
    onMove: options.onMove,
    onDragStart: options.onDragStart,
    onDrop: options.onDrop,
    onDraggingHorizontal: options.onDragging,
  } as UseSortableOptions<TData>)

/** One row of a {@link Sortable}. Both a drag source and a drop target: the
 *  row you drag onto is the position the dragged row takes. */
export const SortableItem = <TData,>({
  id,
  data,
  children,
  style,
  animatedStyle,
  testID,
  onMove,
  onDragStart,
  onDrop,
  onDragging,
  onDraggingHorizontal,
}: SortableItemProps<TData>): ReactNode => {
  const sortable = useSortable<TData>({
    id,
    data,
    onMove,
    onDragStart,
    onDrop,
    onDragging,
    onDraggingHorizontal,
  } as UseSortableOptions<TData>)

  // `SortableItem.Handle` is `Draggable.Handle`: the same context carries the
  // drag source to whichever view claims it, so one implementation serves
  // both components.
  const handleContext = useMemo(
    () => ({
      source: sortable.dragControllers,
      registerHandle: sortable.registerHandle,
    }),
    [sortable.dragControllers, sortable.registerHandle],
  )

  return (
    <View
      style={animatedStyle ? [style, animatedStyle] : style}
      testID={testID}
    >
      <DraggableContext.Provider value={handleContext}>
        {sortable.children}
        {children}
      </DraggableContext.Provider>
    </View>
  )
}

SortableItem.Handle = DraggableHandle
