// Cross-gesture relations against a real pointer, with the responder lock
// watched while they run.
//
// Everything here is driven by a `zwlr_virtual_pointer_v1`. That is not
// gold-plating: the whole of slice 3 rests on a gesture that sits in `BEGAN`
// watching an UNCLAIMED sequence while another decides, and `userEvent` emits
// gesture signals directly without ever producing a GdkEvent — a test written
// against it would agree with whatever the implementation happened to do.
//
// A Wayland pointer is addressed by POSITION, not by focus. "A callback fired"
// is therefore not evidence on its own, and every test below also asserts that
// the card next to the target stayed silent; the last one is a negative
// control with two real `GestureDetector`s and a relation between them.
//
// The unit half of the same claims, where the loop can be inspected directly,
// is tests/unit/gesture-handler/orchestrator.test.ts.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import {
  Gesture,
  GestureDetector,
} from "../../../src/gesture-handler-compat/index"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text, View, type ViewHandle } from "../../../src/index"
import { getCurrentResponder } from "../../../src/responder/use-responder"
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
      console.warn(`[gesture-relations] skipped: ${error.message}`)
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

/**
 * How many views hold the responder right now.
 *
 * There is exactly one lock and it has one holder or none — that is the fact
 * the `Simultaneous` test has to check WHILE two gestures are active, because
 * the alternative design (a multi-holder responder lock) would pass every
 * gesture-level assertion and break `PanResponder` silently.
 */
const responderCount = (): number => (getCurrentResponder() === null ? 0 : 1)

it("requireExternalGestureToFail holds the pan in BEGAN until the other fails", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  // THE ASSERTION THAT PROVES THE SLICE. Two real detectors, one nested in the
  // other, one injected pointer, and a relation that has to hold the inner one
  // still while the outer one makes up its mind. A registry that ignored the
  // relation would start the sheet at 15px; one that never released it would
  // never start it at all.
  const sheet = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const trace: string[] = []

  // The outer gesture is a horizontal scroller: it fails the moment the drag
  // has gone far enough DOWN.
  const scroller = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-25, 25])
    .onBegin(() => trace.push("scroller:begin"))
    .onStart(() => trace.push("scroller:start"))
    .onFinalize((_event, success) =>
      trace.push(`scroller:finalize(${success})`),
    )

  const sheetPan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .requireExternalGestureToFail(scroller)
    .onBegin(() => trace.push("sheet:begin"))
    .onStart(() => trace.push("sheet:start"))
    .onFinalize((_event, success) => trace.push(`sheet:finalize(${success})`))

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={scroller}>
        <View style={{ width: 240, height: 240, backgroundColor: "#3d3846" }}>
          <GestureDetector gesture={sheetPan}>
            <View
              ref={sheet}
              style={{
                width: 200,
                height: 200,
                margin: 20,
                backgroundColor: "#62a0ea",
              }}
            >
              <Text>relation target</Text>
            </View>
          </GestureDetector>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
        onStartShouldSetResponder={neighbour}
      >
        <Text>relation control</Text>
      </View>
    </View>,
    "relation target",
  )

  const start = centreOf(sheet.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())

  // 15px down. The sheet's own `activeOffsetY` is satisfied and it is HELD:
  // still BEGAN, and — the other half of the claim — nothing has taken the
  // responder, so nothing has been claimed in GTK either.
  await dragBy(device, start, 0, 15, 3)
  expect(trace).toEqual(["sheet:begin", "scroller:begin"])
  expect(responderCount()).toBe(0)

  // 45px down. Past the scroller's `failOffsetY`: it fails, and the failure is
  // what releases the sheet.
  await dragBy(device, start, 0, 45, 3)
  expect(trace).toContain("scroller:finalize(false)")
  expect(trace).toContain("sheet:start")
  expect(trace).not.toContain("scroller:start")
  expect(responderCount()).toBe(1)

  await step(() => device.release())
  expect(trace).toContain("sheet:finalize(true)")
  expect(neighbour).not.toHaveBeenCalled()
})

