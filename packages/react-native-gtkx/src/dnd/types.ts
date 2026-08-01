// The mirrored type surface of `react-native-reanimated-dnd`, name for name.
//
// WHY the names are copied rather than improved: the point of this subpath
// is that an app which already uses that library keeps its source. A better
// name here would be a worse module — see docs/research/drag-and-drop.md.
import type { ReactNode, RefObject } from "react"
import type { StyleProp } from "../contracts"

/**
 * What `SharedValue<T>` degrades to here.
 *
 * Reanimated's `SharedValue<T>` is `{ value: T }` plus the worklet plumbing
 * that makes writes cross to the UI thread. There is no UI thread on this
 * platform, so this is the same box without the crossing: **reads and
 * writes both work**, they just do not drive an animation.
 *
 * That matters more than it looks. `positions`, `lowerBound`,
 * `autoScrollDirection` and `itemHeights` appear in
 * `SortableRenderItemProps` — public API an app forwards with `{...rest}`
 * and, occasionally, reads. Typing them as an opaque token would break the
 * reads; typing them as this keeps them working.
 */
export type SharedValueLike<T> = { value: T }

// --- draggable --------------------------------------------------------------

export enum DraggableState {
  IDLE = "IDLE",
  DRAGGING = "DRAGGING",
  DROPPED = "DROPPED",
}

export type AnimationFunction = (toValue: number) => number

export type CollisionAlgorithm = "center" | "intersect" | "contain"

export interface UseDraggableOptions<TData = unknown> {
  data: TData
  draggableId?: string
  dragDisabled?: boolean
  onDragStart?: (data: TData) => void
  onDragEnd?: (data: TData) => void
  onDragging?: (payload: {
    x: number
    y: number
    tx: number
    ty: number
    itemData: TData
  }) => void
  onStateChange?: (state: DraggableState) => void
  /**
   * Accepted and ignored. Upstream uses it to tell a tap from a drag; GDK
   * already does that with `gtk-dnd-drag-threshold` before it starts a drag
   * at all, so honouring it would only make dragging feel slower.
   */
  preDragDelay?: number
  /**
   * Accepted and ignored. GDK hit-tests the pointer against the real widget
   * tree; of the three upstream algorithms `"center"` is closest, since the
   * drag icon is carried at the point it was grabbed.
   */
  collisionAlgorithm?: CollisionAlgorithm
  /** Unsupported: the compositor carries the drag icon and nothing here can
   *  constrain its path. Kept in the type so a shared file still compiles
   *  for iOS and Android. */
  dragAxis?: "x" | "y" | "both"
  /** Unsupported, same reason as `dragAxis`. */
  dragBoundsRef?: RefObject<unknown>
  /** Unsupported: there is no return animation, because the view never
   *  left — GDK drew a picture of it instead. */
  animationFunction?: AnimationFunction
}

export interface UseDraggableReturn {
  /** Spread onto the view that should be draggable. Upstream's name for it
   *  is `animatedViewProps`; the props are a `style` and the drag
   *  controllers, which on this platform are React children rather than a
   *  style. */
  animatedViewProps: {
    style?: StyleProp
    children: ReactNode
  }
  state: DraggableState
  hasHandle: boolean
  registerHandle: (registered: boolean) => void
}

export interface DraggableProps<
  TData = unknown,
> extends UseDraggableOptions<TData> {
  style?: StyleProp
  children: ReactNode
  testID?: string
}

export interface DraggableHandleProps {
  children: ReactNode
  style?: StyleProp
  testID?: string
}

// --- droppable --------------------------------------------------------------

export type DropAlignment =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export interface DropOffset {
  x: number
  y: number
}

export interface UseDroppableOptions<TData = unknown> {
  onDrop: (data: TData) => void
  dropDisabled?: boolean
  onActiveChange?: (isActive: boolean) => void
  activeStyle?: StyleProp
  droppableId?: string
  /** How many draggables this zone accepts. When it is full GDK is told to
   *  REFUSE the drop, so the pointer shows the no-drop cursor — upstream
   *  silently skips the slot instead. */
  capacity?: number
  /** Unsupported: both of these place the dragged view inside the zone
   *  after the drop, and the view never moved. */
  dropAlignment?: DropAlignment
  dropOffset?: DropOffset
}

export interface UseDroppableReturn {
  viewProps: {
    style?: StyleProp
    children: ReactNode
  }
  isActive: boolean
  activeStyle?: StyleProp
}

export interface DroppableProps<
  TData = unknown,
> extends UseDroppableOptions<TData> {
  style?: StyleProp
  children: ReactNode
  testID?: string
}

// --- context ----------------------------------------------------------------

export interface DroppedItemsMap<TData = unknown> {
  [draggableId: string]: { droppableId: string; data: TData }
}

export interface DropProviderProps {
  children: ReactNode
  onDroppedItemsUpdate?: (droppedItems: DroppedItemsMap) => void
  onDragStart?: (data: unknown) => void
  onDragEnd?: (data: unknown) => void
  onDragging?: (payload: {
    x: number
    y: number
    tx: number
    ty: number
    itemData: unknown
  }) => void
  /** Accepted and ignored: there is no layout pass to complete, because
   *  nothing caches a slot rectangle. See `requestPositionUpdate`. */
  onLayoutUpdateComplete?: () => void
  style?: StyleProp
  testID?: string
  ref?: RefObject<DropProviderRef | null>
}

