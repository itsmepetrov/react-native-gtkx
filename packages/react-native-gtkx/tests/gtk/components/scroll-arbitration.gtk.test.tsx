// ScrollView arbitration: `setIsJSResponder`, and the GTK facts it rests on.
//
// WHAT THIS FILE CANNOT DO, stated first because it is the whole shape of
// the task. The contention it exists to resolve is TOUCH-ONLY — all four
// gestures `GtkScrolledWindow` installs are `touch_only`, so with a mouse
// they never run and a child pan never competes with scrolling at all. And
// no touch can be produced on this rig: sway 1.11 on wlroots 0.19 advertises
// `zwlr_virtual_pointer_manager_v1` and `zwp_virtual_keyboard_manager_v1`
// and there is no virtual TOUCH protocol in wlroots to advertise —
// `ext_transient_seat_manager_v1` makes seats with no devices on them. The
// touch spike's uinput recipe needs a seated session, which a headless
// compositor over SSH is not.
//
// So the end-to-end "a finger pans the child instead of scrolling the list"
// is not verifiable here and is not claimed anywhere. What IS verifiable is
// every link the arbitration is built out of, and those are what this file
// pins down:
//
//  1. exactly which gestures `GtkScrolledWindow` installs, and that they are
//     all touch-only — the premise the whole rescoping rests on, measured
//     rather than read out of GTK's source;
//  2. that `kinetic-scrolling` moves those four and nothing else, so the
//     lever cannot take the mouse wheel down with it;
//  3. that setting a gesture's phase to NONE resets a gesture that is
//     already tracking — the mechanism that makes the lever a CANCEL rather
//     than a request, driven here with a real pointer on a gesture that is
//     not touch-only, because that is the one way to watch it happen;
//  4. that granting the responder to a view inside a `ScrollView` actually
//     pulls the lever, and that releasing puts it back.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
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