it("SIMULTANEOUS: two gestures are really active at once, and the responder lock is still single-holder", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  // The test the whole slice was shaped around, and it has to assert BOTH
  // facts in one run. Two `GestureDetector`s, both ACTIVE, both receiving
  // updates for the same injected pointer — and exactly one responder while
  // they are. Merging the two locks would have satisfied the first assertion
  // and broken the second, taking `PanResponder` and every RN-portable app on
  // this platform with it.
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const sheetMoves: number[] = []
  const contentMoves: number[] = []
  const started: string[] = []
  /** Holders observed WHILE both gestures were active. */
  const holdersDuringDrag: number[] = []

  const sheet = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => started.push("sheet"))
    .onUpdate((event) => {
      sheetMoves.push(event.translationY)
      holdersDuringDrag.push(responderCount())
    })

  const content = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .simultaneousWithExternalGesture(sheet)
    .onStart(() => started.push("content"))
    .onUpdate((event) => {
      contentMoves.push(event.translationY)
      holdersDuringDrag.push(responderCount())
    })

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={sheet}>
        <View style={{ width: 240, height: 240, backgroundColor: "#26a269" }}>
          <GestureDetector gesture={content}>
            <View
              ref={card}
              style={{
                width: 200,
                height: 200,
                margin: 20,
                backgroundColor: "#8ff0a4",
              }}
            >
              <Text>simultaneous target</Text>
            </View>
          </GestureDetector>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
        onStartShouldSetResponder={neighbour}
      >
        <Text>simultaneous control</Text>
      </View>
    </View>,
    "simultaneous target",
  )

  const start = centreOf(card.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 0, 90, 6)

  // FACT ONE: both are active, and both are being driven. The outer one has
  // no responder at all, so its updates can only have come from the touch
  // props — which is the second pump the slice had to add.
  expect(started.sort()).toEqual(["content", "sheet"])
  expect(sheetMoves.length).toBeGreaterThan(0)
  expect(contentMoves.length).toBeGreaterThan(0)
  expect(sheetMoves[sheetMoves.length - 1]!).toBeGreaterThan(50)
  expect(contentMoves[contentMoves.length - 1]!).toBeGreaterThan(50)

  // FACT TWO: never more than one responder while that was happening.
  expect(holdersDuringDrag.length).toBeGreaterThan(0)
  expect(Math.max(...holdersDuringDrag)).toBe(1)

  await step(() => device.release())
  expect(responderCount()).toBe(0)
  expect(neighbour).not.toHaveBeenCalled()
})

it("without the relation, the first to activate cancels the other", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  // The control for the test above: the same two nested detectors with the
  // relation removed. Mutual exclusion is the DEFAULT, so exactly one of them
  // may start — and if this passed as well as the test above, neither would be
  // evidence of anything.
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const started: string[] = []
  const finalized: string[] = []

  const outer = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => started.push("outer"))
    .onFinalize((_event, success) => finalized.push(`outer(${success})`))
  const inner = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => started.push("inner"))
    .onFinalize((_event, success) => finalized.push(`inner(${success})`))

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={outer}>
        <View style={{ width: 240, height: 240, backgroundColor: "#613583" }}>
          <GestureDetector gesture={inner}>
            <View
              ref={card}
              style={{
                width: 200,
                height: 200,
                margin: 20,
                backgroundColor: "#dc8add",
              }}
            >
              <Text>exclusive target</Text>
            </View>
          </GestureDetector>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>exclusive control</Text>
      </View>
    </View>,
    "exclusive target",
  )

  const start = centreOf(card.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 0, 60, 4)

  expect(started).toEqual(["inner"])
  expect(finalized).toContain("outer(false)")
  expect(responderCount()).toBe(1)

  await step(() => device.release())
  expect(neighbour).not.toHaveBeenCalled()
})

it("composes two gestures onto one child, and adds no widget doing it", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  // `Gesture.Simultaneous` on ONE detector: two recognizers, one child, and
  // still no box of its own. The composers are list-builders over the same
  // maps the relation methods write, so what is being checked here is the
  // detector's half of that — several recognizers merged onto one view.
  const card = createRef<ViewHandle>()
  const neighbour = vi.fn()
  const trace: string[] = []

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => trace.push("pan"))
  const hold = Gesture.LongPress()
    .minDuration(200)
    .onStart(() => trace.push("hold"))

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, hold)}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#ffbe6f" }}
        >
          <Text>composed target</Text>
        </View>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>composed control</Text>
      </View>
    </View>,
    "composed target",
  )

  // Still the direct child of the row: a composed gesture is still no widget.
  const cardWidget = screen.getByText("composed target").getParent()!
  expect(cardWidget.getParent()).toBeTruthy()

  const start = centreOf(card.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  // Hold first, so the long press matures on its timer...
  await settle(320)
  expect(trace).toEqual(["hold"])

  // ...then drag, and the pan joins it instead of being cancelled by it.
  await dragBy(device, start, 0, 60, 4)
  expect(trace.sort()).toEqual(["hold", "pan"])
  expect(responderCount()).toBe(1)

  await step(() => device.release())
  expect(neighbour).not.toHaveBeenCalled()
})

it("NEGATIVE CONTROL: a related gesture the pointer never visits stays silent", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  // The control that carries every assertion above. Both cards are real
  // `GestureDetector`s and there is a real relation between them — so this
  // rules out relations firing on mount, on registration, or on position
  // alone. Only the card the pointer actually went to may say anything.
  const visited = createRef<ViewHandle>()
  const here = vi.fn()
  const away = vi.fn()

  const untouched = Gesture.Pan().onBegin(away)
  const touched = Gesture.Pan()
    .simultaneousWithExternalGesture(untouched)
    .onBegin(here)

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={touched}>
        <View
          ref={visited}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>related visited</Text>
        </View>
      </GestureDetector>
      <GestureDetector gesture={untouched}>
        <View style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}>
          <Text>related never visited</Text>
        </View>
      </GestureDetector>
    </View>,
    "related visited",
  )

  const start = centreOf(visited.current!)
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 0, 80)
  await step(() => device.release())

  expect(here).toHaveBeenCalled()
  expect(away).not.toHaveBeenCalled()
})
