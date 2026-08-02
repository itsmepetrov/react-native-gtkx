// `Fling`, `Manual`, `Hover` and `ForceTouch` against real widgets, with the
// first three driven by a REAL `zwlr_virtual_pointer_v1`.
//
// A Wayland pointer is addressed by POSITION, not by focus, so "a callback
// fired" is never evidence on its own — every test below also asserts that the
// card beside the target stayed silent.
//
// HOW FAR EACH ONE IS DRIVEN, because the four differ and the difference is the
// point of this file:
//
//   - `Fling` and `Manual` are pointer kinds. Injected press, injected moves,
//     injected release: the whole chain, exactly as `Pan` is driven in
//     gesture-detector.gtk.test.tsx;
//   - `Hover` is a pointer kind too, and this is the finding that reopened it.
//     `docs/research/gesture-detector.md` grouped it with the gestures that had
//     "no input to run on", which was inherited from its neighbours rather than
//     measured. A hover needs no button — it needs `motion_absolute` and
//     nothing else, which is the one request this harness has always had. So
//     `Hover` is the most fully verified of the four, not the least;
//   - `ForceTouch` cannot be driven from here at all. Pressure is a tablet
//     axis, and a tablet is invisible to a compositor started with
//     `WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1`. What is asserted here
//     is the wiring — that the detector attaches a `GtkGestureStylus`, that it
//     is stylus-only, and that a real mouse dragging over it produces NOTHING,
//     which is the assertion that keeps a machine with no tablet from
//     producing a force touch at pressure 0. The chain below the controller is
//     measured by the session probe (`spike/gesture-detector/run-stylus.sh`),
//     the same split `Pinch`/`Rotation` already live with.
//
// VELOCITY IS REAL TIME HERE. `press-event.ts` stamps every touch with
// `performance.now()` rather than with the compositor's event time, so the
// pacing of the injected moves IS the velocity the recognizer computes. That
// is what makes the slow-drag test below meaningful rather than arranged.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { widgetForHandle } from "../../../src/components/measure"
import {
  Directions,
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

const settle = async (ms = 40): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
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
      console.warn(`[rest-gestures] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

const mount = async (tree: ReactNode, label: string): Promise<void> => {
  await act(async () => {
    await render(
      <Root
        width={900}
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

/** One injected step, with a settle: GTK processes the GdkEvent on this loop. */
const step = async (action: () => void, ms = 40): Promise<void> => {
  action()
  await settle(ms)
}

/**
 * The controller the detector attached, found on the widget itself.
 *
 * Not a handle the module hands out: what this asserts is that the detector put
 * a controller of the right class on the right widget.
 */
const controllersOf = <T,>(
  widget: GtkNs.Widget,
  Kind: new (...args: never[]) => T,
): T[] => {
  const controllers = widget.observeControllers()
  const found: T[] = []
  for (let index = 0; index < controllers.getNItems(); index += 1) {
    const item = controllers.getItem(index)
    if (item instanceof Kind) {
      found.push(item as T)
    }
  }
  return found
}

// --- Fling ---------------------------------------------------------------

/**
 * Two cards side by side: a fling target and a card the pointer never visits.
 */
const flingScene = (
  target: React.RefObject<ViewHandle | null>,
  gesture: ReturnType<typeof Gesture.Fling>,
  controlTouched: () => boolean,
): ReactNode => (
  <View style={{ flexDirection: "row", gap: 40, padding: 20 }}>
    <GestureDetector gesture={gesture}>
      <View
        ref={target}
        style={{ width: 420, height: 220, backgroundColor: "#62a0ea" }}
      >
        <Text>fling target</Text>
      </View>
    </GestureDetector>
    <View
      style={{ width: 200, height: 220, backgroundColor: "#c01c28" }}
      onTouchStart={controlTouched}
      onStartShouldSetResponder={controlTouched}
    >
      <Text>untouched</Text>
    </View>
  </View>
)

it("flings on a fast injected flick, and reports END", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const target = createRef<ViewHandle>()
  const control = vi.fn(() => false)
  const onStart = vi.fn()
  const onEnd = vi.fn()
  const onUpdate = vi.fn()

  const fling = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onStart(onStart)
    .onEnd(onEnd)

  await mount(flingScene(target, fling, control), "fling target")

  const start = centreOf(target.current!)
  await step(() => device.moveTo(start.x - 150, start.y))
  await step(() => device.press())
  // Two 75px steps as fast as the harness will settle: well past the 700 px/s
  // floor whatever the machine is doing.
  await step(() => device.moveTo(start.x - 75, start.y), 16)
  await step(() => device.moveTo(start.x, start.y), 16)
  await step(() => device.release())

  expect(onStart).toHaveBeenCalledTimes(1)
  expect(onEnd).toHaveBeenCalledTimes(1)
  // A fling activating IS a fling ending, so there is never an update between
  // them — this is upstream's overridden `activate()`, over a real pointer.
  expect(onUpdate).not.toHaveBeenCalled()
  expect(onEnd.mock.calls[0]![1]).toBe(true)
  expect(onEnd.mock.calls[0]![0].state).toBe(State.END)
  // NEGATIVE CONTROL: the card the pointer never visited.
  expect(control).not.toHaveBeenCalled()
})

it("does NOT fling on a slow injected drag across the same distance", async () => {
  // THE TEST A NAIVE IMPLEMENTATION PASSES AND THIS ONE MUST NOT. Same two
  // cards, same 150px, same direction, same injected requests — only the clock
  // differs. `performance.now()` stamps each touch, so a 300ms settle really is
  // a 500 px/s drag rather than a 4700 px/s flick.
  const device = await withPointer()
  if (!device) {
    return
  }
  const target = createRef<ViewHandle>()
  const control = vi.fn(() => false)
  const onStart = vi.fn()
  const onEnd = vi.fn()

  const fling = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onStart(onStart)
    .onEnd(onEnd)

  await mount(flingScene(target, fling, control), "fling target")

  const start = centreOf(target.current!)
  await step(() => device.moveTo(start.x - 150, start.y))
  // The WAIT GOES BEFORE THE MOVE, which is the whole of what makes this drag
  // slow: `step` acts and then settles, so a long settle after a move paces the
  // NEXT one. Pacing the press this way is what puts 300ms between the press
  // and the first 75px, rather than 300ms between two moves that already
  // happened quickly.
  const began = Date.now()
  await step(() => device.press(), 300)
  await step(() => device.moveTo(start.x - 75, start.y), 300)
  await step(() => device.moveTo(start.x, start.y), 0)
  const elapsed = Date.now() - began

  // Asserted BEFORE the release and before the 800ms deadline could have
  // fired, so this test cannot quietly decay into a test of the timer: what it
  // measures is that 150px at roughly 250 px/s is not a fling, where the same
  // 150px at roughly 1900 px/s is.
  expect(elapsed).toBeLessThan(800)
  expect(onStart).not.toHaveBeenCalled()

  await step(() => device.release())
  expect(onStart).not.toHaveBeenCalled()
  expect(onEnd).not.toHaveBeenCalled()
  expect(control).not.toHaveBeenCalled()
})

it("refuses a fast flick in a direction it was not configured for", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const target = createRef<ViewHandle>()
  const control = vi.fn(() => false)
  const onStart = vi.fn()

  // UP only, and the flick is to the right — fast enough, pointed elsewhere.
  const fling = Gesture.Fling().direction(Directions.UP).onStart(onStart)

  await mount(flingScene(target, fling, control), "fling target")

  const start = centreOf(target.current!)
  await step(() => device.moveTo(start.x - 150, start.y))
  await step(() => device.press())
  await step(() => device.moveTo(start.x - 75, start.y), 16)
  await step(() => device.moveTo(start.x, start.y), 16)
  await step(() => device.release())

  expect(onStart).not.toHaveBeenCalled()
  expect(control).not.toHaveBeenCalled()
})

// --- Hover ---------------------------------------------------------------

it("hovers on a real injected crossing, with no button pressed at all", async () => {
  // The gesture the recon refused for want of input. There is no `press()`
  // anywhere in this test — a hover needs `motion_absolute` and nothing else.
  const device = await withPointer()
  if (!device) {
    return
  }
  const target = createRef<ViewHandle>()
  const control = createRef<ViewHandle>()
  const onBegin = vi.fn()
  const onStart = vi.fn()
  const onUpdate = vi.fn()
  const onEnd = vi.fn()
  const controlStart = vi.fn()

  const hover = Gesture.Hover()
    .onBegin(onBegin)
    .onStart(onStart)
    .onUpdate(onUpdate)
    .onEnd(onEnd)

  // PARKED BEFORE THE TREE EXISTS, which matters and is easy to get wrong: the
  // tests above leave the pointer over their own card, and a widget that is
  // mapped UNDER the pointer receives an `enter` immediately — so a hover
  // mounted there would have begun before this test injected anything, and the
  // crossing asserted below would be a second one rather than the first.
  await step(() => device.moveTo(5, OUTPUT.height - 5))

  await mount(
    <View style={{ flexDirection: "row", gap: 60, padding: 20 }}>
      <GestureDetector gesture={hover}>
        <View
          ref={target}
          style={{ width: 300, height: 220, backgroundColor: "#62a0ea" }}
        >
          <Text>hover target</Text>
        </View>
      </GestureDetector>
      <GestureDetector gesture={Gesture.Hover().onStart(controlStart)}>
        <View
          ref={control}
          style={{ width: 300, height: 220, backgroundColor: "#c01c28" }}
        >
          <Text>never hovered</Text>
        </View>
      </GestureDetector>
    </View>,
    "hover target",
  )

  const inside = centreOf(target.current!)
  // Still parked in the corner, so nothing has hovered anything yet.
  expect(onBegin).not.toHaveBeenCalled()

  await step(() => device.moveTo(inside.x, inside.y))
  expect(onBegin).toHaveBeenCalledTimes(1)
  // Straight to ACTIVE on the crossing, which is upstream's `begin(); activate();`
  expect(onStart).toHaveBeenCalledTimes(1)
  expect(onStart.mock.calls[0]![0].state).toBe(State.ACTIVE)

  await step(() => device.moveTo(inside.x + 40, inside.y + 30))
  await step(() => device.moveTo(inside.x + 80, inside.y + 30))
  expect(onUpdate.mock.calls.length).toBeGreaterThanOrEqual(2)
  // The payload's x/y are relative to the GESTURE's own view.
  const last = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]![0]
  expect(last.x).toBeGreaterThan(0)
  expect(last.y).toBeGreaterThan(0)
  expect(onEnd).not.toHaveBeenCalled()

  // Leaving ENDS it, successfully — a pointer leaving is a hover finishing,
  // not something taking it away.
  await step(() => device.moveTo(5, OUTPUT.height - 5))
  expect(onEnd).toHaveBeenCalledTimes(1)
  expect(onEnd.mock.calls[0]![1]).toBe(true)
  expect(onEnd.mock.calls[0]![0].state).toBe(State.END)

  // NEGATIVE CONTROL: the second detector, which the pointer never crossed.
  expect(controlStart).not.toHaveBeenCalled()
})

it("attaches one motion controller per detector, not one on a shared ancestor", async () => {
  // If a single controller sat on an ancestor, both cards above would fire
  // together and the negative control would be meaningless.
  const target = createRef<ViewHandle>()
  const control = createRef<ViewHandle>()

  await mount(
    <View style={{ flexDirection: "row", gap: 60, padding: 20 }}>
      <GestureDetector gesture={Gesture.Hover()}>
        <View
          ref={target}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>one</Text>
        </View>
      </GestureDetector>
      <View
        ref={control}
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
      >
        <Text>two</Text>
      </View>
    </View>,
    "one",
  )

  const hovered = widgetForHandle(target.current)!
  const plain = widgetForHandle(control.current)!
  expect(controllersOf(hovered, Gtk.EventControllerMotion)).toHaveLength(1)
  expect(controllersOf(plain, Gtk.EventControllerMotion)).toHaveLength(0)
})

// --- Manual --------------------------------------------------------------

it("lets the app drive the state machine from a real press", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const target = createRef<ViewHandle>()
  const control = vi.fn(() => false)
  const onBegin = vi.fn()
  const onStart = vi.fn()
  const onUpdate = vi.fn()
  const onEnd = vi.fn()

  // The app's own rule, which is the whole point of `Manual`: activate once the
  // drag has gone further right than 60px, which is not a criterion any
  // recognizer in this module has.
  let pressX = 0
  const manual = Gesture.Manual()
    .onBegin(onBegin)
    .onStart(onStart)
    .onUpdate(onUpdate)
    .onEnd(onEnd)
    .onTouchesDown((event, manager) => {
      pressX = event.allTouches[0]?.absoluteX ?? 0
      manager.begin()
    })
    .onTouchesMove((event, manager) => {
      const x = event.allTouches[0]?.absoluteX ?? 0
      if (x - pressX > 60) {
        manager.activate()
      }
    })
    .onTouchesUp((_event, manager) => {
      manager.end()
    })

  await mount(
    <View style={{ flexDirection: "row", gap: 40, padding: 20 }}>
      <GestureDetector gesture={manual}>
        <View
          ref={target}
          style={{ width: 420, height: 220, backgroundColor: "#62a0ea" }}
        >
          <Text>manual target</Text>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 220, backgroundColor: "#c01c28" }}
        onTouchStart={control}
        onStartShouldSetResponder={control}
      >
        <Text>untouched</Text>
      </View>
    </View>,
    "manual target",
  )

  const start = centreOf(target.current!)
  await step(() => device.moveTo(start.x - 150, start.y))
  await step(() => device.press())
  expect(onBegin).toHaveBeenCalledTimes(1)

  // Below the app's own threshold: nothing, however far a Pan would have gone.
  await step(() => device.moveTo(start.x - 120, start.y))
  expect(onStart).not.toHaveBeenCalled()

  await step(() => device.moveTo(start.x - 40, start.y))
  expect(onStart).toHaveBeenCalledTimes(1)

  await step(() => device.moveTo(start.x + 40, start.y))
  expect(onUpdate.mock.calls.length).toBeGreaterThanOrEqual(1)

  await step(() => device.release())
  expect(onEnd).toHaveBeenCalledTimes(1)
  expect(onEnd.mock.calls[0]![1]).toBe(true)
  expect(control).not.toHaveBeenCalled()
})

// --- ForceTouch ----------------------------------------------------------

it("attaches a stylus-only GtkGestureStylus, which a real mouse cannot drive", async () => {
  // The negative control that matters most for this gesture: without it, a
  // `ForceTouch` on a machine with no tablet might quietly activate at
  // pressure 0 and look like it worked. A real injected press and drag over
  // the widget must produce nothing at all.
  const device = await withPointer()
  if (!device) {
    return
  }
  const target = createRef<ViewHandle>()
  const onBegin = vi.fn()
  const onStart = vi.fn()
  const onEnd = vi.fn()

  const force = Gesture.ForceTouch()
    .minForce(0.2)
    .onBegin(onBegin)
    .onStart(onStart)
    .onEnd(onEnd)

  await mount(
    <View style={{ padding: 20 }}>
      <GestureDetector gesture={force}>
        <View
          ref={target}
          style={{ width: 300, height: 220, backgroundColor: "#62a0ea" }}
        >
          <Text>force target</Text>
        </View>
      </GestureDetector>
    </View>,
    "force target",
  )

  const widget = widgetForHandle(target.current)!
  const stylus = controllersOf(widget, Gtk.GestureStylus)
  expect(stylus).toHaveLength(1)
  // Stylus-only is GTK's default and is what keeps a mouse out. Asserted
  // rather than assumed, because flipping it would silently turn every mouse
  // press into a pressure-0 force touch.
  expect(stylus[0]!.getStylusOnly()).toBe(true)

  const centre = centreOf(target.current!)
  await step(() => device.moveTo(centre.x, centre.y))
  await step(() => device.press())
  await step(() => device.moveTo(centre.x + 60, centre.y + 40))
  await step(() => device.release())

  // A mouse is not a tablet tool. Nothing fired, at any stage.
  expect(onBegin).not.toHaveBeenCalled()
  expect(onStart).not.toHaveBeenCalled()
  expect(onEnd).not.toHaveBeenCalled()
})
