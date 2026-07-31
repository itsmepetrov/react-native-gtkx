// WORKAROUND: the gtkx tutorial's toasts (task-list.tsx / task-row.tsx /
// dialogs.tsx's "moved to Trash, Undo" feedback) go through
// `@gtkx/components/adw`'s `ToastProvider`/`useToast` — a package this
// repository does not depend on (react-native-gtkx pins gtkx rc.2, and
// @gtkx/components is not among its dependencies; see
// .claude/epics/tasks-app/updates/007/progress.md and
// docs/research/navigation-extensibility.md, "toasts" in Still open).
// react-native-gtkx itself has no toast primitive of its own either — this
// is app-level code, not a library fix (a context provider around a single
// widget ref is not the "small, clean" kind of addition the platform layer
// tasks in this epic were).
//
// This is the smallest local stand-in: a ref to the AdwToastOverlay AND
// nothing else — `Adw.Toast` (react-native-gtkx/adw's `Adw` namespace) is
// already a complete, real object, so there is no missing primitive here,
// only missing plumbing to reach the overlay from deep in the tree without
// prop-drilling it.
import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from "react"
import { Adw } from "react-native-gtkx/adw"

type ToastOptions = {
  title: string
  buttonLabel?: string
  onButtonClicked?: () => void
}

type ToastApi = {
  show: (options: ToastOptions) => void
}

type ToastOverlayRef = RefObject<Adw.ToastOverlay | null>

const ToastContext = createContext<ToastOverlayRef | null>(null)

export const ToastProvider = ({
  overlayRef,
  children,
}: {
  overlayRef: ToastOverlayRef
  children: ReactNode
}) => (
  <ToastContext.Provider value={overlayRef}>{children}</ToastContext.Provider>
)

export const useToast = (): ToastApi => {
  const overlayRef = useContext(ToastContext)
  return {
    show: ({ title, buttonLabel, onButtonClicked }) => {
      const overlay = overlayRef?.current
      if (!overlay) {
        return
      }
      const toast = Adw.Toast.new(title)
      if (buttonLabel) {
        toast.setButtonLabel(buttonLabel)
      }
      if (onButtonClicked) {
        toast.connect("button-clicked", onButtonClicked)
      }
      overlay.addToast(toast)
    },
  }
}
