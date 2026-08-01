// The desktop reminder a due task raises — a real `Gio.Notification` handed
// to the `GtkApplication`, so it is the session's notification daemon that
// draws it, survives the window being unfocused, and stacks in GNOME's
// notification list like any other app's.
//
// The two action targets are what make it more than a banner: `app.*`
// actions, not `win.*`, because a notification outlives any particular
// window and its buttons must still work — see src/index.tsx, where both
// are registered as `applicationActions`.
import { Gio, GLib } from "react-native-gtkx/gtk"
import { formatDateTime } from "./format"
import type { Task } from "./types"

export const buildReminder = (task: Task): Gio.Notification => {
  const notification = Gio.Notification.new(task.title)
  notification.setBody(`Due ${formatDateTime(task.due)}`)
  notification.setPriority(Gio.NotificationPriority.HIGH)
  // Completing from the notification itself, without raising the window.
  notification.addButtonWithTarget(
    "Mark Complete",
    "app.complete-task",
    GLib.Variant.newString(task.id),
  )
  // Clicking the notification body opens that task's editor.
  notification.setDefaultActionAndTarget(
    "app.open-task",
    GLib.Variant.newString(task.id),
  )
  return notification
}
