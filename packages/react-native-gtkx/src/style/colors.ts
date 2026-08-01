// Pure color handling: parses React Native color strings and normalizes them
// into GTK4 CSS color values. No bridge imports — unit-testable on any OS.
//
// Every parseable color is normalized to `rgb(r, g, b)` / `rgba(r, g, b, a)`
// so the output does not depend on which color syntaxes the GTK CSS parser of
// a particular version accepts. Two values pass through untouched:
// - `var(--name[, fallback])` — CSS variables (GTK 4.16+, Adwaita palette)
// - `@name` — legacy GTK named colors (`@define-color` references)

// CSS Color Module Level 4 named colors (the set React Native supports).
const NAMED_COLORS: Record<string, string> = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  grey: "#808080",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
}

/** A parsed colour: 0-255 channels, 0-1 alpha. */
export type Rgba = { r: number; g: number; b: number; a: number }

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const formatRgba = ({ r, g, b, a }: Rgba): string => {
  const alpha = Math.round(clamp(a, 0, 1) * 1000) / 1000
  return alpha >= 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const HEX_PATTERN = /^#([0-9a-f]+)$/i

const hexPair = (digits: string, index: number): number =>
  Number.parseInt(digits.slice(index, index + 2), 16)

const hexSingle = (digits: string, index: number): number =>
  Number.parseInt(digits.charAt(index).repeat(2), 16)

const parseHex = (input: string): Rgba | null => {
  const match = HEX_PATTERN.exec(input)
  if (match === null) {
    return null
  }
  const digits = match[1] ?? ""
  switch (digits.length) {
    case 3:
      return {
        r: hexSingle(digits, 0),
        g: hexSingle(digits, 1),
        b: hexSingle(digits, 2),
        a: 1,
      }
    case 4:
      return {
        r: hexSingle(digits, 0),
        g: hexSingle(digits, 1),
        b: hexSingle(digits, 2),
        a: hexSingle(digits, 3) / 255,
      }
    case 6:
      return {
        r: hexPair(digits, 0),
        g: hexPair(digits, 2),
        b: hexPair(digits, 4),
        a: 1,
      }
    case 8:
      return {
        r: hexPair(digits, 0),
        g: hexPair(digits, 2),
        b: hexPair(digits, 4),
        a: hexPair(digits, 6) / 255,
      }
    default:
      return null
  }
}

const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/

const parseNumber = (token: string): number | null =>
  NUMBER_PATTERN.test(token) ? Number.parseFloat(token) : null

// 0-255 integer or percentage → 0-255 integer.
const parseRgbChannel = (token: string): number | null => {
  if (token.endsWith("%")) {
    const percent = parseNumber(token.slice(0, -1))
    // (percent * 255) / 100 avoids float drift: 50 * 2.55 === 127.4999...
    return percent === null
      ? null
      : Math.round((clamp(percent, 0, 100) * 255) / 100)
  }
  const value = parseNumber(token)
  return value === null ? null : Math.round(clamp(value, 0, 255))
}

// 0-1 float or percentage → 0-1 float.
const parseAlpha = (token: string): number | null => {
  if (token.endsWith("%")) {
    const percent = parseNumber(token.slice(0, -1))
    return percent === null ? null : clamp(percent / 100, 0, 1)
  }
  const value = parseNumber(token)
  return value === null ? null : clamp(value, 0, 1)
}

const parsePercentage = (token: string): number | null => {
  if (!token.endsWith("%")) {
    return null
  }
  const percent = parseNumber(token.slice(0, -1))
  return percent === null ? null : clamp(percent / 100, 0, 1)
}

const parseHue = (token: string): number | null => {
  const raw = token.toLowerCase().endsWith("deg") ? token.slice(0, -3) : token
  const degrees = parseNumber(raw)
  return degrees === null ? null : ((degrees % 360) + 360) % 360
}

const hslToRgb = (
  h: number,
  s: number,
  l: number,
): [number, number, number] => {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hh = h / 60
  const x = chroma * (1 - Math.abs((hh % 2) - 1))
  // Every branch assigns, so the sextant picks the triple outright — the
  // placeholder initialiser it used to start from was dead.
  let rgb: [number, number, number]
  if (hh < 1) {
    rgb = [chroma, x, 0]
  } else if (hh < 2) {
    rgb = [x, chroma, 0]
  } else if (hh < 3) {
    rgb = [0, chroma, x]
  } else if (hh < 4) {
    rgb = [0, x, chroma]
  } else if (hh < 5) {
    rgb = [x, 0, chroma]
  } else {
    rgb = [chroma, 0, x]
  }
  const m = l - chroma / 2
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ]
}

