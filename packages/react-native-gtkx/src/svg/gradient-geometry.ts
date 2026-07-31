// Pure objectBoundingBox / userSpaceOnUse coordinate math for gradients — no
// gtkx imports, so it stays testable even though the bridge's actual
// gradient PAINT is currently blocked by an upstream gtkx-rc2 native bug
// (see the WORKAROUND note by makeColorStop in gtkx/bridge/svg-node.ts).
// This is the part of gradient support that already works end to end today
// and will need no changes once that bug is fixed upstream.

export type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
}
export type GradientUnits = "objectBoundingBox" | "userSpaceOnUse"

export const resolveGradientPoint = (
  bounds: BoundingBox,
  fractionX: number,
  fractionY: number,
  units: GradientUnits,
): { x: number; y: number } =>
  units === "userSpaceOnUse"
    ? { x: fractionX, y: fractionY }
    : {
        x: bounds.x + fractionX * bounds.width,
        y: bounds.y + fractionY * bounds.height,
      }

// SVG only has one radial radius; objectBoundingBox stretches it into an
// ellipse matching the shape's own aspect ratio (what browsers do too).
export const resolveGradientRadius = (
  bounds: BoundingBox,
  r: number,
  units: GradientUnits,
): { hradius: number; vradius: number } =>
  units === "userSpaceOnUse"
    ? { hradius: r, vradius: r }
    : { hradius: r * bounds.width, vradius: r * bounds.height }
