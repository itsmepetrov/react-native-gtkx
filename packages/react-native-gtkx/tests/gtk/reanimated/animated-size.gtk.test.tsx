// Slice 3: `width`/`height` driven at frame rate where the change is confined
// to the node that owns it — the node's own subtree re-laid-out pinned to the
// driven value, the result into the rect store as an OVERRIDE, one queued
// allocation.
//
// Everything here is asserted on geometry GTK itself computed
// (`computeBounds()` against the stage, `gtk_widget_pick()`, the toplevel's
// own `measure()`) rather than on the store this path writes to: reading our
// own bookkeeping back would pass even if nothing ever reached a widget, which
// is the failure the whole exercise exists to rule out. The hit-testing test
// injects a REAL Wayland pointer for the same reason slice 2b's did — a box
// that draws at the right size and is picked at the wrong one is worse than
// the honest refusal.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { memo, useEffect, useState } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { resetAnimatedSizeWarnings } from "../../../src/components/animated"
import {
  Gtk,
  measureWidget,
  type Graphene,
} from "../../../src/gtkx/bridge/index"
import { Pressable, Root, Text, View } from "../../../src/index"
import Animated, {
  Easing,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type MeasuredDimensions,
  type SharedValue,
} from "../../../src/reanimated-compat/index"
import { resetUndriveableWarnings } from "../../../src/reanimated-compat/style"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

const OUTPUT = { width: 1024, height: 768 }
const BASE = 100
const TARGET = 260

const settle = (ms = 80): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const round = (value: number): number => Math.round(value * 100) / 100

const boundsOf = (testID: string): Graphene.Rect => {
  const stage = screen.getByName("stage") as unknown as Gtk.Widget
  const widget = screen.getByName(testID) as unknown as Gtk.Widget
  const [, rect] = widget.computeBounds(stage) as [boolean, Graphene.Rect]
  return rect
}

const boxOf = (
  testID: string,
): { x: number; y: number; width: number; height: number } => {
  const rect = boundsOf(testID)
  return {
    x: round(rect.getX()),
    y: round(rect.getY()),
    width: round(rect.getWidth()),
    height: round(rect.getHeight()),
  }
}

let pointer: VirtualPointer | null = null

beforeEach(() => {
  resetAnimatedSizeWarnings()
  resetUndriveableWarnings()
})

afterEach(() => {
  pointer?.dispose()
  pointer = null
  vi.restoreAllMocks()
})

