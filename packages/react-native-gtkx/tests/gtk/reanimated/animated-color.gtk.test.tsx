// The claim this slice rests on: a shared value drives a REAL colour on a
// mounted widget, at frame rate, with React rendering once — and without the
// shared stylesheet growing by a single class.
//
// Both halves are asserted against GTK rather than against our own
// bookkeeping. `color` is read back with `gtk_widget_get_color()`, which is
// the value GTK itself computed from the cascade; `backgroundColor` is read
// out of the PIXELS of a rendered snapshot, because nothing short of that
// proves a background actually painted. Reading back the CSS text we wrote
// would pass even if the provider never reached the widget, which is the
// failure this file exists to rule out.
import { act, render, screen, screenshot, waitFor } from "@gtkx/testing"
import { createCanvas, loadImage } from "@napi-rs/canvas"
import { useEffect } from "react"
import { beforeEach, expect, it } from "vitest"
import { Gtk } from "../../../src/gtkx/bridge/index"
import { Root, View } from "../../../src/index"
import Animated, {
  Easing,
  interpolateColor,
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

const widgetOf = (testID: string): Gtk.Widget =>
  screen.getByName(testID) as unknown as Gtk.Widget

const to255 = (value: number): number => Math.round(value * 255)

/** The colour GTK itself resolved for the widget, out of the real cascade. */
const colorOf = (testID: string): [number, number, number] => {
  const rgba = widgetOf(testID).getColor()
  return [to255(rgba.red), to255(rgba.green), to255(rgba.blue)]
}

/** The centre pixel of the widget's own rendering. */
const centrePixelOf = async (
  testID: string,
): Promise<[number, number, number]> => {
  const shot = await screenshot(widgetOf(testID))
  const image = await loadImage(Buffer.from(shot.data, "base64"))
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext("2d")
  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(
    Math.floor(image.width / 2),
    Math.floor(image.height / 2),
    1,
    1,
  )
  return [data[0]!, data[1]!, data[2]!]
}

const near = (
  actual: [number, number, number],
  expected: [number, number, number],
  tolerance = 3,
): void => {
  for (let channel = 0; channel < 3; channel += 1) {
    expect(Math.abs(actual[channel]! - expected[channel]!)).toBeLessThanOrEqual(
      tolerance,
    )
  }
}

let progressHandle: SharedValue<number>
// Counted in a commit effect with no dependency array: one run per render.
let renderCount = 0

const Probe = () => {
  const progress = useSharedValue(0)

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ["rgb(255, 0, 0)", "rgb(0, 0, 255)"],
      "RGB",
      { gamma: 1 },
    ),
    color: interpolateColor(
      progress.value,
      [0, 1],
      ["rgb(0, 255, 0)", "rgb(0, 0, 0)"],
      "RGB",
      { gamma: 1 },
    ),
  }))

  useEffect(() => {
    renderCount += 1
    progressHandle = progress
  })

  return (
    <View
      style={{ width: 200, height: 120 }}
      testID="stage"
    >
      <Animated.View
        style={[{ width: 100, height: 60 }, style]}
        testID="box"
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
      width={200}
      height={120}
    >
      <Probe />
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByName("box")).toBeTruthy()
  })
}

it("drives a real GTK colour from a shared value, with one React render", async () => {
  await mountProbe()

  // The mapper's first run is already applied: the widget starts at the
  // range's left end rather than at whatever it inherited.
  near(colorOf("box"), [0, 255, 0])
  expect(renderCount).toBe(1)

  await act(async () => {
    progressHandle.value = withTiming(1, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 150)

  near(colorOf("box"), [0, 0, 0])
  // …and the animation went through React exactly zero times.
  expect(renderCount).toBe(1)
})

it("paints the animated background — read out of the pixels", async () => {
  await mountProbe()
  near(await centrePixelOf("box"), [255, 0, 0])

  await act(async () => {
    progressHandle.value = 0.5
  })
  await settle()
  near(await centrePixelOf("box"), [128, 0, 128], 4)

  await act(async () => {
    progressHandle.value = 1
  })
  await settle()
  near(await centrePixelOf("box"), [0, 0, 255])
})

it("mints no CSS class per frame: the widget's class list never moves", async () => {
  // The regression this whole design exists to prevent. The shared registry
  // memoises by CSS TEXT, so a colour driven through it mints one class per
  // frame into a document that is re-parsed whole and never pruned. If any of
  // that were happening, the widget's own class list would change as the
  // animation ran — it is the only way a new class could reach a widget.
  await mountProbe()
  const before = [...widgetOf("box").getCssClasses()]

  await act(async () => {
    progressHandle.value = withTiming(1, {
      duration: DURATION,
      easing: Easing.linear,
    })
  })
  await settle(DURATION + 150)

  expect([...widgetOf("box").getCssClasses()]).toEqual(before)
  // And the animation genuinely ran through the whole range.
  near(colorOf("box"), [0, 0, 0])
})

it("is not View-specific: Animated.Text drives its own colour", async () => {
  // The write path is a hook over "a widget and its parent", so every
  // component that can produce those two animates colours on the same terms —
  // and `color` on a label is the case that is worth having at all.
  let tintHandle: SharedValue<string>

  const Tinted = () => {
    const tint = useSharedValue("rgb(0, 200, 0)")
    const style = useAnimatedStyle(() => ({ color: tint.value }))
    useEffect(() => {
      tintHandle = tint
    })
    return (
      <View
        style={{ width: 200, height: 120 }}
        testID="stage"
      >
        <Animated.Text
          style={style}
          testID="label"
        >
          tinted
        </Animated.Text>
      </View>
    )
  }

  await render(
    <Root
      width={200}
      height={120}
    >
      <Tinted />
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByName("label")).toBeTruthy()
  })

  near(colorOf("label"), [0, 200, 0])

  await act(async () => {
    tintHandle!.value = "rgb(255, 0, 0)"
  })
  await settle()
  near(colorOf("label"), [255, 0, 0])
})

it("wins over the static class, and hands the property back when the leaf goes away", async () => {
  // Two things at once, because they are the same mechanism seen from both
  // ends. While the leaf exists the private provider has to beat the class
  // the style registry computed for the SAME property on the SAME widget —
  // otherwise the first frame silently does nothing. When the leaf goes away
  // the provider has to be detached, or the widget keeps the last driven
  // frame forever.
  let driveHandle: SharedValue<boolean>

  const Toggling = () => {
    const driven = useSharedValue(true)
    const tint = useSharedValue("rgb(0, 0, 255)")
    const style = useAnimatedStyle(() =>
      driven.value ? { color: tint.value } : { opacity: 1 },
    )
    useEffect(() => {
      driveHandle = driven
    })
    return (
      <View
        style={{ width: 200, height: 120 }}
        testID="stage"
      >
        <Animated.View
          style={[
            { width: 60, height: 30, color: "rgb(255, 0, 0)" },
            style as object,
          ]}
          testID="tinted"
        />
      </View>
    )
  }

  await render(
    <Root
      width={200}
      height={120}
    >
      <Toggling />
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByName("tinted")).toBeTruthy()
  })

  near(colorOf("tinted"), [0, 0, 255])

  await act(async () => {
    driveHandle!.value = false
  })
  await settle()

  // Back to the static style's own colour, through the ordinary class path.
  near(colorOf("tinted"), [255, 0, 0])
})
