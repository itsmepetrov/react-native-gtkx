// rotate/scale reach the widget through gtk_widget_allocate()'s GskTransform
// (docs/research/transforms.md). Everything here is asserted on
// computeBounds() and gtk_widget_pick() — the geometry GTK itself paints and
// routes input with, not on our own bookkeeping.
import { render, screen, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import type { TransformPart } from "../../../src/contracts"
import { Graphene, Gtk } from "../../../src/gtkx/bridge/index"
import { Animated, Root, Text, View } from "../../../src/index"

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 50)
  })

type Box = { x: number; y: number; width: number; height: number }

const round = (value: number): number => Math.round(value * 100) / 100

const boundsOf = (testID: string): Box => {
  const stage = screen.getByName("stage") as unknown as Gtk.Widget
  const widget = screen.getByName(testID) as unknown as Gtk.Widget
  const [, rect] = widget.computeBounds(stage) as [boolean, Graphene.Rect]
  return {
    x: round(rect.getX()),
    y: round(rect.getY()),
    width: round(rect.getWidth()),
    height: round(rect.getHeight()),
  }
}

const pickName = (x: number, y: number): string | null => {
  const stage = screen.getByName("stage") as unknown as Gtk.Widget
  return stage.pick(x, y, Gtk.PickFlags.DEFAULT)?.getName() ?? null
}

// An 80x40 box at (50,50) — centre (90,70) — plus a sibling that must never
// move, because RN transforms are visual only.
const stage = (transform?: TransformPart[]) => (
  <Root
    width={300}
    height={300}
  >
    <View
      style={{ width: 300, height: 300 }}
      testID="stage"
    >
      <View
        style={{
          position: "absolute",
          left: 50,
          top: 50,
          width: 80,
          height: 40,
          backgroundColor: "#26a269",
          ...(transform ? { transform } : null),
        }}
        testID="box"
      />
      <View
        style={{
          position: "absolute",
          left: 200,
          top: 200,
          width: 60,
          height: 60,
        }}
        testID="neighbor"
      >
        <Text>neighbor-marker</Text>
      </View>
    </View>
  </Root>
)

const waitForStage = async (): Promise<void> => {
  await waitFor(() => {
    expect(boundsOf("neighbor").width).toBeGreaterThan(0)
  })
}

it("without a transform the box sits exactly where Yoga put it", async () => {
  await render(stage())
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 50, y: 50, width: 80, height: 40 })
})

it("rotate turns the widget about its centre", async () => {
  await render(stage([{ rotate: "90deg" }]))
  await waitForStage()
  // 80x40 turned a quarter about (90,70) covers x 70..110, y 30..110.
  expect(boundsOf("box")).toEqual({ x: 70, y: 30, width: 40, height: 80 })
})

