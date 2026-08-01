// `DropProvider` — the one piece of this module that is not a GTK controller.
//
// GDK does the hit testing, so unlike upstream this provider keeps no slot
// rectangles and needs no layout pass. What it does keep is the three things
// GDK cannot carry for us:
//
// 1. the map from a draggable's id to its `data` (see payload.ts: a GValue
//    cannot hold arbitrary JavaScript, so only the id travels);
// 2. the registry of droppables, for `capacity` and `getDroppedItems`;
// 3. the in-flight drag record, which is what makes `onDragging`
//    reconstructable — see the GtkDropControllerMotion below.
import {
  createContext,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react"
import type { MeasureHandle } from "../components/measure"
import { View } from "../components/view"
import { Controllers } from "../gtk/controllers"
import { GtkDropControllerMotion } from "../gtkx/bridge/index"
import type {
  DroppedItemsMap,
  DropProviderProps,
  DropProviderRef,
} from "./types"

export type DraggingPayload = {
  x: number
  y: number
  tx: number
  ty: number
  itemData: unknown
}

/** A drag this provider has seen begin and not yet seen end. */
export type ActiveDrag = {
  draggableId: string
  data: unknown
  /** The dragged view's own origin, in the provider view's coordinates. */
  originX: number
  originY: number
  /** Where the pointer was when the drag began, same coordinates — the
   *  origin `tx`/`ty` are measured from. */
  startX: number
  startY: number
  onDragging?: (payload: DraggingPayload) => void
}

export type DropRegistration = { droppableId: string; capacity: number }

export type DropContextValue = {
  /** Register a draggable's payload so a drop can resolve the id back to the
   *  data it stands for. */
  registerDraggable: (draggableId: string, data: unknown) => void
  unregisterDraggable: (draggableId: string) => void
  dataFor: (draggableId: string) => { found: boolean; data: unknown }

  registerDroppable: (registration: DropRegistration) => void
  unregisterDroppable: (droppableId: string) => void
  hasAvailableCapacity: (droppableId: string) => boolean

  registerDroppedItem: (
    draggableId: string,
    droppableId: string,
    data: unknown,
  ) => void
  unregisterDroppedItem: (draggableId: string) => void
  getDroppedItems: () => DroppedItemsMap

  /** Called by a `Draggable` from `drag-begin` / `drag-end`. */
  beginDrag: (drag: ActiveDrag) => void
  endDrag: () => void

  /** The provider's own view, so a draggable can measure its origin in the
   *  same coordinates the motion controller reports. Null when a draggable
   *  is used outside any provider. */
  providerView: RefObject<MeasureHandle | null> | null
}

const noop = (): void => {}

// A default, so a `Draggable` used without a provider still drags — it just
// has nowhere to record a drop. Upstream throws instead; a bare draggable is
// a legitimate thing to demo, so this quietly does nothing.
const ORPHAN: DropContextValue = {
  registerDraggable: noop,
  unregisterDraggable: noop,
  dataFor: () => ({ found: false, data: undefined }),
  registerDroppable: noop,
  unregisterDroppable: noop,
  hasAvailableCapacity: () => true,
  registerDroppedItem: noop,
  unregisterDroppedItem: noop,
  getDroppedItems: () => ({}),
  beginDrag: noop,
  endDrag: noop,
  providerView: null,
}

export const DropContext = createContext<DropContextValue>(ORPHAN)

export const useDropContext = (): DropContextValue => useContext(DropContext)

const defaultStyle = { flex: 1 } as const

/**
 * Scopes a set of draggables and droppables, and reports the drag as it
 * happens.
 *
 * ```tsx
 * <DropProvider>
 *   <Droppable onDrop={(task) => assign(task)}>…</Droppable>
 *   <Draggable data={task}>…</Draggable>
 * </DropProvider>
 * ```
 *
 * Unlike upstream this renders a `View` of its own, because `onDragging`
 * needs a widget to hang a `GtkDropControllerMotion` on. It is a plain
 * `flex: 1` box unless `style` says otherwise, so it fills its parent the
 * way the fragment upstream renders would have.
 */
export const DropProvider = ({
  children,
  onDroppedItemsUpdate,
  onDragStart,
  onDragEnd,
  onDragging,
  style,
  testID,
  ref,
}: DropProviderProps): ReactNode => {
  const draggables = useRef(new Map<string, unknown>())
  const droppables = useRef(new Map<string, DropRegistration>())
  const dropped = useRef<DroppedItemsMap>({})
  const active = useRef<ActiveDrag | null>(null)
  const providerView = useRef<MeasureHandle | null>(null)

  const notifyDropped = useCallback(() => {
    onDroppedItemsUpdate?.({ ...dropped.current })
  }, [onDroppedItemsUpdate])

  const value = useMemo<DropContextValue>(
    () => ({
      registerDraggable: (draggableId, data) => {
        draggables.current.set(draggableId, data)
      },
      unregisterDraggable: (draggableId) => {
        draggables.current.delete(draggableId)
      },
      dataFor: (draggableId) => ({
        found: draggables.current.has(draggableId),
        data: draggables.current.get(draggableId),
      }),

      registerDroppable: (registration) => {
        droppables.current.set(registration.droppableId, registration)
      },
      unregisterDroppable: (droppableId) => {
        droppables.current.delete(droppableId)
      },
      hasAvailableCapacity: (droppableId) => {
        const registration = droppables.current.get(droppableId)
        if (
          !registration ||
          registration.capacity === Number.POSITIVE_INFINITY
        ) {
          return true
        }
        const held = Object.values(dropped.current).filter(
          (entry) => entry.droppableId === droppableId,
        ).length
        return held < registration.capacity
      },

      registerDroppedItem: (draggableId, droppableId, data) => {
        dropped.current = {
          ...dropped.current,
          [draggableId]: { droppableId, data },
        }
        notifyDropped()
      },
      unregisterDroppedItem: (draggableId) => {
        if (!(draggableId in dropped.current)) {
          return
        }
        const next = { ...dropped.current }
        delete next[draggableId]
        dropped.current = next
        notifyDropped()
      },
      getDroppedItems: () => ({ ...dropped.current }),

      beginDrag: (drag) => {
        active.current = drag
        onDragStart?.(drag.data)
      },
      endDrag: () => {
        const drag = active.current
        active.current = null
        if (drag) {
          onDragEnd?.(drag.data)
        }
      },

      providerView,
    }),
    [notifyDropped, onDragStart, onDragEnd],
  )

  useImperativeHandle(
    ref,
    (): DropProviderRef => ({
      // See types.ts: a no-op because GDK re-hit-tests on every motion.
      requestPositionUpdate: noop,
      getDroppedItems: () => ({ ...dropped.current }),
    }),
    [],
  )

  // The whole reason this provider owns a view. `GtkDragSource` goes quiet
  // between `drag-begin` and `drag-end`: once the drag starts the source is
  // out of the loop and the compositor owns the icon. `GtkDropControllerMotion`
  // is the controller that tracks pointer motion DURING a drag, over any
  // widget, so one here sees the drag cross the provider's whole area — which
  // is exactly what upstream's `onDragging` reports.
  const reportMotion = useCallback(
    (x: number, y: number) => {
      const drag = active.current
      if (!drag) {
        return
      }
      const payload: DraggingPayload = {
        x: drag.originX,
        y: drag.originY,
        // The translation the view WOULD have had: how far the pointer has
        // travelled since the drag began.
        tx: x - drag.startX,
        ty: y - drag.startY,
        itemData: drag.data,
      }
      drag.onDragging?.(payload)
      onDragging?.(payload)
    },
    [onDragging],
  )

  return (
    <DropContext.Provider value={value}>
      <View
        ref={providerView}
        testID={testID}
        style={style ?? defaultStyle}
      >
        <Controllers>
          <GtkDropControllerMotion
            onEnter={reportMotion}
            onMotion={reportMotion}
          />
        </Controllers>
        {children}
      </View>
    </DropContext.Provider>
  )
}
