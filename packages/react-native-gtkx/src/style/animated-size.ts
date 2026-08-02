// The second carve-out in the layout refusal: a size change that is CONFINED
// to the node that owns it.
//
// The refusal itself is a cost argument and stays one — a naive `width` write
// is a Yoga pass over the container plus its commit walk, 71 / 129 / 509 µs at
// 5 / 60 / 300 children against a transform's 0.6 µs, and it grows with the
// CONTAINER rather than with the animated value
// (docs/research/animated-size.md §3). What that measurement also found is
// that the growth is entirely in work the change does not need: re-running
// Yoga rooted at the ANIMATED NODE instead of at the root is 6.6 µs for a leaf
// and 23 µs with wrapped text, IDENTICAL at 5, 60 and 300 siblings, and
// reproduces a full pass exactly — as long as the change genuinely stops at
// the node.
//
// This module decides that "as long as". It is the same shape as
// ./absolute-insets.ts and exists for the same reason: a rule that drifted
// away from what Yoga actually does is the bug this design is most likely to
// ship, so it lives in one place and tests/unit/style/animated-size.test.ts
// runs it against the real `LayoutEngine` — every configuration is laid out
// twice, once by a full pass and once by the subtree pass, and the rule is
// required to say yes exactly where the two agree, on every rect.
//
// THE AUTHORITY IS THE LAYOUT TREE, not the updater's style object.
// `position`, the container's `flexDirection` and its `alignItems` are almost
// always in a sibling style entry that `useAnimatedStyle` never mentions
// (`style={[styles.bar, useAnimatedStyle(() => ({ width: w.value }))]}`), and
// the container's style is not in the animated component's props at all. So
// the questions are asked of the shadow tree, of the style each node was
// actually laid out with (layout/node.ts, `LayoutNode.style`).
//
// WHAT THE RULE COMES DOWN TO, per driven axis A:
//
//   1. the node has no `aspectRatio` (it ties A to the other axis) and no
//      `min`/`max` on A (both clamp the driven value — measured);
//   2. the node's size on the OTHER axis does not come from its content, or
//      re-laying the subtree out at the new A would change it too and every
//      following sibling would shift;
//   3. the container's size on A does not depend on its children, or the
//      container grows with the node and everything around it moves;
//   4. for an in-flow node, A is the container's CROSS axis (a main-axis
//      change shifts every following sibling), the container does not wrap
//      (a cross-size change re-sizes the node's LINE and moves the lines
//      after it), and the node's resolved cross-axis alignment is
//      `flex-start` or `stretch` — `center` and `flex-end` move the node's
//      own origin as it grows;
//   5. for an out-of-flow node, A's START edge is anchored, so the node grows
//      from an origin that does not move.
//
// Everything else keeps the refusal, re-argued on cost alone.

import type { LayoutNode } from "../layout/node"
import type { DimensionValue, LayoutStyle } from "../contracts"

export type SizeProperty = "width" | "height"

export const SIZE_PROPERTIES: readonly SizeProperty[] = ["width", "height"]

type Axis = "horizontal" | "vertical"

const AXIS_OF: Record<SizeProperty, Axis> = {
  width: "horizontal",
  height: "vertical",
}

const SIZE_ON: Record<Axis, SizeProperty> = {
  horizontal: "width",
  vertical: "height",
}

const OTHER_AXIS: Record<Axis, Axis> = {
  horizontal: "vertical",
  vertical: "horizontal",
}

const START_EDGE: Record<Axis, "left" | "top"> = {
  horizontal: "left",
  vertical: "top",
}

const END_EDGE: Record<Axis, "right" | "bottom"> = {
  horizontal: "right",
  vertical: "bottom",
}

const MIN_ON: Record<Axis, "minWidth" | "minHeight"> = {
  horizontal: "minWidth",
  vertical: "minHeight",
}

const MAX_ON: Record<Axis, "maxWidth" | "maxHeight"> = {
  horizontal: "maxWidth",
  vertical: "maxHeight",
}

