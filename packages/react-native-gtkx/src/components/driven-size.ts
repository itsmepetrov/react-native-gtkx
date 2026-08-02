// The write half of an animated size: one pinned Yoga pass over the animated
// node's own subtree, its results into the rect store as OVERRIDES, and one
// queued allocation on the parent. No engine flush, no commit walk, no
// `queueResize`, and nothing above the node is visited.
//
// Why the descendants are written too, and why that is not optional: a rect
// write alone — the node's own box and nothing else — is 0.9 µs and beautifully
// flat, and it is wrong. It makes the BOX the right size and leaves everything
// inside it on its old layout: a label stayed 100 px wide and three lines tall
// inside a 260 px box (docs/research/animated-size.md §5). Re-wrapping is what
// a size change MEANS, and it is the difference between this and a `scaleX`.
import { layoutSubtreeAtSize, type DrivenSize } from "../layout/driven-size"
import type { LayoutNode } from "../layout/node"
import { queueAllocate, type Gtk } from "../gtkx/bridge/index"
import {
  clearStoredDrivenBox,
  getStoredRect,
  setStoredDrivenBox,
} from "./rect-store"
import { nodeForWidget } from "./use-layout-child"

const writeSubtree = (
  node: LayoutNode,
  widget: Gtk.Widget,
  touched: Gtk.Widget[],
): void => {
  let child = widget.getFirstChild()
  while (child !== null) {
    const childNode = nodeForWidget(child)
    // Only this container's own layout children: a nested layout root belongs
    // to a different engine and lays itself out, and a raw GTK widget in a
    // slot has no node at all.
    if (
      childNode !== undefined &&
      childNode.parent === node &&
      getStoredRect(child) !== undefined
    ) {
      const yoga = childNode.yoga
      setStoredDrivenBox(child, {
        x: yoga.getComputedLeft(),
        y: yoga.getComputedTop(),
        width: yoga.getComputedWidth(),
        height: yoga.getComputedHeight(),
      })
      touched.push(child)
      writeSubtree(childNode, child, touched)
    }
    child = child.getNextSibling()
  }
}

/**
 * Drives `widget` to `size` and puts it on screen.
 *
 * `touched` is the caller's record of every widget currently carrying an
 * override, rewritten in place on each frame so that unbinding — or a React
 * render, which rebases onto a freshly committed layout — can hand every one
 * of them back to the engine.
 *
 * The node itself overrides ONLY the axis being driven. Its origin and its
 * other axis keep coming from the committed rect, which is both the claim of
 * the carve-out (neither moved) and what keeps a window resize mid-animation
 * from leaving the node behind at a stale position.
 *
 * The driven axis is read back OUT of Yoga rather than written straight
 * through, and that is not ceremony. Yoga floors a box at its own padding and
 * border, so a node with `padding: "10%"` driven below that floor is 80 px
 * wide in a real pass and would have been allocated 60 by a value written
 * straight through — a divergence the engine probe caught
 * (tests/unit/style/animated-size.test.ts). Asking Yoga what the size became
 * reproduces its arithmetic instead of re-deriving it here.
 */
export const applyDrivenSize = (
  node: LayoutNode,
  widget: Gtk.Widget,
  parentWidget: Gtk.Widget | null,
  size: DrivenSize,
  touched: Gtk.Widget[],
): void => {
  if (getStoredRect(widget) === undefined) {
    return
  }
  layoutSubtreeAtSize(node, size)
  releaseDrivenSize(touched)
  setStoredDrivenBox(widget, {
    x: null,
    y: null,
    width: size.width === undefined ? null : node.yoga.getComputedWidth(),
    height: size.height === undefined ? null : node.yoga.getComputedHeight(),
  })
  touched.push(widget)
  writeSubtree(node, widget, touched)
  if (parentWidget) {
    queueAllocate(parentWidget)
  }
}

/** Hands every driven widget back to whatever the engine last committed. */
export const releaseDrivenSize = (touched: Gtk.Widget[]): void => {
  for (const widget of touched) {
    clearStoredDrivenBox(widget)
  }
  touched.length = 0
}
