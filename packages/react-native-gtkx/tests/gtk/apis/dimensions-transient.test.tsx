// Regression: an open transient window (Modal) must not become "the window"
// for Dimensions — it used to shrink the main app viewport to the modal size.
import { render, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import { Gtk, GtkLabel } from "../../../src/gtkx/bridge/index"
import { Dimensions } from "../../../src/index"

const firstToplevel = (): Gtk.Window => {
  const toplevels = Gtk.Window.getToplevels()
  const window = toplevels.getItem(0) as unknown as Gtk.Window | null
  if (!window) {
    throw new Error("no toplevel window in harness")
  }
  return window
}

it("Dimensions ignores transient windows", async () => {
  await render(<GtkLabel label="dimensions host" />)

  const before = Dimensions.get("window")
  expect(before.width).toBeGreaterThan(0)

  const modal = new Gtk.Window()
  modal.setTransientFor(firstToplevel())
  modal.setModal(true)
  modal.setDefaultSize(111, 99)
  modal.present()
  try {
    await waitFor(() => {
      expect(modal.getWidth()).toBeGreaterThan(0)
    })
    const during = Dimensions.get("window")
    expect(during.width).toBe(before.width)
    expect(during.height).toBe(before.height)
  } finally {
    modal.destroy()
  }
})
