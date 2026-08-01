// The one layout case that has an exact transform equivalent.
//
// `width`, `flex`, `margin` and `padding` change what the SIBLINGS get, so
// animating them needs a Yoga pass and is refused by measurement
// (docs/research/animated-colors.md §4). An inset on a node whose own
// `position` is `"absolute"` is different in kind: the node is out of flow, so
// moving it changes nothing but where it is drawn — and "draw it somewhere
// else" is exactly what the transform path already does, at 0.12 µs instead
// of 63.9–496.3 µs.
//
// The equivalence is NOT universal across the four insets, and the shape of
// the exception was measured rather than assumed (Yoga 3, our own tree, the
// table in docs/research/absolute-insets.md):
//
//   top only, +40                  → moved (0, +40), size unchanged
//   left only, +40                 → moved (+40, 0), size unchanged
//   right only, +40                → moved (-40, 0), size unchanged
//   bottom only, +40               → moved (0, -40), size unchanged
//   left+right, no width, left +40 → moved (+40, 0), width -40   ← a RESIZE
//   top+bottom, no height, top +40 → moved (0, +40), height -40  ← a RESIZE
//   left+right, width 80, left +40 → moved (+40, 0), size unchanged
//   left+right, width 80, right+40 → did not move at all         ← IGNORED
//
// So: an inset is a pure translation when its axis is anchored by ONE edge.
// When both edges are set the axis has two anchors, and Yoga either stretches
// between them (no explicit size) or honours the start edge and drops the end
// one (explicit size). Neither is a translation, and translating anyway would
// produce motion a real layout pass would not — the failure this module
// exists to refuse.
//
// The engine lays out `Direction.LTR` unconditionally (layout/engine.ts), so
// `left` is always the start edge and there is no RTL case to fold in here.

export type InsetProperty = "top" | "bottom" | "left" | "right"

export const INSET_PROPERTIES: readonly InsetProperty[] = [
  "top",
  "bottom",
  "left",
  "right",
]

export type InsetTranslation = {
  /** The transform slot this inset is expressed as. */
  transform: "translateX" | "translateY"
  /**
   * How the inset's delta maps onto that slot. `right` and `bottom` measure
   * INWARD from the opposite edge, so a larger value moves the node the other
   * way.
   */
  sign: 1 | -1
}

type AxisSpec = InsetTranslation & {
  /** The other inset on the same axis. */
  opposite: InsetProperty
  /** The size property that decides the axis when both edges are set. */
  size: "width" | "height"
  /** Whether this is the edge Yoga honours when both are set with a size. */
  start: boolean
}

const AXIS: Record<InsetProperty, AxisSpec> = {
  top: {
    transform: "translateY",
    sign: 1,
    opposite: "bottom",
    size: "height",
    start: true,
  },
  bottom: {
    transform: "translateY",
    sign: -1,
    opposite: "top",
    size: "height",
    start: false,
  },
  left: {
    transform: "translateX",
    sign: 1,
    opposite: "right",
    size: "width",
    start: true,
  },
  right: {
    transform: "translateX",
    sign: -1,
    opposite: "left",
    size: "width",
    start: false,
  },
}

const isDefinite = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "auto"

/**
 * Whether animating `property` on `style` is exactly a translation, and which
 * one. Returns null when it is not — the caller must then keep slice 2's
 * refusal, unweakened.
 *
 * `style` is the FLATTENED style of the node itself: `position` is the node's
 * own resolved value, never an ancestor's.
 */
export const insetTranslation = (
  style: Readonly<Record<string, unknown>>,
  property: InsetProperty,
): InsetTranslation | null => {
  if (style.position !== "absolute") {
    return null
  }
  const axis = AXIS[property]
  if (!isDefinite(style[axis.opposite])) {
    return { transform: axis.transform, sign: axis.sign }
  }
  // Both edges are set. Without an explicit size the node stretches between
  // them, so the inset resizes it; with one, Yoga honours the start edge and
  // ignores the end edge entirely.
  if (!axis.start || !isDefinite(style[axis.size])) {
    return null
  }
  return { transform: axis.transform, sign: axis.sign }
}

/**
 * Why an inset on an ALREADY absolutely-positioned node still could not be
 * translated — the sentence a warning needs, or null when it can be.
 */
export const insetRefusalReason = (
  style: Readonly<Record<string, unknown>>,
  property: InsetProperty,
): string | null => {
  if (style.position !== "absolute") {
    return null
  }
  if (insetTranslation(style, property) !== null) {
    return null
  }
  const axis = AXIS[property]
  if (axis.start) {
    return (
      `both \`${property}\` and \`${axis.opposite}\` are set with no \`${axis.size}\`, so the node is ` +
      `stretched between the two edges and changing one RESIZES it rather than moving it`
    )
  }
  return (
    `\`${axis.opposite}\` is set as well, and with a definite \`${axis.size}\` Yoga honours the start ` +
    `edge and ignores \`${property}\` — so there is no movement to reproduce`
  )
}
