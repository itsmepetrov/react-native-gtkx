// The claim this whole surface rests on: a shared value drives a REAL GTK
// allocation, at frame rate, with React rendering once.
//
// Everything here is asserted on geometry GTK itself computed —
// `computeBounds()` against the stage, and `measure()` in window coordinates
// — rather than on the values we stored. Reading back our own bookkeeping
// would pass even if nothing ever reached a widget, which is the failure this
// file exists to rule out. The probe is measured on a CHILD of the animated
// view for the same reason: a child only moves if the parent's allocation
// actually moved.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { beforeEach, expect, it } from "vitest"
import { Graphene, Gtk } from "../../../src/gtkx/bridge/index"
import { Root, View } from "../../../src/index"
import Animated, {
  Easing,
  interpolate,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type MeasuredDimensions,
  type SharedValue,
} from "../../../src/reanimated-compat/index"

const DURATION = 300

const settle = (ms = 60): Promise<void> =>
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

const xOf = (testID: string): number => round(boundsOf(testID).getX())

type Handles = {
  offset: SharedValue<number>
  fade: SharedValue<number>
  measureBox: () => MeasuredDimensions | null
}

let handles: Handles
// Counted in a commit effect with no dependency array rather than in the body:
// one run per render, and a render is only interesting once it has committed
// anyway.
let renderCount = 0

const Probe = () => {
  const offset = useSharedValue(0)
  const fade = useSharedValue(1)
  const boxRef = useAnimatedRef()

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
    opacity: fade.value,
  }))

  useEffect(() => {
    renderCount += 1
    handles = {
      offset,
      fade,
      measureBox: () => measure(boxRef),
    }
  })

  return (
    <View
      style={{ width: 300, height: 200 }}
      testID="stage"
    >
      <Animated.View
        ref={boxRef}
        style={[
          {
            position: "absolute",
            left: 20,
            top: 20,
            width: 60,
            height: 40,
            backgroundColor: "#62a0ea",
          },
          style,
        ]}
        testID="box"
      >
        <View
          style={{ width: 24, height: 24, backgroundColor: "#f6d32d" }}
          testID="probe"
        />
      </Animated.View>
      <View
        style={{
          position: "absolute",
          left: 200,
          top: 120,
          width: 40,
          height: 40,
        }}
        testID="neighbour"
      />
    </View>
  )
}

beforeEach(() => {
  renderCount = 0
})

const mountProbe = async (): Promise<void> => {
  await render(
    <Root
      width={300}
      height={200}
    >
      <Probe />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("probe").getWidth()).toBeGreaterThan(0)
  })
}

