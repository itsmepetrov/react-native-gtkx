// Multi-root foundation (navigation epic): NestedRoot mounts a full Yoga
// engine inside an arbitrary GTK container slot. Two independent roots must
// coexist in one window (an engine per root), follow their slots' allocations
// through window resizes, and detach cleanly on unmount while the sibling
// keeps working.
import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { render, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { GtkBox, type Gtk } from "../../../src/gtkx/bridge/index"
import { NestedRoot, Text, View } from "../../../src/index"

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

const lastLayout = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.at(-1)![0].nativeEvent.layout as {
    width: number
    height: number
  }

it("two nested roots share a window, follow resizes and detach independently", async () => {
  const leftLayout = vi.fn()
  const rightLayout = vi.fn()

  const panes = (withRight: boolean) => (
    <GtkBox homogeneous>
      <NestedRoot>
        <View
          style={{ flex: 1 }}
          onLayout={leftLayout}
        >
          <Text>left pane</Text>
        </View>
      </NestedRoot>
      {withRight ? (
        <NestedRoot>
          <View
            style={{ flex: 1 }}
            onLayout={rightLayout}
          >
            <Text>right pane</Text>
          </View>
        </NestedRoot>
      ) : null}
    </GtkBox>
  )

  const { container, rerender } = await render(panes(true))
  const window = container as Gtk.Window

  // Both engines laid out against their own slots: a homogeneous split gives
  // each pane roughly half of the window width.
  await waitFor(() => {
    expect(leftLayout).toHaveBeenCalled()
    expect(rightLayout).toHaveBeenCalled()
    const left = lastLayout(leftLayout)
    const right = lastLayout(rightLayout)
    expect(left.width).toBeGreaterThan(50)
    expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1)
  })

  // A window resize propagates to BOTH slot allocations and both engines
  // reflow (viewport-following, no manual invalidation).
  await resizeViaCompositor(window, `nested-roots-${process.pid}`, 900, 500)
  await waitFor(() => {
    const left = lastLayout(leftLayout)
    const right = lastLayout(rightLayout)
    expect(left.width + right.width).toBeGreaterThan(700)
    expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1)
  }, RESIZE_TIMEOUT)

  // Detach the right root: the unmount disposes its engine; the surviving
  // root now owns the whole width and keeps following allocations.
  const rightCallsAtUnmount = rightLayout.mock.calls.length
  await rerender(panes(false))
  await waitFor(() => {
    const left = lastLayout(leftLayout)
    expect(left.width).toBeGreaterThan(700)
  }, RESIZE_TIMEOUT)

  // The detached engine stays silent through further resizes — only the
  // survivor reflows.
  await resizeViaCompositor(window, `nested-roots-b-${process.pid}`, 600, 400)
  await waitFor(() => {
    const left = lastLayout(leftLayout)
    expect(left.width).toBeLessThanOrEqual(620)
  }, RESIZE_TIMEOUT)
  expect(rightLayout.mock.calls.length).toBe(rightCallsAtUnmount)
})

it("mount/unmount churn of nested roots leaks no layout activity", async () => {
  const layout = vi.fn()
  const pane = (generation: number, mounted: boolean) => (
    <GtkBox>
      {mounted ? (
        <NestedRoot key={generation}>
          <View
            style={{ flex: 1 }}
            onLayout={layout}
          >
            <Text>{`generation ${generation}`}</Text>
          </View>
        </NestedRoot>
      ) : null}
    </GtkBox>
  )

  const { rerender } = await render(pane(0, true))
  await waitFor(() => {
    expect(layout).toHaveBeenCalled()
  })

  // Ten attach/detach cycles: every generation mounts a fresh engine and the
  // previous one is disposed. Any use-after-dispose would throw during the
  // synchronous in-pass reflows and fail the test.
  for (let generation = 1; generation <= 10; generation += 1) {
    await rerender(pane(generation, false))
    await rerender(pane(generation, true))
  }
  const settledCalls = layout.mock.calls.length
  expect(settledCalls).toBeGreaterThanOrEqual(11)

  // The last generation is alive and still lays out; disposed ones are gone.
  await rerender(pane(11, true))
  await waitFor(() => {
    expect(layout.mock.calls.length).toBeGreaterThan(settledCalls)
  })
})
