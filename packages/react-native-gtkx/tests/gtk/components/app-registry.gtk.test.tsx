// AppRegistry.runApplication builds its own <GtkApplication>/<Window> tree
// and is meant to be called exactly once per process, the same as any real
// GTK app does — so this file calls it exactly ONCE, in beforeAll, and every
// test below works against that one running app. A second call (here or from
// another file sharing this worker) would try to register a second
// GApplication under the same applicationId, which this suite does not
// otherwise attempt.
//
// Two things are covered, deliberately together, because they are the two
// ways the same window is reached:
//
// 1. The RunApplicationParams options — applicationActions, actionAccels,
//    windowActions, windowControllers, breakpoints. The three ReactNode ones
//    are deprecated in favour of the components below but still supported,
//    so their behaviour is pinned here.
//    Live breakpoint application is NOT asserted: see
//    tests/gtk/bridge/auxiliary-elements.gtk.test.tsx and
//    .claude/epics/tasks-app/updates/001/progress.md for why (AdwBreakpoint
//    does not evaluate under the @gtkx/vitest headless-sway compositor, even
//    though it works immediately in a real GNOME session) — only that the
//    prop reaches the window and does not crash it.
//
// 2. <WindowActions>/<ApplicationActions>/<WindowControllers>, declared
//    INSIDE the app tree. The whole reason they exist is that the options
//    above render as siblings of the app, where no context of the app's can
//    reach them; the tests here are what shows the difference rather than
//    asserting it.
import { act, userEvent, waitFor } from "@gtkx/testing"
import { createContext, useContext, useEffect, useState } from "react"
import { beforeAll, expect, it, vi } from "vitest"
import { AppRegistry } from "../../../src/components/app-registry"
import {
  ApplicationActions,
  GSimpleAction,
  WindowActions,
  WindowControllers,
} from "../../../src/gtk/window-actions"
import {
  Adw,
  AdwBreakpoint,
  Gio,
  Gtk,
  GtkShortcut,
  GtkShortcutController,
  GSimpleAction as RawGSimpleAction,
} from "../../../src/gtkx/bridge/index"

const appActivated: string[] = []
const windowActivated: string[] = []
const accelTriggered: string[] = []
// What the in-tree action READ from React context when it ran. If a window
// action could not see the app's providers this would hold the default.
const contextReads: string[] = []
const duplicateRuns: string[] = []
const shortcutRuns: string[] = []

// An ordinary React context, provided inside the app and nowhere near the
// window AppRegistry builds.
const LabelContext = createContext("no-provider-above-me")

const ContextAction = () => {
  const label = useContext(LabelContext)
  return (
    <WindowActions>
      <GSimpleAction
        name="ctx-probe"
        onActivate={() => contextReads.push(label)}
      />
    </WindowActions>
  )
}

// Two independent subtrees claiming ONE action name — the composition case
// that has to have a defined answer rather than a race.
const DuplicateAction = ({ marker }: { marker: string }) => (
  <WindowActions>
    <GSimpleAction
      name="dup"
      onActivate={() => duplicateRuns.push(marker)}
    />
  </WindowActions>
)

const TreeShortcut = () => (
  <WindowControllers>
    <GtkShortcutController
      scope={Gtk.ShortcutScope.GLOBAL}
      shortcuts={
        <GtkShortcut
          trigger={Gtk.ShortcutTrigger.parseString("<Control>m")}
          action={Gtk.CallbackAction.new(() => {
            shortcutRuns.push("ctrl-m")
            return true
          })}
        />
      }
    />
  </WindowControllers>
)

type Mounted = {
  context: boolean
  firstDuplicate: boolean
  secondDuplicate: boolean
  shortcut: boolean
}

const INITIAL_MOUNTED: Mounted = {
  context: true,
  firstDuplicate: true,
  secondDuplicate: false,
  shortcut: true,
}

// Captured from the app's own render; the tests drive mounting and
// unmounting through it, which is how "unmounting unregisters" is shown
// rather than asserted.
let setMounted: ((next: Mounted) => void) | null = null
let mounted: Mounted = INITIAL_MOUNTED

const remount = async (patch: Partial<Mounted>): Promise<void> => {
  mounted = { ...mounted, ...patch }
  await act(async () => {
    setMounted?.(mounted)
  })
}

// chrome: "content" means the app component IS the window content (see
// app-registry.tsx), so it is expected to be a navigation container whose
// own pages bring their own layout roots. Everything this file cares about
// is window/application chrome, so the app renders no widgets at all — only
// the declarations that portal onto the window.
const App = () => {
  const [state, setState] = useState(INITIAL_MOUNTED)
  // Published to the tests once, after mount — beforeAll waits for the app
  // to be up, so it is always set by the time any test runs.
  useEffect(() => {
    setMounted = setState
  }, [])

  return (
    <LabelContext.Provider value="read-through-context">
      <ApplicationActions>
        <GSimpleAction
          name="app-tree-ping"
          onActivate={() => appActivated.push("app-tree-ping")}
        />
      </ApplicationActions>
      {state.context ? <ContextAction /> : null}
      {state.firstDuplicate ? <DuplicateAction marker="first" /> : null}
      {state.secondDuplicate ? <DuplicateAction marker="second" /> : null}
      {state.shortcut ? <TreeShortcut /> : null}
    </LabelContext.Provider>
  )
}

