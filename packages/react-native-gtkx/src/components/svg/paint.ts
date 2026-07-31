// Shared fill/stroke prop shape and the descriptor builder every shape
// component (Path/Rect/Circle/Ellipse/Line/Polygon/Polyline) feeds its
// generated `d` string through. Defaults match react-native-svg: fill
// defaults to black, stroke to none.
import {
  Gsk,
  resolveSvgPaint,
  type SvgShapeDescriptor,
} from "../../gtkx/bridge/index"

export type SvgFillRule = "nonzero" | "evenodd"
export type SvgLineCap = "butt" | "round" | "square"
export type SvgLineJoin = "miter" | "round" | "bevel"

export type SvgPaintProps = {
  fill?: string
  fillRule?: SvgFillRule
  stroke?: string
  strokeLinecap?: SvgLineCap
  strokeLinejoin?: SvgLineJoin
  strokeDasharray?: string | number[]
}

// The subset of paint that can be Animated (see animated-support.ts) — kept
// separate from SvgPaintProps because those fields are always resolved to
// plain numbers by the caller before this function ever sees them.
export type SvgPaintNumbers = {
  fillOpacity: number
  strokeOpacity: number
  strokeWidth: number
  strokeDashoffset: number
  opacity: number
}

export const DEFAULT_PAINT_NUMBERS: SvgPaintNumbers = {
  fillOpacity: 1,
  strokeOpacity: 1,
  strokeWidth: 1,
  strokeDashoffset: 0,
  opacity: 1,
}

const FILL_RULES: Record<SvgFillRule, Gsk.FillRule> = {
  nonzero: Gsk.FillRule.WINDING,
  evenodd: Gsk.FillRule.EVEN_ODD,
}

const LINE_CAPS: Record<SvgLineCap, Gsk.LineCap> = {
  butt: Gsk.LineCap.BUTT,
  round: Gsk.LineCap.ROUND,
  square: Gsk.LineCap.SQUARE,
}

const LINE_JOINS: Record<SvgLineJoin, Gsk.LineJoin> = {
  miter: Gsk.LineJoin.MITER,
  round: Gsk.LineJoin.ROUND,
  bevel: Gsk.LineJoin.BEVEL,
}

// RN-svg accepts both a comma/space-separated string and a number array.
const parseDasharray = (
  value: SvgPaintProps["strokeDasharray"],
): number[] | null => {
  if (value === undefined) {
    return null
  }
  const tokens = Array.isArray(value) ? value : value.split(/[\s,]+/)
  const numbers = tokens
    .map((token) =>
      typeof token === "number" ? token : Number.parseFloat(String(token)),
    )
    .filter((n) => Number.isFinite(n) && n >= 0)
  return numbers.length > 0 ? numbers : null
}

/** `d` may be empty (e.g. a Polygon with no points) — that shape simply
 * paints nothing, it is not an error. Fill defaults to black, stroke to
 * none, exactly like react-native-svg. */
export const buildShapeDescriptor = (
  d: string,
  paint: SvgPaintProps,
  numbers: SvgPaintNumbers,
): SvgShapeDescriptor => ({
  kind: "shape",
  path: d ? Gsk.Path.parse(d) : null,
  fill: resolveSvgPaint(paint.fill ?? "black"),
  fillOpacity: numbers.fillOpacity,
  fillRule: FILL_RULES[paint.fillRule ?? "nonzero"],
  stroke: resolveSvgPaint(paint.stroke ?? "none"),
  strokeOpacity: numbers.strokeOpacity,
  strokeWidth: numbers.strokeWidth,
  strokeLinecap: LINE_CAPS[paint.strokeLinecap ?? "butt"],
  strokeLinejoin: LINE_JOINS[paint.strokeLinejoin ?? "miter"],
  strokeMiterlimit: 4,
  strokeDasharray: parseDasharray(paint.strokeDasharray),
  strokeDashoffset: numbers.strokeDashoffset,
  opacity: numbers.opacity,
})
