// Real GTK geometry driven by an OBJECT-valued `withTiming` — the shape
// react-native-sortables' whole reflow model is built on:
//
//   position.value = withTiming(layoutPos)   // layoutPos: { x, y }
//
// Every other test for this widening (tests/unit/reanimated/animatable-value.test.ts,
// shared-value.test.ts, updater-animations.test.ts) exercises the machinery
// in isolation, off a manual frame scheduler. This one is the same proof
// every other file in this directory insists on: reading GTK's own computed
// bounds rather than the shared value's bookkeeping, because the value
// leaving `zipAnimatableLeaves` correctly and the value actually reaching a
// widget are two different claims — see animated-style.gtk.test.tsx's header.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { expect, it } from "vitest"
import { Graphene, Gtk } from "../../../src/gtkx/bridge/index"
import { Root, View } from "../../../src/index"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "../../../src/reanimated-compat/index"

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

const originOf = (testID: string): { x: number; y: number } => {
  const rect = boundsOf(testID)
  return { x: round(rect.getX()), y: round(rect.getY()) }
}

type Handles = { position: SharedValue<{ x: number; y: number }> }
let handles: Handles

const Item = () => {
  // The library's own shape: ONE shared value holding a Vector, retargeted
  // with a single withTiming call whenever the layout changes — not two
  // independent number-valued springs on translateX/translateY.
  const position = useSharedValue({ x: 0, y: 0 })
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: position.value.x },
      { translateY: position.value.y },
    ],
  }))
  useEffect(() => {
    handles = { position }
  })
  return (
    <View
      style={{ width: 300, height: 300 }}
      testID="stage"
    >
      <Animated.View
        style={[
          { position: "absolute", left: 20, top: 20, width: 40, height: 40 },
          style,
        ]}
        testID="item"
      >
        {/* A child, so a paint-only transform on the parent that failed to
            apply would still leave the parent's OWN bounds at rest and this
            test would not be able to tell — computeBounds walks the widget
            chain, so the child's bounds only move if the transform actually
            composed. */}
        <View
          style={{ width: 10, height: 10, backgroundColor: "#3584e4" }}
          testID="dot"
        />
      </Animated.View>
    </View>
  )
}

it("moves a real widget along both axes from ONE object-valued withTiming, mid-animation and at rest", async () => {
  await render(
    <Root
      width={300}
      height={300}
    >
      <Item />
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByName("item")).toBeTruthy()
  })
  const origin = originOf("dot")

  await act(async () => {
    handles.position.value = withTiming(
      { x: 100, y: 60 },
      { duration: 300, easing: Easing.linear },
    )
  })
  await settle(150)
  const midway = originOf("dot")
  // Both axes moved, and moved TOGETHER — a Vector driven by one call, not
  // two springs that happen to agree.
  expect(midway.x).toBeGreaterThan(origin.x)
  expect(midway.x).toBeLessThan(origin.x + 100)
  expect(midway.y).toBeGreaterThan(origin.y)
  expect(midway.y).toBeLessThan(origin.y + 60)
  // Same progress fraction on both leaves (a linear timing, one clock): the
  // fraction of each axis covered agrees to within a couple of frames' worth
  // of drift from the two waits above being real wall-clock time.
  const fractionX = (midway.x - origin.x) / 100
  const fractionY = (midway.y - origin.y) / 60
  expect(Math.abs(fractionX - fractionY)).toBeLessThan(0.15)

  await settle(400)
  const settled = originOf("dot")
  expect(settled.x).toBe(origin.x + 100)
  expect(settled.y).toBe(origin.y + 60)
})

it("keeps composing with withSequence over an object target, landing on the last step", async () => {
  await render(
    <Root
      width={300}
      height={300}
    >
      <Item />
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByName("item")).toBeTruthy()
  })
  const origin = originOf("dot")

  await act(async () => {
    handles.position.value = withSequence(
      withTiming({ x: 50, y: 0 }, { duration: 60, easing: Easing.linear }),
      withTiming({ x: 50, y: 40 }, { duration: 60, easing: Easing.linear }),
    )
  })
  await settle(400)
  // Both steps ran, on the real widget: the sequence's SECOND step is the
  // one that reaches rest.
  expect(originOf("dot")).toEqual({ x: origin.x + 50, y: origin.y + 40 })
})
