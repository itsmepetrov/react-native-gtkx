// RN's four scroll phases against real input, and the cost of not asking for
// them.
//
// The finding this file exists to pin is that PR #88's claim — "a wheel-driven
// desktop scroller has no drag or momentum phase" — was TRUE ABOUT THE WHEEL
// and false about the platform. Both halves are driven here through a real
// `zwlr_virtual_pointer_v1`, because the difference between them is a
// property of the input device and nothing short of the device shows it:
//
//   - a WHEEL gives GTK no sequence, so this platform groups its detents into
//     one desktop scroll session: begin before the first detent changes the
//     adjustment, end after the burst goes idle, and no momentum.
//   - a touchpad GLIDE reports all four. `::scroll-begin` on the first
//     motion, `::scroll-end` on the lift, and the scrolled window's own
//     kinetic animation carries the content on afterwards — which is the
//     momentum, read off the adjustment rather than off `::decelerate`.
//
// Traces and the numbers: docs/research/scroll-phases.md.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, useRef, useState, type ReactNode } from "react"
import { afterAll, expect, it } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  FlatList,
  Root,
  ScrollView,
  Text,
  View,
  type MeasureHandle,
  type ScrollEvent,
  type ScrollViewHandle,
} from "../../../src/index"
import {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useScrollOffset,
  type SharedValue,
} from "../../../src/reanimated-compat/index"
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

// ONE pointer for the whole file, not one per test. A virtual pointer is a
// new input device and stamps its own event times from zero, and GTK derives
// a kinetic scroll's velocity from exactly those times — a device introduced
// mid-session, whose first events are timestamped before everything the
// compositor has already sent, produces a glide with no inertia. Sharing the
// device is what makes the momentum half reproducible rather than
// order-dependent.
let pointer: VirtualPointer | null = null
let unavailable: string | null = null

afterAll(() => {
  pointer?.dispose()
  pointer = null
})

/**
 * The shared pointer, or null with a reason. Every test here needs a REAL
 * scroll — the phases live in GDK, below anything `userEvent` can emit — so a
 * rig without the protocol skips rather than pretends.
 */
