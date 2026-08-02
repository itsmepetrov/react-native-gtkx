// The pinned subtree pass: Yoga rooted at the ANIMATED NODE rather than at the
// tree's root.
//
// A layout write normally costs what the CONTAINER costs, and the shape of
// that cost is why animated layout is refused here at all: 52 / 133 / 496 µs
// at 5 / 60 / 300 children, of which the biggest single line is not Yoga
// (137 µs) but the engine's incremental COMMIT WALK (320 µs), which visits
// every child the container re-solved even when 299 of 300 rects came back
// identical (docs/research/animated-size.md §3).
//
// This pass pays neither. It pins the node's own size to the driven value,
// asks Yoga to lay out THAT node — its container, its siblings and its
// ancestors are never visited — and puts the style back, so the shadow tree is
// exactly as React left it and no engine flush is dirtied. Measured at 6.6 µs
// for a leaf and 23 µs for a node with wrapped text, FLAT at 5, 60 and 300
// siblings.
//
// It is only correct where the change is genuinely confined to the node, and
// that question is answered by ../style/animated-size.ts, not here.
//
// Two details had to be got right or the pass silently diverges from a full
// one, and both were found by measuring rather than by reading:
//
//   - the available space is the OWNER's content box, not the node's own size.
//     Percentages inside the node — its own padding included — resolve against
//     the owner, so passing the node's size resolves `padding: "5%"` against
//     400 where a real pass resolves it against 800.
//   - pinning is what makes the pass resolve at all for a node whose size is
//     `auto` or a `flex`: without it Yoga re-derives the size from the content
//     and the driven value never lands.
import type { LayoutNode } from "./node"
import { Direction, Edge, Unit, type YogaNode, type YogaValue } from "./yoga"

export type DrivenSize = {
  width?: number
  height?: number
}

/** The content box of the node's owner: what percentages inside it resolve against. */
const ownerContentBox = (
  node: LayoutNode,
): { width: number; height: number } => {
  const parent = node.parent
  if (!parent) {
    return {
      width: node.yoga.getComputedWidth(),
      height: node.yoga.getComputedHeight(),
    }
  }
  const owner = parent.yoga
  return {
    width:
      owner.getComputedWidth() -
      owner.getComputedPadding(Edge.Left) -
      owner.getComputedPadding(Edge.Right),
    height:
      owner.getComputedHeight() -
      owner.getComputedPadding(Edge.Top) -
      owner.getComputedPadding(Edge.Bottom),
  }
}

const restore = (
  saved: YogaValue,
  set: {
    point: (value: number) => void
    percent: (value: number) => void
    auto: () => void
    reset: () => void
  },
): void => {
  if (saved.unit === Unit.Point) {
    set.point(saved.value)
  } else if (saved.unit === Unit.Percent) {
    set.percent(saved.value)
  } else if (saved.unit === Unit.Auto) {
    set.auto()
  } else {
    set.reset()
  }
}

/**
 * Lays `node`'s own subtree out at `size`, leaving the computed values on the
 * Yoga nodes for a caller to read. The node's STYLE is restored before this
 * returns — computed values survive it, so the driven layout is readable while
 * the shadow tree is untouched.
 */
export const layoutSubtreeAtSize = (
  node: LayoutNode,
  size: DrivenSize,
): void => {
  const yoga: YogaNode = node.yoga
  const owner = ownerContentBox(node)
  const savedWidth = yoga.getWidth()
  const savedHeight = yoga.getHeight()
  if (size.width !== undefined) {
    yoga.setWidth(size.width)
  }
  if (size.height !== undefined) {
    yoga.setHeight(size.height)
  }
  yoga.calculateLayout(owner.width, owner.height, Direction.LTR)
  if (size.width !== undefined) {
    restore(savedWidth, {
      point: (value) => yoga.setWidth(value),
      percent: (value) => yoga.setWidthPercent(value),
      auto: () => yoga.setWidthAuto(),
      reset: () => yoga.setWidthAuto(),
    })
  }
  if (size.height !== undefined) {
    restore(savedHeight, {
      point: (value) => yoga.setHeight(value),
      percent: (value) => yoga.setHeightPercent(value),
      auto: () => yoga.setHeightAuto(),
      reset: () => yoga.setHeightAuto(),
    })
  }
}
