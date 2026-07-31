// Window-scoped shortcuts, handed to AppRegistry's `windowControllers`
// (src/index.tsx). This renders OUTSIDE the app's own tree — it is a prop
// of the window AppRegistry builds — which is exactly why the store had to
// stop being a React context (see src/store.ts's header). The hook still
// works here because the store is module-level; a context would not have.
//
// Escape is deliberately conditional. When nothing is open and search is
// off it stays unbound (Gtk.NeverTrigger), so the collapsed split view
// keeps its own Escape-goes-back-to-the-sidebar behaviour — a global
// shortcut would otherwise swallow it and the narrow-window back gesture
// documented in the README would quietly stop working.
import type { ReactElement } from "react"
import { Gtk, GtkShortcut, GtkShortcutController } from "react-native-gtkx/gtk"
import { useStore } from "../store"

const shortcut = (
  accelerator: string,
  run: () => void,
  enabled: boolean,
): ReactElement => (
  <GtkShortcut
    trigger={
      enabled
        ? Gtk.ShortcutTrigger.parseString(accelerator)
        : Gtk.NeverTrigger.get()
    }
    action={Gtk.CallbackAction.new(() => {
      run()
      return true
    })}
  />
)

export const AppShortcuts = () => {
  const { selectedTaskId, searchMode, openTask, setSearchMode, moveToTrash } =
    useStore()

  const escape = (): void => {
    if (selectedTaskId !== null) {
      openTask(null)
      return
    }
    setSearchMode(false)
  }

  return (
    <GtkShortcutController
      scope={Gtk.ShortcutScope.GLOBAL}
      shortcuts={
        <>
          {shortcut("<Control>f", () => setSearchMode(!searchMode), true)}
          {shortcut("Escape", escape, selectedTaskId !== null || searchMode)}
          {shortcut(
            "Delete",
            () => {
              if (selectedTaskId !== null) {
                moveToTrash(selectedTaskId)
              }
            },
            selectedTaskId !== null,
          )}
        </>
      }
    />
  )
}
