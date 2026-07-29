import { useRef, type ReactNode } from "react"
import { GtkFixed, type Gtk } from "../gtkx-bridge/index.js"
import type { StyleProp } from "../contracts.js"
import { HostNodeContext } from "./host-node.js"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child.js"

export type ViewProps = {
  style?: StyleProp
  onLayout?: (event: LayoutEvent) => void
  children?: ReactNode
  testID?: string
}

// Every View is a GtkFixed: Yoga computes the children's rects, the commit
// hooks move the child widgets inside it. Visual styles arrive as a GTK CSS
// class produced by the style system.
export const View = ({ style, onLayout, children, testID }: ViewProps) => {
  const widgetRef = useRef<Gtk.Fixed | null>(null)
  const { host, node, cssClass } = useLayoutChild(widgetRef, {
    style,
    onLayout,
  })

  return (
    <GtkFixed
      ref={widgetRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : []}
    >
      <HostNodeContext.Provider
        value={{ engine: host.engine, node, widgetRef }}
      >
        {children}
      </HostNodeContext.Provider>
    </GtkFixed>
  )
}

// RN parity aliases (no notches or status bars on the Linux desktop).
export const SafeAreaView = View

export const StatusBar = (): null => null
