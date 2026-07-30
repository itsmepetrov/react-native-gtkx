import { useLayoutEffect, useRef, type ReactNode } from "react"
import { StyleSheet } from "../style/index"
import type { PointerEventsValue, StyleProp } from "../contracts"
import {
  getViewBoxComponent,
  GtkBox,
  setBoxPassthrough,
  type Gtk,
} from "../gtkx/bridge/index"
import { HostNodeContext } from "./host-node"
import {
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child"

export type ViewProps = {
  style?: StyleProp
  // RN pointerEvents; the prop wins over style.pointerEvents (RN 0.71+).
  pointerEvents?: PointerEventsValue
  onLayout?: (event: LayoutEvent) => void
  children?: ReactNode
  testID?: string
}

// Every View is a GtkBox subclass (RnGtkxViewBox) driven by RnGtkxLayout:
// Yoga computes the children's rects, the manager's allocate() applies
// them. Visual styles arrive as a GTK CSS class produced by the style
// system. pointerEvents maps onto GTK picking:
// - none: can-target=false — GTK skips the widget WITHOUT descending, the
//   whole subtree is transparent (exact RN semantics);
// - box-none: the subclass' contains() fails for this widget (see
//   view-box.ts) — the box is never the pick target while children stay
//   pickable, and toggling never remounts the subtree;
// - box-only: direct children (and thus their subtrees) get
//   can-target=false; restored when the mode changes. Nesting another
//   pointerEvents INSIDE a box-only view is not supported (the restore
//   pass cannot know about it).
export const View = ({
  style,
  pointerEvents,
  onLayout,
  children,
  testID,
}: ViewProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)
  const { host, node, cssClass } = useLayoutChild(widgetRef, {
    style,
    onLayout,
  })
  useRnContainer(widgetRef, node)

  const mode: PointerEventsValue =
    pointerEvents ?? StyleSheet.flatten(style)?.pointerEvents ?? "auto"

  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    widget.setCanTarget(mode !== "none")
    setBoxPassthrough(widget, mode === "box-none")
  }, [mode])

  // box-only walks the current children every commit (the set changes with
  // renders) and restores once when the mode moves away.
  const wasBoxOnly = useRef(false)
  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const boxOnly = mode === "box-only"
    if (boxOnly || wasBoxOnly.current) {
      let child = widget.getFirstChild()
      while (child) {
        child.setCanTarget(!boxOnly)
        child = child.getNextSibling()
      }
    }
    wasBoxOnly.current = boxOnly
  })

  const ViewBox = getViewBoxComponent() as typeof GtkBox
  return (
    <ViewBox
      ref={widgetRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : []}
    >
      <HostNodeContext.Provider
        value={{ engine: host.engine, node, widgetRef }}
      >
        {children}
      </HostNodeContext.Provider>
    </ViewBox>
  )
}

// RN parity aliases (no notches or status bars on the Linux desktop).
export const SafeAreaView = View

export const StatusBar = (): null => null