const FUNCTION_PATTERN = /^(rgba?|hsla?)\(([^()]*)\)$/i

// Accepts legacy comma syntax and modern space syntax with optional "/ alpha".
const splitFunctionBody = (body: string): string[] =>
  body
    .replace(/\//g, " ")
    .split(/[,\s]+/)
    .filter((token) => token.length > 0)

const parseColorFunction = (input: string): Rgba | null => {
  const match = FUNCTION_PATTERN.exec(input)
  if (match === null) {
    return null
  }
  const name = (match[1] ?? "").toLowerCase()
  const tokens = splitFunctionBody(match[2] ?? "")
  if (tokens.length < 3 || tokens.length > 4) {
    return null
  }
  const alpha = tokens.length === 4 ? parseAlpha(tokens[3] ?? "") : 1
  if (alpha === null) {
    return null
  }
  if (name === "rgb" || name === "rgba") {
    const r = parseRgbChannel(tokens[0] ?? "")
    const g = parseRgbChannel(tokens[1] ?? "")
    const b = parseRgbChannel(tokens[2] ?? "")
    if (r === null || g === null || b === null) {
      return null
    }
    return { r, g, b, a: alpha }
  }
  const h = parseHue(tokens[0] ?? "")
  const s = parsePercentage(tokens[1] ?? "")
  const l = parsePercentage(tokens[2] ?? "")
  if (h === null || s === null || l === null) {
    return null
  }
  const [r, g, b] = hslToRgb(h, s, l)
  return { r, g, b, a: alpha }
}

const CSS_VARIABLE_PATTERN = /^var\(--[\w-]+.*\)$/i
const GTK_NAMED_COLOR_PATTERN = /^@[A-Za-z_][\w-]*$/

/**
 * Parses a React Native color string into numeric channels.
 *
 * Returns null for anything that has no fixed value at parse time — the
 * `var(--name)` and `@named` forms {@link parseColor} passes through to GTK,
 * which resolves them against the live theme. Callers that need to compute
 * WITH a colour (interpolation, blending) have to refuse those; callers that
 * only need to hand it to GTK should use {@link parseColor} instead.
 */
export const parseColorToRgba = (value: string): Rgba | null => {
  if (typeof value !== "string") {
    return null
  }
  const input = value.trim()
  if (input === "") {
    return null
  }
  const lower = input.toLowerCase()
  if (lower === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 }
  }
  const named = NAMED_COLORS[lower]
  return parseHex(named ?? input) ?? parseColorFunction(input)
}

/**
 * Parses a React Native color string into a GTK4 CSS color value.
 * Returns null for values that cannot be understood.
 */
export const parseColor = (value: string): string | null => {
  if (typeof value !== "string") {
    return null
  }
  const input = value.trim()
  if (input === "") {
    return null
  }
  // Adwaita/custom CSS variable references pass through untouched. The
  // pattern is permissive on purpose: nested var() fallbacks stay valid.
  if (input.toLowerCase().startsWith("var(")) {
    return CSS_VARIABLE_PATTERN.test(input) ? input : null
  }
  if (GTK_NAMED_COLOR_PATTERN.test(input)) {
    return input
  }
  const rgba = parseColorToRgba(input)
  return rgba === null ? null : formatRgba(rgba)
}

const toCssVariableName = (name: string): string =>
  name.startsWith("--") ? name : `--${name}`

/**
 * React Native's PlatformColor for GTK: references theme colors by name.
 * Names map onto CSS variables (Adwaita exposes its palette as
 * `--accent-bg-color`, `--window-bg-color`, ... since libadwaita 1.6);
 * extra names become var() fallbacks, tried in order. A name starting with
 * "@" is a legacy GTK named color (`@define-color`) and terminates the
 * fallback chain, because var() fallbacks cannot resolve further after it.
 *
 *   PlatformColor("accent-bg-color")             → "var(--accent-bg-color)"
 *   PlatformColor("accent-bg-color", "@blue_3")  → "var(--accent-bg-color, @blue_3)"
 */
export const PlatformColor = (...names: string[]): string => {
  const cleaned = names.map((name) => name.trim()).filter((name) => name !== "")
  if (cleaned.length === 0) {
    throw new Error("PlatformColor requires at least one color name")
  }
  let expression: string | null = null
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const name = cleaned[i] ?? ""
    if (name.startsWith("@")) {
      // Terminal value: names after it are unreachable fallbacks.
      expression = name
      continue
    }
    const variable = toCssVariableName(name)
    expression =
      expression === null
        ? `var(${variable})`
        : `var(${variable}, ${expression})`
  }
  return expression ?? ""
}
