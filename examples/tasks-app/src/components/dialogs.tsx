// ported from the gtkx tutorial (examples/tutorial/src/components/dialogs.tsx).
// useToast comes from the local workaround in src/toast.tsx, not
// @gtkx/components/adw — see that file for why.
import { useStore } from "../store/index"
import { useToast } from "../toast"
import type { Task } from "../types"
import { About } from "./about"
import { DeleteConfirmation } from "./delete-confirmation"
import { NewListDialog } from "./new-list-dialog"
import { Preferences } from "./preferences"
import { Shortcuts } from "./shortcuts"

export const useRequestDeleteTask = (): ((task: Task) => void) => {
  const { show } = useToast()

  return (task) => {
    const { moveToTrash, restore, askDeleteTask, selectedTaskId, closeTask } =
      useStore.getState()
    if (task.deleted) {
      askDeleteTask(task.id)
      return
    }
    moveToTrash(task.id)
    if (selectedTaskId === task.id) {
      closeTask()
    }
    show({
      title: `"${task.title}" moved to Trash`,
      buttonLabel: "Undo",
      onButtonClicked: () => restore(task.id),
    })
  }
}

export const Dialogs = () => {
  const dialog = useStore((state) => state.dialog)
  const showDialog = useStore((state) => state.showDialog)
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
