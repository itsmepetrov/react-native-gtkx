// Every Adw.Dialog this app can present, switched on one store field.
// Mounted as a SIBLING of the navigator (see src/app.tsx): an Adw.Dialog
// presents itself onto the window rather than being laid out where it sits,
// so it deliberately has no place inside a screen's body.
import { getStore, useStore } from "../store"
import { showToast } from "../toast"
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
 * A plain function rather than a hook, because the Delete key reaches it
 * from `AppShortcuts` — mounted outside the app's tree as
 * `windowControllers`, where no hook of ours can run (see src/toast.ts).
 */
export const requestDeleteTask = (task: Task): void => {
  const store = getStore()
  if (task.deleted) {
    store.askDeleteTask(task.id)
    return
  }
  store.moveToTrash(task.id)
  showToast({
    title: `“${task.title}” moved to Trash`,
    buttonLabel: "Undo",
    onButtonClicked: () => getStore().restore(task.id),
  })
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
