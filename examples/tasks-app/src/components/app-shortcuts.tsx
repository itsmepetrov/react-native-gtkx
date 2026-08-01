// Global window shortcuts — ported from the gtkx tutorial
// (examples/tutorial/src/components/app-shortcuts.tsx). Returns the
// GtkShortcutController element itself (not a wrapping component with its
// own chrome); window-chrome.tsx puts it inside <WindowControllers>, which
// attaches it to the window from where it sits in the tree. It used to go
// to AppRegistry's windowControllers option instead — out of tree, where
// useRequestDeleteTask's useToast() found no provider and the Delete
// shortcut's toast silently never appeared.
import type { ReactElement } from "react"
import { Gtk, GtkShortcut, GtkShortcutController } from "react-native-gtkx/gtk"
import { useStore } from "../store/index"
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
  const requestDeleteTask = useRequestDeleteTask()
  const selectedTaskId = useStore((state) => state.selectedTaskId)
  const closeTask = useStore((state) => state.closeTask)

  const toggleSearch = (): void => {
    const { searchMode, setSearchMode } = useStore.getState()
    setSearchMode(!searchMode)
  }

  const deleteSelected = (): void => {
    const { tasks, selectedTaskId: id } = useStore.getState()
    const task = tasks.find((candidate) => candidate.id === id)
    if (task) {
      requestDeleteTask(task)
    }
  }

  return (
    <GtkShortcutController
      scope={Gtk.ShortcutScope.GLOBAL}
      shortcuts={
        <>
          {shortcut("<Control>f", toggleSearch, true)}
          {shortcut("Escape", closeTask, selectedTaskId !== null)}
          {shortcut("Delete", deleteSelected, selectedTaskId !== null)}
        </>
      }
    />
  )
}
