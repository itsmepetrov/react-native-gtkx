// Slice 2b: `top`/`left` on an absolutely positioned node, driven as a
// translate from the position the committed layout gave it.
//
// Everything here is asserted on geometry GTK itself computed —
// `computeBounds()` against the stage — rather than on the offsets we stored,
// because reading back our own bookkeeping would pass even if nothing ever
// reached a widget. The hit-testing test goes further and injects a REAL
// Wayland pointer: a translation that draws in the right place and is picked
// in the wrong one is worse than the honest refusal slice 2 shipped, and only
// a real pointer can tell those two apart.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  Animated as PlatformAnimated,
  resetAnimatedInsetWarnings,
} from "../../../src/components/animated"
import { Gtk, type Graphene } from "../../../src/gtkx/bridge/index"
import { Pressable, Root, View } from "../../../src/index"
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

const DURATION = 240
const OUTPUT = { width: 1024, height: 768 }

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

const yOf = (testID: string): number => round(boundsOf(testID).getY())
const xOf = (testID: string): number => round(boundsOf(testID).getX())

let pointer: VirtualPointer | null = null

beforeEach(() => {
  resetAnimatedInsetWarnings()
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
      console.warn(`[animated-inset] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

// --- the sortable row, in the shape upstream actually returns -------------

type RowHandles = {
  top: SharedValue<number>
  measureRow: () => MeasuredDimensions | null
}

let handles: RowHandles
let renderCount = 0

// `hooks/useSortable.ts:489-503` returns exactly this object, every frame.
const SortableRow = () => {
  const top = useSharedValue(0)
  const rowRef = useAnimatedRef()
  const style = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    right: 0,
    top: top.value,
    zIndex: 1,
  }))
  useEffect(() => {
    renderCount += 1
    handles = { top, measureRow: () => measure(rowRef) }
  })
  return (
    <View
      style={{ width: 400, height: 400 }}
      testID="stage"
    >
      <Animated.View
        ref={rowRef}
        style={[{ height: 60, backgroundColor: "#62a0ea" }, style]}
        testID="row"
      >
        <View
          style={{ width: 24, height: 24 }}
          testID="probe"
        />
      </Animated.View>
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 60,
          height: 60,
        }}
        testID="neighbour"
      />
    </View>
  )
}

const mountRow = async (): Promise<void> => {
  renderCount = 0
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  await render(
    <Root
      width={400}
      height={400}
    >
      <SortableRow />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("probe").getWidth()).toBeGreaterThan(0)
  })
  warn.mockRestore()
}

it("drives the upstream useSortable shape into real GTK geometry", async () => {
  await mountRow()

  const startY = yOf("probe")
  const neighbourY = yOf("neighbour")
  const rowWidth = round(boundsOf("row").getWidth())
  // `left: 0, right: 0` with no width: the row is full-bleed by construction,
  // which is the property the whole sortable ecosystem is built on.
  expect(rowWidth).toBe(400)
  expect(renderCount).toBe(1)

  await act(async () => {
    handles.top.value = withTiming(240, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 200)

  // Real allocation, measured on a DESCENDANT of the animated view — a child
  // only moves if the parent's allocation actually moved.
  expect(yOf("probe") - startY).toBeCloseTo(240, 0)
  // Still full width: this was a translation, not a stretch between edges.
  expect(round(boundsOf("row").getWidth())).toBe(rowWidth)
  // Zero React renders for the whole animation, exactly like a transform.
  expect(renderCount).toBe(1)
  // Negative control: an absolutely positioned node is out of flow, so
  // nothing else moved.
  expect(yOf("neighbour")).toBe(neighbourY)
})

it("hit-testing follows a translated row, and nowhere else hears anything", async () => {
  // THE probe of this slice. Our transform path re-ALLOCATES rather than
  // painting elsewhere, so input should follow — but "should" is not a
  // measurement, and a Wayland pointer is addressed by position rather than
  // by focus, so the untouched zone has to be asserted too.
  const device = await withPointer()
  if (!device) {
    return
  }

  const onRow = vi.fn()
  const onElsewhere = vi.fn()
  let rowTop: SharedValue<number>

  const Stage = () => {
    const top = useSharedValue(100)
    useEffect(() => {
      rowTop = top
    })
    const style = useAnimatedStyle(() => ({
      position: "absolute",
      left: 100,
      top: top.value,
    }))
    return (
      <View
        style={{ width: OUTPUT.width, height: OUTPUT.height }}
        testID="stage"
      >
        <Animated.View
          style={[{ width: 120, height: 80 }, style]}
          testID="mover"
        >
          <Pressable
            testID="target"
            onPress={() => onRow()}
            style={{ width: 120, height: 80 }}
          />
        </Animated.View>
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

  const press = async (x: number, y: number): Promise<void> => {
    device.moveTo(x, y)
    await settle()
    device.press()
    await settle()
    device.release()
    await settle()
  }

  // Baseline: it answers where it is drawn now.
  await press(160, 140)
  await waitFor(() => {
    expect(onRow).toHaveBeenCalledTimes(1)
  })
  onRow.mockClear()

  await act(async () => {
    rowTop!.value = 400
  })
  await settle()
  expect(yOf("mover")).toBeCloseTo(400, 0)

  // NEGATIVE CONTROL: where it used to be is now empty space.
  await press(160, 140)
  expect(onRow).not.toHaveBeenCalled()

  // …and where it is DRAWN is where it is picked.
  await press(160, 440)
  await waitFor(() => {
    expect(onRow).toHaveBeenCalledTimes(1)
  })

  // UNTOUCHED ZONE: nothing in this sequence went anywhere near it.
  expect(onElsewhere).not.toHaveBeenCalled()
  // …and it was live the whole time, so the silence above means something.
  await press(760, 540)
  await waitFor(() => {
    expect(onElsewhere).toHaveBeenCalledTimes(1)
  })
})

it("composes with a user transform instead of replacing it", async () => {
  // The derived translate is the OUTERMOST matrix, so it moves the already
  // scaled box by the distance the layout asked for. Appending it instead
  // would put the scale on the outside and multiply the offset by it — the
  // subtle failure that only shows up inside an already-transformed subtree.
  let insetTop: SharedValue<number>
  const Scaled = () => {
    const top = useSharedValue(0)
    useEffect(() => {
      insetTop = top
    })
    const style = useAnimatedStyle(() => ({
      position: "absolute",
      left: 0,
      top: top.value,
      transform: [{ scale: 2 }],
    }))
    return (
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <Animated.View
          style={[{ width: 40, height: 40 }, style]}
          testID="box"
        />
      </View>
    )
  }

  await render(
    <Root
      width={400}
      height={400}
    >
      <Scaled />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("box").getWidth()).toBeGreaterThan(0)
  })

  const before = boundsOf("box")
  // The scale is honoured: a 40 px box drawn at 80 px.
  expect(round(before.getWidth())).toBe(80)

  await act(async () => {
    insetTop!.value = 100
  })
  await settle()

  const after = boundsOf("box")
  // 100, not 200: the offset is in the parent's coordinates, exactly as a
  // layout position is. And the scale survived.
  expect(round(after.getY() - before.getY())).toBeCloseTo(100, 0)
  expect(round(after.getWidth())).toBe(80)
})

it("does not jump when React commits a new layout mid-animation", async () => {
  // The bug this design is most likely to ship: the base the offset is
  // measured against moves when React re-renders, and a naive implementation
  // either double-counts it (the row leaps by 2x) or drops it (the row snaps
  // back to where Yoga put it).
  let insetTop: SharedValue<number>
  let bump: () => void

  const Rebasing = () => {
    const top = useSharedValue(50)
    const [extra, setExtra] = useState(0)
    useEffect(() => {
      insetTop = top
      bump = () => setExtra((value) => value + 1)
    })
    const style = useAnimatedStyle(() => ({
      position: "absolute",
      left: 0,
      top: top.value,
    }))
    return (
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <Animated.View
          style={[{ width: 40, height: 40, opacity: 1 - extra * 0.1 }, style]}
          testID="box"
        />
      </View>
    )
  }

  await render(
    <Root
      width={400}
      height={400}
    >
      <Rebasing />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("box").getWidth()).toBeGreaterThan(0)
  })
  expect(yOf("box")).toBeCloseTo(50, 0)

  await act(async () => {
    insetTop!.value = 260
  })
  await settle()
  expect(yOf("box")).toBeCloseTo(260, 0)

  // React commits again. The mapper has since moved `top` to 260, so THIS
  // render hands Yoga 260 as the node's real position and the offset must
  // become zero in the same commit — with nothing visible in between.
  await act(async () => {
    bump!()
  })
  await settle()
  expect(yOf("box")).toBeCloseTo(260, 0)

  // And the animation keeps going from the new base rather than from the old.
  await act(async () => {
    insetTop!.value = 300
  })
  await settle()
  expect(yOf("box")).toBeCloseTo(300, 0)

  await act(async () => {
    bump!()
    insetTop!.value = 120
  })
  await settle()
  expect(yOf("box")).toBeCloseTo(120, 0)
})

it("inverts the axis for `right` and `bottom`", async () => {
  let inset: SharedValue<number>
  const Anchored = () => {
    const value = useSharedValue(0)
    useEffect(() => {
      inset = value
    })
    const style = useAnimatedStyle(() => ({
      position: "absolute",
      right: value.value,
      bottom: value.value,
    }))
    return (
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <Animated.View
          style={[{ width: 40, height: 40 }, style]}
          testID="box"
        />
      </View>
    )
  }

  await render(
    <Root
      width={400}
      height={400}
    >
      <Anchored />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("box").getWidth()).toBeGreaterThan(0)
  })
  // Pinned to the far corner.
  expect(xOf("box")).toBeCloseTo(360, 0)
  expect(yOf("box")).toBeCloseTo(360, 0)

  await act(async () => {
    inset!.value = 100
  })
  await settle()

  // A LARGER inset from the right/bottom edge moves the box back towards the
  // origin, which is the opposite direction from `left`/`top`.
  expect(xOf("box")).toBeCloseTo(260, 0)
  expect(yOf("box")).toBeCloseTo(260, 0)
})

it("drives an inset whose `position` lives in a sibling style entry", async () => {
  // `style={[styles.row, useAnimatedStyle(() => ({ top: y.value }))]}` — the
  // ordinary spelling, where the updater's object says nothing about
  // `position` at all. The view layer flattens first, so it sees the truth.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  let inset: SharedValue<number>
  const Split = () => {
    const value = useSharedValue(0)
    useEffect(() => {
      inset = value
    })
    const style = useAnimatedStyle(() => ({ top: value.value }))
    return (
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <Animated.View
          style={[
            { position: "absolute", left: 0, width: 40, height: 40 },
            style,
          ]}
          testID="box"
        />
      </View>
    )
  }

  await render(
    <Root
      width={400}
      height={400}
    >
      <Split />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("box").getWidth()).toBeGreaterThan(0)
  })

  await act(async () => {
    inset!.value = 170
  })
  await settle()

  expect(yOf("box")).toBeCloseTo(170, 0)
  expect(warn).not.toHaveBeenCalled()
})

it("keeps slice 2's refusal for a node that is not absolutely positioned", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  let inset: SharedValue<number>
  const InFlow = () => {
    const value = useSharedValue(0)
    useEffect(() => {
      inset = value
    })
    const style = useAnimatedStyle(() => ({ top: value.value }))
    return (
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <Animated.View
          style={[{ width: 40, height: 40 }, style]}
          testID="box"
        />
      </View>
    )
  }

  await render(
    <Root
      width={400}
      height={400}
    >
      <InFlow />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("box").getWidth()).toBeGreaterThan(0)
  })
  const startY = yOf("box")

  await act(async () => {
    inset!.value = 120
  })
  await settle()

  // Refused, loudly, and NOT moved — the node is in flow, where moving it
  // would move its siblings and cost a Yoga pass. The warning comes from the
  // view layer here rather than from the mapper, because the updater said
  // nothing about `position` and the flattened style is the only place the
  // answer exists.
  expect(yOf("box")).toBe(startY)
  const messages = warn.mock.calls.map((call) => String(call[0]))
  expect(
    messages.some((message) => message.includes("cannot be driven here")),
  ).toBe(true)
  expect(messages.some((message) => message.includes("translateY"))).toBe(true)
})

it("measure() reports the committed layout, and the window position it is drawn at", async () => {
  await mountRow()
  const before = handles.measureRow()
  expect(before).not.toBeNull()

  await act(async () => {
    handles.top.value = 150
  })
  await settle()

  const after = handles.measureRow()
  // THE SEMANTIC DIFFERENCE, and it is the same one an explicit `translateY`
  // already has here: the node's Yoga rect did not move, so `x`/`y` report
  // the committed layout, while `pageX`/`pageY` go through GTK's transform
  // chain and report where the row is actually drawn.
  expect(after?.y).toBe(before?.y)
  expect((after?.pageY ?? 0) - (before?.pageY ?? 0)).toBeCloseTo(150, 0)
  expect(after?.height).toBe(before?.height)
})

it("drives RN's own Animated.ValueXY.getLayout(), which is the same shape", async () => {
  // `getLayout()` returns `{ left, top }` for exactly this purpose, and
  // before this slice it reached a mounted widget and did nothing at all.
  let pan: InstanceType<typeof PlatformAnimated.ValueXY>
  const Dragged = () => {
    const [value] = useState(() => new PlatformAnimated.ValueXY({ x: 0, y: 0 }))
    useEffect(() => {
      pan = value
    })
    return (
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <PlatformAnimated.View
          style={{
            position: "absolute",
            width: 40,
            height: 40,
            ...value.getLayout(),
          }}
          testID="box"
        />
      </View>
    )
  }

  await render(
    <Root
      width={400}
      height={400}
    >
      <Dragged />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("box").getWidth()).toBeGreaterThan(0)
  })

  await act(async () => {
    pan!.setValue({ x: 70, y: 130 })
  })
  await settle()

  expect(xOf("box")).toBeCloseTo(70, 0)
  expect(yOf("box")).toBeCloseTo(130, 0)
})
