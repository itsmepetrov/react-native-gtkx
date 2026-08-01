// Every Adw.Dialog this app can present, switched on one store field.
// Mounted as a SIBLING of the navigator (see src/app.tsx): an Adw.Dialog
// presents itself onto the window rather than being laid out where it sits,
// so it deliberately has no place inside a screen's body.
import { useCallback } from "react"
import { useStore } from "../store"
import { useToast } from "../toast"
import type { Task } from "../types"
import { About } from "./about"
import { DeleteConfirmation } from "./delete-confirmation"
import { NewListDialog } from "./new-list-dialog"
import { Preferences } from "./preferences"
import { Shortcuts } from "./shortcuts"

/**
 * Deleting a task, from wherever it is asked for.
 *
 * The two halves are deliberately asymmetric, the same way
 * examples/tasks-app's `useRequestDeleteTask` is. A task in Trash is
 * already deleted once, so deleting it again is irreversible and raises a
 * confirmation DIALOG. A live task is only moved to Trash, which is
 * reversible — so a modal there would be a question with an obvious answer,
 * and it gets an undoable TOAST instead. That is the GNOME pattern:
 * confirm what cannot be taken back, offer undo for what can.
 *
 * A hook, like tasks-app's own `useRequestDeleteTask`. It used to be a plain
 * function because the Delete key reached it from `AppShortcuts`, which
 * `windowControllers` mounted outside the app's tree where no hook of ours
 * could run; `<WindowControllers>` put that declaration back in the tree.
 */
export const useRequestDeleteTask = (): ((task: Task) => void) => {
  const { show } = useToast()
  const { askDeleteTask, moveToTrash, restore } = useStore()

  // Memoized: content-screen.tsx puts the result in an effect's dependency
  // list (the header it builds carries the delete button).
  return useCallback(
    (task: Task) => {
      if (task.deleted) {
        askDeleteTask(task.id)
        return
      }
      moveToTrash(task.id)
      show({
        title: `“${task.title}” moved to Trash`,
        buttonLabel: "Undo",
        onButtonClicked: () => restore(task.id),
      })
    },
    [show, askDeleteTask, moveToTrash, restore],
  )
}

export const Dialogs = () => {
  const { dialog, showDialog } = useStore()
  const close = () => showDialog("none")

  switch (dialog) {
    case "about":
      return <About onClose={close} />
    case "shortcuts":
      return <Shortcuts onClose={close} />
    case "preferences":
      return <Preferences onClose={close} />
    case "new-list":
      return <NewListDialog />
    case "delete-task":
      return <DeleteConfirmation />
    case "none":
      return null
  }
}
