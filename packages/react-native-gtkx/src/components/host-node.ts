import { createContext, useContext, type RefObject } from "react"
import type { Gtk } from "../gtkx-bridge/index"
import type { LayoutEngine, LayoutNode } from "../layout/index"

// One per mounted container (Root or View): children register their layout
// nodes here and commit rects into the store read by the parent's
// RnGtkxLayout allocate().
export type HostNode = {
  engine: LayoutEngine
  node: LayoutNode
  widgetRef: RefObject<Gtk.Box | null>
}

export const HostNodeContext = createContext<HostNode | null>(null)

export const useHostNode = (): HostNode => {
  const host = useContext(HostNodeContext)
  if (host === null) {
    throw new Error(
      "react-native-gtkx components must be rendered inside AppRegistry.runApplication() or a <Root>",
    )
  }
  return host
}
