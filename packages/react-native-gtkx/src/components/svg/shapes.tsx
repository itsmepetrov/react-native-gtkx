// Path/Rect/Circle/Ellipse/Line/Polygon/Polyline. Each is geometry (fed to
// the pure src/svg/geometry.ts generators, or passed straight through for
// Path's `d`) + the shared paint props (paint.ts). Geometry fields may be
// Animated (see use-shape-node.ts); `d`/`points`/the paint strings are not.
import {
  circleToPathData,
  ellipseToPathData,
  lineToPathData,
  polygonToPathData,
  polylineToPathData,
  rectToPathData,
  type Point,
} from "../../svg/geometry"
import type { AnimatableNumber } from "./animated-support"
import { SvgNodeElement } from "./node"
import type { SvgPaintProps } from "./paint"
import { useShapeNode, type ShapeNumericPaintProps } from "./use-shape-node"

type ShapePaintProps = SvgPaintProps & ShapeNumericPaintProps

export type PathProps = ShapePaintProps & { d: string }

export const Path = ({
  d,
  fillOpacity,
  strokeOpacity,
  strokeWidth,
  strokeDashoffset,
  opacity,
  ...paint
}: PathProps) => {
  const widgetRef = useShapeNode(
    "Path",
    {},
    () => d,
    paint,
    { fillOpacity, strokeOpacity, strokeWidth, strokeDashoffset, opacity },
    [d],
  )
  return <SvgNodeElement widgetRef={widgetRef} />
}

export type RectProps = ShapePaintProps & {
  x?: AnimatableNumber
  y?: AnimatableNumber
  width: AnimatableNumber
  height: AnimatableNumber
  rx?: AnimatableNumber
  ry?: AnimatableNumber
}

export const Rect = ({
  x = 0,
  y = 0,
  width,
  height,
  rx,
  ry,
  fillOpacity,
  strokeOpacity,
  strokeWidth,
  strokeDashoffset,
  opacity,
  ...paint
}: RectProps) => {
  const geometry: Record<string, AnimatableNumber> = { x, y, width, height }
  if (rx !== undefined) {
    geometry.rx = rx
  }
  if (ry !== undefined) {
    geometry.ry = ry
  }
  const widgetRef = useShapeNode(
    "Rect",
    geometry,
    (v) =>
      rectToPathData({
        x: v.x!,
        y: v.y!,
        width: v.width!,
        height: v.height!,
        rx: v.rx,
        ry: v.ry,
      }),
    paint,
    { fillOpacity, strokeOpacity, strokeWidth, strokeDashoffset, opacity },
    [],
  )
  return <SvgNodeElement widgetRef={widgetRef} />
}

export type CircleProps = ShapePaintProps & {
  cx?: AnimatableNumber
  cy?: AnimatableNumber
  r: AnimatableNumber
}

export const Circle = ({
  cx = 0,
  cy = 0,
  r,
  fillOpacity,
  strokeOpacity,
  strokeWidth,
  strokeDashoffset,
  opacity,
  ...paint
}: CircleProps) => {
  const widgetRef = useShapeNode(
    "Circle",
    { cx, cy, r },
    (v) => circleToPathData(v.cx!, v.cy!, v.r!),
    paint,
    { fillOpacity, strokeOpacity, strokeWidth, strokeDashoffset, opacity },
    [],
  )
  return <SvgNodeElement widgetRef={widgetRef} />
}

export type EllipseProps = ShapePaintProps & {
  cx?: AnimatableNumber
  cy?: AnimatableNumber
  rx: AnimatableNumber
  ry: AnimatableNumber
}

export const Ellipse = ({
  cx = 0,
  cy = 0,
  rx,
  ry,
  fillOpacity,
  strokeOpacity,
  strokeWidth,
  strokeDashoffset,
  opacity,
  ...paint
}: EllipseProps) => {
  const widgetRef = useShapeNode(
    "Ellipse",
    { cx, cy, rx, ry },
    (v) => ellipseToPathData(v.cx!, v.cy!, v.rx!, v.ry!),
    paint,
    { fillOpacity, strokeOpacity, strokeWidth, strokeDashoffset, opacity },
    [],
  )
  return <SvgNodeElement widgetRef={widgetRef} />
}

// Line never fills (a zero-area contour) — the `fill` prop is intentionally
// not part of LineProps at all rather than silently ignored.
export type LineProps = Omit<ShapePaintProps, "fill" | "fillRule"> & {
  x1?: AnimatableNumber
  y1?: AnimatableNumber
  x2?: AnimatableNumber
  y2?: AnimatableNumber
}

export const Line = ({
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 0,
  strokeOpacity,
  strokeWidth,
  strokeDashoffset,
  opacity,
  ...paint
}: LineProps) => {
  const widgetRef = useShapeNode(
    "Line",
    { x1, y1, x2, y2 },
    (v) => lineToPathData(v.x1!, v.y1!, v.x2!, v.y2!),
    { ...paint, fill: "none" },
    { strokeOpacity, strokeWidth, strokeDashoffset, opacity },
    [],
  )
  return <SvgNodeElement widgetRef={widgetRef} />
}

// points is a plain string/array (not part of the Animated field set — same
// cut as Path's `d`, see epic.md).
export type PolygonProps = ShapePaintProps & { points: string | Point[] }

export const Polygon = ({
  points,
  fillOpacity,
  strokeOpacity,
  strokeWidth,
  strokeDashoffset,
  opacity,
  ...paint
}: PolygonProps) => {
  const widgetRef = useShapeNode(
    "Polygon",
    {},
    () => polygonToPathData(points),
    paint,
    { fillOpacity, strokeOpacity, strokeWidth, strokeDashoffset, opacity },
    [points],
  )
  return <SvgNodeElement widgetRef={widgetRef} />
}

export type PolylineProps = ShapePaintProps & { points: string | Point[] }

export const Polyline = ({
  points,
  fillOpacity,
  strokeOpacity,
  strokeWidth,
  strokeDashoffset,
  opacity,
  ...paint
}: PolylineProps) => {
  const widgetRef = useShapeNode(
    "Polyline",
    {},
    () => polylineToPathData(points),
    paint,
    { fillOpacity, strokeOpacity, strokeWidth, strokeDashoffset, opacity },
    [points],
  )
  return <SvgNodeElement widgetRef={widgetRef} />
}
