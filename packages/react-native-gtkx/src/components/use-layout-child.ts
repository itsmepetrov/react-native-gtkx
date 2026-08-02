import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import type { LayoutNode } from "../layout/index"
import { splitStyle, StyleSheet } from "../style/index"
import { defaultCssRegistry } from "../style/registry.gtkx"
import type {
  LayoutStyle,
  MeasureFn,
  Rect,
  StyleProp,
  TransformPart,
  VisualStyle,
} from "../contracts"
import {
  allocateChild,
  attachRnLayout,
  cacheChildOrder,
  detachRnLayout,
  Gtk,
  invalidateZOrder,
  measureWidget,
  queueAllocate,
  queueResize,
  setZIndex,
} from "../gtkx/bridge/index"
import {
  perfAddTime,
  perfBurst,
  perfCount,
  perfEnabled,
  perfNow,
} from "../perf"
import { useHostNode, type HostNode } from "./host-node"
import {
  deferDuringAllocate,
  getStoredDrivenBox,
  getStoredOffset,
  getStoredRect,
  setStoredRect,
  setStoredTransform,
} from "./rect-store"
import { deferUntilReleased } from "./widget-retention"

export type LayoutEvent = {
  nativeEvent: {
    layout: { x: number; y: number; width: number; height: number }
  }
}

// Perf: sizeAllocate recurses synchronously into child containers, so a
// naive per-pass timer double-counts nested passes. Track depth and time
// only the outermost (top-level) allocate — that is the real wall time GTK
// spends in OUR layout code for the frame.
let perfAllocDepth = 0

// RN's `overflow` onto GTK's. It is the one style that has to reach BOTH
// halves of the pipeline: Yoga reads it while measuring (see
// layout/apply-style.ts, which keeps setting it on the node), and the widget
// needs it to clip paint and picking — GTK4 CSS has no `overflow` property,
// so unlike every other visual style this one is a widget call rather than a
// declaration.
//
// `scroll` clips exactly like `hidden`, which is what RN itself does: a
// `View` is not made scrollable by a style on either platform (iOS sets
// `clipsToBounds` for any non-visible overflow, Android's ReactViewGroup
// clips for SCROLL and HIDDEN alike) — only a `ScrollView` scrolls. Mapping
// it to VISIBLE instead would be the silent lie this replaces.
const WIDGET_OVERFLOW: Record<
  NonNullable<LayoutStyle["overflow"]>,
  Gtk.Overflow
> = {
  visible: Gtk.Overflow.VISIBLE,
  hidden: Gtk.Overflow.HIDDEN,
  scroll: Gtk.Overflow.HIDDEN,
}

export type LayoutChildOptions = {
  style: StyleProp | undefined
  onLayout: ((event: LayoutEvent) => void) | undefined
  measure?: MeasureFn
  // Leaves with intrinsic GTK sizes (Entry, Switch, Spinner) measure their
  // own widget so Yoga reserves exactly what the theme will draw.
  measureFromWidget?: boolean
  extraLayout?: LayoutStyle
  // Widgets that clip whatever the style says: an under-allocated GtkLabel
  // paints its full text past its box (Text), and a scroll viewport clips by
  // contract (ScrollView). Both used to write the widget's overflow
  // themselves; one writer avoids the ordering bug where a style change
  // re-runs the generic effect and un-clips them.
  alwaysClips?: boolean
}

export type LayoutChild = {
  host: HostNode
  node: LayoutNode
  flat: ReturnType<typeof StyleSheet.flatten>
  visual: VisualStyle
  cssClass: string | null
}

// Which Yoga node lays out which widget. The reconciler talks in widgets and
// the shadow tree talks in nodes, and syncChildOrder below is the one place
// that has to translate between them.
const nodesByWidget = new WeakMap<Gtk.Widget, LayoutNode>()

