import { AppRegistry } from "react-native"
import { Adw, AdwBreakpoint } from "react-native-gtkx/adw"
import { GLib, GSimpleAction } from "react-native-gtkx/gtk"
import { AppShortcuts } from "./components/app-shortcuts"
import { App } from "./app"
import { useStore } from "./store/index"

AppRegistry.registerComponent("tasks-app", () => App)

// chrome: "content" — the window's own HeaderBars (inside the sidebar and
// content panes) become the titlebar; see docs/api.md and
// docs/platform-layer.md. breakpoints/actions/actionAccels/controllers all
// reach AppRegistry's own GtkApplication/AdwApplicationWindow
// (react-native-gtkx epic tasks-app #003).
AppRegistry.runApplication("tasks-app", {
  title: "Tasks",
  width: 900,
  height: 600,
  chrome: "content",
  breakpoints: (
    <AdwBreakpoint
      condition={Adw.BreakpointCondition.parse("max-width: 500sp")}
      onApply={() => useStore.getState().setCollapsed(true)}
      onUnapply={() => useStore.getState().setCollapsed(false)}
    />
  ),
  // app-level actions: what a Gio.Notification action button targets (see
  // src/notifications.ts) — app.complete-task/app.open-task must be
  // reachable independently of any window content being mounted.
  applicationActions: (
    <>
      <GSimpleAction
        name="complete-task"
        parameterType={GLib.VariantType.new("s")}
        onActivate={(parameter) => {
          if (parameter) {
            useStore.getState().setDone(parameter.getString()[0], true)
          }
        }}
      />
      <GSimpleAction
        name="open-task"
        parameterType={GLib.VariantType.new("s")}
        onActivate={(parameter) => {
          if (!parameter) {
            return
          }
          const { select, openTask } = useStore.getState()
          select({ kind: "smart", view: "all" })
          openTask(parameter.getString()[0])
        }}
      />
    </>
  ),
  actionAccels: [
    { detailedActionName: "win.new", accels: ["<Control>n"] },
    { detailedActionName: "win.preferences", accels: ["<Control>comma"] },
    { detailedActionName: "win.shortcuts", accels: ["<Control>question"] },
  ],
  // window-level actions: what the HeaderBar's "New Task" button
  // (actionName="win.new") and the overflow menu (win.preferences/
  // win.shortcuts/win.about) target.
  windowActions: (
    <>
      <GSimpleAction
        name="new"
        onActivate={() => {
          const { selection, lists, addTask, openTask } = useStore.getState()
          const listId =
            selection.kind === "list" ? selection.listId : (lists[0]?.id ?? "")
          const id = addTask(listId, "New Task")
          if (id) {
            openTask(id)
          }
        }}
      />
      <GSimpleAction
        name="preferences"
        onActivate={() => useStore.getState().showDialog("preferences")}
      />
      <GSimpleAction
        name="shortcuts"
        onActivate={() => useStore.getState().showDialog("shortcuts")}
      />
      <GSimpleAction
        name="about"
        onActivate={() => useStore.getState().showDialog("about")}
      />
    </>
  ),
  windowControllers: <AppShortcuts />,
})
