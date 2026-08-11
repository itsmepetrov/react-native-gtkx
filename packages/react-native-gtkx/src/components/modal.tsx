import { type ReactNode } from "react"
import { GtkWindow } from "../gtkx/bridge/index"
import { Root } from "./root"

export type ModalProps = {
  visible?: boolean
  onRequestClose?: () => void
  title?: string
  // Desktop mapping: RN modals become modal windows; transparent/animationType
  // have no GTK equivalent and are accepted as no-ops for API parity.
  transparent?: boolean
  animationType?: "none" | "slide" | "fade"
  width?: number
  height?: number
  children?: ReactNode
}

// RN Modal → a GtkWindow with a regular RN tree inside. Through gtkx 1.0
// this used to wrap the window in our own `createPortal(..., application)`
// and pass an explicit `transientFor` read via `useParentWindow()`. Neither
// is needed any more: gtkx 1.0's own GtkWindow JSX component is
// createWindowComponent(createElementComponent("GtkWindow"))
// (node_modules/.gtkx/jsx/gtk/gtk.js), which already composes
// createPortaledComponent (self-portals to @gtkx/react's rootElement,
// unconditionally, regardless of where it is rendered in the tree) and
// withDefaultTransientFor (defaults transientFor from ParentWindowContext —
// the exact context useParentWindow() read — whenever the prop is left
// undefined). Removing our own portal/transientFor was probed both ways
// (gallery's Modal section, before/after: same position, same blocked
// parent, same close/reopen behavior) before landing — see 003-notes.md.
export const Modal = ({
  visible = false,
  onRequestClose,
  title = "",
  width = 480,
  height = 400,
  children,
}: ModalProps) => {
  if (!visible) {
    return null
  }

  return (
    <GtkWindow
      title={title}
      modal
      defaultWidth={width}
      defaultHeight={height}
      onCloseRequest={() => {
        onRequestClose?.()
        return true
      }}
    >
      <Root
        width={width}
        height={height}
        followAllocation
      >
        {children}
      </Root>
    </GtkWindow>
  )
}
