import { useState, type ReactNode } from "react"
import {
  createPortal,
  Gtk,
  GtkScrolledWindow,
  GtkWindow,
  useApplication,
  useParentWindow,
} from "../gtkx-bridge/index.js"
import { Root } from "./root.js"
import { useGtkWindowSize } from "./use-window-size.js"

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

// RN Modal → a modal GtkWindow portaled onto the application, transient for
// the window that rendered it. Visibility is fully controlled by the prop:
// the close request is reported and swallowed.
export const Modal = ({
  visible = false,
  onRequestClose,
  title = "",
  width = 480,
  height = 400,
  children,
}: ModalProps) => {
  const application = useApplication()
  const parentWindow = useParentWindow()
  const [window, setWindow] = useState<Gtk.Window | null>(null)
  const viewport = useGtkWindowSize(window, { width, height })

  if (!visible) {
    return null
  }

  return createPortal(
    <GtkWindow
      ref={setWindow}
      title={title}
      modal
      transientFor={parentWindow ?? undefined}
      defaultWidth={width}
      defaultHeight={height}
      onCloseRequest={() => {
        onRequestClose?.()
        return true
      }}
    >
      <GtkScrolledWindow
        hscrollbarPolicy={Gtk.PolicyType.EXTERNAL}
        vscrollbarPolicy={Gtk.PolicyType.EXTERNAL}
      >
        <Root
          width={viewport.width}
          height={viewport.height}
        >
          {children}
        </Root>
      </GtkScrolledWindow>
    </GtkWindow>,
    application,
  )
}
