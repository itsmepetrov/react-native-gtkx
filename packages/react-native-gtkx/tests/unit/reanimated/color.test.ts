// interpolateColor and the colour helpers. The expected values are upstream's
// — gamma-corrected RGB, the HSV hue-wrap fix and the `transparent` handling
// are all visible in the output, so each has an anchor here that a naive
// implementation gets wrong.
import { expect, test } from "vitest"
import {
  convertToRGBA,
  interpolateColor,
  isColor,
  rgbaArrayToRGBAColor,
} from "../../../src/reanimated-compat/color"

test("interpolates in gamma-corrected RGB, as upstream does by default", () => {
  // The whole point of the default gamma: the midpoint of black and white is
  // 186, not 128. A linear blend looks muddy, and an app that matches iOS has
  // to match this number.
  expect(interpolateColor(0.5, [0, 1], ["#000000", "#ffffff"])).toBe(
    "rgba(186, 186, 186, 1)",
  )
  expect(interpolateColor(0, [0, 1], ["#000000", "#ffffff"])).toBe(
    "rgba(0, 0, 0, 1)",
  )
  expect(interpolateColor(1, [0, 1], ["#000000", "#ffffff"])).toBe(
    "rgba(255, 255, 255, 1)",
  )
  expect(interpolateColor(0.5, [0, 1], ["red", "blue"])).toBe(
    "rgba(186, 0, 186, 1)",
  )
})

test("gamma is configurable, and gamma 1 is the plain linear blend", () => {
  expect(
    interpolateColor(0.5, [0, 1], ["#000000", "#ffffff"], "RGB", { gamma: 1 }),
  ).toBe("rgba(127.5, 127.5, 127.5, 1)")
})

test("clamps outside the input range — colour has no extrapolation", () => {
  expect(interpolateColor(-5, [0, 1], ["#000000", "#ffffff"])).toBe(
    "rgba(0, 0, 0, 1)",
  )
  expect(interpolateColor(9, [0, 1], ["#000000", "#ffffff"])).toBe(
    "rgba(255, 255, 255, 1)",
  )
})

test("interpolates alpha, and accepts every colour syntax the platform takes", () => {
  expect(
    interpolateColor(0.5, [0, 1], ["rgba(255, 0, 0, 1)", "rgba(255, 0, 0, 0)"]),
  ).toBe("rgba(255, 0, 0, 0.5)")
  expect(interpolateColor(0, [0, 1], ["hsl(0, 100%, 50%)", "#00f"])).toBe(
    "rgba(255, 0, 0, 1)",
  )
})

test("HSV goes round the colour wheel the short way", () => {
  // Red to green through yellow, not through the grey middle an RGB blend
  // would take.
  expect(interpolateColor(0.5, [0, 1], ["#ff0000", "#00ff00"], "HSV")).toBe(
    "rgba(255, 255, 0, 1)",
  )
  // Red to blue: the hue gap is 2/3 of the wheel, so the corrected path wraps
  // backwards through magenta. Without the correction this is green.
  expect(interpolateColor(0.5, [0, 1], ["#ff0000", "#0000ff"], "HSV")).toBe(
    "rgba(255, 0, 255, 1)",
  )
  expect(
    interpolateColor(0.5, [0, 1], ["#ff0000", "#0000ff"], "HSV", {
      useCorrectedHSVInterpolation: false,
    }),
  ).toBe("rgba(0, 255, 0, 1)")
})

test("`transparent` fades opacity rather than fading to black", () => {
  // The naive reading of `transparent` is rgba(0,0,0,0), which darkens on the
  // way out. Upstream borrows the neighbour's RGB; so does this.
  expect(interpolateColor(0.5, [0, 1], ["red", "transparent"])).toBe(
    "rgba(255, 0, 0, 0.5)",
  )
  expect(interpolateColor(0.5, [0, 1], ["transparent", "red"])).toBe(
    "rgba(255, 0, 0, 0.5)",
  )
  // Through transparent: red's own hue on the way out, blue's on the way in.
  const through = ["red", "transparent", "blue"]
  expect(interpolateColor(0.25, [0, 0.5, 1], through)).toBe(
    "rgba(255, 0, 0, 0.5)",
  )
  expect(interpolateColor(0.75, [0, 0.5, 1], through)).toBe(
    "rgba(0, 0, 255, 0.5)",
  )
})

test("an all-transparent range stays transparent", () => {
  expect(interpolateColor(0.5, [0, 1], ["transparent", "transparent"])).toBe(
    "rgba(0, 0, 0, 0)",
  )
})

test("convertToRGBA returns upstream's 0-1 channels, alpha quantised to 8 bits", () => {
  expect(convertToRGBA("#ff0000")).toEqual([1, 0, 0, 1])
  expect(convertToRGBA("transparent")).toEqual([0, 0, 0, 0])
  // 0.5 alpha is stored as 128/255 upstream, not as 0.5.
  expect(convertToRGBA("rgba(255, 0, 0, 0.5)")).toEqual([1, 0, 0, 128 / 255])
})

test("rgbaArrayToRGBAColor is convertToRGBA's inverse", () => {
  expect(rgbaArrayToRGBAColor([1, 0, 0, 1])).toBe("rgba(255, 0, 0, 1)")
  expect(rgbaArrayToRGBAColor([0, 0, 0, 0.0005])).toBe("rgba(0, 0, 0, 0)")
})

test("isColor answers for strings only, as upstream does", () => {
  expect(isColor("red")).toBe(true)
  expect(isColor("#abc")).toBe(true)
  expect(isColor("rgb(1 2 3)")).toBe(true)
  expect(isColor("not-a-colour")).toBe(false)
  expect(isColor(0xffff0000)).toBe(false)
  expect(isColor(undefined)).toBe(false)
  // A theme colour has no numeric value, so it is not one this can convert.
  expect(isColor("var(--accent-bg-color)")).toBe(false)
})

test("refuses a theme colour by explaining why it cannot be blended", () => {
  expect(() =>
    interpolateColor(0.5, [0, 1], ["var(--accent-bg-color)", "red"]),
  ).toThrow(/PlatformColor values are resolved by GTK/)
})

test("refuses RN's packed colour integers rather than producing nonsense", () => {
  expect(() =>
    interpolateColor(0.5, [0, 1], [0xffff0000 as unknown as string, "red"]),
  ).toThrow(/colour STRINGS/)
})

test("refuses a colour nothing here can parse, listing what is accepted", () => {
  expect(() => interpolateColor(0.5, [0, 1], ["chartreuseish", "red"])).toThrow(
    /not a colour this platform understands/,
  )
})

test("refuses LAB by name instead of quietly treating it as RGB", () => {
  expect(() =>
    interpolateColor(0.5, [0, 1], ["red", "blue"], "LAB" as unknown as "RGB"),
  ).toThrow(/unsupported colour space "LAB"/)
})

test("refuses mismatched ranges", () => {
  expect(() => interpolateColor(0.5, [0, 1], ["red"])).toThrow(/same length/)
  expect(() => interpolateColor(0.5, [0], ["red"])).toThrow(/at least two/)
})
