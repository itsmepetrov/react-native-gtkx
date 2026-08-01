// Full responder negotiation against a real pointer: the lock moving to an
// ancestor mid-gesture, and the three ways GTK takes an interaction away.
//
// Everything here is driven by a `zwlr_virtual_pointer_v1` rather than by
// `userEvent`, and that is not gold-plating. Every claim in this file is
// about what GTK does with a sequence once it has been CLAIMED — which
// gestures still hear events, which are cancelled, what a second mouse
// button does to a single-button gesture. `userEvent` emits gesture signals
// directly and never produces a GdkEvent, so it cannot answer any of it: a
// test written against it would have agreed with whatever the
// implementation happened to do.
//
// A Wayland pointer is addressed by POSITION, not by focus. "A handler
// fired" is therefore not evidence on its own, and every test below also
// asserts that the view next to the target stayed silent.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  Root,
  ScrollView,
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
 * coordinates coincide — sway floats and centres windows by default, and a
 * centred window would make every measured point wrong by an unknown offset.
 */
const fullscreenWindow = async (anyWidget: GtkNs.Widget): Promise<void> => {
  const root = anyWidget.getRoot()
  if (!(root instanceof Gtk.Window)) {
    return
  }
  root.present()
  root.fullscreen()
  // Windows from earlier tests in this worker are still up, and sway stacks
  // them: a pointer aimed at these coordinates would land on whichever one
  // is on top, not on this one. Waiting for this window to be the active
  // one is what makes the aim mean anything — the same reason every
  // assertion below has a negative control.
  await waitFor(() => {
    expect(root.isActive()).toBe(true)
  })
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
      console.warn(`[responder-transfer] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

const mount = async (tree: ReactNode, label: string): Promise<void> => {
  await act(async () => {
    await render(
      <Root
        width={700}
        height={500}
      >
        {tree}
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText(label)).toBeTruthy()
  })
  await fullscreenWindow(screen.getByText(label) as unknown as GtkNs.Widget)
}

it("keeps delivering moves to an ancestor that takes the lock mid-drag", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const onOuterMove = vi.fn()
  const onOuterGrant = vi.fn()
  const onOuterRelease = vi.fn()
  const onNeighbourTouch = vi.fn()

  await mount(
    <View style={{ flexDirection: "row" }}>
      <View
        style={{ width: 300, height: 300 }}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onOuterGrant}
        onResponderMove={onOuterMove}
        onResponderRelease={onOuterRelease}
      >
        <View
          ref={handle}
          style={{ width: 200, height: 200 }}
          onStartShouldSetResponder={() => false}
        >
          <Text>inner</Text>
        </View>
      </View>
      <View
        style={{ width: 300, height: 300 }}
        onTouchStart={onNeighbourTouch}
      >
        <Text>neighbour</Text>
      </View>
    </View>,
    "inner",
  )

  const start = centreOf(handle.current!)
  device.moveTo(start.x, start.y)
  await settle()
  device.press()
  await settle()
  for (let step = 1; step <= 5; step += 1) {
    device.moveTo(start.x + step * 10, start.y + step * 6)
    await settle()
  }
  device.release()
  await settle()

  await waitFor(() => {
    expect(onOuterGrant).toHaveBeenCalledTimes(1)
  })
  // The regression this file exists for. The inner view declares responder
  // props, so it has a GtkGestureDrag of its own and it is the source the
  // interaction arrives through. Making the GTK claim on the OUTER view's
  // gesture — the one that won the responder — denies the sequence on every
  // gesture below it, kills the source, and the pan never moves. It fired
  // once, on the event that granted, and then went silent for the rest of
  // the drag.
  expect(onOuterMove.mock.calls.length).toBeGreaterThan(2)
  expect(onOuterRelease).toHaveBeenCalledTimes(1)
  expect(onNeighbourTouch).not.toHaveBeenCalled()
})

it("terminates when a second mouse button opens a context menu", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const onResponderTerminate = vi.fn()
  const onResponderRelease = vi.fn()
  const onResponderTerminationRequest = vi.fn(() => false)
  const onNeighbourTouch = vi.fn()

  await mount(
    <View style={{ flexDirection: "row" }}>
      <View
        ref={handle}
        style={{ width: 300, height: 300 }}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={onResponderTerminationRequest}
        onResponderTerminate={onResponderTerminate}
        onResponderRelease={onResponderRelease}
      >
        <Text>dragme</Text>
      </View>
      <View
        style={{ width: 300, height: 300 }}
        onTouchStart={onNeighbourTouch}
      >
        <Text>neighbour</Text>
      </View>
    </View>,
    "dragme",
  )

  const start = centreOf(handle.current!)
  device.moveTo(start.x, start.y)
  await settle()
  device.press()
  await settle()
  device.moveTo(start.x + 12, start.y + 8)
  await settle()

  device.press("secondary")
  await settle()
  device.release("secondary")
  await settle()
  device.release()
  await settle()

  await waitFor(() => {
    expect(onResponderTerminate).toHaveBeenCalledTimes(1)
  })
  expect(onResponderRelease).not.toHaveBeenCalled()
  // react-native-web consults onResponderTerminationRequest for a context
  // menu and this platform cannot: GtkGestureSingle cancels its sequence the
  // instant a second button goes down, so by the time JS hears anything the
  // sequence is already gone and there is nothing an answer could change.
  // Documented in docs/api.md rather than faked.
  expect(onResponderTerminationRequest).not.toHaveBeenCalled()
  expect(onNeighbourTouch).not.toHaveBeenCalled()
})

it("terminates when an enclosing ScrollView scrolls under the gesture", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const onResponderTerminate = vi.fn()
  const onResponderRelease = vi.fn()
  const onNeighbourTouch = vi.fn()

  await mount(
    <View style={{ flexDirection: "row" }}>
      <ScrollView style={{ width: 300, height: 300 }}>
        <View
          ref={handle}
          style={{ width: 280, height: 1200 }}
          onStartShouldSetResponder={() => true}
          onResponderTerminate={onResponderTerminate}
          onResponderRelease={onResponderRelease}
        >
          <Text>scrolled</Text>
        </View>
      </ScrollView>
      <View
        style={{ width: 300, height: 300 }}
        onTouchStart={onNeighbourTouch}
      >
        <Text>neighbour</Text>
      </View>
    </View>,
    "scrolled",
  )

  // The view is far taller than its viewport, so its centre is clipped away
  // — aim near the visible top instead.
  const start = { x: centreOf(handle.current!).x, y: 60 }
  device.moveTo(start.x, start.y)
  await settle()
  device.press()
  await settle()
  device.moveTo(start.x + 8, start.y + 6)
  await settle()

  device.scrollBy(3)
  await settle()
  device.release()
  await settle()

  await waitFor(() => {
    expect(onResponderTerminate).toHaveBeenCalledTimes(1)
  })
  expect(onResponderRelease).not.toHaveBeenCalled()
  expect(onNeighbourTouch).not.toHaveBeenCalled()
})

it("keeps the responder when the holder refuses to yield to a scroll", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const onResponderTerminate = vi.fn()
  const onResponderRelease = vi.fn()
  const onResponderTerminationRequest = vi.fn(() => false)

  await mount(
    <ScrollView style={{ width: 300, height: 300 }}>
      <View
        ref={handle}
        style={{ width: 280, height: 1200 }}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={onResponderTerminationRequest}
        onResponderTerminate={onResponderTerminate}
        onResponderRelease={onResponderRelease}
      >
        <Text>stubborn</Text>
      </View>
    </ScrollView>,
    "stubborn",
  )

  const start = { x: centreOf(handle.current!).x, y: 60 }
  device.moveTo(start.x, start.y)
  await settle()
  device.press()
  await settle()
  device.moveTo(start.x + 8, start.y + 6)
  await settle()

  device.scrollBy(3)
  await settle()

  // An ancestor scroll is the one termination a holder is allowed to refuse
  // — the only place onResponderTerminationRequest is honored outside a
  // transfer, because it is the only one GTK has not already decided.
  await waitFor(() => {
    expect(onResponderTerminationRequest).toHaveBeenCalled()
  })
  expect(onResponderTerminate).not.toHaveBeenCalled()

  device.release()
  await settle()
  await waitFor(() => {
    expect(onResponderRelease).toHaveBeenCalledTimes(1)
  })
})

it("terminates when the window stops being the active one", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const onResponderTerminate = vi.fn()
  const onResponderRelease = vi.fn()
  const onTouchCancel = vi.fn()

  await mount(
    <View
      ref={handle}
      style={{ width: 400, height: 300 }}
      onStartShouldSetResponder={() => true}
      onResponderTerminate={onResponderTerminate}
      onResponderRelease={onResponderRelease}
      onTouchCancel={onTouchCancel}
    >
      <Text>dragme</Text>
    </View>,
    "dragme",
  )

  const start = centreOf(handle.current!)
  device.moveTo(start.x, start.y)
  await settle()
  device.press()
  await settle()
  device.moveTo(start.x + 10, start.y + 10)
  await settle()

  // Alt-tabbing away mid-drag, expressed the only way a test can: another
  // toplevel takes the focus. It has to be fullscreened — merely presenting
  // a window is not enough to deactivate a fullscreen one under sway.
  const stealer = new Gtk.Window()
  stealer.setDefaultSize(200, 200)
  stealer.present()
  await settle()
  stealer.fullscreen()
  await settle()
  await settle()

  await waitFor(() => {
    expect(onResponderTerminate).toHaveBeenCalledTimes(1)
  })
  expect(onResponderRelease).not.toHaveBeenCalled()
  // GTK also cancels the gesture when the window goes away under this
  // compositor, so "terminate fired" alone would not prove the blur watcher
  // did anything. The cancel path dispatches onTouchCancel and the blur path
  // does not, so its absence is what says which one won — and it has to be
  // the blur watcher, because a real desktop alt-tab moves no pointer and
  // may produce no cancel at all.
  expect(onTouchCancel).not.toHaveBeenCalled()

  stealer.destroy()
  await settle()
  device.release()
  await settle()
})
