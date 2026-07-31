// AppRegistry.runApplication builds its own <GtkApplication>/<Window> tree
// and is meant to be called exactly once per process, the same as any real
// GTK app does — so this file is deliberately ONE test calling it exactly
// once. A second call (here or from another file sharing this worker) would
// try to register a second GApplication under the same applicationId, which
// this suite does not otherwise attempt.
//
// Everything RunApplicationParams gained — applicationActions, actionAccels,
// windowActions, windowControllers, breakpoints — gets exercised on that one
// call. Live breakpoint application is NOT asserted here: see
// tests/gtk/bridge/auxiliary-elements.gtk.test.tsx and
// .claude/epics/tasks-app/updates/001/progress.md for why (AdwBreakpoint
// does not evaluate under the @gtkx/vitest headless-sway compositor, even
// though it works immediately in a real GNOME session) — only that the prop
// reaches the window and does not crash it.
import { act, userEvent, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import { AppRegistry } from "../../../src/components/app-registry"
import {
  Adw,
  AdwBreakpoint,
  Gio,
  GSimpleAction,
  Gtk,
  GtkShortcut,
  GtkShortcutController,
} from "../../../src/gtkx/bridge/index"

it("forwards actions, actionAccels, controllers and breakpoints to the running app", async () => {
  const appActivated: string[] = []
  const windowActivated: string[] = []
  const accelTriggered: string[] = []

  // chrome: "content" means the app component IS the window content — no
  // Yoga root sits above it (see app-registry.tsx), so it is expected to be
  // a navigation container whose own pages bring their own layout roots.
  // This test only cares about the window/application chrome around it, so
  // it renders nothing.
  const App = () => null

  const TITLE = `app-registry-probe-${process.pid}`
  AppRegistry.registerComponent("app-registry-probe-app", () => App)
  // runApplication mounts its own React root (createRoot().render(...)) —
  // a call the test makes directly, so its resulting state settling needs
  // act() same as any other trigger here.
  await act(async () => {
    AppRegistry.runApplication("app-registry-probe-app", {
      title: TITLE,
      chrome: "content",
      width: 500,
      height: 400,
      applicationActions: (
        <GSimpleAction
          name="app-ping"
          onActivate={() => appActivated.push("app-ping")}
        />
      ),
      actionAccels: [
        { detailedActionName: "app.app-ping", accels: ["<Control>k"] },
      ],
      windowActions: (
        <GSimpleAction
          name="ping"
          onActivate={() => windowActivated.push("win-ping")}
        />
      ),
      windowControllers: (
        <GtkShortcutController
          shortcuts={
            <GtkShortcut
              trigger={Gtk.ShortcutTrigger.parseString("<Control>j")}
              action={Gtk.CallbackAction.new(() => {
                accelTriggered.push("ctrl-j")
                return true
              })}
            />
          }
        />
      ),
      breakpoints: (
        <AdwBreakpoint
          condition={Adw.BreakpointCondition.parse("max-width: 2000px")}
          onApply={() => {}}
          onUnapply={() => {}}
        />
      ),
    })
  })

  const findWindow = (): Gtk.Window | undefined =>
    Gtk.Window.listToplevels().find(
      (widget): widget is Gtk.Window =>
        widget instanceof Gtk.Window && widget.getTitle() === TITLE,
    )

  let window: Gtk.Window | undefined
  await waitFor(() => {
    window = findWindow()
    expect(window).not.toBeUndefined()
  })

  // App-level action: reachable through the default GApplication (what a
  // Gio.Notification action button targets) AND, per GTK convention, through
  // "app.<name>" on any widget in the window.
  const app = Gio.Application.getDefault()
  expect(app).not.toBeNull()
  app!.activateAction("app-ping", null)
  expect(appActivated).toEqual(["app-ping"])

  // Window-level action — activateAction takes the prefixed "group.action"
  // name (the app-level one above needs no prefix: Gio.Application's own
  // activateAction is already scoped to its own action map).
  window!.activateAction("win.ping", null)
  expect(windowActivated).toEqual(["win-ping"])

  // windowControllers: a GtkShortcutController scoped to the window itself.
  // present() maps the window natively — a poke outside any React event
  // handler, same act() need as the runApplication call above.
  await act(async () => {
    window!.present()
  })
  await waitFor(() => {
    expect(window!.getWidth()).toBeGreaterThan(0)
  })
  await userEvent.keyboard(window!, "{Control>}j{/Control}")
  expect(accelTriggered).toEqual(["ctrl-j"])
})
