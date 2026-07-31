import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import type { LayoutNode } from "../layout/index"
import { splitStyle, StyleSheet } from "../style/index"
import { defaultCssRegistry } from "../style/registry.gtkx"
import type {
  LayoutStyle,
  MeasureFn,
  Rect,
  StyleProp,
  VisualStyle,
} from "../contracts"
import {
  allocateChild,
  attachRnLayout,
  detachRnLayout,
  measureWidget,
  queueAllocate,
  queueResize,
  type Gtk,
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
  getStoredOffset,
  getStoredRect,
  setStoredRect,
} from "./rect-store"

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

export type LayoutChildOptions = {
  style: StyleProp | undefined
  onLayout: ((event: LayoutEvent) => void) | undefined
  measure?: MeasureFn
  // Leaves with intrinsic GTK sizes (Entry, Switch, Spinner) measure their
  // own widget so Yoga reserves exactly what the theme will draw.
  measureFromWidget?: boolean
  extraLayout?: LayoutStyle
}

export type LayoutChild = {
  host: HostNode
  node: LayoutNode
  flat: ReturnType<typeof StyleSheet.flatten>
  visual: VisualStyle
  cssClass: string | null
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

  useLayoutEffect(() => {
    const parent = host.node
    // The reconciler has already attached our widget in JSX order, so its
    // sibling position is the correct Yoga index — this keeps the shadow tree
    // ordered even for mid-list mounts (conditional children, list inserts).
    const widget = widgetRef.current
    const parentWidget = host.widgetRef.current
    let index = parent.children.length
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
      // A commit does not imply a change. The engine filters unchanged nodes
      // out of the walk, EXCEPT nodes carrying a measure function — every
      // Text leaf, every intrinsic widget — which it must still visit. Those
      // then arrive here with the rect they already have, and queueing an
      // allocation for them makes GTK re-allocate and re-snapshot the whole
      // container for nothing.
      //
      // The cost of that is not academic: it scales with children × painted
      // area. Measured on a 500-row list, maximized, windowSize 11 — 801
      // live nodes — the frame average was 40.4 ms against 15.7 ms windowed,
      // while neither 777 nodes in a small window nor 205 nodes maximized
      // cost anything. Only the product hurts, and this is where we inflate
      // the first factor.
      if (
        previous &&
        previous.x === rect.x &&
        previous.y === rect.y &&
        previous.width === rect.width &&
        previous.height === rect.height
      ) {
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
      node.setCommit(null)
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
        const rect = node.getRect()
        return Math.round(
          (orientation === "horizontal" ? rect?.width : rect?.height) ?? 0,
        )
      },
      allocate: (width, height) => {
        const start = perfEnabled ? perfNow() : 0
        perfAllocDepth += 1
        optionsRef.current?.beforeAllocate?.(width, height)
        let child = widget.getFirstChild()
        let children = 0
        while (child) {
          const rect = getStoredRect(child)
          if (rect) {
            const offset = getStoredOffset(child)
            allocateChild(
              child,
              rect.x + offset.dx,
              rect.y + offset.dy,
              rect.width,
              rect.height,
            )
            children += 1
          }
          child = child.getNextSibling()
        }
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
      detachRnLayout(widget)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
