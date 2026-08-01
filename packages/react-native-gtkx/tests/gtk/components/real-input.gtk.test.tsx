// The hop no other test covers: compositor -> GDK -> GtkGesture.
//
// Every other gesture test drives `userEvent`, which emits GtkGesture
// SIGNALS directly on a widget's controllers. That proves the JS above the
// signal and nothing below it — a GdkEvent is never produced. `Pressable`
// has depended on that hop since the beginning and the responder system
// depends on it now, so it is worth one test that actually makes it.
//
// Input here is a real `zwlr_virtual_pointer_v1` on the same compositor the
// worker already runs against (see support/virtual-pointer.ts), aimed with
// `measureInWindow`. Position, not focus, decides who receives a Wayland
// pointer event — which is why every test below asserts that the OTHER
// target stayed silent. A test that only checks "something fired" would
// pass just as happily if the compositor had delivered the click to the
// wrong window.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  PanResponder,
  Pressable,
  Root,
  Text,
  View,
  type ViewHandle,
} from "../../../src/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

// Matches @gtkx/vitest's DEFAULT_HEADLESS_SIZE.
const OUTPUT = { width: 1024, height: 768 }

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

/**
 * Fullscreens the harness window so window coordinates and output
 * coordinates coincide — sway floats and centres windows by default
 * (`for_window [app_id=".*"] floating enable`), and a centred window would
 * make every measured point wrong by an unknown offset.
 */
const fullscreenWindow = async (anyWidget: GtkNs.Widget): Promise<void> => {
  const root = anyWidget.getRoot()
  if (root instanceof Gtk.Window) {
    root.fullscreen()
  }
  await settle()
}

const centreOf = (handle: ViewHandle): { x: number; y: number } => {
  let point: { x: number; y: number } | null = null
  handle.measureInWindow((x, y, width, height) => {
    point = { x: x + width / 2, y: y + height / 2 }
  })
  if (point === null) {
    throw new Error("the view has no measurable geometry yet")
  }
  return point
}

let pointer: VirtualPointer | null = null

// A leaked Wayland connection would outlive the worker and keep the
// compositor talking to nobody; dispose even when a test throws.
afterEach(() => {
  pointer?.dispose()
  pointer = null
})

const withPointer = async (): Promise<VirtualPointer | null> => {
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      // A compositor without the wlroots protocol (weston) — the rest of the
      // suite still covers everything above the GdkEvent.
      console.warn(`[real-input] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

it("a real pointer press reaches the Pressable under it, and only that one", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const onLeft = vi.fn()
  const onRight = vi.fn()

  await act(async () => {
    await render(
      <Root
        width={600}
        height={300}
      >
        <View style={{ flexDirection: "row" }}>
          <Pressable
            onPress={onLeft}
            style={{ width: 240, height: 160 }}
          >
            <Text>left</Text>
          </Pressable>
          <Pressable
            onPress={onRight}
            style={{ width: 240, height: 160 }}
          >
            <Text>right</Text>
          </Pressable>
        </View>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("left")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByText("left") as unknown as GtkNs.Widget)

  // Measured from the widgets themselves rather than computed from the
  // style, so a layout change cannot silently aim this somewhere else.
  const boxOf = (label: string): GtkNs.Widget =>
    (screen.getByText(label) as unknown as GtkNs.Widget).getParent()!
  const rectOf = (label: string) => {
    const [ok, bounds] = boxOf(label).computeBounds(
      boxOf(label).getRoot() as unknown as GtkNs.Widget,
    )
    expect(ok).toBe(true)
    return bounds
  }

  const left = rectOf("left")
  device.moveTo(
    left.getX() + left.getWidth() / 2,
    left.getY() + left.getHeight() / 2,
  )
  await settle()
  device.press()
  await settle()
  device.release()
  await settle()

  await waitFor(() => {
    expect(onLeft).toHaveBeenCalledTimes(1)
  })
  // The half of the assertion that proves aiming rather than luck.
  expect(onRight).not.toHaveBeenCalled()
})

it("a real drag drives PanResponder end to end", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const moves: { dx: number; dy: number }[] = []
  const onGrant = vi.fn()
  const onRelease = vi.fn()
  const onOtherGrant = vi.fn()

  const Stage = () => {
    const pan = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: onGrant,
      onPanResponderMove: (_event, state) => {
        moves.push({ dx: state.dx, dy: state.dy })
      },
      onPanResponderRelease: onRelease,
    })
    const other = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: onOtherGrant,
    })
    return (
      <View style={{ flexDirection: "row" }}>
        <View
          {...pan.panHandlers}
          ref={handle}
          style={{ width: 240, height: 200 }}
        >
          <Text>dragme</Text>
        </View>
        <View
          {...other.panHandlers}
          style={{ width: 240, height: 200 }}
        >
          <Text>neighbour</Text>
        </View>
      </View>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={600}
        height={300}
      >
        <Stage />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("dragme")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByText("dragme") as unknown as GtkNs.Widget)

  const start = centreOf(handle.current!)
  device.moveTo(start.x, start.y)
  await settle()
  device.press()
  await settle()
  for (let step = 1; step <= 4; step += 1) {
    device.moveTo(start.x + step * 12, start.y + step * 5)
    await settle()
  }
  device.release()
  await settle()

  await waitFor(() => {
    expect(onGrant).toHaveBeenCalledTimes(1)
  })
  await waitFor(() => {
    expect(onRelease).toHaveBeenCalledTimes(1)
  })

  // The whole point: these numbers came out of real GdkEvents, through
  // GtkGestureDrag, through the responder negotiation, into RN's own
  // PanResponder.
  expect(moves.length).toBeGreaterThan(0)
  const last = moves.at(-1)!
  expect(last.dx).toBeGreaterThan(0)
  expect(last.dy).toBeGreaterThan(0)
  expect(onOtherGrant).not.toHaveBeenCalled()
})
