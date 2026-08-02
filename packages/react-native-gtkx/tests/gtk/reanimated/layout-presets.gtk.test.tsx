// The preset catalogue, asserted on geometry GTK itself computed.
//
// The trap this file exists to rule out is the one the repo already records
// `Animated.View` falling into: a builder object that constructs, mounts, and
// animates NOTHING. So nothing here inspects a built config — every claim is
// read back through `computeBounds()` against the stage (which walks GTK's own
// transform chain, so a scale really is narrower and a rotation really is a
// bigger axis-aligned box) or through `getOpacity()` on the real widget.
//
// Most of it runs on the TEST CLOCK: `withReanimatedTimer` takes the frame
// driver every animation on this platform runs on, so "150 ms into a 300 ms
// zoom" is an exact statement rather than a sleep. The one place that does not
// is the exit path, which is held by a real `setTimeout` fallback (see
// src/components/widget-retention.ts) and therefore has to run at wall speed.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"
import { Graphene, Gtk } from "../../../src/gtkx/bridge/index"
import { Dimensions, Root, View } from "../../../src/index"
import Animated, {
  advanceAnimationByTime,
  BounceIn,
  CurvedTransition,
  Easing,
  FadeInDown,
  JumpingTransition,
  LayoutAnimationConfig,
  RotateInDownLeft,
  SlideInLeft,
  StretchInY,
  withReanimatedTimer,
  ZoomIn,
  ZoomOut,
} from "../../../src/reanimated-compat/index"

const ROW_WIDTH = 120
const ROW_HEIGHT = 40
const STAGE_WIDTH = 200
const STAGE_HEIGHT = 300

const settle = (ms = 40): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** Lets GTK run the allocation a transform write queued, without advancing time. */
const allocate = (): Promise<void> => settle(30)

const widget = (testID: string): Gtk.Widget =>
  screen.getByName(testID) as unknown as Gtk.Widget

const boundsOf = (testID: string): Graphene.Rect => {
  const stage = screen.getByName("stage") as unknown as Gtk.Widget
  const [, rect] = widget(testID).computeBounds(stage) as [
    boolean,
    Graphene.Rect,
  ]
  return rect
}

type Handles = { setItems: (items: string[]) => void }
let handles: Handles

type StageProps = {
  initial: string[]
  entering?: Parameters<typeof Animated.View>[0]["entering"]
  exiting?: Parameters<typeof Animated.View>[0]["exiting"]
  layout?: Parameters<typeof Animated.View>[0]["layout"]
  skipEntering?: boolean
}

const Rows = ({
  initial,
  entering,
  exiting,
  layout,
  skipEntering,
}: StageProps) => {
  const [items, setItems] = useState(initial)
  useEffect(() => {
    handles = { setItems }
  }, [setItems])
  const rows = items.map((id) => (
    <Animated.View
      key={id}
      testID={`row-${id}`}
      entering={entering}
      exiting={exiting}
      layout={layout}
      style={{
        width: ROW_WIDTH,
        height: ROW_HEIGHT,
        backgroundColor: "#62a0ea",
      }}
    />
  ))
  return (
    <View
      style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
      testID="stage"
    >
      {skipEntering === undefined ? (
        rows
      ) : (
        <LayoutAnimationConfig skipEntering={skipEntering}>
          {rows}
        </LayoutAnimationConfig>
      )}
    </View>
  )
}

const mount = async (props: StageProps): Promise<void> => {
  await render(
    <Root
      width={STAGE_WIDTH}
      height={STAGE_HEIGHT}
    >
      <Rows {...props} />
    </Root>,
  )
  await waitFor(() => {
    expect(widget(`row-${props.initial[0]}`)).toBeTruthy()
  })
}

it("ZoomIn grows the widget from nothing to its laid-out size", async () => {
  await withReanimatedTimer(async () => {
    await mount({ initial: ["a"], entering: ZoomIn.duration(300) })
    await allocate()

    // Scale 0 is written in the same commit that mounts the widget, so the
    // box is never drawn at full size — not even for one frame.
    expect(boundsOf("row-a").getWidth()).toBeLessThan(1)

    advanceAnimationByTime(150)
    await allocate()
    const half = boundsOf("row-a")
    // Halfway through inOut(quad) is exactly halfway up the curve.
    expect(half.getWidth()).toBeCloseTo(ROW_WIDTH / 2, 0)
    expect(half.getHeight()).toBeCloseTo(ROW_HEIGHT / 2, 0)

    advanceAnimationByTime(160)
    await allocate()
    expect(boundsOf("row-a").getWidth()).toBeCloseTo(ROW_WIDTH, 1)
    expect(boundsOf("row-a").getHeight()).toBeCloseTo(ROW_HEIGHT, 1)
  })
})

