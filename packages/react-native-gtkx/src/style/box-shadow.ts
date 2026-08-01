// Compiles React Native's `boxShadow` into a GTK4 CSS `box-shadow` value.
// Pure module — no bridge imports, unit-testable on any OS.
//
// WHY this is not a passthrough of the string form. RN accepts both a CSS
// string and a structured array, and the string is the form apps actually
// write. Handing that string straight to GTK would work for the easy cases
// and fail silently for the ones that matter here: a `PlatformColor` becomes
// `var(--card-shade-color)` only after ./colors.ts has seen it, a named
// colour like `rebeccapurple` is not in GTK's vocabulary at all, and an
// unparseable value would poison the whole declaration block with a GTK CSS
// warning rather than being dropped the way an invalid `backgroundColor`
// already is. Parsing here means both forms take the same path, colours go
// through the same normalizer as every other colour prop, and a bad shadow
// costs one dev warning instead of the rest of the style.
//
// What GTK4 CSS supports, and therefore what this emits: offset-x offset-y
// [blur] [spread] [color], plus the `inset` keyword, comma-separated. That
// is the same grammar as CSS, so the ordering rule is CSS's — the FIRST
// shadow paints on top — and RN follows it too.

import type { BoxShadowValue } from "../contracts"
import { parseColor } from "./colors"
import { warnOnce } from "./dev-warning"

/** RN's own shadow-length grammar, from `processBoxShadow.js`: a bare number
 *  or a number with `px`, nothing else. No percentages, no em — matching it
 *  exactly means a style that RN rejects is rejected here too, rather than
 *  quietly working on one platform. */
const LENGTH = /^[+-]?(\d*\.?\d+)(px)?$/

const length = (value: number | string): string | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? `${value}px` : null
  }
  const trimmed = value.trim()
  const match = LENGTH.exec(trimmed)
  return match ? `${match[1]}px` : null
}

/** Blur is the one length CSS (and RN's parser) refuses to take negative. */
const nonNegativeLength = (value: number | string): string | null => {
  const rendered = length(value)
  if (rendered === null || rendered.startsWith("-")) {
    return null
  }
  return rendered
}

/** Splits on commas that are not inside parentheses, so `rgba(0, 0, 0, .5)`
 *  stays one token. */
const splitShadows = (value: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of value) {
    if (char === "(") {
      depth += 1
    } else if (char === ")") {
      depth = Math.max(0, depth - 1)
    }
    if (char === "," && depth === 0) {
      parts.push(current)
      current = ""
      continue
    }
    current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part !== "")
}

/** Same rule as splitShadows, one level down: whitespace outside
 *  parentheses separates a shadow's own components. */
const splitTokens = (shadow: string): string[] => {
  const tokens: string[] = []
  let depth = 0
  let current = ""
  for (const char of shadow) {
    if (char === "(") {
      depth += 1
    } else if (char === ")") {
      depth = Math.max(0, depth - 1)
    }
    if (/\s/.test(char) && depth === 0) {
      if (current !== "") {
        tokens.push(current)
        current = ""
      }
      continue
    }
    current += char
  }
  if (current !== "") {
    tokens.push(current)
  }
  return tokens
}

/**
 * Parses one CSS shadow into the structured form. Returns null when the
 * shadow is not something CSS (or RN) would accept: too few or too many
 * lengths, two colours, an unparseable token.
 */
const parseShadow = (shadow: string): BoxShadowValue | null => {
  const tokens = splitTokens(shadow)
  const lengths: (number | string)[] = []
  let color: string | undefined
  let inset = false
  for (const token of tokens) {
    if (token.toLowerCase() === "inset") {
      if (inset) {
        return null
      }
      inset = true
      continue
    }
    if (length(token) !== null) {
      lengths.push(token)
      continue
    }
    if (color !== undefined) {
      return null
    }
    color = token
  }
  // CSS requires offset-x and offset-y and allows blur and spread after
  // them; anything else is a malformed shadow.
  if (lengths.length < 2 || lengths.length > 4) {
    return null
  }
  return {
    offsetX: lengths[0]!,
    offsetY: lengths[1]!,
    ...(lengths[2] !== undefined ? { blurRadius: lengths[2] } : {}),
    ...(lengths[3] !== undefined ? { spreadDistance: lengths[3] } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(inset ? { inset: true } : {}),
  }
}

/** One structured shadow as a GTK CSS value, or null when a part of it is
 *  not usable. */
const shadowToCss = (shadow: BoxShadowValue): string | null => {
  const offsetX = length(shadow.offsetX)
  const offsetY = length(shadow.offsetY)
  if (offsetX === null || offsetY === null) {
    return null
  }
  const parts: string[] = []
  if (shadow.inset === true) {
    parts.push("inset")
  }
  parts.push(offsetX, offsetY)
  if (shadow.blurRadius !== undefined) {
    const blur = nonNegativeLength(shadow.blurRadius)
    if (blur === null) {
      return null
    }
    parts.push(blur)
  }
  if (shadow.spreadDistance !== undefined) {
    // CSS positions spread after blur, so a spread with no blur needs an
    // explicit zero blur rather than silently becoming one.
    if (shadow.blurRadius === undefined) {
      parts.push("0px")
    }
    const spread = length(shadow.spreadDistance)
    if (spread === null) {
      return null
    }
    parts.push(spread)
  }
  // RN's documented deviation from CSS: an omitted shadow colour is BLACK,
  // not the inherited `currentColor`. Emitting it explicitly is what keeps
  // this platform on RN's side of that difference — leaving it out would
  // silently hand the app CSS's behaviour instead.
  const parsed = parseColor(shadow.color ?? "black")
  if (parsed === null) {
    return null
  }
  parts.push(parsed)
  return parts.join(" ")
}

/**
 * Renders RN's `boxShadow` as a GTK CSS `box-shadow` value, or null when
 * nothing usable came out of it (the caller then emits no declaration).
 * Both RN forms are accepted; the string is parsed rather than forwarded.
 */
export const boxShadowToCss = (
  value: string | readonly BoxShadowValue[],
): string | null => {
  const shadows =
    typeof value === "string"
      ? splitShadows(value).map(parseShadow)
      : value.map((shadow) => shadow)
  const rendered: string[] = []
  for (const shadow of shadows) {
    const css = shadow === null ? null : shadowToCss(shadow)
    if (css === null) {
      warnOnce(
        `invalid-box-shadow:${JSON.stringify(value)}`,
        `[react-native-gtkx] Invalid boxShadow ${JSON.stringify(value)} — declaration dropped`,
      )
      return null
    }
    rendered.push(css)
  }
  return rendered.length > 0 ? rendered.join(", ") : null
}