it("drives real GTK geometry from a shared value, with one React render", async () => {
  await mountProbe()

  const startX = xOf("probe")
  const neighbourX = xOf("neighbour")
  // Mounting costs one render. Nothing in this surface schedules a second
  // one, and the whole point is that nothing during the animation does
  // either — this is the bar the spike set and it stays the bar.
  expect(renderCount).toBe(1)

  await act(async () => {
    handles.offset.value = withTiming(120, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 150)

  // Real allocation, taken on a descendant of the animated view.
  expect(xOf("probe") - startX).toBeCloseTo(120, 0)
  // …and the animation went through React exactly zero times.
  expect(renderCount).toBe(1)
  // Negative control: RN transforms are paint-only, so nothing else moved.
  expect(xOf("neighbour")).toBe(neighbourX)
})

it("keeps the animated position across a later React render", async () => {
  // The failure mode a naive implementation hits: the next render rebuilds
  // the style from the mapper's FIRST result and snaps the widget back.
  await mountProbe()
  const startX = xOf("probe")

  await act(async () => {
    handles.offset.value = withTiming(80, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 150)
  const movedX = xOf("probe")
  expect(movedX - startX).toBeCloseTo(80, 0)

  // A shape change forces the one render this surface ever costs; the
  // position must survive it.
  await act(async () => {
    handles.fade.value = 0.5
  })
  await settle()
  expect(xOf("probe")).toBe(movedX)
})

it("writes opacity straight to the widget", async () => {
  await mountProbe()
  const box = screen.getByName("box") as unknown as Gtk.Widget
  expect(box.getOpacity()).toBeCloseTo(1, 2)

  await act(async () => {
    handles.fade.value = withTiming(0.35, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 150)

  expect(box.getOpacity()).toBeCloseTo(0.35, 2)
})

it("measure() reports the animated view's real window geometry", async () => {
  await mountProbe()
  const before = handles.measureBox()
  expect(before).not.toBeNull()
  expect(before?.width).toBe(60)

  await act(async () => {
    handles.offset.value = withTiming(50, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 150)

  const after = handles.measureBox()
  // measure() reports the LAYOUT rect, as RN does: `x`/`y` are the committed
  // Yoga position, which a paint-only transform does not change, while pageX
  // goes through GTK's transform chain and does.
  expect(after?.x).toBe(before?.x)
  expect((after?.pageX ?? 0) - (before?.pageX ?? 0)).toBeCloseTo(50, 0)
})

it("a style whose shape changes costs exactly one render, and follows", async () => {
  // The case the spike explicitly did not handle: the leaf set changes, so
  // the nodes the view layer bound no longer describe the style.
  let shapeRenders = 0
  let toggle: SharedValue<boolean>
  let shift: SharedValue<number>

  const Shifting = () => {
    const on = useSharedValue(false)
    const dx = useSharedValue(0)
    useEffect(() => {
      shapeRenders += 1
      toggle = on
      shift = dx
    })
    const style = useAnimatedStyle(() =>
      on.value
        ? { transform: [{ translateX: dx.value }, { translateY: 10 }] }
        : { transform: [{ translateX: dx.value }] },
    )
    return (
      <View
        style={{ width: 300, height: 200 }}
        testID="stage"
      >
        <Animated.View
          style={[
            { position: "absolute", left: 10, top: 10, width: 30, height: 30 },
            style,
          ]}
          testID="box"
        >
          <View
            style={{ width: 10, height: 10 }}
            testID="probe"
          />
        </Animated.View>
      </View>
    )
  }

  await render(
    <Root
      width={300}
      height={200}
    >
      <Shifting />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("probe").getWidth()).toBeGreaterThan(0)
  })

  const baseY = round(boundsOf("probe").getY())
  const rendersBefore = shapeRenders

  await act(async () => {
    shift!.value = 25
  })
  await settle()
  // Same shape: no render at all.
  expect(shapeRenders).toBe(rendersBefore)
  expect(xOf("probe")).toBeCloseTo(35, 0)

  await act(async () => {
    toggle!.value = true
  })
  await settle()

  expect(shapeRenders).toBe(rendersBefore + 1)
  // The new leaf reached GTK, and the surviving one kept its value.
  expect(round(boundsOf("probe").getY()) - baseY).toBeCloseTo(10, 0)
  expect(xOf("probe")).toBeCloseTo(35, 0)
})

it("useDerivedValue and interpolate drive the same path", async () => {
  let progress: SharedValue<number>
  const Derived = () => {
    const value = useSharedValue(0)
    useEffect(() => {
      progress = value
    })
    const shifted = useDerivedValue(() =>
      interpolate(value.value, [0, 1], [0, 90]),
    )
    const style = useAnimatedStyle(() => ({
      transform: [{ translateX: shifted.value }],
    }))
    return (
      <View
        style={{ width: 300, height: 200 }}
        testID="stage"
      >
        <Animated.View
          style={[
            { position: "absolute", left: 0, top: 0, width: 20, height: 20 },
            style,
          ]}
          testID="box"
        >
          <View
            style={{ width: 10, height: 10 }}
            testID="probe"
          />
        </Animated.View>
      </View>
    )
  }

  await render(
    <Root
      width={300}
      height={200}
    >
      <Derived />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("probe").getWidth()).toBeGreaterThan(0)
  })

  await act(async () => {
    progress!.value = 0.5
  })
  await settle()

  expect(xOf("probe")).toBeCloseTo(45, 0)
})
