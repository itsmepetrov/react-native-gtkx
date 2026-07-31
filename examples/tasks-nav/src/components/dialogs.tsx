// Every Adw.Dialog this app can present, switched on one store field.
// Mounted as a SIBLING of the navigator (see src/app.tsx): an Adw.Dialog
// presents itself onto the window rather than being laid out where it sits,
// so it deliberately has no place inside a screen's body.
import { useStore } from "../store"
import { About } from "./about"
import { DeleteConfirmation } from "./delete-confirmation"
import { Preferences } from "./preferences"
import { Shortcuts } from "./shortcuts"

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
    case "delete-task":
      return <DeleteConfirmation />
    case "none":
      return null
  }
}
