// `useAnimatedScrollHandler` against a real GtkScrolledWindow and a real
// wheel.
//
// The unit test pins the translation; this pins the claim the hook is FOR.
// Reanimated's promise is that a scroll drives a value without going through
// React, and on this platform that promise is kept by a path that already
// existed — `emitScroll` runs from `GtkAdjustment::value-changed`, a C
// callback on the loop this JS is on. So the assertions are: the handler ran
// from a genuine scroll, the shared value it wrote moved, and React did not
// render while it happened.
//
// Two controls, because a Wayland pointer is addressed by POSITION and not by
// focus. A SECOND scroller the pointer never visits must see nothing — that
// is what makes "the wheel went where it was aimed" mean anything. And the
// render count is the control on the claim itself: a shared value that moved
// because the component re-rendered would satisfy everything else and mean
// the opposite of what this hook exists for.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, useRef } from "react"
import { afterEach, expect, it } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  Root,
  ScrollView,
  Text,
  View,
  type ScrollViewHandle,
} from "../../../src/index"
import {
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from "../../../src/reanimated-compat/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

const OUTPUT = { width: 1024, height: 768 }

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80))
  })
}

let pointer: VirtualPointer | null = null

afterEach(() => {
  pointer?.dispose()
  pointer = null
})

const centreOf = (
  handle: ScrollViewHandle,
): { x: number; y: number } | null => {
  let centre: { x: number; y: number } | null = null
  handle.measureInWindow((x, y, width, height) => {
    centre = { x: x + width / 2, y: y + height / 2 }
  })
  return centre
}

it("a real wheel drives a shared value, and React never renders", async () => {
  try {
    pointer = await createVirtualPointer(OUTPUT)
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      console.warn(`[scroll-handler] skipped: ${error.message}`)
      return
    }
    throw error
  }

  let renders = 0
  let offset: SharedValue<number> | null = null
  const counts = { aimed: 0, control: 0 }
  const aimedRef = createRef<ScrollViewHandle>()
  const controlRef = createRef<ScrollViewHandle>()

  const Probe = (): React.ReactNode => {
    renders += 1
    const scrollY = useSharedValue(0)
    offset = scrollY
    const seen = useRef(counts)
    const onAimedScroll = useAnimatedScrollHandler({
      onScroll: (event) => {
        seen.current.aimed += 1
        scrollY.value = event.contentOffset.y
      },
    })
    const onControlScroll = useAnimatedScrollHandler({
      onScroll: () => {
        seen.current.control += 1
      },
    })
    return (
      <View style={{ flexDirection: "row" }}>
        <ScrollView
          ref={aimedRef}
          style={{ width: 300, height: 200 }}
          onScroll={onAimedScroll}
        >
          <View style={{ height: 2000 }}>
            <Text>aimed</Text>
          </View>
        </ScrollView>
        <ScrollView
          ref={controlRef}
          style={{ width: 300, height: 200 }}
          onScroll={onControlScroll}
        >
          <View style={{ height: 2000 }}>
            <Text>control</Text>
          </View>
        </ScrollView>
      </View>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={800}
        height={400}
      >
        <Probe />
      </Root>,
    )
  })

  const label = screen.getByText("aimed") as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })

  const root = label.getRoot()
  if (root instanceof Gtk.Window) {
    root.present()
    root.fullscreen()
    await waitFor(() => {
      expect(root.isActive()).toBe(true)
    })
  }
  await settle()

  // Aim at the measured allocation rather than at a constant: the window is
  // fullscreened, so window coordinates are output coordinates.
  const aim = centreOf(aimedRef.current!)
  expect(aim).not.toBeNull()

  const rendersBefore = renders
  expect(offset!.value).toBe(0)

  pointer.moveTo(aim!.x, aim!.y)
  await settle()
  for (let step = 0; step < 4; step += 1) {
    pointer.scrollBy(3)
    await settle()
  }

  expect(counts.aimed).toBeGreaterThan(0)
  expect(offset!.value).toBeGreaterThan(0)
  // The whole point: the value moved without a render.
  expect(renders).toBe(rendersBefore)
  // NEGATIVE CONTROL: the scroller the pointer never visited.
  expect(counts.control).toBe(0)
})