const openPointer = async (): Promise<VirtualPointer | null> => {
  if (pointer) {
    return pointer
  }
  if (unavailable) {
    console.warn(`[scroll-phases] skipped: ${unavailable}`)
    return null
  }
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      unavailable = error.message
      console.warn(`[scroll-phases] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

/**
 * Fullscreens the window so window coordinates are output coordinates — the
 * pointer is addressed by absolute position, so without this every aim below
 * is a guess.
 */
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

/**
 * One throwaway glide, so that the one the test measures decelerates.
 *
 * A rig artefact, isolated rather than assumed: a matrix over "our controller
 * / a bare tick callback / neither" found the variable was none of them but
 * the ORDER — whichever glide happened first in a fresh worker never
 * decelerated, and every glide after it did, with or without any of the
 * above. GTK's scrolled window starts its kinetic animation on the frame
 * clock, and the first clock cycle of a headless software-rendered
 * compositor is not yet running when the first lift lands. Nothing about the
 * platform's own code changes between the two, which is exactly why the
 * warm-up is the honest fix and not an assertion loosened until it passed.
 */
let warmedUp = false
const warmUpKinetics = async (injector: VirtualPointer): Promise<void> => {
  if (warmedUp) {
    return
  }
  warmedUp = true
  for (let step = 0; step < 12; step += 1) {
    injector.glideBy(20)
    await settle(16)
  }
  injector.glideEnd()
  await settle(1200)
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

const controllerCount = (widget: GtkNs.Widget): number =>
  widget.observeControllers().getNItems()

it("a wheel reports one begin/end session; a glide reports all four", async () => {
  const injector = await openPointer()
  if (!injector) {
    return
  }

  const phases: string[] = []
  const timeline: string[] = []
  const scrolls = { count: 0 }
  const handleRef = createRef<ScrollViewHandle>()

  const Probe = (): ReactNode => {
    const seen = useRef(scrolls)
    return (
      <ScrollView
        ref={handleRef}
        style={{ width: 400, height: 240 }}
        onScroll={() => {
          seen.current.count += 1
          timeline.push("scroll")
        }}
        onScrollBeginDrag={() => {
          phases.push("beginDrag")
          timeline.push("beginDrag")
        }}
        onScrollEndDrag={() => {
          phases.push("endDrag")
          timeline.push("endDrag")
        }}
        onMomentumScrollBegin={() => phases.push("momentumBegin")}
        onMomentumScrollEnd={() => phases.push("momentumEnd")}
      >
        <View style={{ height: 6000 }}>
          <Text>phases</Text>
        </View>
      </ScrollView>
    )
  }

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
  const label = screen.getByText("phases") as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  await showFullscreen(label)

  const aim = centreOf(handleRef.current!)
  injector.moveTo(aim.x, aim.y)
  await settle(120)
  await warmUpKinetics(injector)
  phases.length = 0
  timeline.length = 0
  scrolls.count = 0

  // --- the wheel half -------------------------------------------------
  for (let step = 0; step < 4; step += 1) {
    injector.scrollBy(1)
    await settle(60)
  }
  // Past the wheel-burst idle boundary, and long enough that an invented
  // momentum phase would also have appeared if the implementation confused
  // "a session ended" with "the content coasted".
  await settle(600)

  expect(scrolls.count).toBeGreaterThan(0)
  expect(phases).toEqual(["beginDrag", "endDrag"])
  expect(timeline[0]).toBe("beginDrag")
  expect(timeline.at(-1)).toBe("endDrag")
  expect(timeline.filter((event) => event === "scroll")).toHaveLength(4)
  // One session for the whole burst, not one pair per detent.
  expect(phases.filter((phase) => phase === "beginDrag")).toHaveLength(1)
  phases.length = 0
  timeline.length = 0

  // --- the glide half -------------------------------------------------
  const scrolled = scrolledWindowAbove(label)
  const beforeGlide = scrolled.getVadjustment().getValue()
  for (let step = 0; step < 12; step += 1) {
    injector.glideBy(20)
    await settle(16)
  }
  const atLift = scrolled.getVadjustment().getValue()
  injector.glideEnd()
  await settle(3500)

  expect(phases).toEqual([
    "beginDrag",
    "endDrag",
    "momentumBegin",
    "momentumEnd",
  ])
  // Momentum is not a label on nothing: the content kept moving after the
  // fingers left, which is what makes the pair worth reporting.
  const atRest = scrolled.getVadjustment().getValue()
  expect(atLift).toBeGreaterThan(beforeGlide)
  expect(atRest).toBeGreaterThan(atLift)
})

it("installs nothing while no phase handler is attached", async () => {
  // The cost bar, asserted rather than claimed: a ScrollView with no phase
  // handler must carry exactly the controllers it carried before the phases
  // existed, and gain one the moment a handler appears.
  let attach: ((on: boolean) => void) | null = null

  const Probe = (): ReactNode => {
    const [withPhases, setWithPhases] = useState(false)
    attach = setWithPhases
    return (
      <ScrollView
        style={{ width: 300, height: 200 }}
        onScroll={() => {}}
        onScrollEndDrag={withPhases ? () => {} : undefined}
      >
        <View style={{ height: 2000 }}>
          <Text>counted</Text>
        </View>
      </ScrollView>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={400}
        height={300}
      >
        <Probe />
      </Root>,
    )
  })
  const label = screen.getByText("counted") as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  const scrolled = scrolledWindowAbove(label)

  const baseline = controllerCount(scrolled)
  await act(async () => {
    attach!(true)
  })
  await settle(30)
  expect(controllerCount(scrolled)).toBe(baseline + 1)

  // And it goes away again, so a screen that stops asking stops paying.
  await act(async () => {
    attach!(false)
  })
  await settle(30)
  expect(controllerCount(scrolled)).toBe(baseline)
})

it("delivers the phases into a useAnimatedScrollHandler, sharing its context", async () => {
  const injector = await openPointer()
  if (!injector) {
    return
  }

  // Exactly the shape `@gorhom/bottom-sheet` writes: one handler object on
  // `onScroll` and no phase prop anywhere, with `onBeginDrag` recording into
  // the shared context what `onScroll` reads back.
  const order: string[] = []
  const lockedTo: number[] = []
  const handleRef = createRef<ScrollViewHandle>()

  const Probe = (): ReactNode => {
    const onScroll = useAnimatedScrollHandler<{ startedAt?: number }>({
      onScroll: (_event, context) => {
        if (context.startedAt !== undefined) {
          lockedTo.push(context.startedAt)
        }
      },
      onBeginDrag: (event, context) => {
        order.push("onBeginDrag")
        context.startedAt = event.contentOffset.y
      },
      onEndDrag: () => order.push("onEndDrag"),
      onMomentumBegin: () => order.push("onMomentumBegin"),
      onMomentumEnd: () => order.push("onMomentumEnd"),
    })
    return (
      <ScrollView
        ref={handleRef}
        style={{ width: 400, height: 240 }}
        onScroll={onScroll}
      >
        <View style={{ height: 6000 }}>
          <Text>reanimated phases</Text>
        </View>
      </ScrollView>
    )
  }

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
  const label = screen.getByText("reanimated phases") as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  await showFullscreen(label)

  const aim = centreOf(handleRef.current!)
  injector.moveTo(aim.x, aim.y)
  await settle(120)
  await warmUpKinetics(injector)
  order.length = 0
  lockedTo.length = 0

  const scrolled = scrolledWindowAbove(label)
  const startedAt = scrolled.getVadjustment().getValue()
  for (let step = 0; step < 12; step += 1) {
    injector.glideBy(20)
    await settle(16)
  }
  injector.glideEnd()
  await settle(3500)

  expect(order).toEqual([
    "onBeginDrag",
    "onEndDrag",
    "onMomentumBegin",
    "onMomentumEnd",
  ])
  // The context written by `onBeginDrag` was read by `onScroll` — one object
  // across the whole gesture, which is the contract the sheet's lock is
  // built on.
  expect(lockedTo.length).toBeGreaterThan(0)
  expect(lockedTo[0]).toBe(startedAt)
})

it("carries a phase-aware handler through FlatList's onScroll wrapper", async () => {
  const injector = await openPointer()
  if (!injector) {
    return
  }

  const phases: string[] = []
  const wrapperRef = createRef<MeasureHandle>()

  const Probe = (): ReactNode => {
    const onScroll = useAnimatedScrollHandler({
      onScroll: () => phases.push("scroll"),
      onBeginDrag: () => phases.push("beginDrag"),
      onEndDrag: () => phases.push("endDrag"),
    })
    return (
      <View
        ref={wrapperRef}
        style={{ width: 400, height: 240 }}
      >
        <FlatList
          data={Array.from({ length: 100 }, (_, index) => index)}
          getItemLayout={(_data, index) => ({
            index,
            length: 40,
            offset: index * 40,
          })}
          onScroll={onScroll}
          renderItem={({ item }) => (
            <View style={{ height: 40 }}>
              <Text>{`list-phase-${item}`}</Text>
            </View>
          )}
        />
      </View>
    )
  }

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
  const label = screen.getByText("list-phase-0") as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  await showFullscreen(label)

  let aim: { x: number; y: number } | null = null
  wrapperRef.current!.measureInWindow((x, y, width, height) => {
    aim = { x: x + width / 2, y: y + height / 2 }
  })
  expect(aim).not.toBeNull()
  injector.moveTo(aim!.x, aim!.y)
  await settle(120)

  for (let step = 0; step < 3; step += 1) {
    injector.scrollBy(1)
    await settle(60)
  }
  await settle(240)

  expect(phases[0]).toBe("beginDrag")
  expect(phases.at(-1)).toBe("endDrag")
  expect(phases.filter((phase) => phase === "scroll")).toHaveLength(3)
})

it("useScrollOffset tracks a real wheel without a render", async () => {
  const injector = await openPointer()
  if (!injector) {
    return
  }

  let renders = 0
  let offset: SharedValue<number> | null = null
  const handleRef = createRef<ScrollViewHandle>()

  const Probe = (): ReactNode => {
    renders += 1
    const animatedRef = useAnimatedRef<ScrollViewHandle>()
    offset = useScrollOffset(animatedRef)
    return (
      <ScrollView
        ref={(instance: ScrollViewHandle | null) => {
          animatedRef(instance)
          ;(handleRef as { current: ScrollViewHandle | null }).current =
            instance
        }}
        style={{ width: 400, height: 240 }}
      >
        <View style={{ height: 6000 }}>
          <Text>tracked</Text>
        </View>
      </ScrollView>
    )
  }

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
  const label = screen.getByText("tracked") as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  await showFullscreen(label)

  // No `onScroll` prop anywhere on that ScrollView: the hook subscribes to
  // the adjustment itself, which is the point of it.
  expect(offset!.value).toBe(0)
  const aim = centreOf(handleRef.current!)
  injector.moveTo(aim.x, aim.y)
  await settle(120)
  const rendersBefore = renders

  for (let step = 0; step < 4; step += 1) {
    injector.scrollBy(1)
    await settle(60)
  }

  const scrolled = scrolledWindowAbove(label)
  expect(offset!.value).toBeGreaterThan(0)
  expect(offset!.value).toBe(scrolled.getVadjustment().getValue())
  // Reanimated's promise, kept by the path that was already there.
  expect(renders).toBe(rendersBefore)

  // And it follows the scroll back up — the sign is not assumed.
  injector.scrollBy(-2)
  await settle(120)
  expect(offset!.value).toBe(scrolled.getVadjustment().getValue())
})

it("stops tracking when the component tracking it unmounts", async () => {
  // "A scrollable nobody is tracking should cost nothing" has an end as well
  // as a beginning: the adjustment must not still be writing into a shared
  // value belonging to a component React has removed.
  let mountedOffset: SharedValue<number> | null = null
  let unmount: (() => void) | null = null

  const Tracker = (): ReactNode => {
    const animatedRef = useAnimatedRef<ScrollViewHandle>()
    mountedOffset = useScrollOffset(animatedRef)
    return (
      <ScrollView
        ref={animatedRef}
        style={{ width: 300, height: 200 }}
      >
        <View style={{ height: 3000 }}>
          <Text>tracked-until-unmount</Text>
        </View>
      </ScrollView>
    )
  }

  const Host = (): ReactNode => {
    const [mounted, setMounted] = useState(true)
    unmount = () => setMounted(false)
    return <View>{mounted ? <Tracker /> : <Text>gone</Text>}</View>
  }

  await act(async () => {
    await render(
      <Root
        width={400}
        height={300}
      >
        <Host />
      </Root>,
    )
  })
  const label = screen.getByText(
    "tracked-until-unmount",
  ) as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  const scrolled = scrolledWindowAbove(label)
  const adjustment = scrolled.getVadjustment()

  adjustment.setValue(120)
  await settle(30)
  expect(mountedOffset!.value).toBe(120)

  const captured = mountedOffset!
  await act(async () => {
    unmount!()
  })
  await settle(30)

  // The widget is gone with the component; what matters is that the shared
  // value was released rather than left subscribed to a live adjustment.
  adjustment.setValue(240)
  await settle(30)
  expect(captured.value).toBe(120)
})

// A ScrollEvent is what every one of the five callbacks receives, and the
// phases must carry the same payload `onScroll` does rather than a thinner
// one — a consumer reads `contentOffset` off an `onScrollEndDrag` exactly as
// it reads it off an `onScroll`.
it("hands every phase the same payload onScroll gets", async () => {
  const injector = await openPointer()
  if (!injector) {
    return
  }

  const events: ScrollEvent[] = []
  const handleRef = createRef<ScrollViewHandle>()

  await act(async () => {
    await render(
      <Root
        width={800}
        height={500}
      >
        <ScrollView
          ref={handleRef}
          style={{ width: 400, height: 240 }}
          onScrollBeginDrag={(event) => events.push(event)}
          onScrollEndDrag={(event) => events.push(event)}
        >
          <View style={{ height: 6000 }}>
            <Text>payload</Text>
          </View>
        </ScrollView>
      </Root>,
    )
  })
  const label = screen.getByText("payload") as unknown as GtkNs.Widget
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  await showFullscreen(label)

  const aim = centreOf(handleRef.current!)
  injector.moveTo(aim.x, aim.y)
  await settle(120)
  for (let step = 0; step < 6; step += 1) {
    injector.glideBy(20)
    await settle(16)
  }
  injector.glideEnd()
  await settle(1500)

  expect(events.length).toBeGreaterThanOrEqual(2)
  for (const event of events) {
    expect(event.nativeEvent.contentSize.height).toBeGreaterThan(1000)
    expect(event.nativeEvent.layoutMeasurement.height).toBeGreaterThan(0)
    expect(typeof event.nativeEvent.contentOffset.y).toBe("number")
  }
  // The drag began at the top and ended below it — the payload is measured
  // at the moment of the phase, not once.
  expect(events[0]!.nativeEvent.contentOffset.y).toBe(0)
  expect(events[1]!.nativeEvent.contentOffset.y).toBeGreaterThan(0)
})
