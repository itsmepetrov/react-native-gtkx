// Pure parser for the SVG `transform` attribute's function-list syntax
// (translate/scale/rotate/matrix — no gtkx imports, unit-testable anywhere).
// `skewX`/`skewY` are a deliberate cut (see epic.md): nothing in the shapes
// this API ships needs them, and Gsk's skew() takes degrees on both axes
// while SVG's skewX/skewY are single-axis, different enough to not be a
// one-line addition later if it turns out to matter.
//
// `rotate(angle, cx, cy)` is expanded here into translate/rotate/translate
// so the bridge only ever has to apply four primitive ops, never carry
// pivot-point bookkeeping of its own.

export type SvgTransformOp =
  | { type: "translate"; x: number; y: number }
  | { type: "scale"; x: number; y: number }
  | { type: "rotate"; angleDeg: number }
  | {
      type: "matrix"
      a: number
      b: number
      c: number
      d: number
      e: number
      f: number
    }

const CALL_PATTERN = /([a-zA-Z]+)\s*\(([^)]*)\)/g

const parseArgs = (raw: string): number[] =>
  raw
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token.length > 0)
    .map(Number)

const isAllFinite = (values: number[]): boolean =>
  values.every((value) => Number.isFinite(value))

const buildOps = (name: string, args: number[]): SvgTransformOp[] => {
  switch (name) {
    case "translate": {
      if (args.length < 1 || args.length > 2 || !isAllFinite(args)) {
        return []
      }
      const [x, y = 0] = args
      return [{ type: "translate", x: x!, y }]
    }
    case "scale": {
      if (args.length < 1 || args.length > 2 || !isAllFinite(args)) {
        return []
      }
      const [x, y = x] = args
      return [{ type: "scale", x: x!, y: y! }]
    }
    case "rotate": {
      if ((args.length !== 1 && args.length !== 3) || !isAllFinite(args)) {
        return []
      }
      const [angleDeg, cx, cy] = args
      if (cx === undefined || cy === undefined) {
        return [{ type: "rotate", angleDeg: angleDeg! }]
      }
      return [
        { type: "translate", x: cx, y: cy },
        { type: "rotate", angleDeg: angleDeg! },
        { type: "translate", x: -cx, y: -cy },
      ]
    }
    case "matrix": {
      if (args.length !== 6 || !isAllFinite(args)) {
        return []
      }
      const [a, b, c, d, e, f] = args
      return [{ type: "matrix", a: a!, b: b!, c: c!, d: d!, e: e!, f: f! }]
    }
    default:
      // skewX/skewY (deliberate cut) and anything unrecognized: ignored,
      // same leniency RN-svg shows toward transform-list garbage.
      return []
  }
}

/** Parses an SVG transform-list string left to right into primitive ops. */
export const parseSvgTransform = (
  value: string | undefined,
): SvgTransformOp[] => {
  if (!value) {
    return []
  }
  const ops: SvgTransformOp[] = []
  for (const match of value.matchAll(CALL_PATTERN)) {
    const name = match[1]!
    const args = parseArgs(match[2] ?? "")
    ops.push(...buildOps(name, args))
  }
  return ops
}
