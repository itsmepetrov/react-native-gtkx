// `Gesture.Native()`, the scrollable re-exports, and the `->DENIED`
// correction — the three halves of one claim: a gesture may stand for the
// native widget underneath it without taking anything away from it, and the
// platform can tell the difference between that widget ending an interaction
// and stealing one.
//
// Everything is driven by a real `zwlr_virtual_pointer_v1`, for the same
// reason the rest of this directory is: `userEvent` emits gesture SIGNALS on
// the controllers of the widget you name and never produces a GdkEvent, so it
// cannot produce a sequence for anything to claim, deny or scroll. The
// `->DENIED` transition this file exists to pin down does not exist above the
// GdkEvent layer.
//
// A Wayland pointer is addressed by POSITION, not by focus, so "a callback
// fired" is never evidence on its own — every test below also asserts that
// the card next to the target stayed silent.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, type ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"
import {
  Gesture,
  GestureDetector,
  FlatList as GestureHandlerFlatList,
  ScrollView as GestureHandlerScrollView,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "../../../src/gesture-handler-compat/index"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  FlatList,
  TouchableHighlight as PlatformTouchableHighlight,
  TouchableOpacity as PlatformTouchableOpacity,
  TouchableWithoutFeedback as PlatformTouchableWithoutFeedback,
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
      console.warn(`[native-gesture] skipped: ${error.message}`)
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
  for (let index = 1; index <= steps; index += 1) {
    await step(() => {
      device.moveTo(
        from.x + (dx * index) / steps,
        from.y + (dy * index) / steps,
      )
    })
  }
}

const scrollerAbove = (widget: GtkNs.Widget): GtkNs.ScrolledWindow => {
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

/** The phases of the scroller's own four touch-only gestures. */
const kineticPhases = (scroller: GtkNs.ScrolledWindow): number[] => {
  const model = scroller.observeControllers()
  const phases: number[] = []
  for (let index = 0; index < model.getNItems(); index += 1) {
    const controller = model.getItem(
      index,
    ) as unknown as GtkNs.EventController | null
    if (controller instanceof Gtk.GestureSingle && controller.getTouchOnly()) {
      phases.push(controller.getPropagationPhase() as unknown as number)
    }
  }
  return phases
}

const scrollOffset = (scroller: GtkNs.ScrolledWindow): number =>
  scroller.getVadjustment()?.getValue() ?? 0

// ---------------------------------------------------------------------------
// The finding this slice exists to handle.
// ---------------------------------------------------------------------------

/**
 * A native GTK ancestor with a gesture of its own that decides, mid-drag,
 * that the sequence is its. This is what a `GtkScrolledWindow` does on touch
 * past the 8 px threshold, what a selectable label does on a drag, and what
 * the recon measured directly on raw `Gtk.Box` widgets: an ANCESTOR claiming
 * DENIES the descendant and then ends it with an ordinary `drag-end` — the
 * same signal a finger lifting produces.
 */
const installThief = (
  ancestor: GtkNs.Widget,
): { stole: () => boolean; remove: () => void } => {
  const thief = new Gtk.GestureDrag()
  thief.setTouchOnly(false)
  let stolen = false
  thief.on("drag-update", (_offsetX: number, offsetY: number) => {
    if (!stolen && Math.abs(offsetY) > 20) {
      stolen = true
      thief.setState(Gtk.EventSequenceState.CLAIMED)
    }
  })
  ancestor.addController(thief)
  return {
    stole: () => stolen,
    remove: () => {
      ancestor.removeController(thief)
    },
  }
}

const dragCard = async (
  device: VirtualPointer,
  card: ViewHandle,
): Promise<void> => {
  let start = { x: 0, y: 0 }
  card.measureInWindow((x, y, width, height) => {
    start = { x: x + width / 2, y: y + height / 2 }
  })
  await step(() => device.moveTo(start.x, start.y))
  await step(() => device.press())
  await dragBy(device, start, 0, 90)
  await step(() => device.release())
}

it("reports a sequence stolen by a native ancestor as a cancel, not an end", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const onTouchEnd = vi.fn()
  const onTouchCancel = vi.fn()
  const neighbour = vi.fn()

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <View
        ref={card}
        style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <Text>stolen target</Text>
      </View>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
        onStartShouldSetResponder={neighbour}
      >
        <Text>untouched</Text>
      </View>
    </View>,
    "stolen target",
  )

  const cardWidget = screen
    .getByText("stolen target")
    .getParent() as unknown as GtkNs.Widget
  const thief = installThief(cardWidget.getParent()!)

  await dragCard(device, card.current!)

  expect(thief.stole()).toBe(true)
  // WITHOUT the `->DENIED` watch this is `onTouchEnd` — a clean ending,
  // indistinguishable from the user letting go, at whatever position the
  // theft happened at. That is the whole reason the sequence state is watched
  // rather than only the drag signals.
  await waitFor(() => {
    expect(onTouchCancel).toHaveBeenCalledTimes(1)
  })
  expect(onTouchEnd).not.toHaveBeenCalled()
  expect(neighbour).not.toHaveBeenCalled()

  thief.remove()
})