it("StretchInY grows one axis and leaves the other alone", async () => {
  await withReanimatedTimer(async () => {
    await mount({ initial: ["a"], entering: StretchInY.duration(300) })
    await allocate()
    // The discriminating assertion: a `scaleY` must not touch the width, or
    // the catalogue is quietly emitting `scale`.
    expect(boundsOf("row-a").getWidth()).toBeCloseTo(ROW_WIDTH, 1)
    expect(boundsOf("row-a").getHeight()).toBeLessThan(1)

    advanceAnimationByTime(320)
    await allocate()
    expect(boundsOf("row-a").getHeight()).toBeCloseTo(ROW_HEIGHT, 1)
  })
})

it("SlideInLeft walks the row in from a window's width away", async () => {
  await withReanimatedTimer(async () => {
    await mount({
      initial: ["a"],
      entering: SlideInLeft.duration(300).easing(Easing.linear),
    })
    await allocate()
    // A WINDOW's width, not the stage's — upstream measures the slide against
    // `Dimensions.get("window")`, and mirroring that is the whole point.
    const travel = Dimensions.get("window").width
    // `originX` is driven as a layout offset, so the box really is off the
    // left of the stage rather than merely claiming to be.
    expect(boundsOf("row-a").getX()).toBeCloseTo(-travel, 0)

    advanceAnimationByTime(150)
    await allocate()
    expect(boundsOf("row-a").getX()).toBeCloseTo(-travel / 2, 0)

    advanceAnimationByTime(160)
    await allocate()
    expect(boundsOf("row-a").getX()).toBeCloseTo(0, 1)
  })
})

it("FadeInDown drops the row into place while it fades", async () => {
  await withReanimatedTimer(async () => {
    await mount({
      initial: ["a"],
      entering: FadeInDown.duration(300).easing(Easing.linear),
    })
    await allocate()
    // Both halves at once, which is what makes it FadeInDown rather than
    // FadeIn: 25 px below where the engine put it, and transparent.
    expect(boundsOf("row-a").getY()).toBeCloseTo(25, 0)
    expect(widget("row-a").getOpacity()).toBeLessThan(0.05)

    advanceAnimationByTime(150)
    await allocate()
    // Halfway down a linear 25 px drop. Bracketed rather than compared to
    // 12.5: a layout offset lands on GTK's integer allocation grid, so the
    // exact midpoint is not a value the geometry can report.
    const half = boundsOf("row-a").getY()
    expect(half).toBeGreaterThan(10)
    expect(half).toBeLessThan(15)
    expect(widget("row-a").getOpacity()).toBeCloseTo(0.5, 1)

    advanceAnimationByTime(160)
    await allocate()
    expect(boundsOf("row-a").getY()).toBeCloseTo(0, 1)
    expect(widget("row-a").getOpacity()).toBeCloseTo(1, 2)
  })
})

it("BounceIn overshoots past its target and settles back", async () => {
  await withReanimatedTimer(async () => {
    await mount({ initial: ["a"], entering: BounceIn.duration(400) })
    await allocate()
    expect(boundsOf("row-a").getWidth()).toBeLessThan(1)

    // The overshoot is the whole preset: at the end of the first (55 %) leg
    // the scale is 1.2, which is WIDER than the box will ever be again. A
    // preset table that dropped the sequence would just ease to 1.
    advanceAnimationByTime(220)
    await allocate()
    expect(boundsOf("row-a").getWidth()).toBeGreaterThan(ROW_WIDTH * 1.1)

    advanceAnimationByTime(220)
    await allocate()
    expect(boundsOf("row-a").getWidth()).toBeCloseTo(ROW_WIDTH, 1)
  })
})

it("RotateInDownLeft starts turned a quarter and lands square", async () => {
  await withReanimatedTimer(async () => {
    await mount({ initial: ["a"], entering: RotateInDownLeft.duration(300) })
    await allocate()
    // A 120x40 box turned 90 degrees has a 40x120 axis-aligned bound. Reading
    // that back from GTK is what proves the angle reached the matrix rather
    // than being dropped as "not a number" (upstream spells it `'-90deg'`).
    const turned = boundsOf("row-a")
    expect(turned.getWidth()).toBeCloseTo(ROW_HEIGHT, 0)
    expect(turned.getHeight()).toBeCloseTo(ROW_WIDTH, 0)

    advanceAnimationByTime(320)
    await allocate()
    const square = boundsOf("row-a")
    expect(square.getWidth()).toBeCloseTo(ROW_WIDTH, 1)
    expect(square.getHeight()).toBeCloseTo(ROW_HEIGHT, 1)
    expect(widget("row-a").getOpacity()).toBeCloseTo(1, 2)
  })
})

