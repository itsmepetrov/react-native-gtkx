// `Gesture.Pinch()` and `Gesture.Rotation()` against a REAL `GtkGestureZoom`
// and a REAL `GtkGestureRotate`, attached to a real widget by the real
// `GestureDetector`.
//
// WHY THIS ONE IS NOT DRIVEN BY INJECTED INPUT, when every other file in this
// directory is. A touchpad pinch is not injected — it is CONCLUDED by libinput
// from two fingers moving apart on a device it has classified as a touchpad,
// and delivered to the app as `zwp_pointer_gestures_v1`. That requires the
// compositor to have a libinput backend, and the one each vitest worker runs
// against does not: `@gtkx/vitest` starts sway with `WLR_BACKENDS=headless`
// and `WLR_LIBINPUT_NO_DEVICES=1`, so it enumerates no input devices at all.
// Measured, with a real uinput touchpad present and the same probe running
// under each: the desktop session's compositor delivers the whole gesture, the
// headless one delivers nothing and never moves the pointer.
//
// So the chain BELOW the GTK controller is measured by probe 6
// (`spike/gesture-detector/run-session.sh`, real uinput device, real libinput,
// real compositor, real GDK), and what is measured HERE is the chain above it:
// that the detector attaches the right controller to the right widget, and
// that GTK's own signals drive the recognizer, the arbitration and the
// callbacks. `tests/gtk/support/virtual-touchpad.ts` is the harness the probe
// uses; it is deliberately not used here, because a device this compositor
// cannot see would make the test pass for the wrong reason.
//
// The negative control is the same as everywhere else in this directory: a
// second detector, mounted beside the target, that must stay silent — and here
// it also has to be shown that the CONTROLLERS are per-detector, since a
// single controller on a shared ancestor would make both fire.
//
// EXPECT `Gdk-CRITICAL: gdk_event_get_event_type: assertion 'GDK_IS_EVENT
// (event)' failed` in this file's output, once per emitted `begin`. It is
// GtkGestureZoom's own `begin` handler recomputing its distance from
// `gtk_gesture_get_last_event`, which is NULL because an emitted signal has no
// GdkEvent behind it — and it is a precise statement of what this file cannot
// cover, which is exactly why the probe exists.
import { act, fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { createRef, type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { widgetForHandle } from "../../../src/components/measure"
import {
  Gesture,
  GestureDetector,
  State,
} from "../../../src/gesture-handler-compat/index"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text, View, type ViewHandle } from "../../../src/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

// Matches @gtkx/vitest's DEFAULT_HEADLESS_SIZE.
const OUTPUT = { width: 1024, height: 768 }

let pointer: VirtualPointer | null = null

afterEach(() => {
  pointer?.dispose()
  pointer = null
})

/**
 * The ORDINARY pointer, which is here for one test and one claim: that a real
 * mouse press does not begin a touchpad gesture. It cannot produce a pinch —
 * nothing in this compositor can, see the header — so it is used only to prove
 * the negative.
 */
const withPointer = async (): Promise<VirtualPointer | null> => {
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      console.warn(`[touchpad-gestures] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

const step = async (action: () => void, ms = 45): Promise<void> => {
  action()
  await settle(ms)
}

const fullscreenWindow = async (anyWidget: GtkNs.Widget): Promise<void> => {
  const root = anyWidget.getRoot()
  if (!(root instanceof Gtk.Window)) {
    return
  }
  root.present()
  root.fullscreen()
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

const settle = async (ms = 30): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
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
  await settle()
}

const widgetOf = (handle: ViewHandle | null): GtkNs.Widget => {
  const widget = widgetForHandle(handle)
  if (widget === null) {
    throw new Error("the view carries no widget")
  }
  return widget
}

/**
 * The controller the detector attached, found on the widget itself.
 *
 * Not a handle the module hands out: what this asserts is that the detector
 * put a controller of the right class on the right widget, which is the whole
 * of the wiring under test. `observeControllers` is GTK's own list.
 */
const controllerOf = <T,>(
  widget: GtkNs.Widget,
  Kind: new (...args: never[]) => T,
): T => {
  const controllers = widget.observeControllers()
  const found: T[] = []
  for (let index = 0; index < controllers.getNItems(); index += 1) {
    const item = controllers.getItem(index)
    if (item instanceof Kind) {
      found.push(item as T)
    }
  }
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one ${Kind.name} on the widget, found ${found.length}`,
    )
  }
  return found[0]!
}

/** GTK's own signal sequence for one touchpad pinch. */
const pinchThrough = async (
  zoom: GtkNs.GestureZoom,
  scales: number[],
): Promise<void> => {
  await fireEvent(zoom, "begin", null)
  for (const scale of scales) {
    await fireEvent(zoom, "scale-changed", scale)
  }
  await fireEvent(zoom, "end", null)
}