/**
 * The shadow-tree node laying out this widget, or undefined for a widget that
 * is not a layout child of any container (a nested layout root, a raw GTK
 * widget in a slot).
 *
 * The reverse of what `syncChildOrder` uses it for, and the same map: an
 * animated size has to walk the driven node's DESCENDANTS, which it can only
 * reach through the widget tree, and pairing each widget back to its node is
 * what keeps that walk honest about which children belong to which container.
 */
export const nodeForWidget = (widget: Gtk.Widget): LayoutNode | undefined =>
  nodesByWidget.get(widget)

/**
 * Puts a container's shadow tree back into its widgets' order.
 *
 * WHY this is needed, and why insertion order alone was not enough. A child
 * picks its Yoga index once, on mount, from where the reconciler put its
 * widget — which is right for a child that APPEARS mid-list, and blind to a
 * child that MOVES. React reorders keyed siblings by moving the existing
 * fibers, so nothing mounts and nothing unmounts: the widgets end up in the
 * new order and the Yoga nodes stay in the old one, and since the rects come
 * from the nodes, the rows redraw exactly where they were. Every list that
 * can be sorted, filtered into a different order, or dragged into one was
 * silently affected — found by dragging a row in `examples/tasks-nav` after
 * its rows were rewritten in React Native (a `GtkListBox` was doing its own
 * layout before, so nothing had ever exercised this).
 *
 * Runs after every commit of the container, and does nothing at all unless
 * the two orders actually disagree — one pointer comparison per child.
 */
const syncChildOrder = (parentWidget: Gtk.Widget, parent: LayoutNode): void => {
  const ordered: LayoutNode[] = []
  let moved = false
  let child = parentWidget.getFirstChild()
  while (child !== null) {
    const node = nodesByWidget.get(child)
    // Widgets that are not layout children of THIS container are skipped in
    // both orders: a nested layout root, or a raw GTK widget a slot holds.
    if (node !== undefined && node.parent === parent) {
      if (parent.children[ordered.length] !== node) {
        moved = true
      }
      ordered.push(node)
    }
    child = child.getNextSibling()
  }
  // A disagreement in COUNT is not a reorder — it means a child is
  // mid-mount, or something in this container lays itself out. Re-sorting
  // against a partial view would be worse than leaving it alone.
  if (!moved || ordered.length !== parent.children.length) {
    return
  }
  for (let index = 0; index < ordered.length; index += 1) {
    const node = ordered[index]!
    if (parent.children[index] !== node) {
      parent.removeChild(node)
      parent.insertChild(node, index)
    }
  }
}