/** Where the driven size is asked about: the node, and the root it lives under. */
export type DrivenSizeContext = {
  /** The animated node's own shadow-tree node. */
  node: LayoutNode
  /**
   * Whether the LAYOUT ROOT reports its own Yoga content size to GTK — an
   * `IntrinsicRoot`, i.e. React Native content mounted directly in a GTK
   * chrome slot. That is the one root shape where a size below really does
   * reach the toplevel's size request (docs/research/animated-size.md §4), so
   * under it the climb never ends in a rectangle somebody else decided and
   * nothing qualifies.
   */
  rootIsContentSized: boolean
}

// --- reading a style --------------------------------------------------------

const EMPTY: Readonly<LayoutStyle> = {}

const styleOf = (node: LayoutNode): Readonly<LayoutStyle> => node.style ?? EMPTY

/** Definite in Yoga's sense: a point or a percentage, not `auto` and not absent. */
const isDefinite = (value: DimensionValue | undefined): boolean =>
  typeof value === "number" ||
  (typeof value === "string" && value !== "auto" && value.endsWith("%"))

const mainAxisOf = (style: Readonly<LayoutStyle>): Axis => {
  const direction = style.flexDirection ?? "column"
  return direction === "row" || direction === "row-reverse"
    ? "horizontal"
    : "vertical"
}

const isAbsolute = (style: Readonly<LayoutStyle>): boolean =>
  style.position === "absolute"

// `flex: N` is Yoga's shorthand and it resolves flexBasis to zero, which is
// what makes `flex: 1` a size that comes from the container rather than from
// the content. A bare `flexGrow` leaves flexBasis `auto`, so the final size is
// content PLUS a share of the free space — and the content half is exactly
// what disqualifies it.
const growsFromContainer = (style: Readonly<LayoutStyle>): boolean => {
  const flex = style.flex ?? 0
  if (flex > 0) {
    return true
  }
  return (style.flexGrow ?? 0) > 0 && isDefinite(style.flexBasis)
}

/** The cross-axis alignment this node resolves to inside `container`. */
const resolvedAlign = (
  style: Readonly<LayoutStyle>,
  container: Readonly<LayoutStyle>,
): string => {
  const own = style.alignSelf ?? "auto"
  return own === "auto" ? (container.alignItems ?? "stretch") : own
}

// --- the question the rule is made of ---------------------------------------

// A climb, so it terminates; nothing in a real tree comes close, and a
// malformed one must not hang a frame.
const MAX_CLIMB = 64

/**
 * Whether `node`'s own size on `axis` can be changed by its CHILDREN.
 *
 * Asked of the container (can the animated node push it around?) and, on the
 * other axis, of the animated node itself (can its own re-laid-out subtree
 * push it around?). The answers are the same list: a definite size from its
 * own style, a size stretched or grown from its container, or an out-of-flow
 * box anchored on both edges — and the climb only continues where the size is
 * inherited from above.
 */
const sizeIsIndependentOfContent = (
  node: LayoutNode | null,
  axis: Axis,
  rootIsContentSized: boolean,
  depth = 0,
): boolean => {
  if (node === null) {
    // Past the engine root. `Root` is laid out against a viewport — a definite
    // rectangle it adopts whole — and an `IntrinsicRoot` measures its content
    // instead, which is the one case where the climb ends in a no.
    return !rootIsContentSized
  }
  if (depth >= MAX_CLIMB) {
    return false
  }
  const style = styleOf(node)
  if (isDefinite(style[SIZE_ON[axis]])) {
    return true
  }
  if (isAbsolute(style)) {
    // Anchored on both edges: the size is the distance between them, which is
    // the container's business and not its children's.
    return (
      isDefinite(style[START_EDGE[axis]]) && isDefinite(style[END_EDGE[axis]])
    )
  }
  const parent = node.parent
  if (parent === null) {
    // The engine root itself: `calculateLayout` is given the viewport as
    // available space, and it fills it — unless the root is the one that
    // measures its content instead.
    return !rootIsContentSized
  }
  const container = styleOf(parent)
  if (axis === mainAxisOf(container)) {
    return (
      growsFromContainer(style) &&
      sizeIsIndependentOfContent(parent, axis, rootIsContentSized, depth + 1)
    )
  }
  // The container's cross axis: `stretch` hands the node the container's own
  // content box, so the question simply moves up one level. A wrapping
  // container stretches to the LINE instead, which its siblings decide, so it
  // stops here.
  if (
    (container.flexWrap ?? "nowrap") !== "nowrap" ||
    resolvedAlign(style, container) !== "stretch"
  ) {
    return false
  }
  return sizeIsIndependentOfContent(parent, axis, rootIsContentSized, depth + 1)
}

