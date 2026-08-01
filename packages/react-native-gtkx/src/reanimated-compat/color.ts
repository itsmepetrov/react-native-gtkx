// `interpolateColor` and the colour helpers, ported from upstream's
// `src/interpolateColor.ts` and `src/Colors.ts` — the gamma correction, the
// HSV hue-wrap fix and the `transparent` handling included, because each of
// them is visible in the output and an app that looks right on iOS has to
// look right here.
//
// THE PARSER IS THE PLATFORM'S, NOT RN's. Upstream vendors a copy of React
// Native's `normalizeColor` and packs every colour into an AARRGGBB integer,
// because that integer is what crosses to native. Nothing crosses here:
// a colour's destination is a GTK stylesheet, which takes a string, and
// `src/style/colors.ts` already parses every syntax RN accepts on its way
// there. Reusing it means one parser, one set of accepted syntaxes, and no
// possibility of `interpolateColor` accepting a colour the stylesheet would
// then reject — or the reverse. The packed integer is not reproduced at all;
// it has no consumer on this platform, which is also why `processColor`
// stays refused rather than returning a number nothing here can use.
//
// The one thing the platform's parser accepts and this file cannot is a
// theme colour — `PlatformColor("accent-bg-color")`, i.e. `var(--…)` or
// `@named`. Those have no value until GTK resolves them against the live
// theme, so they can be handed to a stylesheet but not blended with a second
// colour. That fails loudly here rather than producing `rgba(NaN, …)`.

import { parseColorToRgba, type Rgba } from "../style/colors"
import { Extrapolation, interpolate } from "./interpolation"

/** Upstream's shape: red, green, blue and alpha, each normalised to 0-1. */
export type ParsedColorArray = [number, number, number, number]

/** Upstream's `InterpolationOptions`, with upstream's defaults. */
export type ColorInterpolationOptions = {
  /** Gamma used for the RGB colour space. Defaults to `2.2`. */
  gamma?: number
  /** Wrap hues the short way round. Defaults to `true`. */
  useCorrectedHSVInterpolation?: boolean
}

export type ColorSpace = "RGB" | "HSV"

