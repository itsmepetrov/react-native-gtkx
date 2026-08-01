// `Sortable`, `SortableItem`, `useSortable` and `useSortableList` — the
// drag-to-reorder list, which is the shape most apps actually reach for.
//
// The reorder is LIVE: crossing another row moves the dragged row into its
// place immediately, so the list rearranges under the drag icon. That is
// upstream's behaviour too — its `onMove` fires as rows cross, not at the
// end — minus the spring, because here the rows are laid out by Yoga rather
// than transformed.
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
import { ScrollView } from "../components/scroll-view"
import { View } from "../components/view"
import { DraggableContext, DraggableHandle } from "./draggable"
import { DragSourceControllers, DropTargetControllers } from "./gtk-controllers"
import { listToObject } from "./order"
import { nextDraggableId, type DragPayload } from "./payload"
import {
  ScrollDirection,
  SortableDirection,
  type SharedValueLike,
  type SortableData,
  type SortableItemPlumbing,
  type SortableItemProps,
  type SortableProps,
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
  /** Called by a row when the dragged row crosses it. */
  moveOnto: (draggedId: string, targetId: string) => void
  beginDrag: (draggedId: string) => void
  endDrag: (draggedId: string, cancelled: boolean) => void
  onDragging?: (id: string, overItemId: string | null, y: number) => void
}

const SortableContext = createContext<SortableContextValue | null>(null)

const stretchRows = { alignItems: "stretch" } as const

const keyOf = <TData extends SortableData>(
  item: TData,
  index: number,
  extractor?: (item: TData, index: number) => string,
): string => extractor?.(item, index) ?? item.id

/** The order state, shared by `useSortableList` and `Sortable`. */
const useOrder = <TData extends SortableData>(
  data: TData[],
  itemKeyExtractor?: (item: TData, index: number) => string,
) => {
  // Lazy initial state, not a ref: stable for the list's lifetime, and a ref
  // may not be read during render.
  const [scope] = useState(() => `sortable-${nextDraggableId()}`)

  const incoming = useMemo(
    () => data.map((item, index) => keyOf(item, index, itemKeyExtractor)),
    [data, itemKeyExtractor],
  )
  const [order, setOrder] = useState<string[]>(incoming)

  // The list owns the ORDER; the app owns the SET. Adding or removing an item
  // has to reach the order without discarding a reorder the user already
  // made — so new ids go to the end, departed ids drop out, and a pure
  // reorder of `data` by the app is ignored (upstream's contract too: the
  // component owns the order).
  //
  // Adjusted DURING RENDER rather than in an effect. React documents this as
  // the way to derive state from changed props, and it matters here: an
  // effect would paint one frame in the stale order every time the app
  // appends an item.
  const signature = incoming.join(" ")
  const [seenSignature, setSeenSignature] = useState(signature)
  if (seenSignature !== signature) {
    setSeenSignature(signature)
    const known = new Set(incoming)
    const next = [
      ...order.filter((id) => known.has(id)),
      ...incoming.filter((id) => !order.includes(id)),
    ]
    if (
      next.length !== order.length ||
      next.some((id, index) => id !== order[index])
    ) {
      setOrder(next)
    }
  }

  const items = useMemo(() => {
    const byId = new Map<string, TData>()
    data.forEach((item, index) => {
      byId.set(keyOf(item, index, itemKeyExtractor), item)
    })
    return order
      .map((id) => byId.get(id))
      .filter((item): item is TData => item !== undefined)
  }, [order, data, itemKeyExtractor])

  return { scope, order, setOrder, items }
}

/** The `SharedValue`-shaped boxes upstream hands to `renderItem`. Real,
 *  readable and writable here — just not animated. See `SharedValueLike`. */
