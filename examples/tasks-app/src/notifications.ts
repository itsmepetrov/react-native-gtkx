// Builds a desktop reminder notification with an action button that routes
// back into the app — ported from the gtkx tutorial
// (examples/tutorial/src/notifications.ts). Gio and GLib both come from
// react-native-gtkx/gtk.
import { Gio, GLib } from "react-native-gtkx/gtk"
import { formatDateTime } from "./format"
import type { Task } from "./types"

export const buildReminder = (task: Task): Gio.Notification => {
  const notification = Gio.Notification.new(task.title)
  notification.setBody(`Due ${formatDateTime(task.due)}`)
  notification.setPriority(Gio.NotificationPriority.HIGH)
  notification.addButtonWithTarget(
    "Mark Complete",
    "app.complete-task",
    GLib.Variant.newString(task.id),
  )
  notification.setDefaultActionAndTarget(
    "app.open-task",
    GLib.Variant.newString(task.id),
  )
  return notification
}
