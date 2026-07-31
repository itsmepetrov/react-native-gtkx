// Composes an RN `transform` array into one 2D affine matrix. Pure module —
// no bridge imports — so the whole ordering contract is unit-testable on any
// OS; the bridge only turns the finished matrix into a GskTransform.
//
// Why a matrix and not a chain of GskTransform calls: measured in the VM
// (docs/research/transforms.md), a five-op GskTransform chain costs 18.3 us
// per build against 5.7 us for one gsk_transform_matrix2d(), and both
// produce a bit-identical to2d(). Composition is six multiplies of plain
// numbers, so it stays on the Animated fast path.

import type { Transform2D, TransformPart } from "../contracts"
import { warnOnce } from "./dev-warning"

export const IDENTITY_TRANSFORM: Transform2D = {
  xx: 1,
  yx: 0,
  xy: 0,
  yy: 1,
  dx: 0,
  dy: 0,
}

const DEG_PER_RAD = 180 / Math.PI

/**
 * RN angle syntax: a number with an explicit `deg` or `rad` unit. Returns
 * degrees, or null for anything unparseable (warned once, then dropped —
 * a bad angle must not take the whole style down).
 */
export const parseAngle = (value: unknown): number | null => {
  if (typeof value === "number") {
    // RN rejects unitless angles in styles, but an Animated node driving a
    // rotation with a plain numeric outputRange is a common shortcut and
    // degrees are the only sane reading of it.
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== "string") {
    return null
  }
  const match =
    /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(deg|rad)\s*$/.exec(value)
  if (!match) {
    warnOnce(
      `invalid-angle:${value}`,
      `[react-native-gtkx] Invalid angle ${JSON.stringify(value)} in "transform" — expected "<number>deg" or "<number>rad"; the entry is ignored`,
    )
    return null
  }
  const amount = parseFloat(match[1]!)
  return match[2] === "rad" ? amount * DEG_PER_RAD : amount
}

// left * right, both in the Transform2D component order.
const multiply = (left: Transform2D, right: Transform2D): Transform2D => ({
  xx: left.xx * right.xx + left.xy * right.yx,
  yx: left.yx * right.xx + left.yy * right.yx,
  xy: left.xx * right.xy + left.xy * right.yy,
  yy: left.yx * right.xy + left.yy * right.yy,
  dx: left.xx * right.dx + left.xy * right.dy + left.dx,
  dy: left.yx * right.dx + left.yy * right.dy + left.dy,
})

const scaleMatrix = (x: number, y: number): Transform2D | null =>
  Number.isFinite(x) && Number.isFinite(y)
    ? { xx: x, yx: 0, xy: 0, yy: y, dx: 0, dy: 0 }
    : null

const rotateMatrix = (angle: unknown): Transform2D | null => {
  const degrees = parseAngle(angle)
  if (degrees === null) {
    return null
  }
  const radians = degrees / DEG_PER_RAD
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { xx: cos, yx: sin, xy: -sin, yy: cos, dx: 0, dy: 0 }
}

// A TransformPart is a single-key object, and this runs on every animated
// frame — so the supported keys are probed directly (a monomorphic property
// load) instead of being discovered with Object.keys/for-in, and the matrices
// are plain literals rather than spreads of the identity. Key discovery only
// happens on the miss path, to name the unsupported entry in the warning.
const partToMatrix = (part: TransformPart): Transform2D | null => {
  const entry = part as Record<string, unknown>

  const translateX = entry.translateX
  if (typeof translateX === "number") {
    return Number.isFinite(translateX)
      ? { xx: 1, yx: 0, xy: 0, yy: 1, dx: translateX, dy: 0 }
      : null
  }
  const translateY = entry.translateY
  if (typeof translateY === "number") {
    return Number.isFinite(translateY)
      ? { xx: 1, yx: 0, xy: 0, yy: 1, dx: 0, dy: translateY }
      : null
  }
  const scale = entry.scale
  if (typeof scale === "number") {
    return scaleMatrix(scale, scale)
  }
  const scaleX = entry.scaleX
  if (typeof scaleX === "number") {
    return scaleMatrix(scaleX, 1)
  }
  const scaleY = entry.scaleY
  if (typeof scaleY === "number") {
    return scaleMatrix(1, scaleY)
  }
  if (entry.rotate !== undefined) {
    return rotateMatrix(entry.rotate)
  }
  if (entry.rotateZ !== undefined) {
    return rotateMatrix(entry.rotateZ)
  }

  for (const key of Object.keys(entry)) {
    warnOnce(
      `unsupported-transform:${key}`,
      `[react-native-gtkx] Unsupported transform "${key}" — supported: translateX, translateY, scale, scaleX, scaleY, rotate, rotateZ`,
    )
  }
  return null
}

/**
 * Folds an RN transform array into a single matrix. Order is RN's (and
 * CSS's): the leftmost entry is the outermost matrix, so it is applied to a
 * point LAST — `[{rotate}, {translateX}]` translates, then rotates the
 * result about the origin.
 */
export const composeTransform = (
  parts: readonly TransformPart[],
): Transform2D => {
  // `matrix === null` means "still the identity", which lets the common
  // single-entry array skip the multiply entirely.
  let matrix: Transform2D | null = null
  for (const part of parts) {
    const next = partToMatrix(part)
    if (next) {
      matrix = matrix === null ? next : multiply(matrix, next)
    }
  }
  return matrix ?? IDENTITY_TRANSFORM
}

export const isIdentityTransform = (matrix: Transform2D): boolean =>
  matrix.xx === 1 &&
  matrix.yx === 0 &&
  matrix.xy === 0 &&
  matrix.yy === 1 &&
  matrix.dx === 0 &&
  matrix.dy === 0

/**
 * True when the matrix is a pure translation. Those keep the existing
 * positional fast path (the rect is simply offset), which costs no
 * GskTransform at all — only rotate/scale need one.
 */
export const isTranslationOnly = (matrix: Transform2D): boolean =>
  matrix.xx === 1 && matrix.yx === 0 && matrix.xy === 0 && matrix.yy === 1
