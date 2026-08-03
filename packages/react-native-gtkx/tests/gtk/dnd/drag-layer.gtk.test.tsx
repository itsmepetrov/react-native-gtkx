// The window-level drag layer (gtkx/bridge/drag-layer.ts), driven by a REAL
// pointer — same discipline as dnd.gtk.test.tsx: a synthesised `prepare`
// would prove our JSX reached the controller, not that a dragged item
// actually escapes an `overflow: hidden` ancestor.
//
// Geometry evidence, not eyeballing: the ghost is a real `Gtk.Picture`, so
// its own allocated bounds (computed against the SAME stage `clip`'s bounds
// are, via `computeBounds`) say whether it left the clip's box, and
// `getCanTarget()` says whether it can take a press — no screenshot needed
// for either.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { afterEach, expect, it } from "vitest"
import { Draggable, DropProvider } from "../../../src/dnd/index"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text, View } from "../../../src/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

const OUTPUT = { width: 1024, height: 768 }

const settle = async (ms = 80): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

const widget = (testID: string): GtkNs.Widget =>
  screen.getByName(testID) as unknown as GtkNs.Widget

const fullscreenWindow = async (anyWidget: GtkNs.Widget): Promise<void> => {
  const root = anyWidget.getRoot()
  if (root instanceof Gtk.Window) {
    root.present()
    root.fullscreen()
    await waitFor(() => {
      expect(root.isActive()).toBe(true)
    })
  }
  await settle()
}

const centreOf = (testID: string): { x: number; y: number } => {
  const target = widget(testID)
  const [ok, bounds] = target.computeBounds(target.getRoot() as GtkNs.Widget)
  expect(ok).toBe(true)
  return {
    x: bounds.getX() + bounds.getWidth() / 2,
    y: bounds.getY() + bounds.getHeight() / 2,
  }
}

type Box = { x: number; y: number; width: number; height: number }

const boundsOf = (target: GtkNs.Widget, against: GtkNs.Widget): Box => {
  const [ok, bounds] = target.computeBounds(against)
  expect(ok).toBe(true)
  return {
    x: Math.round(bounds.getX()),
    y: Math.round(bounds.getY()),
    width: Math.round(bounds.getWidth()),
    height: Math.round(bounds.getHeight()),
  }
}

/**
 * The ghost this feature adds is not part of the React tree — it is a raw
 * `Gtk.Picture` added straight to the window's own `Gtk.Overlay` — so it has
 * no testID and `screen.getByName` cannot find it. Walking the window's real
 * child is the only way in, which is exactly why this proves the escape
 * rather than assuming it: the overlay and the picture both have to be
 * really there.
 */
