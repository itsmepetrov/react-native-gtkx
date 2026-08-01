// The window's and application's actions, declared INSIDE the app tree.
//
// These used to be `AppRegistry.runApplication`'s `applicationActions` /
// `windowActions` / `windowControllers` options (src/index.tsx). Options
// render as siblings of the app, so nothing the app provides is above them —
// which cost this app a real, silent bug: `AppShortcuts` calls
// `useRequestDeleteTask()`, which calls `useToast()`, which reads a React
// context provided by `<ToastProvider>` inside `Window`. Out of tree that
// context was always null, so pressing Delete moved the task to Trash and
// the "moved to Trash — Undo" toast simply never appeared. Rendered here,
// below the provider, it does.
//
// Zustand hid the other half of the problem (it is module-global, so
// `useStore.getState()` worked from anywhere) — see examples/tasks-nav,
// which uses a React context store and could not work around it at all.
import type { ReactNode } from "react"
import {
  ApplicationActions,
  GLib,
  GSimpleAction,
  WindowActions,
  WindowControllers,
} from "react-native-gtkx/gtk"
import { useStore } from "../store/index"
import { AppShortcuts } from "./app-shortcuts"

// app-level actions: what a Gio.Notification action button targets (see
// src/notifications.ts) — app.complete-task/app.open-task must be reachable
// independently of any window content being mounted.
const NotificationActions = (): ReactNode => (
  <ApplicationActions>
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
  </ApplicationActions>
)

// window-level actions: what the HeaderBar's "New Task" button
// (actionName="win.new") and the overflow menu (win.preferences/
// win.shortcuts/win.about) target. The accelerators for them stay in
// src/index.tsx's actionAccels — a flat name→keys table, with nothing to
// read from the tree.
const MenuActions = (): ReactNode => (
  <WindowActions>
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
  </WindowActions>
)

export const WindowChrome = (): ReactNode => (
  <>
    <NotificationActions />
    <MenuActions />
    <WindowControllers>
      <AppShortcuts />
    </WindowControllers>
  </>
)
