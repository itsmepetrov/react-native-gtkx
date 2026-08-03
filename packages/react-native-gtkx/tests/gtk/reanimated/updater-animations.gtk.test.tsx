// An animation returned FROM the updater — `useAnimatedStyle(() => ({ height:
// withTiming(…) }))` — which is the shape every page of Reanimated's
// documentation is written in, and which did nothing at all here until
// `spike/core-exports` caught it. Outside the initial run a `with*` builder
// returns a marked descriptor, the style layer's leaf test is `typeof value
// === "number"`, and an object is not a number: the property was neither
// driven, nor written, nor warned about.
//
// The cases below are the paths a descriptor can take once it becomes a
// number, and the ones that matter are about a property this platform REFUSES
// to drive at frame rate, whose warning ends "applied on the next React
// render" — a promise nothing kept when the value only ever moved inside an
// animation. It is kept at the settle, and on the cadence that carries the
// value there: the settle alone was 1.38 s late on `@gorhom/bottom-sheet`'s
// mount, where the target is re-aimed every frame and never settles at all
// (docs/research/animated-size.md §10).
//
// Geometry is read back out of GTK rather than out of the rect store, as
// everywhere else in this directory: reading our own bookkeeping would pass
// even if nothing reached a widget.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { memo, useEffect, useMemo } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { resetAnimatedSizeWarnings } from "../../../src/components/animated"
import { Gtk, type Graphene } from "../../../src/gtkx/bridge/index"
import { Root, View } from "../../../src/index"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "../../../src/reanimated-compat/index"
import { resetUndriveableWarnings } from "../../../src/reanimated-compat/style"

/**
 * Inside `act` because the end of an animation on a refused property produces
 * a React render on purpose — that IS the mechanism under test, so the wait
 * for it has to be a wait React knows about.
 */
const settle = async (ms = 400): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms)
    })
  })
}

const round = (value: number): number => Math.round(value * 100) / 100

const boxOf = (testID: string): { width: number; height: number } => {
  const stage = screen.getByName("stage") as unknown as Gtk.Widget
  const widget = screen.getByName(testID) as unknown as Gtk.Widget
  const [, rect] = widget.computeBounds(stage) as [boolean, Graphene.Rect]
  return { width: round(rect.getWidth()), height: round(rect.getHeight()) }
}

beforeEach(() => {
  resetAnimatedSizeWarnings()
  resetUndriveableWarnings()
  sheetDuration = 120
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- 1. the canonical pattern, on a property that IS driven ---------------

let fadeHandles: { open: SharedValue<number> }

const Fader = () => {
  const open = useSharedValue(1)
  // No shared value holds the opacity: the ANIMATION is the value, which is
  // the whole point of the pattern.
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(open.value, { duration: 120, easing: Easing.linear }),
  }))
  useEffect(() => {
    fadeHandles = { open }
  })
  return (
    <View
      style={{ width: 400, height: 300, backgroundColor: "#241f31" }}
      testID="stage"
    >
      <Animated.View
        style={[{ width: 100, height: 60, backgroundColor: "#3584e4" }, style]}
        testID="box"
      />
    </View>
  )
}

it("runs an animation the updater returned, straight to the widget", async () => {
  await render(
    <Root
      width={400}
      height={300}
    >
      <Fader />
    </Root>,
  )
  const box = screen.getByName("box") as unknown as Gtk.Widget
  // Seeded at the target rather than animated to it: on the first evaluation
  // there is nothing to animate FROM.
  await waitFor(() => {
    expect(box.getOpacity()).toBeCloseTo(1, 2)
  })

  await act(async () => {
    fadeHandles.open.value = 0.25
  })
  await settle()
  // It reached the widget, which is what used to be a spring descriptor
  // sitting in the style object.
  expect(box.getOpacity()).toBeCloseTo(0.25, 2)
})

// --- 2 & 3. a memo boundary, and a size the platform refuses --------------
//
// The shape is `@gorhom/bottom-sheet`'s, reduced to the part that mattered: an
// animated `height` on a container, produced by `useAnimatedStyle` in the
// parent, handed through a `useMemo` to a child wrapped in `memo`, bounding a
// child of its own. The library's version of this is `BottomSheetContent` →
// `BottomSheetDraggableView` → `BottomSheetFlatList`, and the `memo` is why a
// re-render of the component that owns the hook was not enough.

let sheetHandles: { open: SharedValue<number> }
let renderCount = 0