// Shared plumbing for every leaf/container component: owns one LayoutNode,
// keeps it in the parent's shadow tree for the component lifetime, applies
// the layout half of the style and commits Yoga rects into the rect store,
// where the parent container's RnGtkxLayout allocate() picks them up.
export const useLayoutChild = (
  widgetRef: RefObject<Gtk.Widget | null>,
  options: LayoutChildOptions,
): LayoutChild => {
  const host = useHostNode()

  // useState's lazy initializer is guaranteed once-per-instance even under
  // the React Compiler — a lazy ref here got its creation memoized ACROSS
  // component instances, sharing one Yoga node and double-freeing it.
  const [node] = useState<LayoutNode>(() => host.engine.createNode())

  const flat = StyleSheet.flatten(options.style)
  const { layout, visual } = splitStyle(flat)
  const effectiveLayout = options.extraLayout
    ? { ...layout, ...options.extraLayout }
    : layout

  // Re-apply layout style only when it actually changed (keyed effect) —
  // setStyle dirties the whole tree.
  const layoutKey = JSON.stringify(effectiveLayout)
  useLayoutEffect(() => {
    node.setStyle(JSON.parse(layoutKey) as LayoutStyle)
  }, [node, layoutKey])

  const cssClass = defaultCssRegistry.getClassName(visual)

  // The GTK half of `overflow`. Yoga has had it since the beginning and
  // nothing reached the widget, so the style was accepted and painted
  // nothing — `overflow: "hidden"` on a container was a no-op. GTK clips to
  // the CSS padding box, so `borderRadius` shapes the clip for free (a
  // rounded-clip node rather than a rectangular one) and both paint and
  // `gtk_widget_pick()` follow it.
  const overflow = options.alwaysClips
    ? "hidden"
    : (flat?.overflow ?? "visible")
  useLayoutEffect(() => {
    widgetRef.current?.setOverflow(WIDGET_OVERFLOW[overflow])
  }, [widgetRef, overflow])

  // RN's `zIndex`, which is neither a Yoga input nor a CSS declaration: the
  // PARENT container sorts its snapshot and its picking by it
  // (gtkx/bridge/view-box.ts). Applied unconditionally, as RN does — CSS
  // needs a non-static `position` for `z-index` to take effect and RN does
  // not, so nothing here consults `position`. `undefined` is 0, and negative
  // values are legal (they paint below unraised siblings).
  const zIndex = flat?.zIndex ?? 0
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    setZIndex(widget, zIndex)
    return () => {
      // Cleared before the widget leaves the tree, so the container that is
      // losing it drops its cached order and the process-wide "anything
      // raised at all" counter comes back down to zero.
      setZIndex(widget, 0)
      const parentWidget = host.widgetRef.current
      if (parentWidget) {
        invalidateZOrder(parentWidget)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zIndex])

  // RN transforms are visual only: the widget keeps the box Yoga gave it, so
  // a transform never touches the shadow tree — it only asks the parent
  // container to run its allocate hook again. Keyed on the serialized array
  // so a re-render with the same transform costs nothing.
  // (Animated.View owns its own transform and strips it from the static
  // style before it gets here, so the two writers never race.)
  const transformKey = JSON.stringify(visual.transform ?? null)
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    setStoredTransform(widget, JSON.parse(transformKey) as TransformPart[])
    const parentWidget = host.widgetRef.current
    if (parentWidget) {
      queueAllocate(parentWidget)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transformKey])

  useLayoutEffect(() => {
    const parent = host.node
    // The reconciler has already attached our widget in JSX order, so its
    // sibling position is the correct Yoga index — this keeps the shadow tree
    // ordered even for mid-list mounts (conditional children, list inserts).
    const widget = widgetRef.current
    const parentWidget = host.widgetRef.current
    let index = parent.children.length
    if (widget) {
      // Published so the container can put the shadow tree back into widget
      // order after React has MOVED an existing child — see syncChildOrder.
      // Outside the `parentWidget` guard below on purpose: on a first mount
      // the PARENT's ref is not attached yet (React attaches host refs
      // bottom-up, so a child's layout effect runs before its container's
      // widget exists), and a registration skipped there would never happen
      // again — the effect runs once.
      nodesByWidget.set(widget, node)
    }
    if (widget && parentWidget) {
      let position = 0
      let sibling = parentWidget.getFirstChild()
      while (sibling !== null && sibling !== widget) {
        position += 1
        sibling = sibling.getNextSibling()
      }
      if (sibling === widget) {
        index = Math.min(position, parent.children.length)
      }
    }
    parent.insertChild(node, index)
    node.setCommit((rect: Rect) => {
      const widget = widgetRef.current
      const parentWidget = host.widgetRef.current
      if (!widget || !parentWidget) {
        return
      }
      const previous = getStoredRect(widget)
      // A commit does not imply a change. The engine may hand us the rect a
      // widget already has — nodes carrying a measure function are visited
      // even when Yoga did not move them — and queueing an allocation for
      // those makes GTK re-allocate and re-snapshot the container for nothing.
      //
      // `rect.skip` counts how often this guard actually fires and
      // `rect.change` how often it does not, because a guard nobody can see
      // firing is a guard nobody can attribute a measurement to: this one was
      // once credited with a large maximized-window win that a later, properly
      // geometry-controlled run could not reproduce (docs/research/
      // scroll-performance.md, round six). Keep it — it is correct and free —
      // but read the counter before crediting it with anything.
      const unchanged =
        previous !== undefined &&
        previous.x === rect.x &&
        previous.y === rect.y &&
        previous.width === rect.width &&
        previous.height === rect.height
      if (perfEnabled) {
        perfCount(unchanged ? "rect.skip" : "rect.change")
      }
      if (unchanged) {
        return
      }
      setStoredRect(widget, rect)
      const sizeChanged =
        !previous ||
        previous.width !== rect.width ||
        previous.height !== rect.height
      const queue = (): void => {
        if (sizeChanged) {
          // A size change invalidates this widget's cached measure (nested
          // managers, ScrolledWindow ranges) and re-allocates the ancestors.
          queueResize(widget)
        } else {
          // Pure move: the parent just needs another allocation pass. GTK
          // dedupes queued allocates, so per-child calls batch into one.
          queueAllocate(parentWidget)
        }
      }
      if (!deferDuringAllocate(widget, queue)) {
        queue()
      }
    })
    return () => {
      // `widget`, not `widgetRef.current`: by cleanup time the ref may
      // already have been detached, and the entry to drop is the one this
      // effect registered.
      if (widget) {
        nodesByWidget.delete(widget)
      }
      node.setCommit(null)
      // Removed from the shadow tree and freed even when the widget is being
      // RETAINED for an exit animation (see ./widget-retention): the siblings
      // must close the gap immediately — an exiting widget does not hold its
      // space, it draws over the space closing behind it — and the rect its
      // container keeps reporting afterwards is `lastRect`, a plain JS value
      // that outlives the Yoga node it came from.
      parent.removeChild(node)
      node.free()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onLayout = options.onLayout
  useLayoutEffect(() => {
    node.setOnLayout(
      onLayout
        ? (rect: Rect) => {
            onLayout({ nativeEvent: { layout: rect } })
          }
        : null,
    )
  }, [node, onLayout])

  // The explicit return type keeps the inner params contextually typed: with a
  // bare lazy initializer TS may match the outer arrow against MeasureFn
  // itself (useState accepts S | () => S) and drop the context.
  const [widgetMeasure] = useState<MeasureFn>(
    (): MeasureFn => (width, widthMode) => {
      const widget = widgetRef.current
      if (!widget) {
        return { width: 0, height: 0 }
      }
      const { minimum, natural } = measureWidget(widget, "horizontal")
      // Floor at the widget's own minimum width, not at 1 — see the same
      // clamp in text.tsx's measure for why: gtk_widget_measure() enforces
      // this floor internally regardless of what we request (warning while
      // it does), so anything below `minimum` was never actually honored.
      const used =
        widthMode === "undefined"
          ? natural
          : Math.min(natural, Math.max(minimum, Math.floor(width)))
      return {
        width: used,
        height: measureWidget(widget, "vertical", used).natural,
      }
    },
  )
  const measure =
    options.measure ?? (options.measureFromWidget ? widgetMeasure : undefined)
  useLayoutEffect(() => {
    if (!measure) {
      return
    }
    node.setMeasureFn(measure)
    // Widgets measured before their window is mapped report zero (no realized
    // theme context yet, unlike offscreen probes) and Yoga caches it —
    // invalidate once the widget actually maps.
    const widget = widgetRef.current
    const remeasure = (): void => {
      node.markDirty()
    }
    if (options.measureFromWidget && widget) {
      widget.on("map", remeasure)
    }
    return () => {
      if (options.measureFromWidget && widget) {
        widget.off("map", remeasure)
      }
      // Cleared by free() on unmount; explicit unset only when measure is
      // removed while mounted.
      node.setMeasureFn(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, measure])

  return { host, node, flat, visual, cssClass }
}

export type RnContainerOptions = {
  // Overrides the default engine-rect measure (the window root reports 0 so
  // the window can shrink freely below the current content size; the
  // intrinsic root measures its content through Yoga, honoring forSize for
  // height-for-width).
  measure?: (orientation: "horizontal" | "vertical", forSize: number) => number
  // Runs before children are placed — the window root syncs the engine
  // viewport to the actual allocation here.
  beforeAllocate?: (width: number, height: number) => void
}

// Containers (Root, View, Animated.View, ScrollView content) drive their GTK
// side with an RnGtkxLayout: measure() reports the engine rect of `node`
// (minimum == natural — GTK minimums of children never leak upward), and
// allocate() places every child widget at exactly its stored engine rect
// plus the Animated offset.
export const useRnContainer = (
  widgetRef: RefObject<Gtk.Widget | null>,
  node: LayoutNode,
  options?: RnContainerOptions,
): void => {
  const optionsRef = useRef<RnContainerOptions | undefined>(options)
  optionsRef.current = options

  // Deliberately no dependency array: a MOVE mounts nothing and unmounts
  // nothing, so there is no other commit this could key off. Children's
  // layout effects run before their container's, so by the time this fires
  // every child of this commit has registered its node. See syncChildOrder.
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (widget) {
      syncChildOrder(widget, node)
      // The paint order caches a child list, and a commit is the only thing
      // that can change one without any zIndex being written — a mount, an
      // unmount, or a MOVE. Dropping it here is a WeakMap delete on a
      // container that has a raised child and nothing at all on one that does
      // not (`invalidateZOrder` only redraws when there was a cache to drop).
      invalidateZOrder(widget)
    }
  })

  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    attachRnLayout(widget, {
      measure: (orientation, forSize) => {
        const custom = optionsRef.current?.measure
        if (custom) {
          return custom(orientation, forSize)
        }
        // A driven size wins over the committed one here as well as in the
        // parent's allocate, so the container asks GTK for the box it is
        // actually being given. Otherwise a size animated DOWNWARD would
        // under-allocate a widget against its own stated minimum every frame.
        const rect = node.getRect()
        const driven = getStoredDrivenBox(widget)
        const size =
          orientation === "horizontal"
            ? (driven?.width ?? rect?.width)
            : (driven?.height ?? rect?.height)
        return Math.round(size ?? 0)
      },
      allocate: (width, height) => {
        const start = perfEnabled ? perfNow() : 0
        perfAllocDepth += 1
        optionsRef.current?.beforeAllocate?.(width, height)
        let child = widget.getFirstChild()
        let children = 0
        // Collected while this loop walks the sibling chain anyway, and handed
        // to the paint pass, which would otherwise have to walk it again: each
        // getNextSibling() mints a native wrapper and is the single most
        // expensive thing a JS snapshot vfunc does (docs/research/z-index.md).
        const order: Gtk.Widget[] = []
        while (child) {
          order.push(child)
          const rect = getStoredRect(child)
          if (rect) {
            const offset = getStoredOffset(child)
            // The engine's rect, with whatever an animation is currently
            // driving laid over it field by field: the animated node
            // overrides only the axis being driven, its descendants override
            // the whole rect because re-laying the subtree out is what
            // decides them. The transform composes on top either way.
            const driven = offset.driven
            allocateChild(
              child,
              (driven?.x ?? rect.x) + offset.dx,
              (driven?.y ?? rect.y) + offset.dy,
              driven?.width ?? rect.width,
              driven?.height ?? rect.height,
              offset.matrix,
            )
            children += 1
          }
          child = child.getNextSibling()
        }
        cacheChildOrder(widget, order)
        perfAllocDepth -= 1
        if (perfEnabled) {
          perfCount("gtk.allocPass")
          perfCount("gtk.allocChild", children)
          if (perfAllocDepth === 0) {
            const elapsed = perfNow() - start
            perfAddTime("gtk.allocTop", elapsed)
            perfBurst("gtk.allocMsPerFrame", elapsed)
          }
        }
      },
    })
    return () => {
      // Deferred inside a retained subtree for the same reason the Yoga node
      // is: without its RnGtkxLayout the container falls back to GtkBox's own
      // layout and the children of a widget that is still visible re-stack
      // themselves mid-animation.
      if (!deferUntilReleased(widget, () => detachRnLayout(widget))) {
        detachRnLayout(widget)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