const rotateThrough = async (
  rotate: GtkNs.GestureRotate,
  angles: number[],
): Promise<void> => {
  await fireEvent(rotate, "begin", null)
  for (const angle of angles) {
    // GTK passes the absolute angle first and the delta SINCE RECOGNITION
    // second; the second is the one upstream calls `rotation`.
    await fireEvent(rotate, "angle-changed", angle, angle)
  }
  await fireEvent(rotate, "end", null)
}

it("attaches a GtkGestureZoom for a Pinch and drives the whole progression", async () => {
  const target = createRef<ViewHandle>()
  const control = createRef<ViewHandle>()
  const onBegin = vi.fn()
  const onStart = vi.fn()
  const onUpdate = vi.fn()
  const onEnd = vi.fn()
  const controlBegin = vi.fn()
  const controlUpdate = vi.fn()

  const pinch = Gesture.Pinch()
    .onBegin(onBegin)
    .onStart(onStart)
    .onUpdate(onUpdate)
    .onEnd(onEnd)
  const controlPinch = Gesture.Pinch()
    .onBegin(controlBegin)
    .onUpdate(controlUpdate)

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={pinch}>
        <View
          ref={target}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>pinch target</Text>
        </View>
      </GestureDetector>
      <GestureDetector gesture={controlPinch}>
        <View
          ref={control}
          style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        >
          <Text>untouched</Text>
        </View>
      </GestureDetector>
    </View>,
    "pinch target",
  )

  const targetWidget = widgetOf(target.current)
  const zoom = controllerOf(targetWidget, Gtk.GestureZoom)
  // The control has its own, on its own widget: this is what makes the
  // silence below mean something. One controller on a shared ancestor would
  // deliver to both detectors and the negative control would be vacuous.
  const controlZoom = controllerOf(widgetOf(control.current), Gtk.GestureZoom)
  expect(controlZoom).not.toBe(zoom)

  await pinchThrough(zoom, [1.02, 1.3, 1.8])

  expect(onBegin).toHaveBeenCalledTimes(1)
  expect(onStart).toHaveBeenCalledTimes(1)
  expect(onEnd).toHaveBeenCalledTimes(1)
  // 1.02 is inside the recognition threshold, so it neither activates nor
  // updates; 1.3 activates; 1.8 is the one update.
  expect(onStart.mock.calls[0]![0].scale).toBeCloseTo(1.3, 6)
  expect(onUpdate).toHaveBeenCalledTimes(1)
  expect(onUpdate.mock.calls[0]![0].scale).toBeCloseTo(1.8, 6)
  // A ratio, not a difference — and on the first update it is the scale.
  expect(onUpdate.mock.calls[0]![0].scaleChange).toBeCloseTo(1.8, 6)
  expect(onEnd.mock.calls[0]![0].state).toBe(State.END)
  expect(onEnd.mock.calls[0]![1]).toBe(true)

  // The focal point falls back to the view's centre when GTK has no bounding
  // box to report, which is the case for a signal with no event behind it.
  // The view is 200x200.
  expect(onStart.mock.calls[0]![0].focalX).toBeCloseTo(100, 0)
  expect(onStart.mock.calls[0]![0].focalY).toBeCloseTo(100, 0)

  expect(controlBegin).not.toHaveBeenCalled()
  expect(controlUpdate).not.toHaveBeenCalled()
})

it("attaches a GtkGestureRotate for a Rotation and reports radians", async () => {
  const target = createRef<ViewHandle>()
  const onStart = vi.fn()
  const onUpdate = vi.fn()
  const onEnd = vi.fn()
  const controlUpdate = vi.fn()

  const rotation = Gesture.Rotation()
    .onStart(onStart)
    .onUpdate(onUpdate)
    .onEnd(onEnd)
  const controlRotation = Gesture.Rotation().onUpdate(controlUpdate)

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={rotation}>
        <View
          ref={target}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>rotation target</Text>
        </View>
      </GestureDetector>
      <GestureDetector gesture={controlRotation}>
        <View style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}>
          <Text>untouched</Text>
        </View>
      </GestureDetector>
    </View>,
    "rotation target",
  )

  const rotate = controllerOf(widgetOf(target.current), Gtk.GestureRotate)
  // A Rotation gets no zoom controller and a Pinch gets no rotate one: the
  // detector attaches exactly what the kind reads.
  expect(() =>
    controllerOf(widgetOf(target.current), Gtk.GestureZoom),
  ).toThrow()

  await rotateThrough(rotate, [0.01, 0.4, 0.9])

  expect(onStart).toHaveBeenCalledTimes(1)
  expect(onStart.mock.calls[0]![0].rotation).toBeCloseTo(0.4, 6)
  expect(onUpdate).toHaveBeenCalledTimes(1)
  expect(onUpdate.mock.calls[0]![0].rotation).toBeCloseTo(0.9, 6)
  // A difference, where Pinch's is a ratio.
  expect(onUpdate.mock.calls[0]![0].rotationChange).toBeCloseTo(0.9, 6)
  expect(onUpdate.mock.calls[0]![0].anchorX).toBeCloseTo(100, 0)
  expect(onEnd).toHaveBeenCalledTimes(1)
  expect(controlUpdate).not.toHaveBeenCalled()
})