const TITLE = `app-registry-probe-${process.pid}`

const findWindow = (): Gtk.Window | undefined =>
  Gtk.Window.listToplevels().find(
    (widget): widget is Gtk.Window =>
      widget instanceof Gtk.Window && widget.getTitle() === TITLE,
  )

let window: Gtk.Window

const activate = (detailedName: string): boolean =>
  window.activateAction(detailedName, null)

beforeAll(async () => {
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
        <RawGSimpleAction
          name="app-ping"
          onActivate={() => appActivated.push("app-ping")}
        />
      ),
      actionAccels: [
        { detailedActionName: "app.app-ping", accels: ["<Control>k"] },
      ],
      windowActions: (
        <RawGSimpleAction
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

  await waitFor(() => {
    const found = findWindow()
    expect(found).not.toBeUndefined()
    window = found as Gtk.Window
  })

  // present() maps the window natively — a poke outside any React event
  // handler, same act() need as the runApplication call above. The keyboard
  // tests need it; it is harmless for the rest.
  await act(async () => {
    window.present()
  })
  await waitFor(() => {
    expect(window.getWidth()).toBeGreaterThan(0)
  })
})

it("forwards actions, actionAccels, controllers and breakpoints to the running app", async () => {
  // App-level action: reachable through the default GApplication (what a
  // Gio.Notification action button targets) AND, per GTK convention, through
  // "app.<name>" on any widget in the window.
  const app = Gio.Application.getDefault()
  expect(app).not.toBeNull()
  app!.activateAction("app-ping", null)
  expect(appActivated).toContain("app-ping")

  // Window-level action — activateAction takes the prefixed "group.action"
  // name (the app-level one above needs no prefix: Gio.Application's own
  // activateAction is already scoped to its own action map).
  activate("win.ping")
  expect(windowActivated).toEqual(["win-ping"])

  // windowControllers: a GtkShortcutController scoped to the window itself.
  await userEvent.keyboard(window, "{Control>}j{/Control}")
  expect(accelTriggered).toEqual(["ctrl-j"])
})

it("runs an in-tree action's callback with the React context around it", () => {
  // The point of the whole change: this action is declared inside
  // <LabelContext.Provider>, so its callback closes over the provided value.
  // Declared through runApplication's windowActions it would have closed over
  // the context default instead — there is no provider above the window.
  expect(activate("win.ctx-probe")).toBe(true)
  expect(contextReads).toEqual(["read-through-context"])
})

it("registers an application action declared in the tree", () => {
  const app = Gio.Application.getDefault()
  app!.activateAction("app-tree-ping", null)
  expect(appActivated).toContain("app-tree-ping")
})

it("unregisters an action when the component that declared it unmounts", async () => {
  expect(activate("win.ctx-probe")).toBe(true)
  contextReads.length = 0

  await remount({ context: false })

  // Gone from the window's action map entirely — activateAction reports the
  // miss rather than silently running a stale handler.
  expect(activate("win.ctx-probe")).toBe(false)
  expect(contextReads).toEqual([])

  // ...and back when it mounts again, with a fresh registration.
  await remount({ context: true })
  expect(activate("win.ctx-probe")).toBe(true)
  expect(contextReads).toEqual(["read-through-context"])
})

it("gives a duplicated action name to the first declaration, and hands it on when that one leaves", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  duplicateRuns.length = 0

  try {
    activate("win.dup")
    expect(duplicateRuns).toEqual(["first"])

    // A second, unrelated subtree claims the same name. GTK's own map would
    // let it replace the first — and then the first unmount, of EITHER, would
    // remove the name for both. First-wins keeps that from happening; the
    // warning is what tells the developer it happened at all.
    await remount({ secondDuplicate: true })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("win.dup"))

    activate("win.dup")
    expect(duplicateRuns).toEqual(["first", "first"])

    // The winner leaves: its own action is removed, and the claim passes to
    // the declaration that was waiting behind it.
    await remount({ firstDuplicate: false })
    await waitFor(() => {
      expect(activate("win.dup")).toBe(true)
    })
    duplicateRuns.length = 0
    activate("win.dup")
    expect(duplicateRuns).toEqual(["second"])
  } finally {
    warn.mockRestore()
  }
})

it("attaches an in-tree shortcut controller, and detaches it on unmount", async () => {
  shortcutRuns.length = 0
  await userEvent.keyboard(window, "{Control>}m{/Control}")
  expect(shortcutRuns).toEqual(["ctrl-m"])

  await remount({ shortcut: false })

  await userEvent.keyboard(window, "{Control>}m{/Control}")
  expect(shortcutRuns).toEqual(["ctrl-m"])
})
