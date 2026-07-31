// Pure shape → SVG path `d` string generators. No gtkx imports (unit-testable
// on any OS, like style/colors.ts) — the only consumer of the output is
// `Gsk.Path.parse()` in the bridge, so every generator here produces (a
// superset of) SVG path syntax and nothing else. This is the "no parser of
// our own" bet from the PRD: <Path> passes its `d` straight through, and
// every other shape is just a small amount of arithmetic away from the same
// syntax.

export type Point = { x: number; y: number }

// Accepts both the comma-separated and whitespace-separated forms RN-svg
// tolerates ("0,0 10,5" and "0 0 10 5"), and odd trailing tokens are
// dropped rather than throwing — malformed `points` should render nothing
// useful, not crash the tree.
export const parsePoints = (points: string): Point[] => {
  const numbers = points
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token.length > 0)
    .map(Number)
    .filter((value) => !Number.isNaN(value))
  const result: Point[] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    result.push({ x: numbers[i]!, y: numbers[i + 1]! })
  }
  return result
}

export type RectShape = {
  x: number
  y: number
  width: number
  height: number
  rx?: number
  ry?: number
}

// SVG's rx/ry resolution: either one fills in for a missing other, and both
// clamp to half the box so opposite corners never overlap.
const resolveCornerRadii = (
  width: number,
  height: number,
  rx: number | undefined,
  ry: number | undefined,
): [number, number] => {
  const rawRx = rx ?? ry ?? 0
  const rawRy = ry ?? rx ?? 0
  return [
    Math.max(0, Math.min(rawRx, width / 2)),
    Math.max(0, Math.min(rawRy, height / 2)),
  ]
}

export const rectToPathData = ({
  x,
  y,
  width,
  height,
  rx,
  ry,
}: RectShape): string => {
  if (width <= 0 || height <= 0) {
    return ""
  }
  const [radiusX, radiusY] = resolveCornerRadii(width, height, rx, ry)
  if (radiusX <= 0 || radiusY <= 0) {
    return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`
  }
  const right = x + width
  const bottom = y + height
  return (
    `M ${x + radiusX} ${y} ` +
    `H ${right - radiusX} ` +
    `A ${radiusX} ${radiusY} 0 0 1 ${right} ${y + radiusY} ` +
    `V ${bottom - radiusY} ` +
    `A ${radiusX} ${radiusY} 0 0 1 ${right - radiusX} ${bottom} ` +
    `H ${x + radiusX} ` +
    `A ${radiusX} ${radiusY} 0 0 1 ${x} ${bottom - radiusY} ` +
    `V ${y + radiusY} ` +
    `A ${radiusX} ${radiusY} 0 0 1 ${x + radiusX} ${y} Z`
  )
}

// Two semicircle arcs — the standard trick for a full ellipse/circle in a
// path grammar that has no dedicated "ellipse" command.
export const ellipseToPathData = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): string => {
  if (rx <= 0 || ry <= 0) {
    return ""
  }
  return (
    `M ${cx - rx} ${cy} ` +
    `A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} ` +
    `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
  )
}

export const circleToPathData = (cx: number, cy: number, r: number): string =>
  ellipseToPathData(cx, cy, r, r)

export const lineToPathData = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string => `M ${x1} ${y1} L ${x2} ${y2}`

const pointsToPathData = (points: Point[], close: boolean): string => {
  if (points.length === 0) {
    return ""
  }
  const [first, ...rest] = points
  const segments = rest.map((p) => `L ${p.x} ${p.y}`).join(" ")
  const body =
    segments.length > 0
      ? `M ${first!.x} ${first!.y} ${segments}`
      : `M ${first!.x} ${first!.y}`
  return close ? `${body} Z` : body
}

export const polygonToPathData = (points: string | Point[]): string =>
  pointsToPathData(
    typeof points === "string" ? parsePoints(points) : points,
    true,
  )

export const polylineToPathData = (points: string | Point[]): string =>
  pointsToPathData(
    typeof points === "string" ? parsePoints(points) : points,
    false,
  )