export interface DropProviderRef {
  /**
   * A no-op **because GDK re-hit-tests on every motion**. Upstream needs it
   * to refresh cached slot rectangles after a scroll or a relayout; there
   * are no cached rectangles here, so calling it is harmless and
   * unnecessary. Kept so an app that calls it after a list update compiles.
   */
  requestPositionUpdate: () => void
  getDroppedItems: () => DroppedItemsMap
}

// --- sortable ---------------------------------------------------------------

export interface SortableData {
  id: string
}

export enum ScrollDirection {
  None = "none",
  Up = "up",
  Down = "down",
}

export enum HorizontalScrollDirection {
  None = "none",
  Left = "left",
  Right = "right",
}

export enum SortableDirection {
  Vertical = "vertical",
  Horizontal = "horizontal",
}

/** The plumbing `Sortable` hands `renderItem` and `renderItem` hands
 *  `SortableItem` — opaque in upstream's own examples, which destructure
 *  `item`/`index`/`id` and spread the rest. */
export interface SortableItemPlumbing {
  positions: SharedValueLike<Record<string, number>>
  lowerBound: SharedValueLike<number>
  autoScrollDirection: SharedValueLike<ScrollDirection>
  itemHeights: SharedValueLike<Record<string, number>>
  itemsCount: number
  /** Accepted and ignored: Yoga lays rows out at their natural height, so
   *  a height hint has nothing to correct. */
  itemHeight?: number
  /** Accepted and ignored, same reason. */
  estimatedItemHeight?: number
  /** Accepted and ignored, same reason. */
  isDynamicHeight?: boolean
  scheduleHeightUpdate?: (id: string, height: number) => void
}

export interface SortableCallbacks {
  onMove?: (id: string, from: number, to: number) => void
  onDragStart?: (id: string, position: number) => void
  onDrop?: (
    id: string,
    position: number,
    allPositions?: Record<string, number>,
  ) => void
  onDragging?: (
    id: string,
    overItemId: string | null,
    yPosition: number,
  ) => void
}

export interface UseSortableOptions<TData = unknown>
  extends SortableCallbacks, SortableItemPlumbing {
  id: string
  data?: TData
}

export interface UseSortableReturn {
  /** Upstream returns a Reanimated style here. This platform reorders by
   *  re-rendering, so the row needs no transform — the field stays for
   *  spread compatibility. */
  animatedStyle: StyleProp
  isMoving: boolean
  hasHandle: boolean
  registerHandle: (registered: boolean) => void
  /** Everything the row's view must contain: the drop target always, and the
   *  drag source unless a handle has claimed it. */
  children: ReactNode
  /** The drag source on its own, for a caller placing its own handle. */
  dragControllers: ReactNode
}

export interface SortableItemProps<TData = unknown>
  extends Partial<SortableItemPlumbing>, SortableCallbacks {
  id: string
  data?: TData
  children: ReactNode
  style?: StyleProp
  /** Accepted for spread compatibility; upstream's own transform style. */
  animatedStyle?: StyleProp
  direction?: SortableDirection
  testID?: string
}

export interface SortableRenderItemProps<
  TData extends SortableData,
> extends SortableItemPlumbing {
  item: TData
  index: number
  id: string
  direction?: SortableDirection
}

export interface SortableProps<
  TData extends SortableData,
> extends SortableCallbacks {
  data: TData[]
  renderItem: (props: SortableRenderItemProps<TData>) => ReactNode
  itemKeyExtractor?: (item: TData, index: number) => string
  style?: StyleProp
  contentContainerStyle?: StyleProp
  testID?: string
  /** Accepted and ignored — see `SortableItemPlumbing`. */
  itemHeight?: number | number[] | ((item: TData, index: number) => number)
  /** Accepted and ignored. */
  estimatedItemHeight?: number
  /** Accepted and ignored. */
  enableDynamicHeights?: boolean
  /** Accepted and ignored. */
  useFlatList?: boolean
  /** Accepted and ignored. */
  onHeightsMeasured?: (heights: Record<string, number>) => void
  /** `SortableDirection.Horizontal` is not implemented — see
   *  docs/research/drag-and-drop.md. Passing it throws, rather than
   *  silently laying out vertically. */
  direction?: SortableDirection
}

export interface SortableHandleProps {
  children: ReactNode
  style?: StyleProp
  testID?: string
}

export interface UseSortableListOptions<TData extends SortableData> {
  data: TData[]
  itemKeyExtractor?: (item: TData, index: number) => string
  itemHeight?: number | number[] | ((item: TData, index: number) => number)
  enableDynamicHeights?: boolean
  estimatedItemHeight?: number
  onHeightsMeasured?: (heights: Record<string, number>) => void
}

export interface UseSortableListReturn<TData extends SortableData> {
  positions: SharedValueLike<Record<string, number>>
  scrollY: SharedValueLike<number>
  autoScroll: SharedValueLike<ScrollDirection>
  itemHeights: SharedValueLike<Record<string, number>>
  dropProviderRef: RefObject<DropProviderRef | null>
  handleScroll: () => void
  handleScrollEnd: () => void
  contentHeight: number
  isDynamicHeight: boolean
  /** The current order, which this hook owns — upstream keeps the same
   *  contract ("do NOT update external state in `onMove`"). */
  items: TData[]
  getItemProps: (item: TData, index: number) => SortableItemPlumbing
}