const findGhost = (anyWidget: GtkNs.Widget): GtkNs.Picture | null => {
  const root = anyWidget.getRoot()
  if (!(root instanceof Gtk.Window)) {
    return null
  }
  const top = root.getChild()
  if (!(top instanceof Gtk.Overlay)) {
    return null
  }
  for (
    let child = top.getFirstChild();
    child !== null;
    child = child.getNextSibling()
  ) {
    if (child instanceof Gtk.Picture) {
      return child
    }
  }
  return null
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
      console.warn(`[drag-layer] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

/** Press and walk to `to`, WITHOUT releasing — the caller inspects the
 *  mid-drag state, then releases itself. */
const holdDragTo = async (
  device: VirtualPointer,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
): Promise<void> => {
  device.moveTo(from.x, from.y)
  await settle()
  device.press()
  await settle()
  for (let step = 1; step <= steps; step += 1) {
    device.moveTo(
      from.x + ((to.x - from.x) * step) / steps,
      from.y + ((to.y - from.y) * step) / steps,
    )
    await settle(60)
  }
}

type Task = { id: string; title: string }

let cardRenders = 0

const CardLabel = () => {
  // Counted in an effect rather than during render, matching the pattern
  // `updater-animations.gtk.test.tsx` uses: this is about how many times the
  // component actually committed, not a value read during render.
  useEffect(() => {
    cardRenders += 1
  })
  return <Text>Card</Text>
}

/**
 * `clip` (100×100 at 50,50, `overflow: hidden`) holds the dragged card.
 * `clipB` is the negative control: a second clipped box, far away, never
 * touched by any gesture below — its own escapee stays clipped throughout,
 * which is what proves the drag layer does not leak a global effect onto
 * unrelated widgets. Both are absolute children of `DropProvider`'s own
 * view, which defaults to `flex: 1` and so fills `stage` exactly the way
 * `stage` itself would — same coordinate space, no offset to account for.
 */
const Stage = () => (
  <View
    style={{ width: OUTPUT.width, height: OUTPUT.height }}
    testID="stage"
  >
    <DropProvider>
      <View
        style={{
          position: "absolute",
          left: 50,
          top: 50,
          width: 100,
          height: 100,
          overflow: "hidden",
          backgroundColor: "#26a269",
        }}
        testID="clip"
      >
        <Draggable<Task>
          data={{ id: "t1", title: "Card" }}
          draggableId="t1"
          style={{
            position: "absolute",
            left: 20,
            top: 30,
            width: 60,
            height: 40,
            backgroundColor: "#1a5fb4",
          }}
          testID="card"
        >
          <CardLabel />
        </Draggable>
      </View>
      <View
        style={{
          position: "absolute",
          left: 300,
          top: 50,
          width: 100,
          height: 100,
          overflow: "hidden",
          backgroundColor: "#c64600",
        }}
        testID="clipB"
      >
        <View
          style={{
            position: "absolute",
            left: 60,
            top: 20,
            width: 100,
            height: 40,
            backgroundColor: "#e01b24",
          }}
          testID="escapeeB"
        />
      </View>
    </DropProvider>
  </View>
)

it("paints a window-level copy of the dragged card outside its overflow: hidden ancestor", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }

  await act(async () => {
    await render(
      <Root
        width={OUTPUT.width}
        height={OUTPUT.height}
      >
        <Stage />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(widget("card").getWidth()).toBeGreaterThan(0)
  })
  await fullscreenWindow(widget("stage"))
  await settle(150)

  // Baseline: no drag in flight, no ghost — the negative control for the
  // feature's own presence, not just for the clip it does not touch.
  expect(findGhost(widget("stage"))).toBeNull()

  const clipBBoundsBefore = boundsOf(widget("clipB"), widget("stage"))
  const cardBoundsBefore = boundsOf(widget("card"), widget("stage"))
  const opacityBefore = widget("card").getOpacity()

  cardRenders = 0
  const from = centreOf("card")
  // Well past `clip`'s box (50,50 100x100 -> bottom-right corner at 150,150)
  // and past `clipB`'s too, so the ghost's escape is unambiguous either way.
  const to = { x: 700, y: 500 }
  await holdDragTo(device, from, to)

  // The card itself never moved — this platform's whole premise (the view
  // never moves; a paintable of it does) — so its OWN allocation is exactly
  // what it was before the drag. This is what `measure()` reads.
  expect(boundsOf(widget("card"), widget("stage"))).toEqual(cardBoundsBefore)

  // Ghosted, the way RN dnd libraries do it — dimmed, not gone, and
  // recorded rather than assumed to be a specific number.
  expect(widget("card").getOpacity()).toBeLessThan(opacityBefore)

  const ghost = findGhost(widget("stage"))
  expect(ghost).not.toBeNull()
  // Takes no input: the responder path and hit-testing are for the
  // ORIGINAL widget alone, untouched by this feature.
  expect(ghost!.getCanTarget()).toBe(false)

  const ghostBounds = boundsOf(ghost!, widget("stage"))
  // Escaped `clip`: entirely past its bottom-right corner (150, 150).
  expect(ghostBounds.x).toBeGreaterThan(150)
  expect(ghostBounds.y).toBeGreaterThan(150)
  // And landed near the pointer, offset by where the grab happened inside
  // the card — not merely "somewhere outside", but where the gesture put it.
  expect(Math.abs(ghostBounds.x + ghostBounds.width / 2 - to.x)).toBeLessThan(
    40,
  )
  expect(Math.abs(ghostBounds.y + ghostBounds.height / 2 - to.y)).toBeLessThan(
    40,
  )

  // Zero React renders per frame: eight motion steps moved the ghost eight
  // times, and the card's own render count is unmoved by any of them.
  expect(cardRenders).toBe(0)

  // NEGATIVE CONTROL, held the whole time: `clipB` was never dragged into or
  // out of, so it is exactly as clipped as it was before this gesture ever
  // started.
  expect(boundsOf(widget("clipB"), widget("stage"))).toEqual(clipBBoundsBefore)

  device.release()
  await settle(200)

  // Torn down on drag end: no ghost left behind, opacity restored.
  expect(findGhost(widget("stage"))).toBeNull()
  expect(widget("card").getOpacity()).toBe(opacityBefore)
})

it("leaves an undragged card exactly as clipped as any other view", async () => {
  await act(async () => {
    await render(
      <Root
        width={OUTPUT.width}
        height={OUTPUT.height}
      >
        <Stage />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(widget("card").getWidth()).toBeGreaterThan(0)
  })
  await settle(150)

  // No gesture at all: the mechanism this file exists for never engages, and
  // `escapeeB` is exactly as clipped as `overflow.gtk.test.tsx` already
  // proves for any other `overflow: hidden` box.
  expect(findGhost(widget("stage"))).toBeNull()
  const clipBBounds = boundsOf(widget("clipB"), widget("stage"))
  expect(clipBBounds).toEqual({ x: 300, y: 50, width: 100, height: 100 })
})
