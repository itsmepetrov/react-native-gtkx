// Edge autoscroll during a drag: while the pointer is near an edge of the
// list's own viewport, keep nudging the `ScrollView` toward that edge for as
// long as it stays there.
//
// Upstream drives this in two separate pieces, both worklets: a
// `useAnimatedReaction` on the DRAGGED ITEM'S transformed pixel position
// writes `autoScrollDirection.value` once it crosses within `scrollThreshold`
// of a bound, and a second reaction on THAT value starts a `withTiming` tween
// of the scroll offset toward the boundary over a fixed 1500ms. Neither piece
// has an equivalent here: there is no per-frame pixel position for a dragged
// row (GDK moves the drag icon, not a style), and there is no timing engine
// driving a `ScrollView`'s offset outside a real gesture.
//
// What GTK hands back instead is exactly the substitute this needs:
//
//  - "is the drag near an edge" comes from a `GtkDropControllerMotion` on the
//    list's own viewport — the same technique `DropProvider`'s `onDragging`
//    already uses to see a drag crossing a widget the drag source itself has
//    gone quiet on;
//  - the scroll ITSELF is a `Gtk.Widget` tick callback nudging the real
//    `GtkAdjustment` at a constant speed for as long as the pointer sits in
//    the edge band — an imperative, per-frame write with no React state
//    behind it, so autoscrolling costs no render, matching the reorder path
//    next to it (docs/research/drag-and-drop.md).
//
// docs/api.md records the one behavioural difference this produces: upstream
// eases into a 1500ms glide toward the boundary; here the scroll runs at a
// constant speed for as long as the edge band is occupied, because there is
// no timing engine here to ease with.
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react"
import type { RefObject } from "react"
import { widgetForHandle, type MeasureHandle } from "../components/measure"
import type { ScrollViewHandle } from "../components/scroll-view"
import { Controllers } from "../gtk/controllers"
import { GtkDropControllerMotion, type Gtk } from "../gtkx/bridge/index"
import { perfNow } from "../perf"
import type { SharedValueLike } from "./types"

/** Distance from a viewport edge, in pixels, that starts scrolling. Upstream
 *  scales this from `itemHeight`/`itemWidth`; this platform does not require
 *  a fixed item size for a plain `Sortable` (rows keep their natural Yoga
 *  height), so a fixed band is used for all three list shapes instead —
 *  matching the floor (`Math.max(scrollThreshold, 60)`) upstream's own
 *  horizontal hook already applies. */
const EDGE = 60

/** Pixels per second while the pointer sits inside the edge band. */
const SPEED = 700

export type AutoscrollAxes = "vertical" | "horizontal" | "both"

export type AutoscrollHandle<TDirection> = {
  /** Render as a direct child of the plain `View` wrapping the list's
   *  `ScrollView`, so motion lands in VIEWPORT coordinates rather than the
   *  scrolling content's. */
  controllers: ReactNode
  /** The list's own `moveOnto`/`beginDrag`/`endDrag` neighbour: on while a
   *  drag started by one of THIS list's own rows is in flight, off otherwise
   *  — so hovering the list with no drag, or with someone ELSE's drag
   *  passing over it, never scrolls it. `GtkDropControllerMotion` reports
   *  every drag crossing the widget, not only this list's own. */
  setActive: (active: boolean) => void
  /** The live direction, real `{ value }` box — see `SharedValueLike`. An app
   *  forwarding `autoScrollDirection`/`autoScrollHorizontalDirection` through
   *  `{...rest}` reads the true state; upstream's own `SharedValue` of the
   *  same name is what this replaces. */
  direction: SharedValueLike<TDirection>
}

export type UseEdgeAutoscrollOptions<TDirection> = {
  /** The plain `View` wrapping the `ScrollView` — its own allocated size IS
   *  the viewport `GtkDropControllerMotion` reports positions against. */
  containerRef: RefObject<MeasureHandle | null>
  scrollViewRef: RefObject<ScrollViewHandle | null>
  axes: AutoscrollAxes
  none: TDirection
  directionFor: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => TDirection
}

const clampValue = (value: number, lower: number, upper: number): number =>
  Math.min(Math.max(value, lower), Math.max(lower, upper))

/**
 * A `SharedValueLike` with a `set()` for THIS module's own writes.
 *
 * `direction.value = x` inside a `useCallback` is exactly what
 * `react-hooks/immutability` exists to catch — mutating a value a hook
 * returned, from a callback that outlives the render that created it. The
 * fix already established in this codebase (see reanimated-compat's own
 * `SharedValue`, commit "Write shared values through set(), because the
 * compiler is on by default") is a `set()` method: a plain method call is
 * opaque to the compiler's static analysis in a way a property assignment on
 * a hook's return value is not. The `value` PROPERTY stays exactly
 * `SharedValueLike`-shaped for every reader outside this file — apps forward
 * and read `autoScrollDirection.value` as documented; only the write, local
 * to this module, goes through `set()`.
 */
