import { useLayoutEffect, useState, type RefObject } from "react"
import {
  allocateChild,
  attachRnLayout,
  detachRnLayout,
  measureWidget,
  queueAllocate,
  queueResize,
  type Gtk,
} from "../gtkx-bridge/index.js"
import type { LayoutNode } from "../layout/index.js"
import { splitStyle, StyleSheet } from "../style/index.js"
import { defaultCssRegistry } from "../style/registry.gtkx.js"
import type {
  LayoutStyle,
  MeasureFn,
  Rect,
  StyleProp,
  VisualStyle,
} from "../contracts.js"
import { useHostNode, type HostNode } from "./host-node.js"
import { getStoredOffset, getStoredRect, setStoredRect } from "./rect-store.js"

export type LayoutEvent = {
  nativeEvent: {
    layout: { x: number; y: number; width: number; height: number }
  }
}

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
      setStoredRect(widget, rect)
      if (
        !previous ||
        previous.width !== rect.width ||
        previous.height !== rect.height
      ) {
        // A size change invalidates this widget's cached measure (nested
        // managers, ScrolledWindow ranges) and re-allocates the ancestors.
        queueResize(widget)
      } else {
        // Pure move: the parent just needs another allocation pass. GTK
        // dedupes queued allocates, so per-child calls batch into one.
        queueAllocate(parentWidget)
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
      const natural = measureWidget(widget, "horizontal").natural
      const used =
        widthMode === "undefined"
          ? natural
          : Math.min(natural, Math.max(1, Math.floor(width)))
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

// Containers (Root, View, Animated.View, ScrollView content) drive their GTK
// side with an RnGtkxLayout: measure() reports the engine rect of `node`
// (minimum == natural — GTK minimums of children never leak upward), and
// allocate() places every child widget at exactly its stored engine rect
// plus the Animated offset.
export const useRnContainer = (
  widgetRef: RefObject<Gtk.Widget | null>,
  node: LayoutNode,
): void => {
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    attachRnLayout(widget, {
      measure: (orientation) => {
        const rect = node.getRect()
        return Math.round(
          (orientation === "horizontal" ? rect?.width : rect?.height) ?? 0,
        )
      },
      allocate: () => {
        let child = widget.getFirstChild()
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
          }
          child = child.getNextSibling()
        }
      },
    })
    return () => {
      detachRnLayout(widget)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
