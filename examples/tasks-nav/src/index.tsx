import { AppRegistry } from "react-native"
import { GLib, GSimpleAction } from "react-native-gtkx/gtk"
import { AppShortcuts } from "./components/app-shortcuts"
import { App } from "./app"
import { addTargetListId, parseRoute } from "./selectors"
import { getStore } from "./store"

AppRegistry.registerComponent("tasks-nav", () => App)

// chrome: "content" — the sidebar navigator's own HeaderBars become the
// window chrome (see docs/api.md and docs/platform-layer.md); the default
// "system" chrome would double up a titlebar on top of them.
//
// windowActions/windowControllers/actionAccels are rendered as props of the
// window AppRegistry builds — OUTSIDE the app's own tree, which is why the
// store they reach through `getStore()` had to be module-level rather than
// a React context (see src/store.ts). They are what the HeaderBar's
// `actionName="win.new"` button, the overflow menu and the accelerators all
// target, so the button and the shortcut can never drift apart.
AppRegistry.runApplication("tasks-nav", {
  title: "Tasks (nav)",
  width: 900,
  height: 600,
  chrome: "content",
  // APPLICATION-level actions, not window-level: these are what a
  // Gio.Notification's buttons target (src/notifications.ts), and a
  // notification outlives any particular window — it can still be sitting
  // in GNOME's notification list after the window is gone. `win.*` would
  // stop working at that point; `app.*` does not.
  applicationActions: (
    <>
      <GSimpleAction
        name="complete-task"
        parameterType={GLib.VariantType.new("s")}
        onActivate={(parameter) => {
          if (!parameter) {
            return
          }
          const store = getStore()
          const id = parameter.getString()[0]
          const task = store.tasks.find((candidate) => candidate.id === id)
          // toggleDone, so guard on the current state: activating "Mark
          // Complete" twice (a stale banner, say) must not reopen the task.
          if (task && !task.done) {
            store.toggleDone(task.id)
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
            getStore().openTask(parameter.getString()[0])
          }
        }}
      />
    </>
  ),
  actionAccels: [
    { detailedActionName: "win.new", accels: ["<Control>n"] },
    { detailedActionName: "win.preferences", accels: ["<Control>comma"] },
    { detailedActionName: "win.shortcuts", accels: ["<Control>question"] },
  ],
  windowActions: (
    <>
      <GSimpleAction
        name="new"
        onActivate={() => {
          const store = getStore()
          // Where a new task lands is the SAME rule the "Add a task…" row
          // uses (selectors.ts): the current list, or the first one when a
          // smart view is selected. Which list is current has to come out
          // of navigation state, since the sidebar owns the selection —
          // read from the store's own record of the focused route instead
          // of duplicating react-navigation's state out here.
          const listId = addTargetListId(
            parseRoute(store.activeRoute),
            store.lists,
          )
          if (!listId) {
            return
          }
          const task = store.addTask(listId, "New Task")
          if (task) {
            store.openTask(task.id)
          }
        }}
      />
      <GSimpleAction
        name="preferences"
        onActivate={() => getStore().showDialog("preferences")}
      />
      <GSimpleAction
        name="shortcuts"
        onActivate={() => getStore().showDialog("shortcuts")}
      />
      <GSimpleAction
        name="about"
        onActivate={() => getStore().showDialog("about")}
      />
    </>
  ),
  windowControllers: <AppShortcuts />,
})
