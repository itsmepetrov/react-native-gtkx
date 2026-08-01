// `Draggable`, `Draggable.Handle` and `useDraggable`.
//
// Upstream's draggable moves itself: a Reanimated transform follows the
// finger and springs back, or into the drop slot, at the end. Here the view
// never moves — GDK carries a picture of it (a `Gtk.WidgetPaintable`) above
// every window, with the theme's own cursors. That single difference is
// where `dragAxis`, `dragBoundsRef` and `animationFunction` go, and it is
// also why a drag here looks like the rest of the desktop instead of like a
// mobile app. docs/research/drag-and-drop.md argues the trade.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import type { MeasureHandle } from "../components/measure"
import { View } from "../components/view"
import { useDropContext, type DraggingPayload } from "./context"
import { DragSourceControllers } from "./gtk-controllers"
import { FREE_SCOPE, nextDraggableId } from "./payload"
import {
  DraggableState,
  type DraggableHandleProps,
  type DraggableProps,
  type UseDraggableOptions,
  type UseDraggableReturn,
} from "./types"

type DraggableContextValue = {
  /** The controllers a handle mounts on its own widget instead of the
   *  item's. */
  source: ReactNode
  registerHandle: (registered: boolean) => void
}

export const DraggableContext = createContext<DraggableContextValue | null>(
  null,
)

export type UseDraggableResult = UseDraggableReturn & {
  /** The view the drag source belongs to must be measurable, because
   *  `onDragging` reports the item's origin. Upstream returns an
   *  `useAnimatedRef` under this name for the same reason. */
  animatedViewRef: RefObject<MeasureHandle | null>
  /** The GTK controllers themselves, so a caller that renders its own handle
   *  can place them. `animatedViewProps.children` is this, or null when a
   *  handle has claimed it. */
  dragControllers: ReactNode
}

/**
 * The drag half of the module, as a hook, for a component that owns its own
 * view.
 *
 * `animatedViewProps` keeps upstream's name for spread compatibility. What
 * it carries differs: upstream's is a Reanimated `style`, ours is the GTK
 * controllers as `children`, because on this platform the drag is a property
 * of the widget rather than of a transform.
 */
export const useDraggable = <TData,>(
  options: UseDraggableOptions<TData>,
): UseDraggableResult => {
  const {
    data,
    draggableId,
    dragDisabled = false,
    onDragStart,
    onDragEnd,
    onDragging,
    onStateChange,
  } = options

  const context = useDropContext()
  const viewRef = useRef<MeasureHandle | null>(null)
  const grab = useRef({ x: 0, y: 0 })
  const [state, setState] = useState(DraggableState.IDLE)
  const [hasHandle, setHasHandle] = useState(false)

  // Stable for the component's lifetime, as upstream's is: the id is what
  // travels through GDK, so it cannot change under an in-flight drag. Lazy
  // initial state rather than a ref, because a ref may not be read during
  // render.
  const [generatedId] = useState(nextDraggableId)
  const id = draggableId ?? generatedId

  // The registry is what turns the id back into `data` on drop, so it tracks
  // every change to `data`, not just the mount.
  useEffect(() => {
    context.registerDraggable(id, data)
    return () => context.unregisterDraggable(id)
  }, [context, id, data])

  useEffect(() => {
    onStateChange?.(state)
  }, [state, onStateChange])

  const registerHandle = useCallback((registered: boolean) => {
    setHasHandle(registered)
  }, [])

  const handleGrab = useCallback((x: number, y: number) => {
    grab.current = { x, y }
  }, [])

  const handleDragBegin = useCallback(() => {
    // Measured now rather than on layout: the origin only matters while a
    // drag is in flight, and the moment it starts is the one time it is
    // guaranteed current. `measureLayout` reports against the provider's own
    // view, which is the coordinate space its motion controller uses.
    let originX = 0
    let originY = 0
    const provider = context.providerView?.current
    if (provider && viewRef.current) {
      viewRef.current.measureLayout(provider, (left, top) => {
        originX = left
        originY = top
      })
    }
    context.beginDrag({
      draggableId: id,
      data,
      originX,
      originY,
      startX: originX + grab.current.x,
      startY: originY + grab.current.y,
      onDragging: onDragging as ((p: DraggingPayload) => void) | undefined,
    })
    setState(DraggableState.DRAGGING)
    onDragStart?.(data)
  }, [context, id, data, onDragStart, onDragging])

  const handleDragEnd = useCallback(
    (dropped: boolean) => {
      context.endDrag()
      // DROPPED is sticky until the next drag begins, which is as close as
      // this platform gets to upstream's meaning ("the item is sitting in a
      // slot"): the item never left, so there is no return journey to end it.
      setState(dropped ? DraggableState.DROPPED : DraggableState.IDLE)
      onDragEnd?.(data)
    },
    [context, data, onDragEnd],
  )

  // A handle registers in a passive effect, so on the very first commit
  // `hasHandle` is still false and the item would mount a second drag source
  // that the next commit immediately removes. Deferring the item's own copy
  // by one commit removes the flicker entirely: both state updates land in
  // the same re-render. The delay is unobservable for the same reason
  // `Controllers` gives for attaching late — no pointer reaches a widget in
  // its first frame.
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const dragControllers = dragDisabled ? null : (
    <DragSourceControllers
      payload={{ scope: FREE_SCOPE, id }}
      onGrab={handleGrab}
      onDragBegin={handleDragBegin}
      onDragEnd={handleDragEnd}
    />
  )

  return {
    animatedViewProps: {
      children: mounted && !hasHandle ? dragControllers : null,
    },
    state,
    hasHandle,
    registerHandle,
    animatedViewRef: viewRef,
    dragControllers,
  }
}

/**
 * Makes its children draggable, carrying `data` to whatever `Droppable`
 * accepts it.
 *
 * ```tsx
 * <Draggable data={task}>
 *   <View style={styles.card}>
 *     <Text>{task.title}</Text>
 *   </View>
 * </Draggable>
 * ```
 *
 * With a `Draggable.Handle` inside it the drag starts only from the handle —
 * and on this platform that is literal: the `GtkDragSource` is attached to
 * the handle's own widget, so the rest of the item stays free to scroll,
 * press and select.
 */
export const Draggable = <TData,>({
  children,
  style,
  testID,
  ...options
}: DraggableProps<TData>): ReactNode => {
  const {
    animatedViewProps,
    animatedViewRef,
    dragControllers,
    registerHandle,
  } = useDraggable<TData>(options)

  const contextValue = useMemo<DraggableContextValue>(
    () => ({ source: dragControllers, registerHandle }),
    [dragControllers, registerHandle],
  )

  return (
    <DraggableContext.Provider value={contextValue}>
      <View
        ref={animatedViewRef}
        style={style}
        testID={testID}
      >
        {animatedViewProps.children}
        {children}
      </View>
    </DraggableContext.Provider>
  )
}

/**
 * The region a drag may start from. Everything outside it stays inert.
 *
 * Upstream's handle gates a pan gesture; here it owns the `GtkDragSource`
 * outright, which is a closer match to how GTK's own list rows work.
 */
export const DraggableHandle = ({
  children,
  style,
  testID,
}: DraggableHandleProps): ReactNode => {
  const context = useContext(DraggableContext)
  const registerHandle = context?.registerHandle

  useEffect(() => {
    registerHandle?.(true)
    return () => registerHandle?.(false)
  }, [registerHandle])

  return (
    <View
      style={style}
      testID={testID}
    >
      {context?.source}
      {children}
    </View>
  )
}

Draggable.Handle = DraggableHandle
