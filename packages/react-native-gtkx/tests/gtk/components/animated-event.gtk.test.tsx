// Animated.event end to end: a real GTK scroll, through a ScrollView's
// onScroll, into an Animated.Value — the one path unit tests cannot cover
// (tests/unit/animated/event.test.ts drives the traversal directly), because
// what matters here is that the mapping actually receives the SAME
// ScrollEvent shape a real scroll produces, not one a test wrote by hand.
// Rig and pattern lifted from scroll-phases.gtk.test.tsx.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, type ReactNode } from "react"
import { afterAll, expect, it } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  Animated,
  Root,
  ScrollView,
  Text,
  View,
  type ScrollViewHandle,
} from "../../../src/index"
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

let pointer: VirtualPointer | null = null
let unavailable: string | null = null

afterAll(() => {
  pointer?.dispose()
  pointer = null
})

const openPointer = async (): Promise<VirtualPointer | null> => {
  if (pointer) {
    return pointer
  }
  if (unavailable) {
    console.warn(`[animated-event] skipped: ${unavailable}`)
    return null
  }
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      unavailable = error.message
      console.warn(`[animated-event] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

const showFullscreen = async (widget: GtkNs.Widget): Promise<void> => {
  const root = widget.getRoot()
  if (root instanceof Gtk.Window) {
    root.present()
    root.fullscreen()
    await waitFor(() => {
      expect(root.isActive()).toBe(true)
    })
  }
  await settle()
}

const centreOf = (handle: ScrollViewHandle): { x: number; y: number } => {
  let centre: { x: number; y: number } | null = null
  handle.measureInWindow((x, y, width, height) => {
    centre = { x: x + width / 2, y: y + height / 2 }
  })
  expect(centre).not.toBeNull()
  return centre!
}

const scrolledWindowAbove = (widget: GtkNs.Widget): GtkNs.ScrolledWindow => {
  for (
    let current: GtkNs.Widget | null = widget;
    current !== null;
    current = current.getParent()
  ) {
    if (current instanceof Gtk.ScrolledWindow) {
      return current
    }
  }
  throw new Error("no GtkScrolledWindow above the widget")
}

it("drives an Animated.Value from a real ScrollView scroll, listener included", async () => {
  const injector = await openPointer()
  if (!injector) {
    return
  }

  const scrollY = new Animated.Value(0)
  const listenerOffsets: number[] = []
  const handleRef = createRef<ScrollViewHandle>()

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event) => {
        const { nativeEvent } = event as {
          nativeEvent: { contentOffset: { y: number } }
        }
        // The mapping has already run by the time the listener sees the
        // event — RN's own ordering (AnimatedEvent's `_callListeners` runs
        // after the traversal), so the value it reads back is this call's.
        listenerOffsets.push(scrollY.__getValue())
        expect(scrollY.__getValue()).toBe(nativeEvent.contentOffset.y)
      },
    },
  )

  const Probe = (): ReactNode => (
    <ScrollView
      ref={handleRef}
      style={{ width: 400, height: 240 }}
      onScroll={onScroll}
    >
      <View style={{ height: 6000 }}>
        <Text>event-driven</Text>
      </View>
    </ScrollView>
  )

  await act(async () => {
    await render(
      <Root
        width={800}
        height={500}
      >
        <Probe />
      </Root>,
    )
  })
  const label = screen.getByText("event-driven") as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  await showFullscreen(label)

  expect(scrollY.__getValue()).toBe(0)

  const aim = centreOf(handleRef.current!)
  injector.moveTo(aim.x, aim.y)
  await settle(120)

  for (let step = 0; step < 4; step += 1) {
    injector.scrollBy(1)
    await settle(60)
  }
  await settle(120)

  const scrolled = scrolledWindowAbove(label)
  const actual = scrolled.getVadjustment().getValue()
  expect(actual).toBeGreaterThan(0)
  // The Animated.Value tracks the real widget, not a value the test invented.
  expect(scrollY.__getValue()).toBe(actual)
  expect(listenerOffsets.length).toBeGreaterThan(0)
  expect(listenerOffsets.at(-1)).toBe(actual)
})
