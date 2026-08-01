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
import { getStore, useStore } from "../store"
import { requestDeleteTask } from "./dialogs"

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
  const { selectedTaskId, searchMode, openTask, setSearchMode } = useStore()

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
              // Through the same helper the row's trash button uses, so the
              // keyboard path gets the undo toast too. `getStore()` rather
              // than the destructured state above: this controller is
              // mounted outside the app's tree, and the task has to be
              // looked up at press time regardless.
              const store = getStore()
              const task = store.tasks.find(
                (candidate) => candidate.id === store.selectedTaskId,
              )
              if (task) {
                requestDeleteTask(task)
              }
            },
            selectedTaskId !== null,
          )}
        </>
      }
    />
  )
}
