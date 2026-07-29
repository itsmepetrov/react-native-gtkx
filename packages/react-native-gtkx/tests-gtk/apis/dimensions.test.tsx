// Integration: Dimensions against the real gtkx host, sized by the
// @gtkx/testing harness window (800x600 by default).
//
// Resizing on Wayland: a mapped toplevel cannot reliably request its own
// resize — setDefaultSize() on a mapped window is only a hint the compositor
// may ignore or race (that made the first version of this test flaky). Two
// deterministic resize paths are used instead:
// - compositor-driven: sway IPC `resize set` targeting the window by title —
//   the production scenario (the user/compositor resizes the window), with a
//   retry loop because the freshly set title reaches sway asynchronously;
// - map-time: hide, set the new default size, present — GTK applies the
//   default size on map, the same reliable path as the initial show.

import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { render, renderHook, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import { Dimensions, useWindowDimensions } from "../../src/apis/index.js"
import { Gtk, GtkLabel, toNumber } from "../../src/gtkx-bridge/index.js"

const RESIZE_TIMEOUT = { timeout: 5000 }

const resizeViaCompositor = async (
  window: Gtk.Window,
  title: string,
  width: number,
  height: number,
): Promise<void> => {
  window.setTitle(title)
  const runtimeDir = process.env.XDG_RUNTIME_DIR ?? ""
  const socket = readdirSync(runtimeDir).find((name) =>
    name.startsWith("sway-ipc"),
  )
  if (!socket) {
    throw new Error("sway IPC socket not found in XDG_RUNTIME_DIR")
  }
  const command = `[title="${title}"] resize set width ${width} px height ${height} px`
  await waitFor(() => {
    const out = execFileSync("swaymsg", [
      "-s",
      join(runtimeDir, socket),
      command,
    ]).toString()
    const results = JSON.parse(out) as { success?: boolean }[]
    expect(results[0]?.success).toBe(true)
  }, RESIZE_TIMEOUT)
}

it("reports the harness window size and a plausible screen size", async () => {
  const { container } = await render(<GtkLabel label="dimensions" />)
  const window = container as Gtk.Window

  await waitFor(() => {
    const metrics = Dimensions.get("window")
    expect(metrics.width).toBe(toNumber(window.getWidth()))
    expect(metrics.height).toBe(toNumber(window.getHeight()))
    expect(metrics.width).toBeGreaterThan(0)
    expect(metrics.height).toBeGreaterThan(0)
  }, RESIZE_TIMEOUT)
  expect(Dimensions.get("window").scale).toBeGreaterThanOrEqual(1)

  const screenMetrics = Dimensions.get("screen")
  expect(screenMetrics.width).toBeGreaterThan(0)
  expect(screenMetrics.height).toBeGreaterThan(0)
})

it("emits change events when the compositor resizes the window", async () => {
  const { container } = await render(<GtkLabel label="resize me" />)
  const window = container as Gtk.Window
  await waitFor(() => {
    expect(toNumber(window.getWidth())).toBeGreaterThan(0)
  }, RESIZE_TIMEOUT)

  const widths: number[] = []
  const subscription = Dimensions.addEventListener(
    "change",
    ({ window: metrics }) => {
      widths.push(metrics.width)
    },
  )
  try {
    await resizeViaCompositor(window, "rn-gtkx-resize-events", 640, 480)
    await waitFor(() => {
      expect(widths.length).toBeGreaterThan(0)
      expect(Dimensions.get("window").width).toBe(640)
      expect(Dimensions.get("window").height).toBe(480)
    }, RESIZE_TIMEOUT)
  } finally {
    subscription.remove()
  }
})

it("useWindowDimensions tracks window resizes", async () => {
  // renderHook mounts into a windowless Gtk.Box container, so create a real
  // toplevel first — the host resolves it via Gtk.Window.getToplevels().
  const { container } = await render(<GtkLabel label="hook window" />)
  const window = container as Gtk.Window
  const { result, unmount } = await renderHook(() => useWindowDimensions())

  await waitFor(() => {
    expect(result.current.width).toBeGreaterThan(0)
    expect(result.current.height).toBeGreaterThan(0)
  }, RESIZE_TIMEOUT)
  const targetWidth = result.current.width - 160

  // Map-time resize (see the header comment): deterministic without sway IPC.
  window.setVisible(false)
  window.setDefaultSize(targetWidth, 400)
  window.present()

  await waitFor(() => {
    expect(result.current.width).toBe(targetWidth)
    expect(result.current.height).toBe(400)
  }, RESIZE_TIMEOUT)
  await unmount()
})
