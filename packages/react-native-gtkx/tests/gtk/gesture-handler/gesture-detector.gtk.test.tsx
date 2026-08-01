// `GestureDetector` and `Gesture.Pan()` against a real pointer, with every
// assertion taken from GTK's own allocation rather than from a value the test
// stored itself.
//
// Everything here is driven by a `zwlr_virtual_pointer_v1`. That is not
// gold-plating: the whole design rests on a recognizer that watches an
// UNCLAIMED sequence and decides late, and `userEvent` emits gesture signals
// directly without ever producing a GdkEvent — a test written against it
// would agree with whatever the implementation happened to do. The offsets
// are only meaningful against a pointer that really moved.
//
// A Wayland pointer is addressed by POSITION, not by focus. "A callback
// fired" is therefore not evidence on its own, and every test below also
// asserts that the card next to the target stayed silent.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import {
  Gesture,
  GestureDetector,
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

const settle = async (ms = 60): Promise<void> => {
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

/** The view's top-left in window coordinates — real GTK allocation. */
const originOf = (handle: ViewHandle): { x: number; y: number } => {
  let point: { x: number; y: number } | null = null
  handle.measureInWindow((x, y) => {
    point = { x, y }
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
      console.warn(`[gesture-detector] skipped: ${error.message}`)
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

/** One injected step, with a settle: GTK processes the GdkEvent on this loop. */
const step = async (action: () => void, ms = 45): Promise<void> => {
  action()
  await settle(ms)
}

const dragBy = async (
  device: VirtualPointer,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  steps = 6,
): Promise<void> => {
  for (let i = 1; i <= steps; i += 1) {
    await step(() => {
      device.moveTo(from.x + (dx * i) / steps, from.y + (dy * i) / steps)
    })
  }
}

it("moves REAL GTK geometry from a shared-value-shaped onUpdate, with no widget of its own", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const moved: number[] = []
  // The detector writes into an ordinary style through a re-render here
  // rather than through a shared value — the animated path has its own
  // coverage — so what this asserts is that translation reaches the caller
  // and that the widget the pointer is over is the card itself.
  const pan = Gesture.Pan().onUpdate((event) => {
    moved.push(event.translationY)
  })

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={pan}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>drag target</Text>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
        onStartShouldSetResponder={neighbour}
      >
        <Text>untouched</Text>
      </View>
    </View>,
    "drag target",
  )

  const start = centreOf(card.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 0, 90)
  await step(() => device.release())

  expect(moved.length).toBeGreaterThan(0)
  // Activation happens at the 10px default, and translation is measured from
  // there — so the last update reports the travel after activation, not the
  // full 90px.
  expect(moved[moved.length - 1]!).toBeGreaterThan(60)
  expect(moved[moved.length - 1]!).toBeLessThanOrEqual(90)

  // GestureDetector adds no widget: the card's own box is still the direct
  // child of the row, so its parent is what the row allocated and nothing
  // was inserted between them.
  const cardWidget = screen.getByText("drag target").getParent()!
  const row = cardWidget.getParent()
  expect(row).toBeTruthy()
  expect(row!.getParent()).toBeTruthy()

  expect(neighbour).not.toHaveBeenCalled()
})

it("adds no widget to the tree", async () => {
  const withDetector = createRef<ViewHandle>()
  const pan = Gesture.Pan()

  await mount(
    <View style={{ padding: 10 }}>
      <GestureDetector gesture={pan}>
        <View
          ref={withDetector}
          style={{ width: 100, height: 100 }}
        >
          <Text>wrapped</Text>
        </View>
      </GestureDetector>
    </View>,
    "wrapped",
  )

  // The depth from the wrapped view up to the Root must be the same as it
  // would be without the detector. Counting widgets is the only check that
  // would have caught an "it's only one extra box" regression: the layout
  // would still have looked right in a screenshot.
  const wrapped = screen.getByText("wrapped").getParent()!
  let depth = 0
  for (
    let widget: GtkNs.Widget | null = wrapped;
    widget !== null;
    widget = widget.getParent()
  ) {
    depth += 1
  }

  await act(async () => {
    await render(
      <Root
        width={700}
        height={500}
      >
        <View style={{ padding: 10 }}>
          <View style={{ width: 100, height: 100 }}>
            <Text>bare</Text>
          </View>
        </View>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("bare")).toBeTruthy()
  })

  const bare = screen.getByText("bare").getParent()!
  let bareDepth = 0
  for (
    let widget: GtkNs.Widget | null = bare;
    widget !== null;
    widget = widget.getParent()
  ) {
    bareDepth += 1
  }

  expect(depth).toBe(bareDepth)
})

it("holds the gesture BEGAN below activeOffsetY and activates above it", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const trace: string[] = []
  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onBegin(() => trace.push("begin"))
    .onStart(() => trace.push("start"))
    .onFinalize(() => trace.push("finalize"))

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={pan}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#8ff0a4" }}
        >
          <Text>offset target</Text>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>offset control</Text>
      </View>
    </View>,
    "offset target",
  )

  const start = centreOf(card.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 0, 6, 3)
  expect(trace).toEqual(["begin"])

  await dragBy(device, start, 0, 60, 6)
  expect(trace).toContain("start")

  await step(() => device.release())
  expect(neighbour).not.toHaveBeenCalled()
})