const THEME_COLOR = /^(var\(|@)/i

const parse = (color: unknown): Rgba => {
  if (typeof color !== "string") {
    throw new Error(
      `react-native-reanimated: interpolateColor() takes colour STRINGS, got ${typeof color} (${String(color)}). ` +
        "React Native's packed colour integers do not exist on this platform — a colour's destination here is a " +
        "GTK stylesheet, which is why `processColor` is not implemented either. See docs/api.md.",
    )
  }
  const parsed = parseColorToRgba(color)
  if (parsed !== null) {
    return parsed
  }
  if (THEME_COLOR.test(color.trim())) {
    throw new Error(
      `react-native-reanimated: cannot interpolate the theme colour ${JSON.stringify(color)}. ` +
        "PlatformColor values are resolved by GTK against the live theme, so they have no numeric value to " +
        "blend with. Interpolate between literal colours, or swap the theme colour on a shared value instead.",
    )
  }
  throw new Error(
    `react-native-reanimated: ${JSON.stringify(color)} is not a colour this platform understands. ` +
      "Accepted: #rgb/#rgba/#rrggbb/#rrggbbaa, rgb()/rgba(), hsl()/hsla(), the CSS colour names, and `transparent`.",
  )
}

// Upstream rounds alpha to three decimals; the value goes into a string, so
// the difference is observable.
const rgbaColor = (r: number, g: number, b: number, alpha = 1): string =>
  `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`

/** True for a string this platform can turn into a colour. Upstream's contract: numbers are not colours. */
export const isColor = (value: unknown): value is string =>
  typeof value === "string" && parseColorToRgba(value) !== null

/**
 * A colour as four 0-1 channels. Alpha is quantised to eighths-of-a-percent
 * (n/255) exactly as upstream's is, because upstream reads it back out of an
 * 8-bit packed integer and callers compare against those values.
 */
export const convertToRGBA = (color: unknown): ParsedColorArray => {
  const { r, g, b, a } = parse(color)
  return [r / 255, g / 255, b / 255, Math.round(a * 255) / 255]
}

/** The inverse of {@link convertToRGBA}, in upstream's output format. */
export const rgbaArrayToRGBAColor = (rgba: ParsedColorArray): string => {
  const alpha = rgba[3] < 0.001 ? 0 : rgba[3]
  return `rgba(${Math.round(rgba[0] * 255)}, ${Math.round(rgba[1] * 255)}, ${Math.round(rgba[2] * 255)}, ${alpha})`
}

// h in 0-1, s/v in 0-1, from 0-255 channels — upstream's exact arithmetic.
const rgbToHsv = (
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const s = max === 0 ? 0 : d / max
  const v = max / 255
  let h = 0
  if (max !== min) {
    if (max === r) {
      h = (g - b + d * (g < b ? 6 : 0)) / (6 * d)
    } else if (max === g) {
      h = (b - r + d * 2) / (6 * d)
    } else {
      h = (r - g + d * 4) / (6 * d)
    }
  }
  return { h, s, v }
}

const hsvToRgb = (
  h: number,
  s: number,
  v: number,
): { r: number; g: number; b: number } => {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  let triple: [number, number, number]
  switch (i % 6) {
    case 0:
      triple = [v, t, p]
      break
    case 1:
      triple = [q, v, p]
      break
    case 2:
      triple = [p, v, t]
      break
    case 3:
      triple = [p, q, v]
      break
    case 4:
      triple = [t, p, v]
      break
    default:
      triple = [v, p, q]
  }
  return {
    r: Math.round(triple[0] * 255),
    g: Math.round(triple[1] * 255),
    b: Math.round(triple[2] * 255),
  }
}

const toLinearSpace = (channels: number[], gamma: number): number[] =>
  channels.map((value) => Math.pow(value / 255, gamma))

const toGammaSpace = (value: number, gamma: number): number =>
  Math.round(Math.pow(value, 1 / gamma) * 255)

/**
 * `transparent` carries no hue, so interpolating THROUGH it the naive way
 * fades to black and back. Upstream's fix, reproduced: a transparent stop
 * borrows the RGB of the colour next to it and contributes only its alpha —
 * which means the stop list grows by one entry at each transparent boundary.
 */
const processColorRanges = (
  inputRange: readonly number[],
  outputRange: readonly unknown[],
): { stops: number[]; colors: Rgba[] } => {
  const stops: number[] = []
  const colors: Rgba[] = []
  let previousWasTransparent = false

  for (let index = 0; index < inputRange.length; index += 1) {
    const color = outputRange[index]
    const isTransparent =
      typeof color === "string" && color.trim().toLowerCase() === "transparent"

    if (!isTransparent) {
      const parsed = parse(color)
      if (previousWasTransparent) {
        // Coming OUT of transparent: start from this colour's own RGB at
        // alpha 0, so the fade is of opacity and not of hue.
        stops.push(inputRange[index - 1]!)
        colors.push({ ...parsed, a: 0 })
      }
      stops.push(inputRange[index]!)
      colors.push(parsed)
    } else if (!previousWasTransparent) {
      if (index > 0) {
        const last = colors[colors.length - 1]!
        stops.push(inputRange[index]!)
        colors.push({ ...last, a: 0 })
      }
    } else if (index === inputRange.length - 1 && colors.length === 0) {
      // Every stop was transparent: two stops of nothing is the whole range.
      stops.push(inputRange[0]!, inputRange[inputRange.length - 1]!)
      colors.push({ r: 0, g: 0, b: 0, a: 0 }, { r: 0, g: 0, b: 0, a: 0 })
    }

    previousWasTransparent = isTransparent
  }

  return { stops, colors }
}

const interpolateRgb = (
  value: number,
  stops: number[],
  colors: Rgba[],
  gamma: number,
): string => {
  let outputR = colors.map((color) => color.r)
  let outputG = colors.map((color) => color.g)
  let outputB = colors.map((color) => color.b)
  const outputA = colors.map((color) => color.a)
  if (gamma !== 1) {
    outputR = toLinearSpace(outputR, gamma)
    outputG = toLinearSpace(outputG, gamma)
    outputB = toLinearSpace(outputB, gamma)
  }
  const r = interpolate(value, stops, outputR, Extrapolation.CLAMP)
  const g = interpolate(value, stops, outputG, Extrapolation.CLAMP)
  const b = interpolate(value, stops, outputB, Extrapolation.CLAMP)
  const a = interpolate(value, stops, outputA, Extrapolation.CLAMP)
  if (gamma === 1) {
    return rgbaColor(r, g, b, a)
  }
  return rgbaColor(
    toGammaSpace(r, gamma),
    toGammaSpace(g, gamma),
    toGammaSpace(b, gamma),
    a,
  )
}

const interpolateHsv = (
  value: number,
  stops: number[],
  colors: Rgba[],
  corrected: boolean,
): string => {
  const hsv = colors.map((color) => rgbToHsv(color.r, color.g, color.b))
  const originalH = hsv.map((entry) => entry.h)
  let h: number

  if (corrected) {
    // A hue jump wider than half the circle means the short way round is the
    // other way: shift the far end past the wrap point and re-enter the range
    // an epsilon later at the original hue, so the following segment is
    // unaffected.
    const correctedStops: number[] = [stops[0]!]
    const correctedH: number[] = [originalH[0]!]
    for (let index = 1; index < originalH.length; index += 1) {
      const current = originalH[index]!
      const previous = originalH[index - 1]!
      const delta = current - previous
      if (current > previous && delta > 0.5) {
        correctedStops.push(stops[index]!, stops[index]! + 0.00001)
        correctedH.push(current - 1, current)
      } else if (current < previous && delta < -0.5) {
        correctedStops.push(stops[index]!, stops[index]! + 0.00001)
        correctedH.push(current + 1, current)
      } else {
        correctedStops.push(stops[index]!)
        correctedH.push(current)
      }
    }
    h =
      (interpolate(value, correctedStops, correctedH, Extrapolation.CLAMP) +
        1) %
      1
  } else {
    h = interpolate(value, stops, originalH, Extrapolation.CLAMP)
  }

  const s = interpolate(
    value,
    stops,
    hsv.map((entry) => entry.s),
    Extrapolation.CLAMP,
  )
  const v = interpolate(
    value,
    stops,
    hsv.map((entry) => entry.v),
    Extrapolation.CLAMP,
  )
  const a = interpolate(
    value,
    stops,
    colors.map((color) => color.a),
    Extrapolation.CLAMP,
  )
  const rgb = hsvToRgb(h, s, v)
  return rgbaColor(rgb.r, rgb.g, rgb.b, a)
}

/**
 * Maps `value` from `inputRange` onto a range of colours, returning
 * `rgba(r, g, b, a)`.
 *
 * Outside `inputRange` the result is clamped to the nearest end, as upstream
 * does — colour has no meaningful extrapolation.
 */
export const interpolateColor = (
  value: number,
  inputRange: readonly number[],
  outputRange: readonly string[],
  colorSpace: ColorSpace = "RGB",
  options: ColorInterpolationOptions = {},
): string => {
  if (inputRange.length !== outputRange.length) {
    throw new Error(
      "react-native-reanimated: interpolateColor() input and output ranges must be the same length " +
        `(got ${inputRange.length} and ${outputRange.length})`,
    )
  }
  const { stops, colors } = processColorRanges(inputRange, outputRange)
  if (stops.length < 2) {
    throw new Error(
      "react-native-reanimated: interpolateColor() input and output ranges must contain at least two values",
    )
  }
  if (colorSpace === "RGB") {
    return interpolateRgb(value, stops, colors, options.gamma ?? 2.2)
  }
  if (colorSpace === "HSV") {
    return interpolateHsv(
      value,
      stops,
      colors,
      options.useCorrectedHSVInterpolation ?? true,
    )
  }
  // Upstream also takes 'LAB' (Oklab, through a vendored slice of culori).
  // Not reproduced: it is the only colour space that needs a second
  // dependency, and upstream feeds it 0-255 channels where culori documents
  // 0-1, so matching it would mean matching a scaling bug. Refused by name
  // rather than silently treated as RGB.
  throw new Error(
    `react-native-reanimated: unsupported colour space "${String(colorSpace)}" for interpolateColor(). ` +
      "Supported here: 'RGB', 'HSV'. ('LAB' is upstream-only — see docs/api.md.)",
  )
}
