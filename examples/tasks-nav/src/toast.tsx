// Toasts, over `AdwToastOverlay`.
//
// Same standing as examples/tasks-app's own `src/toast.tsx`, and for the
// same reason: the gtkx tutorial reaches for `@gtkx/components/adw`'s
// `ToastProvider`/`useToast`, a package this repository does not depend on,
// and react-native-gtkx has no toast primitive of its own. `Adw.Toast` and
// `AdwToastOverlay` are already complete — what is missing is only the
// plumbing to reach the overlay from deep in the tree, which is app-level
// code, not a platform gap.
//
// This was a module-level variable rather than a context until recently,
// and the reason was the same one that made this example's store
// module-level: anything mounted through `AppRegistry.runApplication`'s
// `windowControllers` is a SIBLING of the app's tree, so no provider of ours
// is above it and a context would read null there. `<WindowControllers>`
// (react-native-gtkx/gtk) put those declarations back inside the tree, so
// this is an ordinary context again — identical to tasks-app's.
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react"
import { Adw } from "react-native-gtkx/adw"

export type ToastOptions = {
  title: string
  buttonLabel?: string
  onButtonClicked?: () => void
}

type ToastApi = { show: (options: ToastOptions) => void }

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
  // Memoized on the ref alone (which never changes identity), so `show` is
  // stable: call sites put it in effect dependency lists, and a fresh object
  // per render would re-run them forever.
  return useMemo<ToastApi>(
    () => ({
      show: ({ title, buttonLabel, onButtonClicked }) => {
        // A no-op before the overlay has mounted — feedback about an action
        // is not worth a crash during startup.
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
    }),
    [overlayRef],
  )
}