type MutableBox<T> = SharedValueLike<T> & { set(next: T): void }

const createMutableBox = <T,>(initial: T): MutableBox<T> => {
  const box: MutableBox<T> = {
    value: initial,
    set(next) {
      box.value = next
    },
  }
  return box
}

/** The `ScrollView`'s own widget is a `Gtk.ScrolledWindow` — the generic
 *  `Gtk.Widget` `widgetForHandle` returns has no `getHadjustment()`/
 *  `getVadjustment()`, so it is narrowed here rather than at every call
 *  site. */
const scrolledWindowFor = (
  handle: ScrollViewHandle | null,
): Gtk.ScrolledWindow | null =>
  (widgetForHandle(handle) as Gtk.ScrolledWindow | null) ?? null

export const useEdgeAutoscroll = <TDirection,>({
  containerRef,
  scrollViewRef,
  axes,
  none,
  directionFor,
}: UseEdgeAutoscrollOptions<TDirection>): AutoscrollHandle<TDirection> => {
  const active = useRef(false)
  const tickId = useRef<number | null>(null)
  const lastTick = useRef(0)
  const deltaX = useRef<-1 | 0 | 1>(0)
  const deltaY = useRef<-1 | 0 | 1>(0)
  // A `useMemo`, not a ref: reading `ref.current` during render is what
  // `react-hooks/refs` exists to catch, even though nothing here is actually
  // rendered from it. The box still needs a stable identity `applyDelta`
  // below can `set()` without a re-render — a `useMemo` with no dependencies
  // gives exactly that, the same way `sortable.tsx`'s own `idle` boxes are
  // built. `none` only seeds the box once; it is not meant to be reactive.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const direction = useMemo(() => createMutableBox(none), [])

  const stopTick = useCallback(() => {
    const widget = scrolledWindowFor(scrollViewRef.current)
    if (widget && tickId.current !== null) {
      widget.removeTickCallback(tickId.current)
    }
    tickId.current = null
  }, [scrollViewRef])

  const onTick = useCallback((): boolean => {
    const widget = scrolledWindowFor(scrollViewRef.current)
    const handle = scrollViewRef.current
    if (!widget || !handle) {
      return true
    }
    const now = perfNow()
    const dt = Math.min((now - lastTick.current) / 1000, 0.1)
    lastTick.current = now
    if (deltaX.current !== 0) {
      const adjustment = widget.getHadjustment()
      if (adjustment) {
        const next = clampValue(
          adjustment.getValue() + deltaX.current * SPEED * dt,
          0,
          adjustment.getUpper() - adjustment.getPageSize(),
        )
        handle.scrollTo({ x: next })
      }
    }
    if (deltaY.current !== 0) {
      const adjustment = widget.getVadjustment()
      if (adjustment) {
        const next = clampValue(
          adjustment.getValue() + deltaY.current * SPEED * dt,
          0,
          adjustment.getUpper() - adjustment.getPageSize(),
        )
        handle.scrollTo({ y: next })
      }
    }
    return true
  }, [scrollViewRef])

  const startTick = useCallback(() => {
    if (tickId.current !== null) {
      return
    }
    const widget = scrolledWindowFor(scrollViewRef.current)
    if (!widget) {
      return
    }
    lastTick.current = perfNow()
    tickId.current = widget.addTickCallback(onTick)
  }, [scrollViewRef, onTick])

  const applyDelta = useCallback(
    (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
      deltaX.current = dx
      deltaY.current = dy
      direction.set(directionFor(dx, dy))
      if (dx !== 0 || dy !== 0) {
        startTick()
      } else {
        stopTick()
      }
    },
    [direction, directionFor, startTick, stopTick],
  )

  const onMotion = useCallback(
    (x: number, y: number) => {
      if (!active.current) {
        return
      }
      const container = containerRef.current
      if (!container) {
        return
      }
      container.measure((_x, _y, width, height) => {
        let dx: -1 | 0 | 1 = 0
        let dy: -1 | 0 | 1 = 0
        if (axes !== "vertical") {
          if (x < EDGE) {
            dx = -1
          } else if (x > width - EDGE) {
            dx = 1
          }
        }
        if (axes !== "horizontal") {
          if (y < EDGE) {
            dy = -1
          } else if (y > height - EDGE) {
            dy = 1
          }
        }
        applyDelta(dx, dy)
      })
    },
    [containerRef, axes, applyDelta],
  )

  const onLeave = useCallback(() => {
    applyDelta(0, 0)
  }, [applyDelta])

  const setActive = useCallback(
    (value: boolean) => {
      active.current = value
      if (!value) {
        applyDelta(0, 0)
      }
    },
    [applyDelta],
  )

  useEffect(() => stopTick, [stopTick])

  const controllers = useMemo(
    () => (
      <Controllers>
        <GtkDropControllerMotion
          onMotion={onMotion}
          onLeave={onLeave}
        />
      </Controllers>
    ),
    [onMotion, onLeave],
  )

  return { controllers, setActive, direction }
}