// --- the rule ---------------------------------------------------------------

/**
 * Why `property` cannot be driven on this node — the sentence a warning needs
 * — or null when it CAN be, in which case the driven size goes into the rect
 * store as an override and the node's own subtree is re-laid-out pinned to it.
 */
export const drivenSizeRefusal = (
  { node, rootIsContentSized }: DrivenSizeContext,
  property: SizeProperty,
): string | null => {
  const axis = AXIS_OF[property]
  const other = OTHER_AXIS[axis]
  const style = styleOf(node)

  if (style.aspectRatio !== undefined) {
    return (
      "the node has an `aspectRatio`, which derives its " +
      `\`${SIZE_ON[other]}\` from its \`${property}\` — so the change is not confined to one axis`
    )
  }
  if (isDefinite(style[MIN_ON[axis]]) || isDefinite(style[MAX_ON[axis]])) {
    return (
      `the node has a \`${MIN_ON[axis]}\`/\`${MAX_ON[axis]}\`, which clamps the driven value — what is on ` +
      "screen would stop following the animation"
    )
  }
  if (!sizeIsIndependentOfContent(node, other, rootIsContentSized)) {
    return (
      `the node's \`${SIZE_ON[other]}\` comes from its own content, so re-laying its subtree out at a new ` +
      `\`${property}\` would change the \`${SIZE_ON[other]}\` too and move every sibling after it`
    )
  }

  const parent = node.parent
  if (parent === null) {
    return "the node is a layout root, whose size is the rectangle GTK hands it rather than a style"
  }
  if (!sizeIsIndependentOfContent(parent, axis, rootIsContentSized)) {
    return rootIsContentSized
      ? `the container's \`${property}\` is derived from its children, up to an \`IntrinsicRoot\` that reports ` +
          "its content size to GTK — so a size change here really does reach the window's own size request"
      : `the container's \`${property}\` is derived from its children, so the node growing would grow the ` +
          "container and move everything around it"
  }

  if (isAbsolute(style)) {
    // Out of flow: no sibling can be shifted and the container's content size
    // does not include it, so the only question left is whether the node grows
    // from an origin that stays put.
    if (!isDefinite(style[START_EDGE[axis]])) {
      return (
        `the node is absolutely positioned with no \`${START_EDGE[axis]}\`, so it is anchored by its ` +
        `\`${END_EDGE[axis]}\` edge or by its static position and growing it MOVES it`
      )
    }
    return null
  }

  const container = styleOf(parent)
  if (axis === mainAxisOf(container)) {
    return (
      `\`${property}\` is the container's MAIN axis, so growing the node pushes every following sibling ` +
      "along — that is a layout pass over the container, which is what costs 71–509 µs"
    )
  }
  if ((container.flexWrap ?? "nowrap") !== "nowrap") {
    return (
      "the container wraps, so a change on its cross axis re-sizes the node's LINE and moves every line " +
      "after it"
    )
  }
  const align = resolvedAlign(style, container)
  if (align !== "flex-start" && align !== "stretch") {
    return (
      `the node's resolved cross-axis alignment is \`${align}\`, not \`flex-start\` or \`stretch\`, so it ` +
      "grows about its centre or its far edge and its own position moves with its size"
    )
  }
  return null
}

/** Whether `property` can be driven at frame rate on this node. */
export const canDriveSize = (
  context: DrivenSizeContext,
  property: SizeProperty,
): boolean => drivenSizeRefusal(context, property) === null
