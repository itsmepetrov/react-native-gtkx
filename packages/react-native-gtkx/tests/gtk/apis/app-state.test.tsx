// Integration: AppState against the real host (window is-active tracking).
// The headless harness runs a single toplevel per test file, so there is
// nothing to hand focus over to and no transition to drive (the seat keeps
// that window active). The integration signal here is consistency: the module
// must mirror the toplevel's real is-active state. Transition semantics
// (change/focus/blur) are covered by unit tests with a mock host.

import { render, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { AppState } from "../../../src/apis/index"
import { Gtk, GtkLabel } from "../../../src/gtkx/bridge/index"

it("mirrors the real window's is-active state", async () => {
  const { container } = await render(<GtkLabel label="app state" />)
  const window = container as Gtk.Window
  await waitFor(() => {
    const expected = window.isActive() ? "active" : "background"
    expect(AppState.currentState).toBe(expected)
  })
})

it("exposes availability and validates event types", () => {
  expect(AppState.isAvailable).toBe(true)
  expect(() =>
    AppState.addEventListener("memoryWarning" as never, vi.fn()),
  ).toThrow(/unsupported event type/)
})

it("subscriptions detach cleanly and never fire after remove()", async () => {
  await render(<GtkLabel label="app state" />)
  const handler = vi.fn()
  const subscription = AppState.addEventListener("change", handler)
  subscription.remove()
  subscription.remove()
  // The state is still readable after all listeners are gone (live-computed).
  expect(["active", "background"]).toContain(AppState.currentState)
  expect(handler).not.toHaveBeenCalled()
})