const Mask = memo(({ style }: { style: unknown }) => {
  // Counted in an effect rather than during render: what the test is about is
  // how many times this memo boundary was actually crossed and committed.
  useEffect(() => {
    renderCount += 1
  })
  return (
    <Animated.View
      style={style as never}
      testID="mask"
    >
      {/* Its height comes from the parent's and from nowhere else, so it can
          only be right if YOGA knows the animated height. A rect-store
          override the engine never sees would leave this at zero. */}
      <View
        style={{ flex: 1, backgroundColor: "#613583" }}
        testID="filler"
      />
    </Animated.View>
  )
})
Mask.displayName = "Mask"

// Read during render, so a case that needs an animation long enough to be
// caught mid-flight sets it before mounting — the landing cadence is 100 ms,
// and 120 ms leaves no room to look inside.
let sheetDuration = 120

const Sheet = () => {
  const open = useSharedValue(0)
  const animated = useAnimatedStyle(() => ({
    height: withTiming(open.value, {
      duration: sheetDuration,
      easing: Easing.linear,
    }),
  }))
  // gorhom composes exactly like this, and the memo below sees only what comes
  // out of it.
  const style = useMemo(
    () => [{ backgroundColor: "#3d3846" }, animated],
    [animated],
  )
  useEffect(() => {
    sheetHandles = { open }
  })
  return (
    <View
      style={{ width: 400, height: 300, backgroundColor: "#241f31" }}
      testID="stage"
    >
      <Mask style={style} />
    </View>
  )
}

const mountSheet = async (): Promise<void> => {
  renderCount = 0
  await render(
    <Root
      width={400}
      height={300}
    >
      <Sheet />
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByName("mask")).toBeTruthy()
  })
}

it("lands a refused size in Yoga when the animation settles, through a memo", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  await mountSheet()
  expect(boxOf("mask").height).toBe(0)
  const rendersAtMount = renderCount

  await act(async () => {
    sheetHandles.open.value = 200
  })
  await settle()

  // The container is at the animated height…
  expect(boxOf("mask").height).toBe(200)
  // …and so is a child whose height can ONLY come from a Yoga pass. This is
  // the assertion the epic was blocked on: a driven size that lives as a rect
  // store override is invisible to a child, and a value that never became a
  // number is invisible to everything.
  expect(boxOf("filler").height).toBe(200)

  // The refusal is still loud, and still by name: this `height` is the
  // container's MAIN axis, so it is not driven at frame rate and says so.
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("an animated `height` cannot be driven here"),
  )

  // Renders bounded by the CLOCK, not by the frame rate: a 120 ms animation
  // crosses the 100 ms landing interval at most once, so at most two renders
  // — against the eight frames it publishes at 60 Hz. The whole reason the
  // value does not go through React per frame is that a layout write costs
  // what the CONTAINER costs and not what the animated value costs
  // (docs/research/animated-size.md §3); the reason it no longer waits for the
  // settle alone is that on gorhom's mount the settle was 1.38 s away (§10,
  // and LANDING_INTERVAL_MS).
  //
  // An upper bound rather than a number: a landing that falls on the frame the
  // animation ends on is batched into the settle's render, and this
  // environment's main loop is coarse enough for that to be the usual case.
  // That the value arrives BEFORE the settle is asserted by the case below,
  // where it is a geometry to read rather than a count.
  expect(renderCount - rendersAtMount).toBeLessThanOrEqual(2)
})

it("lands a refused size before its animation settles, not only after", async () => {
  // The §10 case, reduced: a slow animation on a refused property used to be
  // absent from Yoga for its whole duration, because the one render it was
  // promised came at the end. `@gorhom/bottom-sheet` mounting is the same
  // shape at 1.38 s, and the list inside the sheet mounted zero cells for all
  // of it. A third of the way in is a real value now.
  vi.spyOn(console, "warn").mockImplementation(() => {})
  sheetDuration = 900
  await mountSheet()

  await act(async () => {
    sheetHandles.open.value = 240
  })
  await settle(300)
  const midway = boxOf("mask").height
  expect(midway).toBeGreaterThan(0)
  expect(midway).toBeLessThan(240)
  // And the child whose height can ONLY come from a Yoga pass followed it
  // there, which is the whole claim: it is a bounded parent mid-animation and
  // not merely at the end of one.
  expect(boxOf("filler").height).toBe(midway)

  await settle(1000)
  expect(boxOf("mask").height).toBe(240)
})

it("keeps following a target that moves before the previous animation settled", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  await mountSheet()

  await act(async () => {
    sheetHandles.open.value = 200
  })
  // Re-aimed mid-flight, which is what a sheet being dragged does on every
  // frame. The cancelled animation must NOT report a settle, or the refusal
  // would publish through React once a frame.
  await act(async () => {
    sheetHandles.open.value = 120
  })
  await settle()

  expect(boxOf("mask").height).toBe(120)
  expect(boxOf("filler").height).toBe(120)
})
