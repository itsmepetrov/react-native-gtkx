// The fallback branch from .claude/epics/adw-optional/002.md: on a store
// with no "Adw-1" declared, chrome: "content" falls back to the same
// GtkApplicationWindow chrome: "system" always used, instead of throwing.
// This suite's own codegen store DOES have Adw (the monorepo root's), so it
// mocks adwAvailable() to false rather than adwAvailable() actually being
// false — spike/plain-gtk (run-headless.sh) is what proves this against a
// GENUINELY Adw-less store; this file is what proves the BRANCHING LOGIC
// itself: which window gets built, that breakpoints is accepted-and-ignored
// with one warning, and that actions/controllers work exactly as they do on
// the Adw profile's own guardrail (app-registry.gtk.test.tsx, left
// unmodified) — the same code path, just reached from the other side of the
// probe.
import { act, userEvent, waitFor } from "@gtkx/testing"
import { beforeAll, expect, it, vi } from "vitest"
import {
  AppRegistry,
  getActiveChrome,
} from "../../../src/components/app-registry"
import { requireAdwJsx } from "../../../src/gtkx/bridge/adw"
import {
  GSimpleAction,
  Gtk,
  GtkShortcut,
  GtkShortcutController,
} from "../../../src/gtkx/bridge/index"

vi.mock("../../../src/gtkx/bridge/adw", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/gtkx/bridge/adw")>()
  return {
    ...actual,
    adwAvailable: () => false,
    // Wrapped, not replaced: if the fallback branch is ever wired wrong and
    // reaches for real Adw JSX anyway, this still resolves it correctly
    // (this store does have Adw) — the test below asserts on the SPY
    // (not-called), not on a throw, so a wiring regression fails loudly
    // with "expected 0 calls" rather than masking the bug behind a crash.
    requireAdwJsx: vi.fn(actual.requireAdwJsx),
  }
})

const windowActivated: string[] = []
const shortcutRuns: string[] = []

// No RN widgets needed — same reasoning as app-registry.gtk.test.tsx: this
// suite is only about window/application chrome.
const App = () => null

const TITLE = `app-registry-fallback-probe-${process.pid}`

const findWindow = (): Gtk.Window | undefined =>
  Gtk.Window.listToplevels().find(
    (widget): widget is Gtk.Window =>
      widget instanceof Gtk.Window && widget.getTitle() === TITLE,
  )

let window: Gtk.Window
// Captured from the one-time warn spy in beforeAll — runApplication (and
// the warnOnce it triggers) runs exactly once per process, same reasoning
// as app-registry.gtk.test.tsx, so the calls are read here rather than
// re-spied per test.
let breakpointsWarnings: unknown[][] = []

beforeAll(async () => {
  AppRegistry.registerComponent("app-registry-fallback-probe-app", () => App)

  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    await act(async () => {
      AppRegistry.runApplication("app-registry-fallback-probe-app", {
        title: TITLE,
        // The whole point: requested WITH content chrome, but adwAvailable()
        // is mocked to false above — falls back to GtkApplicationWindow.
        chrome: "content",
        width: 500,
        height: 400,
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
                trigger={Gtk.ShortcutTrigger.parseString("<Control>m")}
                action={Gtk.CallbackAction.new(() => {
                  shortcutRuns.push("ctrl-m")
                  return true
                })}
              />
            }
          />
        ),
        // Truthy and not Adw-shaped on purpose: the fallback never forwards
        // this to a widget at all (GtkApplicationWindow has no such prop),
        // so any truthy node is enough to exercise the "ignored" warning.
        breakpoints: <></>,
      })
    })
    breakpointsWarnings = warn.mock.calls
  } finally {
    warn.mockRestore()
  }

  await waitFor(() => {
    const found = findWindow()
    expect(found).not.toBeUndefined()
    window = found as Gtk.Window
  })

  await act(async () => {
    window.present()
  })
  await waitFor(() => {
    expect(window.getWidth()).toBeGreaterThan(0)
  })
})

it("falls back to a plain GtkApplicationWindow without ever reaching for Adw", () => {
  // requireAdwJsx backs <AdwApplicationWindow> — never called means the
  // fallback branch, not the Adw branch, built this window.
  expect(requireAdwJsx).not.toHaveBeenCalled()
  // activeChrome tracks what actually got built, not what was requested —
  // the navigation dev-mode hint (a HeaderBar page under "system" chrome
  // renders a doubled titlebar) needs the real answer, not the request.
  expect(getActiveChrome()).toBe("system")
})

it("accepts breakpoints and ignores it with exactly one warning naming Adw-1", () => {
  expect(breakpointsWarnings).toHaveLength(1)
  const [message] = breakpointsWarnings[0]!
  expect(message).toContain("breakpoints")
  expect(message).toContain("Adw-1")
  expect(message).toContain("ignored")
})

it("still forwards windowActions and windowControllers to the fallback window", async () => {
  const activate = (detailedName: string): boolean =>
    window.activateAction(detailedName, null)

  expect(activate("win.ping")).toBe(true)
  expect(windowActivated).toEqual(["win-ping"])

  await userEvent.keyboard(window, "{Control>}m{/Control}")
  expect(shortcutRuns).toEqual(["ctrl-m"])
})
