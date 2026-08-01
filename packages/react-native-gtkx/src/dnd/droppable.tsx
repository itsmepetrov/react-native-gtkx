// `Droppable` and `useDroppable`.
//
// Upstream registers a rectangle with the provider and the dragged item's
// own maths decides whether it landed inside. Here GDK decides, against the
// real widget tree — which is why `collisionAlgorithm` has nothing to
// configure and why a zone that is full can REFUSE a drop outright (the
// pointer then shows the no-drop cursor) rather than silently ignoring it.
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { View } from "../components/view"
import { useDropContext } from "./context"
import { DropTargetControllers } from "./gtk-controllers"
import { FREE_SCOPE, nextDraggableId } from "./payload"
import type {
  DroppableProps,
  UseDroppableOptions,
  UseDroppableReturn,
} from "./types"

/** The drop half of the module, as a hook, for a component that owns its own
 *  view. `viewProps.children` are the GTK controllers; spread them into the
 *  view the zone should cover. */
export const useDroppable = <TData,>(
  options: UseDroppableOptions<TData>,
): UseDroppableReturn => {
  const {
    onDrop,
    dropDisabled = false,
    onActiveChange,
    activeStyle,
    droppableId,
    capacity = Number.POSITIVE_INFINITY,
  } = options

  const context = useDropContext()
  const [isActive, setIsActive] = useState(false)

  // Lazy initial state rather than a ref: stable for the component's
  // lifetime, and a ref may not be read during render.
  const [generatedId] = useState(nextDraggableId)
  const id = droppableId ?? generatedId

  useEffect(() => {
    context.registerDroppable({ droppableId: id, capacity })
    return () => context.unregisterDroppable(id)
  }, [context, id, capacity])

  useEffect(() => {
    onActiveChange?.(isActive)
  }, [isActive, onActiveChange])

  // A zone only accepts a free-standing draggable. A `SortableItem` carries
  // its list's own scope so that dragging a row does not light up every drop
  // zone on the screen — upstream keeps the two mechanisms apart in the same
  // way, by never registering sortable items as slots.
  const accepts = useCallback(
    (payload: { scope: string; id: string }) =>
      payload.scope === FREE_SCOPE &&
      context.dataFor(payload.id).found &&
      context.hasAvailableCapacity(id),
    [context, id],
  )

  const handleDrop = useCallback(
    (payload: { scope: string; id: string }) => {
      setIsActive(false)
      const { found, data } = context.dataFor(payload.id)
      if (!found) {
        return
      }
      context.registerDroppedItem(payload.id, id, data)
      onDrop(data as TData)
    },
    [context, id, onDrop],
  )

  const controllers = dropDisabled ? null : (
    <DropTargetControllers
      accepts={accepts}
      onEnter={() => setIsActive(true)}
      onLeave={() => setIsActive(false)}
      onDrop={handleDrop}
    />
  )

  return { viewProps: { children: controllers }, isActive, activeStyle }
}

/**
 * A zone that accepts a `Draggable`'s `data`.
 *
 * ```tsx
 * <Droppable
 *   onDrop={(task) => assign(task)}
 *   activeStyle={{ borderColor: "accent" }}
 * >
 *   <View style={styles.zone}>
 *     <Text>Assign to me</Text>
 *   </View>
 * </Droppable>
 * ```
 *
 * `capacity` is enforced at GDK level: once the zone is full it refuses the
 * drop, so the cursor says so before the user lets go.
 */
export const Droppable = <TData,>({
  children,
  style,
  testID,
  ...options
}: DroppableProps<TData>): ReactNode => {
  const droppable = useDroppable<TData>(options)

  return (
    <View
      style={
        droppable.isActive && droppable.activeStyle
          ? [style, droppable.activeStyle]
          : style
      }
      testID={testID}
    >
      {droppable.viewProps.children}
      {children}
    </View>
  )
}
