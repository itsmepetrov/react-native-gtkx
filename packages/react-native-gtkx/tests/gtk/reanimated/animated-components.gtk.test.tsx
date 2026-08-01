// `Animated.Text`/`Image`/`ScrollView` and `createAnimatedComponent`, on the
// same terms slice 1 set for `Animated.View`: real GTK geometry, taken from
// what GTK itself computed (`computeBounds()` against the stage, the widget's
// own `getOpacity()`), and the render count still 1.
//
// The load-bearing assertion in this file is the NEGATIVE one — that wrapping
// a component adds no widget. It would have been three lines to render the
// wrapped component inside an `Animated.View` and call it a shim, and it
// would have been wrong: an extra box changes flex layout, changes what
// `measureLayout` is relative to, and changes which widget a parent's
// allocate walks. So the tree is asserted directly: the animated label's GTK
// parent IS the stage, and the stage has exactly the children the source
// wrote.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect, type ReactNode } from "react"
import { expect, it, vi } from "vitest"
import { resetAnimatedComponentWarnings } from "../../../src/components/animated"
import { Circle, Svg } from "../../../src/components/svg/index"
import {
  getSvgNodeDescriptor,
  Graphene,
  Gtk,
} from "../../../src/gtkx/bridge/index"
import { Root, Text, View } from "../../../src/index"
import Animated, {
  createAnimatedComponent,
  Easing,
  measure,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "../../../src/reanimated-compat/index"

const DURATION = 300

const settle = (ms = 60): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const round = (value: number): number => Math.round(value * 100) / 100

const widgetOf = (testID: string): Gtk.Widget =>
  screen.getByName(testID) as unknown as Gtk.Widget

const boundsOf = (testID: string): Graphene.Rect => {
  const stage = widgetOf("stage")
  const [, rect] = widgetOf(testID).computeBounds(stage) as [
    boolean,
    Graphene.Rect,
  ]
  return rect
}

const xOf = (testID: string): number => round(boundsOf(testID).getX())

const childCount = (widget: Gtk.Widget): number => {
  let count = 0
  let child = widget.getFirstChild()
  while (child !== null) {
    count += 1
    child = child.getNextSibling()
  }
  return count
}

it("Animated.Text moves real GTK geometry, and costs no render", async () => {
  let offset: SharedValue<number>
  let renders = 0

  const Probe = () => {
    const dx = useSharedValue(0)
    useEffect(() => {
      renders += 1
      offset = dx
    })
    const style = useAnimatedStyle(() => ({
      transform: [{ translateX: dx.value }],
    }))
    return (
      <View
        style={{ width: 300, height: 120 }}
        testID="stage"
      >
        <Animated.Text
          style={style}
          testID="animated"
        >
          moved
        </Animated.Text>
        <Text testID="plain">still</Text>
      </View>
    )
  }

  await render(
    <Root
      width={300}
      height={120}
    >
      <Probe />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("animated").getWidth()).toBeGreaterThan(0)
  })

  const startX = xOf("animated")
  const plainX = xOf("plain")
  expect(renders).toBe(1)

  await act(async () => {
    offset!.value = withTiming(90, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 150)

  // The GtkLabel itself moved, in the stage's coordinate space.
  expect(xOf("animated") - startX).toBeCloseTo(90, 0)
  // …through zero React renders, which is the whole claim.
  expect(renders).toBe(1)
  // Negative control: a transform is paint-only, so the sibling did not move.
  expect(xOf("plain")).toBe(plainX)
})

it("createAnimatedComponent adds no widget to the tree", async () => {
  await render(
    <Root
      width={300}
      height={120}
    >
      <View
        style={{ width: 300, height: 120 }}
        testID="stage"
      >
        <Animated.Text testID="animated">wrapped</Animated.Text>
        <Text testID="plain">plain</Text>
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("animated").getWidth()).toBeGreaterThan(0)
  })

  const stage = widgetOf("stage")
  // A wrapper box would sit between them; the label's parent IS the stage.
  expect(widgetOf("animated").getParent()).toBe(stage)
  expect(widgetOf("plain").getParent()).toBe(stage)
  // Two children in the source, two widgets in GTK.
  expect(childCount(stage)).toBe(2)
  // And the widget carrying the testID IS the label itself — a wrapping shim
  // would have put the name on a box with the label inside it.
  expect(screen.getByText("wrapped") as unknown as Gtk.Widget).toBe(
    widgetOf("animated"),
  )
  expect(childCount(widgetOf("animated"))).toBe(0)
})

it("Animated.Image writes opacity straight to the GtkPicture", async () => {
  let fade: SharedValue<number>

  const Probe = () => {
    const value = useSharedValue(1)
    useEffect(() => {
      fade = value
    })
    const style = useAnimatedStyle(() => ({ opacity: value.value }))
    return (
      <View
        style={{ width: 200, height: 120 }}
        testID="stage"
      >
        <Animated.Image
          source="/nonexistent/icon.png"
          style={[{ width: 40, height: 40 }, style]}
          testID="picture"
        />
      </View>
    )
  }

  await render(
    <Root
      width={200}
      height={120}
    >
      <Probe />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("picture").getWidth()).toBeGreaterThan(0)
  })

  const picture = widgetOf("picture")
  expect(picture.getOpacity()).toBeCloseTo(1, 2)

  await act(async () => {
    fade!.value = withTiming(0.4, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 150)

  expect(picture.getOpacity()).toBeCloseTo(0.4, 2)
})