it("fails the pan past failOffsetX, and a later vertical move cannot revive it", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const trace: string[] = []
  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onBegin(() => trace.push("begin"))
    .onStart(() => trace.push("start"))
    .onFinalize((_event, success) => trace.push(`finalize(${success})`))

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={pan}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#8ff0a4" }}
        >
          <Text>fail target</Text>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>fail control</Text>
      </View>
    </View>,
    "fail target",
  )

  const start = centreOf(card.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 40, 0, 4)
  expect(trace).toEqual(["begin", "finalize(false)"])

  // 60px straight down would have activated it, had it still been alive.
  await dragBy(device, { x: start.x + 40, y: start.y }, 0, 60, 4)
  await step(() => device.release())
  expect(trace).toEqual(["begin", "finalize(false)"])
  expect(neighbour).not.toHaveBeenCalled()
})

it("activateAfterLongPress refuses an immediate drag and grants on the timer", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const trace: string[] = []
  let offset = 0
  const pan = Gesture.Pan()
    .activateAfterLongPress(200)
    .onBegin(() => trace.push("begin"))
    .onStart(() => trace.push("start"))
    .onUpdate((event) => {
      offset = event.translationY
    })
    .onFinalize((_event, success) => trace.push(`finalize(${success})`))

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={pan}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>hold target</Text>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>hold control</Text>
      </View>
    </View>,
    "hold target",
  )

  const start = centreOf(card.current!)

  // A. drag immediately: the press was a drag, not a hold.
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 0, 90, 6)
  await step(() => device.release())
  expect(trace).toEqual(["begin", "finalize(false)"])

  // B. hold, and the gesture activates WITHOUT the pointer moving — the
  // out-of-event grant channel. Before that channel existed the spike this
  // replaced could only activate on the first move after the timer.
  trace.length = 0
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await settle(320)
  expect(trace).toEqual(["begin", "start"])

  await dragBy(device, start, 0, 90, 6)
  await step(() => device.release())
  // Granted while the pointer was still, so translation is measured from the
  // press and the whole travel arrives.
  expect(offset).toBeGreaterThan(80)
  expect(neighbour).not.toHaveBeenCalled()
})

it("gates the press on an anchored hitSlop, the way a closed drawer does", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const trace: string[] = []
  // react-native-drawer-layout's closed-drawer strip.
  const pan = Gesture.Pan()
    .hitSlop({ left: 0, width: 32 })
    .onBegin(() => trace.push("begin"))

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={pan}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#dc8add" }}
        >
          <Text>edge target</Text>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>edge control</Text>
      </View>
    </View>,
    "edge target",
  )

  const origin = originOf(card.current!)
  const centre = centreOf(card.current!)

  // The middle of the card is inside the widget and outside the gesture.
  await step(() => device.moveTo(centre.x, centre.y))
  await step(() => device.press())
  await step(() => device.release())
  expect(trace).toEqual([])

  // 10px in from the left edge is inside the 32px strip.
  await step(() => device.moveTo(origin.x + 10, centre.y))
  await step(() => device.press())
  await step(() => device.release())
  expect(trace).toEqual(["begin"])

  expect(neighbour).not.toHaveBeenCalled()
})