const withPointer = async (): Promise<VirtualPointer | null> => {
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      console.warn(`[animated-size] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

// --- the shape the carve-out is for ---------------------------------------

type BarHandles = {
  width: SharedValue<number>
  measureBar: () => MeasuredDimensions | null
}

let handles: BarHandles
let renderCount = 0

const ROWS = 12

const Bar = () => {
  const width = useSharedValue(BASE)
  const barRef = useAnimatedRef()
  const style = useAnimatedStyle(() => ({ width: width.value }))
  useEffect(() => {
    renderCount += 1
    handles = { width, measureBar: () => measure(barRef) }
  })
  return (
    <View
      style={{ width: 500, height: 400, backgroundColor: "#241f31" }}
      testID="stage"
    >
      {/* A definite cross size, so nothing a child does to its own width can
          change the container's. That is the precondition the carve-out
          rests on. */}
      <View
        style={{ width: 400, height: 380, backgroundColor: "#3d3846" }}
        testID="column"
      >
        <Animated.View
          ref={barRef}
          style={[{ height: 60, backgroundColor: "#3584e4" }, style]}
          testID="bar"
        >
          <Text
            style={{ color: "#ffffff", fontSize: 11 }}
            testID="label"
          >
            the quick brown fox jumps over the lazy dog
          </Text>
        </Animated.View>
        {Array.from({ length: ROWS }, (_, index) => (
          <View
            key={index}
            testID={`row${index}`}
            style={{ width: 90, height: 8, backgroundColor: "#613583" }}
          />
        ))}
      </View>
    </View>
  )
}

const mountBar = async (): Promise<void> => {
  renderCount = 0
  await render(
    <Root
      width={500}
      height={400}
    >
      <Bar />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("label").getWidth()).toBeGreaterThan(0)
  })
}

it("drives a width into real GTK geometry, and moves nothing else", async () => {
  await mountBar()

  const before = boxOf("bar")
  const labelBefore = boxOf("label")
  const rowBefore = boxOf("row0")
  const columnBefore = boxOf("column")
  expect(before.width).toBe(BASE)
  expect(renderCount).toBe(1)

  await act(async () => {
    handles.width.value = withTiming(TARGET, {
      duration: 160,
      easing: Easing.linear,
    })
  })
  await settle(400)

  const after = boxOf("bar")
  // It reached a widget, at the value asked for.
  expect(after.width).toBe(TARGET)
  // It grew from the LEADING edge — the difference from a `scaleX`, which
  // grows about the centre (docs/research/animated-size.md §6).
  expect(after.x).toBe(before.x)
  expect(after.y).toBe(before.y)
  // The node's own content was re-laid-out for the new width: the label
  // re-wrapped from several lines to fewer. A rect write alone makes the box
  // the right size and leaves everything inside it on its old layout, which
  // is the whole reason this is a pinned Yoga pass rather than one store
  // write.
  const labelAfter = boxOf("label")
  expect(labelAfter.width).toBeGreaterThan(labelBefore.width)
  expect(labelAfter.height).toBeLessThan(labelBefore.height)
  // NEGATIVE CONTROLS: the sibling below and the container are untouched.
  expect(boxOf("row0")).toEqual(rowBefore)
  expect(boxOf("column")).toEqual(columnBefore)
  // Zero React renders for the whole animation, exactly like a transform.
  expect(renderCount).toBe(1)
})

it("keeps the driven size through an unrelated engine flush", async () => {
  // THE bug this design is most likely to ship, and the reason the driven size
  // is an OVERRIDE in the rect store rather than a write over the committed
  // rect. A window resize re-lays the WHOLE tree out and re-commits every node
  // — a measure-backed leaf (every `Text`) is re-committed by any walk that
  // reaches it whether its rect changed or not — so an implementation that
  // wrote over the committed rect would lose the frame to a flush that had
  // nothing to do with the animation.
  let barWidth: SharedValue<number>
  let resize: (value: number) => void
  let sceneRenders = 0

  // Memoised so the resize below re-renders the ROOT and not the animated
  // subtree: a re-render would rebase the animation deliberately, which is a
  // different mechanism (the test after this one) and would hide this one.
  const Scene = memo(() => {
    const width = useSharedValue(BASE)
    const style = useAnimatedStyle(() => ({ width: width.value }))
    useEffect(() => {
      sceneRenders += 1
      barWidth = width
    })
    return (
      <View
        style={{ width: 500, height: 400 }}
        testID="stage"
      >
        <View
          style={{ width: 400, height: 380 }}
          testID="column"
        >
          <Animated.View
            style={[{ height: 60 }, style]}
            testID="bar"
          >
            <Text
              style={{ fontSize: 11 }}
              testID="label"
            >
              the quick brown fox jumps over the lazy dog
            </Text>
          </Animated.View>
        </View>
      </View>
    )
  })
  Scene.displayName = "Scene"

  const Harness = () => {
    const [viewport, setViewport] = useState(500)
    useEffect(() => {
      resize = setViewport
    }, [])
    return (
      <Root
        width={viewport}
        height={400}
      >
        <Scene />
      </Root>
    )
  }

  await render(<Harness />)
  await waitFor(() => {
    expect(boundsOf("label").getWidth()).toBeGreaterThan(0)
  })

  await act(async () => {
    barWidth!.value = TARGET
  })
  await settle()
  const driven = boxOf("bar")
  const label = boxOf("label")
  expect(driven.width).toBe(TARGET)
  const rendersBefore = sceneRenders

  // The unrelated flush: the window changed size, which sets the engine's
  // walk-everything flag and re-commits every node in the tree at the layout
  // Yoga computed — where the bar is still 100 wide, because the driven value
  // deliberately never went into Yoga.
  await act(async () => {
    resize!(560)
  })
  await settle(120)

  expect(sceneRenders).toBe(rendersBefore)
  expect(boxOf("bar").width).toBe(TARGET)
  // And the re-wrap inside it survived too, which is the half a store-write
  // implementation loses first: a `Text` re-commits on every walk that
  // reaches it.
  expect(boxOf("label")).toEqual(label)

  // Still animating afterwards, from the same base.
  await act(async () => {
    barWidth!.value = 180
  })
  await settle()
  expect(boxOf("bar").width).toBe(180)
})

it("does not jump when React commits a new layout mid-animation", async () => {
  // The rebase. The render hands Yoga the size the animation is currently
  // showing and the override is dropped in the same commit, so the committed
  // rect takes over with nothing visible in between.
  let barWidth: SharedValue<number>
  let bump: () => void

  const Rebasing = () => {
    const width = useSharedValue(BASE)
    const [extra, setExtra] = useState(0)
    useEffect(() => {
      barWidth = width
      bump = () => setExtra((value) => value + 1)
    })
    const style = useAnimatedStyle(() => ({ width: width.value }))
    return (
      <View
        style={{ width: 500, height: 400 }}
        testID="stage"
      >
        <View
          style={{ width: 400, height: 380 }}
          testID="column"
        >
          <Animated.View
            style={[{ height: 60, opacity: 1 - extra * 0.1 }, style]}
            testID="bar"
          >
            <View
              style={{ height: 10 }}
              testID="inner"
            />
          </Animated.View>
        </View>
      </View>
    )
  }

  await render(
    <Root
      width={500}
      height={400}
    >
      <Rebasing />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("bar").getWidth()).toBeGreaterThan(0)
  })

  await act(async () => {
    barWidth!.value = TARGET
  })
  await settle()
  expect(boxOf("bar").width).toBe(TARGET)
  // The stretched child followed, which is the subtree pass doing its job.
  expect(boxOf("inner").width).toBe(TARGET)

  await act(async () => {
    bump!()
  })
  await settle(120)
  expect(boxOf("bar").width).toBe(TARGET)
  expect(boxOf("inner").width).toBe(TARGET)

  // …and the animation continues from the new base rather than from the old.
  await act(async () => {
    barWidth!.value = 150
  })
  await settle()
  expect(boxOf("bar").width).toBe(150)
  expect(boxOf("inner").width).toBe(150)

  await act(async () => {
    bump!()
    barWidth!.value = 320
  })
  await settle(120)
  expect(boxOf("bar").width).toBe(320)
})

it("is picked where it is drawn, under a real pointer", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }

  const onBar = vi.fn()
  const onElsewhere = vi.fn()
  let barWidth: SharedValue<number>

  const Stage = () => {
    const width = useSharedValue(BASE)
    useEffect(() => {
      barWidth = width
    })
    const style = useAnimatedStyle(() => ({ width: width.value }))
    return (
      <View
        style={{ width: OUTPUT.width, height: OUTPUT.height }}
        testID="stage"
      >
        <View
          style={{ width: 600, height: 400 }}
          testID="column"
        >
          <Animated.View
            style={[{ height: 120 }, style]}
            testID="bar"
          >
            <Pressable
              testID="target"
              onPress={() => onBar()}
              style={{ flex: 1, height: 120 }}
            />
          </Animated.View>
        </View>
        <Pressable
          testID="elsewhere"
          onPress={() => onElsewhere()}
          style={{
            position: "absolute",
            left: 700,
            top: 500,
            width: 120,
            height: 80,
          }}
        />
      </View>
    )
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
    expect(boundsOf("target").getWidth()).toBeGreaterThan(0)
  })
  const root = (screen.getByName("stage") as unknown as Gtk.Widget).getRoot()
  if (!(root instanceof Gtk.Window)) {
    throw new Error("no toplevel")
  }
  root.present()
  root.fullscreen()
  await waitFor(() => {
    expect(root.isActive()).toBe(true)
  })
  await settle()

  // A Wayland pointer is addressed by position, so every press below is at a
  // DIFFERENT point from the one before it: pressing the same coordinates
  // twice sends no motion between them and GTK has no crossing event to
  // re-target on, which measures the rig rather than the mechanism.
  const press = async (x: number, y: number): Promise<void> => {
    device.moveTo(x, y)
    await settle()
    device.press()
    await settle()
    device.release()
    await settle()
  }

  // Baseline: inside the 100 px box.
  await press(50, 60)
  await waitFor(() => {
    expect(onBar).toHaveBeenCalledTimes(1)
  })
  onBar.mockClear()

  // NEGATIVE CONTROL: past the old edge, before it grows, is dead space.
  await press(300, 60)
  expect(onBar).not.toHaveBeenCalled()

  await act(async () => {
    barWidth!.value = 400
  })
  await settle()
  expect(boxOf("bar").width).toBe(400)
  // The Pressable inside grew with it — the subtree really was re-laid-out.
  expect(boxOf("target").width).toBe(400)

  // A point that was dead space a moment ago now hits, because the widget is
  // genuinely there rather than merely painted there.
  await press(200, 60)
  await waitFor(() => {
    expect(onBar).toHaveBeenCalledTimes(1)
  })
  onBar.mockClear()

  // …and past the NEW edge still does not.
  await press(500, 60)
  expect(onBar).not.toHaveBeenCalled()

  // UNTOUCHED ZONE: nothing above went near it…
  expect(onElsewhere).not.toHaveBeenCalled()
  // …and it was live the whole time, so the silence means something.
  await press(760, 540)
  await waitFor(() => {
    expect(onElsewhere).toHaveBeenCalledTimes(1)
  })
})

it("drives `height` on a ROW container, which is its cross axis", async () => {
  let barHeight: SharedValue<number>
  const Row = () => {
    const height = useSharedValue(40)
    useEffect(() => {
      barHeight = height
    })
    const style = useAnimatedStyle(() => ({ height: height.value }))
    return (
      <View
        style={{ width: 500, height: 400 }}
        testID="stage"
      >
        <View
          style={{
            width: 400,
            height: 380,
            flexDirection: "row",
            alignItems: "flex-start",
          }}
          testID="column"
        >
          <Animated.View
            style={[{ width: 60 }, style]}
            testID="bar"
          />
          <View
            style={{ width: 60, height: 40 }}
            testID="next"
          />
        </View>
      </View>
    )
  }

  await render(
    <Root
      width={500}
      height={400}
    >
      <Row />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("bar").getWidth()).toBeGreaterThan(0)
  })
  const next = boxOf("next")

  await act(async () => {
    barHeight!.value = 300
  })
  await settle()

  expect(boxOf("bar").height).toBe(300)
  expect(boxOf("bar").y).toBe(0)
  // The next child along the MAIN axis did not move: a cross-axis change
  // touches no sibling, which is the property the carve-out is scoped to.
  expect(boxOf("next")).toEqual(next)
})

it("keeps the refusal, loudly, where the change would not stop at the node", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  let barHeight: SharedValue<number>
  const MainAxis = () => {
    const height = useSharedValue(60)
    useEffect(() => {
      barHeight = height
    })
    const style = useAnimatedStyle(() => ({ height: height.value }))
    return (
      <View
        style={{ width: 500, height: 400 }}
        testID="stage"
      >
        <View
          style={{ width: 400, height: 380 }}
          testID="column"
        >
          <Animated.View
            style={[{ width: 100 }, style]}
            testID="bar"
          />
          <View
            style={{ width: 100, height: 20 }}
            testID="next"
          />
        </View>
      </View>
    )
  }

  await render(
    <Root
      width={500}
      height={400}
    >
      <MainAxis />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("bar").getWidth()).toBeGreaterThan(0)
  })
  const before = boxOf("bar")
  const next = boxOf("next")

  await act(async () => {
    barHeight!.value = 300
  })
  await settle()

  // Refused, and NOT moved: a `height` in a column is the container's MAIN
  // axis, so growing it would push every following sibling along — a layout
  // pass over the container, which is the cost the refusal is about.
  expect(boxOf("bar")).toEqual(before)
  expect(boxOf("next")).toEqual(next)
  const messages = warn.mock.calls.map((call) => String(call[0]))
  const message = messages.find((entry) => entry.includes("`height`"))
  expect(message).toBeTruthy()
  expect(message).toContain("MAIN axis")
  expect(message).toContain("scaleY")
  expect(message).toContain("NOT the same thing")
})

it("refuses an alignment that would move the node's own origin", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  let barWidth: SharedValue<number>
  const Centred = () => {
    const width = useSharedValue(BASE)
    useEffect(() => {
      barWidth = width
    })
    const style = useAnimatedStyle(() => ({ width: width.value }))
    return (
      <View
        style={{ width: 500, height: 400 }}
        testID="stage"
      >
        <View
          style={{ width: 400, height: 380, alignItems: "center" }}
          testID="column"
        >
          <Animated.View
            style={[{ height: 60 }, style]}
            testID="bar"
          />
        </View>
      </View>
    )
  }

  await render(
    <Root
      width={500}
      height={400}
    >
      <Centred />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("bar").getWidth()).toBeGreaterThan(0)
  })
  const before = boxOf("bar")

  await act(async () => {
    barWidth!.value = TARGET
  })
  await settle()

  expect(boxOf("bar")).toEqual(before)
  const message = warn.mock.calls
    .map((call) => String(call[0]))
    .find((entry) => entry.includes("`width`"))
  expect(message).toContain("cross-axis alignment")
})

it("refuses a container whose own width comes from its children", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  let barWidth: SharedValue<number>
  const ContentSized = () => {
    const width = useSharedValue(BASE)
    useEffect(() => {
      barWidth = width
    })
    const style = useAnimatedStyle(() => ({ width: width.value }))
    return (
      <View
        style={{ width: 500, height: 400 }}
        testID="stage"
      >
        {/* `alignSelf: flex-start` takes the stretch away, so the container's
            width is whatever its widest child is — and the node growing would
            grow the container with it. */}
        <View
          style={{ height: 380, alignSelf: "flex-start" }}
          testID="column"
        >
          <Animated.View
            style={[{ height: 60 }, style]}
            testID="bar"
          />
        </View>
      </View>
    )
  }

  await render(
    <Root
      width={500}
      height={400}
    >
      <ContentSized />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("bar").getWidth()).toBeGreaterThan(0)
  })
  const before = boxOf("bar")
  const column = boxOf("column")

  await act(async () => {
    barWidth!.value = TARGET
  })
  await settle()

  expect(boxOf("bar")).toEqual(before)
  expect(boxOf("column")).toEqual(column)
  const message = warn.mock.calls
    .map((call) => String(call[0]))
    .find((entry) => entry.includes("`width`"))
  expect(message).toContain("derived from its children")
})

it("does not move the window's own size request", async () => {
  // The correctness half of the original refusal, and it survives here for a
  // structural reason: the driven size never goes into Yoga, so nothing the
  // toplevel measures can change (docs/research/animated-size.md §4).
  await mountBar()
  const window = (screen.getByName("stage") as unknown as Gtk.Widget).getRoot()
  if (!(window instanceof Gtk.Window)) {
    throw new Error("no toplevel")
  }
  const before = measureWidget(window as unknown as Gtk.Widget, "horizontal")

  await act(async () => {
    handles.width.value = 900
  })
  await settle()
  expect(boxOf("bar").width).toBe(900)

  const after = measureWidget(window as unknown as Gtk.Widget, "horizontal")
  expect(after.minimum).toBe(before.minimum)
  expect(after.natural).toBe(before.natural)
})

it("measure() reports the committed layout, not the driven size", async () => {
  await mountBar()
  const before = handles.measureBar()
  expect(before?.width).toBe(BASE)

  await act(async () => {
    handles.width.value = TARGET
  })
  await settle()

  const after = handles.measureBar()
  // THE SEMANTIC DIFFERENCE, and it is the same one a transform already has
  // here: the node's Yoga rect did not change, so `measure()` keeps reporting
  // what React last committed. It catches up on the next render.
  expect(after?.width).toBe(before?.width)
  expect(boxOf("bar").width).toBe(TARGET)
})
