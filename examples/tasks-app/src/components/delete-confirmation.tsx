// Permanently deletes a task already in the trash — ported from the gtkx
// tutorial (examples/tutorial/src/components/delete-confirmation.tsx).
import { Adw, AdwAlertDialog } from "react-native-gtkx/adw"
import { useStore } from "../store/index"

export const DeleteConfirmation = () => {
  const taskToDelete = useStore((state) => state.taskToDelete)
  const tasks = useStore((state) => state.tasks)
  const deleteForever = useStore((state) => state.deleteForever)
  const askDeleteTask = useStore((state) => state.askDeleteTask)
  const title = tasks.find((task) => task.id === taskToDelete)?.title ?? ""

  return (
    <AdwAlertDialog
      heading="Delete Task?"
      body={`"${title}" will be permanently deleted. This cannot be undone.`}
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
