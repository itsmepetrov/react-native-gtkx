// Context handed down from <Svg> to every descendant: a ref to the root
// widget (so a leaf can call queueDraw without walking the GTK tree upward)
// plus a bound convenience wrapper. Mirrors HostNodeContext (host-node.ts)
// for the Yoga tree — same idea, separate tree, because SVG nodes carry no
// Yoga node at all (see svg.tsx).
import { createContext, useContext, type RefObject } from "react"
import type { Gtk } from "../../gtkx/bridge/index"

export type SvgRootContextValue = {
  rootRef: RefObject<Gtk.Widget | null>
  requestRedraw: () => void
}

export const SvgRootContext = createContext<SvgRootContextValue | null>(null)

export const useSvgRoot = (componentName: string): SvgRootContextValue => {
  const context = useContext(SvgRootContext)
  if (!context) {
    throw new Error(`<${componentName}> must be rendered inside <Svg>`)
  }
  return context
}