it("Animated.ScrollView translates the scrolled window itself", async () => {
  let shift: SharedValue<number>

  const Probe = () => {
    const dx = useSharedValue(0)
    useEffect(() => {
      shift = dx
    })
    const style = useAnimatedStyle(() => ({
      transform: [{ translateX: dx.value }],
    }))
    return (
      <View
        style={{ width: 300, height: 200 }}
        testID="stage"
      >
        <Animated.ScrollView
          style={[{ width: 120, height: 200 }, style]}
          testID="scroller"
        >
          <View style={{ height: 400 }}>
            <Text>content</Text>
          </View>
        </Animated.ScrollView>
      </View>
    )
  }

  await render(
    <Root
      width={300}
      height={200}
    >
      <Probe />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("scroller").getWidth()).toBeGreaterThan(0)
  })

  const startX = xOf("scroller")
  await act(async () => {
    shift!.value = 60
  })
  await settle()

  expect(xOf("scroller") - startX).toBeCloseTo(60, 0)
  // Still a GtkScrolledWindow, not something wrapped in a box.
  expect(widgetOf("scroller").getParent()).toBe(widgetOf("stage"))
})

it("forwards a ref through the wrapper, so measure() works on Animated.Text", async () => {
  let measured: (() => ReturnType<typeof measure>) | null = null

  const Probe = () => {
    const labelRef = useAnimatedRef()
    useEffect(() => {
      measured = () => measure(labelRef)
    })
    return (
      <View
        style={{ paddingLeft: 24, paddingTop: 12 }}
        testID="stage"
      >
        <Animated.Text
          ref={labelRef}
          style={{ width: 70, height: 20 }}
          testID="animated"
        >
          measurable
        </Animated.Text>
      </View>
    )
  }

  await render(
    <Root
      width={300}
      height={200}
    >
      <Probe />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf("animated").getWidth()).toBeGreaterThan(0)
  })

  const box = measured!()
  expect(box).not.toBeNull()
  expect(box?.width).toBe(70)
  expect(box?.height).toBe(20)
  expect(box?.x).toBe(24)
  expect(box?.y).toBe(12)
})

it("says so by name when the wrapped component exposes no widget", async () => {
  // The failure this repo refuses is the silent one. A component that
  // forwards no ref has no widget to write opacity or a transform to, and
  // saying nothing would be "compiled, ran, did nothing".
  resetAnimatedComponentWarnings()
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

  const Bare = ({ children }: { children?: ReactNode }) => (
    <Text>{children}</Text>
  )
  const AnimatedBare = createAnimatedComponent(Bare)

  const Probe = () => {
    const dx = useSharedValue(0)
    const style = useAnimatedStyle(() => ({
      transform: [{ translateX: dx.value }],
    }))
    return (
      <View
        style={{ width: 200, height: 100 }}
        testID="stage"
      >
        <AnimatedBare style={style}>unreachable</AnimatedBare>
      </View>
    )
  }

  await render(
    <Root
      width={200}
      height={100}
    >
      <Probe />
    </Root>,
  )
  await waitFor(() => {
    expect(warn).toHaveBeenCalled()
  })

  expect(warn).toHaveBeenCalledTimes(1)
  expect(String(warn.mock.calls[0]?.[0])).toContain("Bare")
  warn.mockRestore()
})

it("useAnimatedProps drives an SVG shape through its own redraw channel", async () => {
  // The claim the props path rests on: the SVG shapes already accept an
  // animated node on every numeric prop and subscribe to it themselves, so
  // `useAnimatedProps` hands them a node and gets frame-rate geometry through
  // queueDraw — no React render, and no second write path.
  const AnimatedCircle = createAnimatedComponent(Circle)
  let radius: SharedValue<number>
  let renders = 0

  const Probe = () => {
    const r = useSharedValue(10)
    useEffect(() => {
      renders += 1
      radius = r
    })
    const animatedProps = useAnimatedProps(() => ({ r: r.value }))
    return (
      <Svg
        testID="svg"
        width={100}
        height={100}
      >
        <AnimatedCircle
          cx={50}
          cy={50}
          fill="green"
          animatedProps={animatedProps}
        />
      </Svg>
    )
  }

  await render(
    <Root
      width={100}
      height={100}
    >
      <Probe />
    </Root>,
  )

  const svgWidget = screen.getByName("svg") as unknown as Gtk.Widget
  // No wrapper widget here either: the circle is the SVG root's only child.
  expect(childCount(svgWidget)).toBe(1)
  const circleWidget = svgWidget.getFirstChild()!

  const before = getSvgNodeDescriptor(circleWidget)
  const widthOf = (descriptor: typeof before): number | undefined =>
    descriptor?.kind === "shape"
      ? descriptor.path?.getBounds()[1].size.width
      : undefined
  expect(widthOf(before)).toBeCloseTo(20, 5)

  const rendersBefore = renders
  // Synchronous, outside act(): the channel is the shape's own subscription,
  // not a React re-render.
  radius!.value = 35

  expect(widthOf(getSvgNodeDescriptor(circleWidget))).toBeCloseTo(70, 5)
  expect(renders).toBe(rendersBefore)
})
