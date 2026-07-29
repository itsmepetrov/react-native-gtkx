// Regression for the removed window wrapper (branch B, workaround #1):
// the Root is the window's DIRECT child — with no scrollable ancestor the
// "double scroll" bug (wheel panning the whole window root after an inner
// ScrollView hits its end) is structurally impossible — and the window
// shrinks below any content minimum because the root reports a zero minimum
// and adopts the actual allocation as the layout viewport.
import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { render, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { measureWidget, type Gtk } from "../../src/gtkx-bridge/index.js"
import { Root, View } from "../../src/index.js"

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

it("window root has no scrollable ancestor and shrinks below content minimums", async () => {
  const onLayout = vi.fn()
  const { container } = await render(
    <Root
      width={800}
      height={600}
      followAllocation
    >
      <View
        style={{ flex: 1 }}
        onLayout={onLayout}
      >
        {/* Wider than the shrink target: must not block the resize. */}
        <View style={{ width: 700, height: 60 }} />
      </View>
    </Root>,
  )
  const window = container as Gtk.Window

  await waitFor(() => {
    expect(window.getChild()).not.toBeNull()
  })
  const rootWidget = window.getChild()!

  // Direct child of the window: no GtkScrolledWindow/viewport in between.
  expect(rootWidget.getParent()).toBe(window)

  // Zero minimum: nothing for a window resize to ratchet against.
  expect(measureWidget(rootWidget, "horizontal").minimum).toBe(0)
  expect(measureWidget(rootWidget, "vertical").minimum).toBe(0)

  // The viewport follows the allocation: the flex child fills it.
  await waitFor(() => {
    expect(onLayout).toHaveBeenCalled()
    const layout = onLayout.mock.calls.at(-1)![0].nativeEvent.layout
    expect(layout.width).toBeGreaterThan(300)
  })

  await resizeViaCompositor(window, `root-shrink-${process.pid}`, 400, 300)
  await waitFor(() => {
    const allocation = rootWidget.getAllocation()
    expect(allocation.width).toBeLessThanOrEqual(420)
    const layout = onLayout.mock.calls.at(-1)![0].nativeEvent.layout
    expect(layout.width).toBeLessThanOrEqual(420)
  }, RESIZE_TIMEOUT)
})
