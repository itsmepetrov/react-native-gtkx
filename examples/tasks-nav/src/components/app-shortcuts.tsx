// Window-scoped shortcuts. Rendered inside <WindowControllers>
// (components/window-chrome.tsx), so this is an ordinary component of the
// app's tree that happens to attach its controller to the window — which is
// why `useStore()` below is just the React context every screen uses. It
// used to be handed to AppRegistry's `windowControllers` option instead,
// outside the tree, and that is what forced the store to be module-level
// (see src/store.tsx's header).
//
// Escape is deliberately conditional. When nothing is open and search is
// off it stays unbound (Gtk.NeverTrigger), so the collapsed split view
// keeps its own Escape-goes-back-to-the-sidebar behaviour — a global
// shortcut would otherwise swallow it and the narrow-window back gesture
// documented in the README would quietly stop working.
import type { ReactElement } from "react"
import { Gtk, GtkShortcut, GtkShortcutController } from "react-native-gtkx/gtk"
import { useStore } from "../store"
import { useRequestDeleteTask } from "./dialogs"

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
  const { selectedTaskId, searchMode, tasks, openTask, setSearchMode } =
    useStore()
  const requestDeleteTask = useRequestDeleteTask()

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
              // Through the same hook the row's trash button uses, so the
              // keyboard path gets the undo toast too — and it IS the same
              // hook now: this controller is a component of the app's tree
              // (window-chrome.tsx renders it inside <WindowControllers>),
              // not a prop of the window.
              const task = tasks.find(
                (candidate) => candidate.id === selectedTaskId,
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