it("runs a Simultaneous Pinch and Rotation on one view, both active", async () => {
  const target = createRef<ViewHandle>()
  const pinchUpdate = vi.fn()
  const rotationUpdate = vi.fn()
  const controlUpdate = vi.fn()

  const pinch = Gesture.Pinch().onUpdate(pinchUpdate)
  const rotation = Gesture.Rotation().onUpdate(rotationUpdate)
  const controlPinch = Gesture.Pinch().onUpdate(controlUpdate)

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, rotation)}>
        <View
          ref={target}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>both target</Text>
        </View>
      </GestureDetector>
      <GestureDetector gesture={controlPinch}>
        <View style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}>
          <Text>untouched</Text>
        </View>
      </GestureDetector>
    </View>,
    "both target",
  )

  const widget = widgetOf(target.current)
  const zoom = controllerOf(widget, Gtk.GestureZoom)
  const rotate = controllerOf(widget, Gtk.GestureRotate)

  await fireEvent(zoom, "begin", null)
  await fireEvent(rotate, "begin", null)
  await fireEvent(zoom, "scale-changed", 1.5)
  await fireEvent(rotate, "angle-changed", 0.5, 0.5)
  await fireEvent(zoom, "scale-changed", 2)
  await fireEvent(rotate, "angle-changed", 0.9, 0.9)
  await fireEvent(zoom, "end", null)
  await fireEvent(rotate, "end", null)

  // The `Gesture.Simultaneous(pinch, rotation)` a photo viewer writes. Without
  // the relation, mutual exclusion is the default and whichever activated
  // first would have cancelled the other — which is the next test.
  expect(pinchUpdate).toHaveBeenCalledTimes(1)
  expect(rotationUpdate).toHaveBeenCalledTimes(1)
  expect(pinchUpdate.mock.calls[0]![0].scale).toBeCloseTo(2, 6)
  expect(rotationUpdate.mock.calls[0]![0].rotation).toBeCloseTo(0.9, 6)
  expect(controlUpdate).not.toHaveBeenCalled()
})

it("cancels the loser when the two RACE, which is the default", async () => {
  const target = createRef<ViewHandle>()
  const pinchStart = vi.fn()
  const rotationStart = vi.fn()
  const rotationFinalize = vi.fn()

  const pinch = Gesture.Pinch().onStart(pinchStart)
  const rotation = Gesture.Rotation()
    .onStart(rotationStart)
    .onFinalize(rotationFinalize)

  await mount(
    <GestureDetector gesture={Gesture.Race(pinch, rotation)}>
      <View
        ref={target}
        style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
      >
        <Text>race target</Text>
      </View>
    </GestureDetector>,
    "race target",
  )

  const widget = widgetOf(target.current)
  const zoom = controllerOf(widget, Gtk.GestureZoom)
  const rotate = controllerOf(widget, Gtk.GestureRotate)

  await fireEvent(zoom, "begin", null)
  await fireEvent(rotate, "begin", null)
  await fireEvent(zoom, "scale-changed", 1.5)
  await fireEvent(rotate, "angle-changed", 0.5, 0.5)

  expect(pinchStart).toHaveBeenCalledTimes(1)
  expect(rotationStart).not.toHaveBeenCalled()
  // `makeActive`'s broadcast cancel, reached through the same `tryActivate`
  // every other kind goes through. There is no second arbitration path.
  expect(rotationFinalize).toHaveBeenCalledTimes(1)
  expect(rotationFinalize.mock.calls[0]![0].state).toBe(State.CANCELLED)
})

it("does not begin a Pinch on a REAL mouse press, while a Pan beside it does", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const target = createRef<ViewHandle>()
  const pinchBegin = vi.fn()
  const panBegin = vi.fn()

  // Both on the same view. The `Pan` is the positive control: it is what
  // proves the press really arrived and was really ignored by the pinch,
  // rather than nothing having happened at all. Without it this test would
  // pass on a broken pointer.
  await mount(
    <GestureDetector
      gesture={Gesture.Simultaneous(
        Gesture.Pinch().onBegin(pinchBegin),
        Gesture.Pan().onBegin(panBegin),
      )}
    >
      <View
        ref={target}
        style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
      >
        <Text>press target</Text>
      </View>
    </GestureDetector>,
    "press target",
  )
  await fullscreenWindow(
    screen.getByText("press target") as unknown as GtkNs.Widget,
  )

  const centre = centreOf(target.current!)
  await step(() => device.moveTo(centre.x, centre.y))
  await step(() => device.press())
  await step(() => device.moveTo(centre.x, centre.y + 40))
  await step(() => device.release())

  expect(panBegin).toHaveBeenCalledTimes(1)
  expect(pinchBegin).not.toHaveBeenCalled()
})
