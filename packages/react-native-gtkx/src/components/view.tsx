import { useRef, type ReactNode } from "react"
import { GtkBox, type Gtk } from "../gtkx-bridge/index"
import type { StyleProp } from "../contracts"
import { HostNodeContext } from "./host-node"
import {
  useLayoutChild,
  useRnContainer,
  type LayoutEvent,
} from "./use-layout-child"

export type ViewProps = {
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
  children?: ReactNode
  testID?: string
}

// Every View is a GtkBox driven by RnGtkxLayout: Yoga computes the children's
// rects, the manager's allocate() applies them. Visual styles arrive as a GTK
// CSS class produced by the style system.
export const View = ({ style, onLayout, children, testID }: ViewProps) => {
  const widgetRef = useRef<Gtk.Box | null>(null)
  const { host, node, cssClass } = useLayoutChild(widgetRef, {
    style,
    onLayout,
  })
  useRnContainer(widgetRef, node)

  return (
    <GtkBox
      ref={widgetRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : []}
    >
      <HostNodeContext.Provider
        value={{ engine: host.engine, node, widgetRef }}
      >
        {children}
      </HostNodeContext.Provider>
    </GtkBox>
  )
}

// RN parity aliases (no notches or status bars on the Linux desktop).
export const SafeAreaView = View

export const StatusBar = (): null => null