const OUTPUT = { width: 1024, height: 768 }

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

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
      console.warn(`[scroll-arbitration] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

const ancestorScroller = (widget: GtkNs.Widget): GtkNs.ScrolledWindow => {
  for (
    let current: GtkNs.Widget | null = widget;
    current !== null;
    current = current.getParent()
  ) {
    if (current instanceof Gtk.ScrolledWindow) {
      return current
    }
  }
  throw new Error("no GtkScrolledWindow above this widget")
}

/** Every controller on a widget, as `Name phase touchOnly` triples. */
const controllersOf = (
  widget: GtkNs.Widget,
): { name: string; phase: number; touchOnly: boolean | null }[] => {
  const model = widget.observeControllers()
  const described = []
  for (let index = 0; index < model.getNItems(); index += 1) {
    const controller = model.getItem(
      index,
    ) as unknown as GtkNs.EventController | null
    if (controller === null) {
      continue
    }
    described.push({
      name: controller.constructor.name,
      phase: controller.getPropagationPhase() as unknown as number,
      touchOnly:
        controller instanceof Gtk.GestureSingle
          ? controller.getTouchOnly()
          : null,
    })
  }
  return described
}

const renderScrolled = async (
  handle: ReturnType<typeof createRef<ViewHandle>>,
  props: Record<string, unknown> = {},
): Promise<GtkNs.ScrolledWindow> => {
  await act(async () => {
    await render(
      <Root
        width={600}
        height={400}
      >
        <ScrollView style={{ width: 400, height: 300 }}>
          <View
            ref={handle}
            style={{ width: 380, height: 1500 }}
            {...props}
          >
            <Text>row</Text>
          </View>
        </ScrollView>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("row")).toBeTruthy()
  })
  const leaf = screen.getByText("row") as unknown as GtkNs.Widget
  await fullscreenWindow(leaf)
  return ancestorScroller(leaf)
}

it("installs four touch-only gestures of its own, and nothing that runs on a mouse", async () => {
  const scroller = await renderScrolled(createRef<ViewHandle>())
  const gestures = controllersOf(scroller).filter(
    (controller) => controller.touchOnly !== null,
  )

  // The finding that moved this task off the epic's critical path, now a
  // regression test: if a future GTK adds a gesture here that is NOT
  // touch-only, a child pan starts contending with scrolling under a mouse
  // and everything slices 1 and 2 verified would need re-examining.
  expect(gestures.map((gesture) => gesture.name).sort()).toEqual([
    "GestureDrag",
    "GestureLongPress",
    "GesturePan",
    "GestureSwipe",
  ])
  expect(gestures.every((gesture) => gesture.touchOnly)).toBe(true)
  // All four run in CAPTURE, so on touch the scroller sees a sequence before
  // any descendant's bubble-phase gesture does. It does not CLAIM there —
  // it claims in drag-update past the 8 px threshold — which is why a child
  // that claims on press still wins, and why one that claims on a move does
  // not.
  expect(
    gestures.every((gesture) => gesture.phase === Gtk.PropagationPhase.CAPTURE),
  ).toBe(true)
})

it("moves exactly those four when kinetic scrolling is turned off", async () => {
  const scroller = await renderScrolled(createRef<ViewHandle>())
  const before = controllersOf(scroller)

  scroller.setKineticScrolling(false)
  const during = controllersOf(scroller)
  scroller.setKineticScrolling(true)
  const after = controllersOf(scroller)

  const phases = (
    described: ReturnType<typeof controllersOf>,
    touchOnly: boolean,
  ): number[] =>
    described
      .filter((controller) => (controller.touchOnly ?? false) === touchOnly)
      .map((controller) => controller.phase)

  expect(phases(during, true)).toEqual([0, 0, 0, 0])
  expect(phases(during, true)).not.toEqual(phases(before, true))
  // And the mouse paths — two GtkEventControllerScroll, two
  // GtkEventControllerMotion — are untouched, which is what makes this lever
  // usable at all: the wheel keeps scrolling while a child pans.
  expect(phases(during, false)).toEqual(phases(before, false))
  expect(phases(after, true)).toEqual(phases(before, true))
})

it("resets a gesture that is already tracking when its phase goes to NONE", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const scroller = await renderScrolled(handle)

  // A stand-in for one of GtkScrolledWindow's own four, differing only in
  // being drivable: same class, same capture phase, touch-only turned off so
  // a mouse can reach it. What is under test is GTK's rule that setting a
  // controller's phase to NONE resets it — the reason the kinetic-scrolling
  // lever cancels a scroll in progress instead of merely declining the next
  // one.
  const standIn = new Gtk.GestureDrag()
  standIn.setTouchOnly(false)
  standIn.setPropagationPhase(Gtk.PropagationPhase.CAPTURE)
  const onCancel = vi.fn()
  standIn.on("cancel", onCancel)
  scroller.addController(standIn)

  let point = { x: 0, y: 0 }
  handle.current!.measureInWindow((x, _y, width) => {
    point = { x: x + width / 2, y: 60 }
  })
  device.moveTo(point.x, point.y)
  await settle()
  device.press()
  await settle()
  device.moveTo(point.x + 20, point.y + 20)
  await settle()

  await waitFor(() => {
    expect(standIn.isActive()).toBe(true)
  })

  standIn.setPropagationPhase(Gtk.PropagationPhase.NONE)
  await settle()

  expect(standIn.isActive()).toBe(false)
  expect(onCancel).toHaveBeenCalled()

  device.release()
  await settle()
  scroller.removeController(standIn)
})

it("suspends the enclosing scroller while a view inside it holds the responder", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const kineticWhileHeld: (boolean | "unobserved")[] = []
  // Read from inside onResponderMove, so the assertion is about the state
  // DURING the gesture rather than after it. Filled in below, before any
  // pointer has been sent.
  const observed: { scroller: GtkNs.ScrolledWindow | null } = { scroller: null }
  const scroller = await renderScrolled(handle, {
    onStartShouldSetResponder: () => true,
    onResponderMove: () => {
      kineticWhileHeld.push(
        observed.scroller?.getKineticScrolling() ?? "unobserved",
      )
    },
  })
  observed.scroller = scroller

  expect(scroller.getKineticScrolling()).toBe(true)

  let point = { x: 0, y: 0 }
  handle.current!.measureInWindow((x, _y, width) => {
    point = { x: x + width / 2, y: 60 }
  })
  device.moveTo(point.x, point.y)
  await settle()
  device.press()
  await settle()
  device.moveTo(point.x + 15, point.y + 15)
  await settle()

  // The back-channel: for as long as React Native holds the interaction, the
  // scroller's own four gestures are in GTK_PHASE_NONE and cannot take it.
  expect(kineticWhileHeld.length).toBeGreaterThan(0)
  expect(kineticWhileHeld.every((value) => value === false)).toBe(true)
  expect(
    controllersOf(scroller)
      .filter((controller) => controller.touchOnly !== null)
      .every((controller) => controller.phase === Gtk.PropagationPhase.NONE),
  ).toBe(true)

  device.release()
  await settle()

  // And it is given back. A list that is scrollable before a drag has to be
  // scrollable after one.
  await waitFor(() => {
    expect(scroller.getKineticScrolling()).toBe(true)
  })
  expect(
    controllersOf(scroller)
      .filter((controller) => controller.touchOnly !== null)
      .every((controller) => controller.phase === Gtk.PropagationPhase.CAPTURE),
  ).toBe(true)
})

it("leaves the scroller alone when no view inside it claims the interaction", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const handle = createRef<ViewHandle>()
  const onTouchMove = vi.fn()
  const scroller = await renderScrolled(handle, {
    onStartShouldSetResponder: () => false,
    onMoveShouldSetResponder: () => false,
    onTouchMove,
  })

  let point = { x: 0, y: 0 }
  handle.current!.measureInWindow((x, _y, width) => {
    point = { x: x + width / 2, y: 60 }
  })
  device.moveTo(point.x, point.y)
  await settle()
  device.press()
  await settle()
  device.moveTo(point.x + 15, point.y + 15)
  await settle()

  await waitFor(() => {
    expect(onTouchMove).toHaveBeenCalled()
  })
  // Touch props fire whether or not anything holds the responder, and a view
  // that only listens must not cost the list its scrolling.
  expect(scroller.getKineticScrolling()).toBe(true)

  device.release()
  await settle()
})