it("a drag nobody steals is still an ordinary end", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const onTouchEnd = vi.fn()
  const onTouchCancel = vi.fn()
  const neighbour = vi.fn()

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <View
        ref={card}
        style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <Text>plain target</Text>
      </View>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>untouched too</Text>
      </View>
    </View>,
    "plain target",
  )

  await dragCard(device, card.current!)

  // The control: the same drag, the same signals, no thief — so the fix must
  // not have turned every ending into a cancellation, which a flag that was
  // never reset would have done.
  await waitFor(() => {
    expect(onTouchEnd).toHaveBeenCalledTimes(1)
  })
  expect(onTouchCancel).not.toHaveBeenCalled()
  expect(neighbour).not.toHaveBeenCalled()
})

it("claiming on press cancels the ancestor outright, which is why nothing depended on this before", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const onResponderRelease = vi.fn()
  const onResponderTerminate = vi.fn()

  await mount(
    <View style={{ padding: 20 }}>
      <View
        ref={card}
        style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        onStartShouldSetResponder={() => true}
        onResponderRelease={onResponderRelease}
        onResponderTerminate={onResponderTerminate}
      >
        <Text>claiming target</Text>
      </View>
    </View>,
    "claiming target",
  )

  const cardWidget = screen
    .getByText("claiming target")
    .getParent() as unknown as GtkNs.Widget
  const thief = installThief(cardWidget.getParent()!)

  await dragCard(device, card.current!)

  // The other half of the asymmetry, and the measurement that explains why
  // `use-responder.ts` could get away without watching the sequence state
  // until now: a view that takes the responder on PRESS makes the platform
  // claim on its own gesture, and a claim by the descendant CANCELS every
  // ancestor's gesture rather than denying it. The thief above never gets a
  // second update, so it never gets the chance to steal anything.
  expect(thief.stole()).toBe(false)
  await waitFor(() => {
    expect(onResponderRelease).toHaveBeenCalledTimes(1)
  })
  expect(onResponderTerminate).not.toHaveBeenCalled()

  thief.remove()
})

it("Gesture.Native() reports a stolen drag as a cancellation", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const card = createRef<ViewHandle>()
  const ended = vi.fn()
  const finalized = vi.fn()

  // THE REASON THE `->DENIED` WORK BELONGS IN THIS SLICE. `Gesture.Native()`
  // is the first recognizer that deliberately never takes the responder, so
  // it is the first one whose ending is read straight off the touch props —
  // and therefore the first one for which a stolen `drag-end` would have been
  // reported as a successful, completed gesture.
  const native = Gesture.Native()
    .onEnd((_event, success) => {
      ended(success)
    })
    .onFinalize((_event, success) => {
      finalized(success)
    })

  await mount(
    <View style={{ padding: 20 }}>
      <GestureDetector gesture={native}>
        <View
          ref={card}
          style={{ width: 200, height: 200, backgroundColor: "#62a0ea" }}
        >
          <Text>native stolen</Text>
        </View>
      </GestureDetector>
    </View>,
    "native stolen",
  )

  const cardWidget = screen
    .getByText("native stolen")
    .getParent() as unknown as GtkNs.Widget
  const thief = installThief(cardWidget.getParent()!)

  await dragCard(device, card.current!)

  expect(thief.stole()).toBe(true)
  await waitFor(() => {
    expect(finalized).toHaveBeenCalled()
  })
  expect(ended).toHaveBeenCalledWith(false)
  expect(finalized).toHaveBeenCalledWith(false)

  thief.remove()
})

// ---------------------------------------------------------------------------
// Gesture.Native()
// ---------------------------------------------------------------------------