it("ZoomOut shrinks a widget React has already removed, then drops it", async () => {
  // The exit path, at wall speed: the retention that keeps the widget on
  // screen is released by a real timer, so a virtual clock would have the two
  // disagreeing about how long the animation has been running.
  await mount({ initial: ["a", "b"], exiting: ZoomOut.duration(300) })
  await allocate()
  const rowB = widget("row-b")
  expect(boundsOf("row-b").getWidth()).toBeCloseTo(ROW_WIDTH, 1)

  await act(async () => {
    handles.setItems(["a"])
  })
  await settle(150)

  expect(rowB.getParent()).not.toBeNull()
  const shrunk = boundsOf("row-b").getWidth()
  expect(shrunk).toBeGreaterThan(0)
  expect(shrunk).toBeLessThan(ROW_WIDTH)

  await settle(700)
  expect(rowB.getParent()).toBeNull()
})

it("CurvedTransition walks a reordered row to where the engine put it", async () => {
  await mount({
    initial: ["a", "b", "c"],
    layout: CurvedTransition.duration(200),
  })
  await allocate()
  expect(Math.round(boundsOf("row-c").getY())).toBe(ROW_HEIGHT * 2)

  await act(async () => {
    handles.setItems(["c", "a", "b"])
  })
  await settle(40)
  const early = boundsOf("row-c").getY()
  expect(early).toBeGreaterThan(0)
  expect(early).toBeLessThanOrEqual(ROW_HEIGHT * 2)

  await settle(400)
  expect(Math.round(boundsOf("row-c").getY())).toBe(0)
  expect(Math.round(boundsOf("row-a").getY())).toBe(ROW_HEIGHT)
})

it("JumpingTransition arcs clear of both rows on its way", async () => {
  await mount({
    initial: ["a", "b"],
    layout: JumpingTransition.duration(300),
  })
  await allocate()
  expect(Math.round(boundsOf("row-b").getY())).toBe(ROW_HEIGHT)

  await act(async () => {
    handles.setItems(["b", "a"])
  })
  // Halfway through, the leaping half has taken the row ABOVE its
  // destination — a straight walk would never produce a negative y here.
  await settle(150)
  expect(boundsOf("row-b").getY()).toBeLessThan(0)

  await settle(400)
  expect(Math.round(boundsOf("row-b").getY())).toBe(0)
  expect(Math.round(boundsOf("row-a").getY())).toBe(ROW_HEIGHT)
})

it("LayoutAnimationConfig skips the entering of rows that mount with it", async () => {
  await withReanimatedTimer(async () => {
    await mount({
      initial: ["a"],
      entering: ZoomIn.duration(300),
      skipEntering: true,
    })
    await allocate()
    // Mounted WITH the wrapper: full size on the first frame, no zoom.
    expect(boundsOf("row-a").getWidth()).toBeCloseTo(ROW_WIDTH, 1)

    // …and a row added later is past the wrapper's one commit, so it does
    // animate. That asymmetry is the whole point of the component.
    await act(async () => {
      handles.setItems(["a", "b"])
    })
    await allocate()
    expect(boundsOf("row-b").getWidth()).toBeLessThan(1)

    advanceAnimationByTime(320)
    await allocate()
    expect(boundsOf("row-b").getWidth()).toBeCloseTo(ROW_WIDTH, 1)
  })
})

it("advanceAnimationByTime moves the clock and nothing else does", async () => {
  await withReanimatedTimer(async () => {
    await mount({ initial: ["a"], entering: ZoomIn.duration(300) })
    // Half a second of WALL time with the test clock installed: the main loop
    // runs, GTK allocates, and the animation has not moved a frame. That is
    // the property the helper exists for.
    await settle(500)
    expect(boundsOf("row-a").getWidth()).toBeLessThan(1)

    advanceAnimationByTime(320)
    await allocate()
    expect(boundsOf("row-a").getWidth()).toBeCloseTo(ROW_WIDTH, 1)
  })
})

it("advanceAnimationByTime refuses outside the timer, by name", () => {
  expect(() => advanceAnimationByTime(100)).toThrow(
    /only works inside withReanimatedTimer/,
  )
})
