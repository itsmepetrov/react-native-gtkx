// The window's and the application's actions, plus the global shortcuts,
// declared INSIDE the app.
//
// This is the file the whole thing turns on. These used to be
// `AppRegistry.runApplication`'s `applicationActions`/`windowActions`/
// `windowControllers` options in src/index.tsx, which render as siblings of
// the app tree — no provider of the app's is above them, so `win.new` could
// not read a React context store and the store had to be module-level to be
// reachable at all. Rendered here, under <StoreProvider> (src/app.tsx), the
// actions call the very same `useStore()` every screen calls.
//
// The accelerators stay in src/index.tsx: `actionAccels` is a flat
// name→keys table with nothing to read from the tree.
import type { ReactNode } from "react"
import {
  ApplicationActions,
  GLib,
  GSimpleAction,
  WindowActions,
  WindowControllers,
} from "react-native-gtkx/gtk"
import { addTargetListId, parseRoute } from "../selectors"
import { useStore } from "../store"
import { AppShortcuts } from "./app-shortcuts"

// APPLICATION-level actions, not window-level: these are what a
// Gio.Notification's buttons target (src/notifications.ts), and a
// notification outlives any particular window — it can still be sitting in
// GNOME's notification list after the window is gone. `win.*` would stop
// working at that point; `app.*` does not.
const NotificationActions = (): ReactNode => {
  const { tasks, toggleDone, openTask } = useStore()

  return (
    <ApplicationActions>
      <GSimpleAction
        name="complete-task"
        parameterType={GLib.VariantType.new("s")}
        onActivate={(parameter) => {
          if (!parameter) {
            return
          }
          const id = parameter.getString()[0]
          const task = tasks.find((candidate) => candidate.id === id)
          // toggleDone, so guard on the current state: activating "Mark
          // Complete" twice (a stale banner, say) must not reopen the task.
          if (task && !task.done) {
            toggleDone(task.id)
          }
        }}
      />
      <GSimpleAction
        name="open-task"
        parameterType={GLib.VariantType.new("s")}
        onActivate={(parameter) => {
          if (parameter) {
            // No navigation needed: the content screen renders the open
            // task's editor from `selectedTaskId` alone, whichever sidebar
            // route happens to be focused (see screens/content-screen.tsx).
            openTask(parameter.getString()[0])
          }
        }}
      />
    </ApplicationActions>
  )
}

// window-level actions: what the content HeaderBar's "New Task" button
// (actionName="win.new") and the overflow menu target.
const MenuActions = (): ReactNode => {
  const { activeRoute, lists, addTask, openTask, showDialog } = useStore()

  return (
    <WindowActions>
      <GSimpleAction
        name="new"
        onActivate={() => {
          // Where a new task lands is the SAME rule the "Add a task…" row
          // uses (selectors.ts): the current list, or the first one when a
          // smart view is selected. Which list is current has to come out of
          // navigation state, since the sidebar owns the selection — read
          // from the store's own record of the focused route instead of
          // duplicating react-navigation's state out here.
          const listId = addTargetListId(parseRoute(activeRoute), lists)
          if (!listId) {
            return
          }
          const task = addTask(listId, "New Task")
          if (task) {
            openTask(task.id)
          }
        }}
      />
      <GSimpleAction
        name="preferences"
        onActivate={() => showDialog("preferences")}
      />
      <GSimpleAction
        name="shortcuts"
        onActivate={() => showDialog("shortcuts")}
      />
      <GSimpleAction
        name="about"
        onActivate={() => showDialog("about")}
      />
    </WindowActions>
  )
}

export const WindowChrome = (): ReactNode => (
  <>
    <NotificationActions />
    <MenuActions />
    <WindowControllers>
      <AppShortcuts />
    </WindowControllers>
  </>
)