const useSharedBoxes = (order: string[]) => {
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
  // These three this platform never writes: there is no UI-thread scroll
  // position, no autoscroll during a drag (see docs/research/drag-and-drop.md)
  // and no measured row heights, because Yoga lays rows out at their natural
  // height. Stable, so forwarding them is free.
  const idle = useMemo(
    () => ({
      scrollY: { value: 0 },
      autoScroll: { value: ScrollDirection.None as ScrollDirection },
      itemHeights: { value: {} as Record<string, number> },
    }),
    [],
  )

  const itemsCount = order.length

  return useMemo(
    () => ({
      positions,
      ...idle,
      plumbing: (): SortableItemPlumbing => ({
        positions,
        lowerBound: idle.scrollY,
        autoScrollDirection: idle.autoScroll,
        itemHeights: idle.itemHeights,
        itemsCount,
        isDynamicHeight: false,
      }),
    }),
    [positions, idle, itemsCount],
  )
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
 */
export const useSortableList = <TData extends SortableData>(
  options: UseSortableListOptions<TData>,
): UseSortableListReturn<TData> => {
  const { order, items } = useOrder(options.data, options.itemKeyExtractor)
  const boxes = useSharedBoxes(order)
  const dropProviderRef = useRef(null)
  const noop = useCallback(() => {}, [])

  return {
    positions: boxes.positions,
    scrollY: boxes.scrollY,
    autoScroll: boxes.autoScroll,
    itemHeights: boxes.itemHeights,
    dropProviderRef,
    handleScroll: noop,
    handleScrollEnd: noop,
    contentHeight: 0,
    isDynamicHeight: false,
    items,
    getItemProps: boxes.plumbing,
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
 */
export const Sortable = <TData extends SortableData>({
  data,
  renderItem,
  itemKeyExtractor,
  style,
  contentContainerStyle,
  testID,
  direction = SortableDirection.Vertical,
  onMove,
  onDragStart,
  onDrop,
  onDragging,
}: SortableProps<TData>): ReactNode => {
  const { scope, order, setOrder, items } = useOrder(data, itemKeyExtractor)
  const boxes = useSharedBoxes(order)

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

  const beginDrag = useCallback(
    (draggedId: string) => {
      beforeDrag.current = orderRef.current
      onDragStart?.(draggedId, orderRef.current.indexOf(draggedId))
    },
    [onDragStart],
  )

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

  const endDrag = useCallback(
    (draggedId: string, cancelled: boolean) => {
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
    [setOrder, onDrop],
  )

  const contextValue = useMemo<SortableContextValue>(
    () => ({ scope, moveOnto, beginDrag, endDrag, onDragging }),
    [scope, moveOnto, beginDrag, endDrag, onDragging],
  )

  if (direction === SortableDirection.Horizontal) {
    // Loud rather than silent: a horizontal list that lays out vertically is
    // a bug report waiting to happen. See docs/research/drag-and-drop.md for
    // why the horizontal surface is deferred rather than approximated.
    throw new Error(
      "react-native-gtkx/dnd: SortableDirection.Horizontal is not implemented on Linux",
    )
  }

  return (
    <SortableContext.Provider value={contextValue}>
      <ScrollView
        style={style}
        // Rows are full width unless the app says otherwise. Upstream gets
        // this for free — its rows are `position: absolute; left: 0; right: 0`
        // — and this platform's ScrollView content container is
        // `alignItems: "flex-start"`, so without the override a row shrinks to
        // its intrinsic width and any `flex: 1` inside it collapses to zero.
        // Found by pointing the gallery at a real window; see
        // docs/research/drag-and-drop.md.
        contentContainerStyle={[stretchRows, contentContainerStyle]}
        testID={testID}
      >
        {items.map((item, index) =>
          renderItem({
            item,
            index,
            id: keyOf(item, index, itemKeyExtractor),
            direction,
            ...boxes.plumbing(),
          }),
        )}
      </ScrollView>
    </SortableContext.Provider>
  )
}

/**
 * The reorder half of the module, as a hook, for a row that owns its own
 * view. Render `children` inside that view.
 */
export const useSortable = <TData,>(
  options: UseSortableOptions<TData>,
): UseSortableReturn => {
  const { id, onDragging } = options
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
  // looks right and is wrong: because the reorder happens live on `::enter`,
  // by the time the pointer settles it is over the DRAGGED row, so a row that
  // refuses its own payload leaves GDK with no target, cancels the drag, and
  // the list snaps back to where it started. Accepting is also the honest
  // reading: dropping a row on its own current position means "leave it
  // here", which is a completed drag, not an abandoned one.
  const accepts = useCallback(
    (payload: DragPayload) => payload.scope === list.scope,
    [list],
  )

  const dragControllers = (
    <DragSourceControllers
      payload={{ scope: list.scope, id }}
      onDragBegin={() => {
        setIsMoving(true)
        list.beginDrag(id)
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
      // The reorder happens HERE, not on drop: crossing this row is what
      // moves the dragged row into its place, so the list rearranges under
      // the drag icon the way upstream's animated gaps do.
      onEnter={(payload) => list.moveOnto(payload.id, id)}
      onMotion={(payload, _x, y) => {
        list.onDragging?.(payload.id, id, y)
        onDragging?.(payload.id, id, y)
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
}: SortableItemProps<TData>): ReactNode => {
  const sortable = useSortable<TData>({
    id,
    data,
    onMove,
    onDragStart,
    onDrop,
    onDragging,
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
