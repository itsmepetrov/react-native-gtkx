// `useScrollOffset` (and `useScrollViewOffset`, its own deprecated alias
// upstream) — a shared value that always holds a scrollable's current offset.
//
// Upstream builds it out of `useEvent`, which subscribes a native view tag to
// the scroll event names and lets the UI runtime write the value. Here it is
// shorter and reads the same: an `AnimatedRef` on a scrollable resolves to the
// `GtkScrolledWindow` behind it, and its adjustments already emit
// `value-changed` on the loop this JS is on — the same signal
// `ScrollView.emitScroll` runs from. So the value moves with the scroll, with
// no React render and no event machinery, which is what the hook promises.
//
// **It costs nothing to be untracked.** Nothing is connected until a hook
// actually points at a scrollable, and it is disconnected when the component
// unmounts or the ref moves to a different one. A scrollable nobody tracks is
// the widget it always was.
import { useEffect, useRef, useState } from "react"
import { widgetForHandle } from "../components/measure"
import { warnOnce } from "../style/dev-warning"
import { Gtk } from "../gtkx/bridge/index"
import type { SharedValue } from "./mutable"

type MakeMutable = <T>(initial: T) => SharedValue<T>

/** Either spelling of a ref, as everything else on this surface accepts. */
type ScrollableRef = (() => unknown) | { current: unknown } | null | undefined

const instanceOf = (animatedRef: ScrollableRef): unknown => {
  if (!animatedRef) {
    return null
  }
  return typeof animatedRef === "function" ? animatedRef() : animatedRef.current
}

/**
 * The scrolled window a ref stands for. A `ScrollView`'s handle IS the
 * scrolled window; a windowed list's handle resolves through to the
 * `ScrollView` it renders (`registerHandleAlias`), which is the same rule
 * `findNodeHandle` and `measureLayout` already follow — so this works on a
 * `FlatList` ref without knowing anything about lists.
 */
const scrolledWindowOf = (
  animatedRef: ScrollableRef,
): Gtk.ScrolledWindow | null => {
  const widget = widgetForHandle(instanceOf(animatedRef))
  return widget instanceof Gtk.ScrolledWindow ? widget : null
}

export const createScrollOffsetHooks = (makeMutable: MakeMutable) => {
  const useScrollOffset = (
    animatedRef: ScrollableRef,
    // Upstream's second argument: write into the caller's shared value
    // instead of minting one, so two hooks can share an offset.
    providedOffset?: SharedValue<number>,
  ): SharedValue<number> => {
    // useState rather than a lazily-filled ref for the reason `useSharedValue`
    // reaches for it: this value IS the return value, so a ref would be a
    // render-time read.
    const [internal] = useState(() => makeMutable(0))
    const offset = providedOffset ?? internal

    // The widget currently subscribed to, so a re-render that resolved to the
    // same one reconnects nothing.
    const attached = useRef<Gtk.ScrolledWindow | null>(null)
    const detach = useRef<(() => void) | null>(null)

    // No dependency array on purpose. A ref is attached by React AFTER the
    // render that created it, so the first run of this effect commonly
    // resolves to nothing and the second one — a commit later, with the list
    // mounted — is the one that finds the scroller. Upstream solves the same
    // problem with `animatedRef.observe`; re-resolving per commit is the same
    // answer without a second observer protocol, and it is one WeakMap lookup
    // when the answer has not changed.
    useEffect(() => {
      const widget = scrolledWindowOf(animatedRef)
      if (widget === attached.current) {
        return
      }
      detach.current?.()
      detach.current = null
      attached.current = widget
      if (!widget) {
        if (instanceOf(animatedRef) !== null) {
          warnOnce(
            "useScrollOffset",
            "useScrollOffset was given a ref that is not on a scrollable, so the " +
              "offset will stay at 0. Pass the ref to a ScrollView, FlatList or " +
              "Animated.ScrollView.",
          )
        }
        return
      }

      const hadjustment = widget.getHadjustment()
      const vadjustment = widget.getVadjustment()
      const update = (): void => {
        // Upstream's own rule, mirrored exactly: the horizontal offset when
        // there is one, the vertical otherwise. One shared value cannot carry
        // two axes, and this is the choice every consumer is written against.
        const x = hadjustment.getValue()
        offset.value = x === 0 ? vadjustment.getValue() : x
      }
      update()
      hadjustment.on("value-changed", update)
      vadjustment.on("value-changed", update)
      detach.current = () => {
        hadjustment.off("value-changed", update)
        vadjustment.off("value-changed", update)
      }
    })

    useEffect(
      () => () => {
        detach.current?.()
        detach.current = null
        attached.current = null
      },
      [],
    )

    return offset
  }

  return {
    useScrollOffset,
    /** Upstream's own deprecated alias, kept so library call sites are unchanged. */
    useScrollViewOffset: useScrollOffset,
  }
}