it("rotateZ is an alias of rotate", async () => {
  await render(stage([{ rotateZ: "90deg" }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 70, y: 30, width: 40, height: 80 })
})

it("rad angles work as well as deg", async () => {
  await render(stage([{ rotate: "1.5707963267948966rad" }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 70, y: 30, width: 40, height: 80 })
})

it("scale grows the widget about its centre", async () => {
  await render(stage([{ scale: 2 }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 10, y: 30, width: 160, height: 80 })
})

it("scaleX and scaleY act on one axis each", async () => {
  await render(stage([{ scaleX: 2 }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 10, y: 50, width: 160, height: 40 })
})

it("composes the array in RN order: rotate then translate", async () => {
  // The translation is carried by the rotation, so the box moves DOWN by 60,
  // not right.
  await render(stage([{ rotate: "90deg" }, { translateX: 60 }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 70, y: 90, width: 40, height: 80 })
})

it("composes the array in RN order: translate then rotate", async () => {
  // The reverse order translates in the untransformed frame: right by 60.
  await render(stage([{ translateX: 60 }, { rotate: "90deg" }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 130, y: 30, width: 40, height: 80 })
})

it("a transform never disturbs layout", async () => {
  await render(stage([{ rotate: "37deg" }, { scale: 3 }]))
  await waitForStage()
  // The widget keeps the box Yoga gave it...
  const box = screen.getByName("box") as unknown as Gtk.Widget
  expect(box.getAllocatedWidth()).toBe(80)
  expect(box.getAllocatedHeight()).toBe(40)
  // ...and the neighbour has not moved a pixel.
  expect(boundsOf("neighbor")).toEqual({
    x: 200,
    y: 200,
    width: 60,
    height: 60,
  })
})

it("untransformed picking is the baseline for the two cases below", async () => {
  await render(stage())
  await waitForStage()
  expect(pickName(60, 60)).toBe("box")
  expect(pickName(120, 85)).toBe("box")
  expect(pickName(75, 100)).toBe("stage")
  expect(pickName(160, 100)).toBe("stage")
})

it("input follows the rotated shape (GTK inverts the transform when picking)", async () => {
  await render(stage([{ rotate: "90deg" }]))
  await waitForStage()
  // Every pick above flips: what was inside the flat box is now outside the
  // turned one, and vice versa.
  expect(pickName(60, 60)).toBe("stage")
  expect(pickName(120, 85)).toBe("stage")
  expect(pickName(75, 100)).toBe("box")
  expect(pickName(95, 65)).toBe("box")
})

it("input follows a scaled widget", async () => {
  await render(stage([{ scale: 2 }]))
  await waitForStage()
  expect(pickName(160, 100)).toBe("box")
})

const animatedStage = (transform: unknown[]) => (
  <Root
    width={300}
    height={300}
  >
    <View
      style={{ width: 300, height: 300 }}
      testID="stage"
    >
      <Animated.View
        style={{
          position: "absolute",
          left: 50,
          top: 50,
          width: 80,
          height: 40,
          backgroundColor: "#26a269",
          transform: transform as never,
        }}
        testID="box"
      />
      <View
        style={{
          position: "absolute",
          left: 200,
          top: 200,
          width: 60,
          height: 60,
        }}
        testID="neighbor"
      />
    </View>
  </Root>
)

it("Animated.View rotates from an interpolated deg value", async () => {
  const value = new Animated.Value(0)
  const rotate = value.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  })

  await render(animatedStage([{ rotate }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 50, y: 50, width: 80, height: 40 })

  value.setValue(1)
  await settle()
  expect(boundsOf("box")).toEqual({ x: 70, y: 30, width: 40, height: 80 })

  value.setValue(0)
  await settle()
  expect(boundsOf("box")).toEqual({ x: 50, y: 50, width: 80, height: 40 })
})

it("Animated.View scales, and the container does not move", async () => {
  const value = new Animated.Value(1)

  await render(animatedStage([{ scale: value }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 50, y: 50, width: 80, height: 40 })

  value.setValue(2)
  await settle()
  expect(boundsOf("box")).toEqual({ x: 10, y: 30, width: 160, height: 80 })
  // The absurd case must not inflate anything either.
  value.setValue(50)
  await settle()
  const box = screen.getByName("box") as unknown as Gtk.Widget
  expect(box.getAllocatedWidth()).toBe(80)
  expect(boundsOf("neighbor")).toEqual({
    x: 200,
    y: 200,
    width: 60,
    height: 60,
  })
})

it("Animated.View mixes a driven rotate with a static translate, in order", async () => {
  const value = new Animated.Value(0)
  const rotate = value.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  })

  await render(animatedStage([{ rotate }, { translateX: 60 }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 110, y: 50, width: 80, height: 40 })

  value.setValue(1)
  await settle()
  expect(boundsOf("box")).toEqual({ x: 70, y: 90, width: 40, height: 80 })
})

it("Animated.View still translates positionally when nothing rotates", async () => {
  const value = new Animated.Value(0)

  await render(animatedStage([{ translateX: value }]))
  await waitForStage()
  expect(boundsOf("box")).toEqual({ x: 50, y: 50, width: 80, height: 40 })

  value.setValue(40)
  await settle()
  expect(boundsOf("box")).toEqual({ x: 90, y: 50, width: 80, height: 40 })
})
