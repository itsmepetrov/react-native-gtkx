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
// The ONE difference from tasks-app: the overlay is held in a module-level
// variable rather than a React context. tasks-app can use a context because
// everything that raises a toast is inside its tree; here the Delete
// shortcut lives in `AppShortcuts`, which `AppRegistry.runApplication`
// mounts as `windowControllers` — a SIBLING of the app's tree, not a
// descendant — so no provider of ours is above it and a context would
// simply be null there. That is the same constraint that made this
// example's store module-level (see src/store.ts), and it has an epic of
// its own (.claude/epics/window-actions-component); this file works within
// it rather than around it. `useToast()` is kept so call sites read
// identically to tasks-app's, exactly as `useStore()`/`getStore()` do.
import { Adw } from "react-native-gtkx/adw"

export type ToastOptions = {
  title: string
  buttonLabel?: string
  onButtonClicked?: () => void
}

let overlay: Adw.ToastOverlay | null = null

/** Callback ref for the single `AdwToastOverlay` (see src/app.tsx). React
 *  calls it with null on unmount, which is exactly the right thing to
 *  store: a toast raised after teardown is dropped instead of reaching a
 *  disposed widget. */
export const setToastOverlay = (value: Adw.ToastOverlay | null): void => {
  overlay = value
}

/** Raise a toast from anywhere, in the tree or out of it. A no-op before
 *  the overlay has mounted — feedback about an action is not worth a crash
 *  during startup. */
export const showToast = ({
  title,
  buttonLabel,
  onButtonClicked,
}: ToastOptions): void => {
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
}

// Bound once: components put this in effect dependency lists, and a fresh
// object per call would re-run them forever — the same discipline the
// store's `actions` object keeps.
const api = { show: showToast }

export const useToast = (): { show: (options: ToastOptions) => void } => api