it("NEGATIVE CONTROL: a card the pointer never visits stays silent throughout", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const touched = vi.fn()
  const untouched = vi.fn()

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={Gesture.Pan().onBegin(touched)}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>visited</Text>
        </View>
      </GestureDetector>
      <GestureDetector gesture={Gesture.Pan().onBegin(untouched)}>
        <View style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}>
          <Text>never visited</Text>
        </View>
      </GestureDetector>
    </View>,
    "visited",
  )

  const start = centreOf(card.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 0, 80)
  await step(() => device.release())

  // The control is a real GestureDetector with a real Pan on it — not a bare
  // View — so this rules out the whole detector firing on position alone.
  expect(touched).toHaveBeenCalled()
  expect(untouched).not.toHaveBeenCalled()
})

it("does not jump when a already-moved view is grabbed again", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  // The regression this file exists for, reported by hand: after moving a
  // card, a NEW drag on it snapped before it followed.
  //
  // Measured, the cause is the CONSUMER's arithmetic and not the recognizer's:
  // `translationY` is measured from where THIS gesture activated and so starts
  // at zero on every grab, exactly as upstream's `resetProgress` makes it.
  // Writing `y = translationY` discards the accumulated offset and snaps the
  // card back toward its origin; capturing the offset in `onStart` and adding
  // it is the documented pattern. Both are driven below against real GTK
  // allocation, so the assertion is about where the widget actually is.
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  let offset = 0
  let start = 0
  // Every `translationY` the recognizer reported, which is exactly what the
  // naive `y = translationY` consumer would have written to the view.
  const reported: number[] = []

  const pan = Gesture.Pan()
    .onStart(() => {
      start = offset
    })
    .onUpdate((event) => {
      offset = start + event.translationY
      reported.push(event.translationY)
    })

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={pan}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>regrab target</Text>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>regrab control</Text>
      </View>
    </View>,
    "regrab target",
  )

  const home = centreOf(card.current!)

  // First drag, and it accumulates.
  await step(() => device.moveTo(home.x, home.y))
  await step(() => device.press())
  await dragBy(device, home, 0, 80)
  await step(() => device.release())
  const afterFirst = offset
  expect(afterFirst).toBeGreaterThan(50)

  // Second grab, at the same place.
  const before = reported.length
  await step(() => device.moveTo(home.x, home.y))
  await step(() => device.press())
  // Crossing the 10px threshold ACTIVATES, and activation reports zero
  // travel, so no update is emitted for it and the card must not have moved.
  await step(() => device.moveTo(home.x, home.y + 12))
  expect(offset).toBe(afterFirst)

  // One more small step, which is the first real update of the second
  // gesture.
  await step(() => device.moveTo(home.x, home.y + 18))
  expect(reported.length).toBeGreaterThan(before)
  const naive = reported[reported.length - 1]!
  // What the recognizer reports for this gesture is a few px, measured from
  // where it activated — NOT the ~67px the card has accumulated. So the
  // accumulate pattern advances by that few px...
  expect(naive).toBeLessThan(20)
  expect(offset - afterFirst).toBeCloseTo(naive, 5)
  // ...while the naive `y = translationY` would have snapped the card from
  // afterFirst down to `naive`. That difference IS the jump the user saw, and
  // it is proportional to the accumulated offset rather than to the 10px
  // activation threshold.
  expect(afterFirst - naive).toBeGreaterThan(40)

  await dragBy(device, { x: home.x, y: home.y + 18 }, 0, 40, 4)
  await step(() => device.release())
  // It carried on from where it was rather than restarting from zero.
  expect(offset).toBeGreaterThan(afterFirst)

  expect(neighbour).not.toHaveBeenCalled()
})
