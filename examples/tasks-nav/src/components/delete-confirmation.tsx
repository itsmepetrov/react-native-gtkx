// Permanently deleting a task from Trash is the one destructive action
// here with no undo behind it, so it is the one that asks first. Moving a
// task TO Trash stays unconfirmed — Trash is the undo.
import { Adw, AdwAlertDialog } from "react-native-gtkx/adw"
import { useStore } from "../store"

export const DeleteConfirmation = () => {
  const { tasks, taskToDelete, deleteForever, askDeleteTask } = useStore()
  const title = tasks.find((task) => task.id === taskToDelete)?.title ?? ""

  return (
    <AdwAlertDialog
      heading="Delete Task?"
      body={`“${title}” will be permanently deleted. This cannot be undone.`}
      defaultResponse="cancel"
      closeResponse="cancel"
      responses={[
        { id: "cancel", label: "Cancel" },
        {
          id: "delete",
          label: "Delete",
          appearance: Adw.ResponseAppearance.DESTRUCTIVE,
        },
      ]}
      onResponse={(id) => {
        if (id === "delete" && taskToDelete !== null) {
          deleteForever(taskToDelete)
        }
        askDeleteTask(null)
      }}
    />
  )
}