it("yields to GtkScrolledWindow's kinetics instead of fighting them", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const list = createRef<ViewHandle>()
  const started = vi.fn()
  const ended = vi.fn()
  const neighbour = vi.fn()
  const kineticWhileActive: boolean[] = []
  const observed: { scroller: GtkNs.ScrolledWindow | null } = { scroller: null }

  const native = Gesture.Native()
    .onStart(() => {
      started()
    })
    .onUpdate(() => {
      kineticWhileActive.push(observed.scroller?.getKineticScrolling() ?? false)
    })
    .onEnd((_event, success) => {
      ended(success)
    })

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureDetector gesture={native}>
        <ScrollView style={{ width: 300, height: 300 }}>
          <View
            ref={list}
            style={{ width: 280, height: 1500, backgroundColor: "#62a0ea" }}
          >
            <Text>native list</Text>
          </View>
        </ScrollView>
      </GestureDetector>
      <View
        style={{ width: 200, height: 200, backgroundColor: "#c01c28" }}
        onTouchStart={neighbour}
      >
        <Text>untouched list neighbour</Text>
      </View>
    </View>,
    "native list",
  )

  const scroller = scrollerAbove(
    screen.getByText("native list") as unknown as GtkNs.Widget,
  )
  observed.scroller = scroller
  const restingPhases = kineticPhases(scroller)
  expect(restingPhases.length).toBe(4)

  // The list is far taller than its viewport, so its centre is clipped away
  // — aim near the visible top.
  let start = { x: 0, y: 0 }
  list.current!.measureInWindow((x, _y, width) => {
    start = { x: x + width / 2, y: 80 }
  })
  await step(() => device.moveTo(start.x, start.y))

  // 1. The scroller is fully live under a `Gesture.Native()`: the wheel moves
  //    it, and moves it back. A gesture that had taken the responder would
  //    have put those four gestures into GTK_PHASE_NONE.
  await step(() => device.scrollBy(3))
  const scrolledDown = scrollOffset(scroller)
  expect(scrolledDown).toBeGreaterThan(0)
  await step(() => device.scrollBy(-3))
  expect(scrollOffset(scroller)).toBeLessThan(scrolledDown)

  // 2. And during a drag on it, which is where a JS gesture would normally
  //    pull `setIsJSResponder` and stop it.
  await step(() => device.press())
  await dragBy(device, start, 0, 60)
  await step(() => device.release())

  expect(started).toHaveBeenCalledTimes(1)
  expect(ended).toHaveBeenCalledWith(true)
  expect(kineticWhileActive.length).toBeGreaterThan(0)
  expect(kineticWhileActive.every(Boolean)).toBe(true)
  expect(scroller.getKineticScrolling()).toBe(true)
  expect(kineticPhases(scroller)).toEqual(restingPhases)
  expect(neighbour).not.toHaveBeenCalled()
})

// ---------------------------------------------------------------------------
// The re-exported components
// ---------------------------------------------------------------------------

it("re-exports the platform's own scrollables rather than stand-ins", () => {
  // Upstream wraps RN's components in a `NativeViewGestureHandler` so its
  // arbitration knows about them. Here the responder system IS that
  // arbitration and these components already speak it, so the wrapper has
  // nothing to add and the re-export is the component itself. Asserted by
  // identity because a "compatible" copy would be a second thing to keep
  // correct, and `measureLayout` and the animated seam are both keyed on
  // component identity.
  expect(GestureHandlerScrollView).toBe(ScrollView)
  expect(GestureHandlerFlatList).toBe(FlatList)
  expect(TouchableOpacity).toBe(PlatformTouchableOpacity)
  expect(TouchableHighlight).toBe(PlatformTouchableHighlight)
  expect(TouchableWithoutFeedback).toBe(PlatformTouchableWithoutFeedback)
})

it("renders and scrolls react-native-gesture-handler's ScrollView", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const neighbour = vi.fn()

  await mount(
    <View style={{ flexDirection: "row", gap: 20, padding: 20 }}>
      <GestureHandlerScrollView style={{ width: 300, height: 300 }}>
        <View style={{ width: 280, height: 1500, backgroundColor: "#62a0ea" }}>
          <Text>rngh scrollview</Text>
        </View>
      </GestureHandlerScrollView>
      <View
        style={{ width: 200, height: 200 }}
        onTouchStart={neighbour}
      >
        <Text>untouched scroll neighbour</Text>
      </View>
    </View>,
    "rngh scrollview",
  )

  const scroller = scrollerAbove(
    screen.getByText("rngh scrollview") as unknown as GtkNs.Widget,
  )
  expect(scrollOffset(scroller)).toBe(0)

  await step(() => device.moveTo(120, 120))
  await step(() => device.scrollBy(3))

  expect(scrollOffset(scroller)).toBeGreaterThan(0)
  expect(neighbour).not.toHaveBeenCalled()
})

it("renders and scrolls react-native-gesture-handler's FlatList", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const rows = Array.from({ length: 60 }, (_value, index) => ({
    key: `row-${index}`,
  }))

  await mount(
    <GestureHandlerFlatList
      style={{ width: 300, height: 300 }}
      data={rows}
      keyExtractor={(item: { key: string }) => item.key}
      renderItem={({ item }: { item: { key: string } }) => (
        <View style={{ height: 40 }}>
          <Text>{item.key}</Text>
        </View>
      )}
    />,
    "row-0",
  )

  const scroller = scrollerAbove(
    screen.getByText("row-0") as unknown as GtkNs.Widget,
  )
  expect(scrollOffset(scroller)).toBe(0)

  await step(() => device.moveTo(120, 120))
  await step(() => device.scrollBy(5))

  // A windowed list, so the assertion is on the scroll position rather than
  // on a row that may not be mounted any more.
  expect(scrollOffset(scroller)).toBeGreaterThan(0)
})
