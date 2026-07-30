import type { Rect } from "../contracts"
import { LayoutNode } from "./node"
import { Direction } from "./yoga"

export type ViewportSize = { width: number; height: number }

// One engine per window root. Batches every mutation (style, tree, measure
// invalidation) into a single Yoga pass per microtask, then walks the shadow
// tree, diffs rects and fires commit (widget move) + onLayout callbacks only
// for nodes whose rect actually changed.
export class LayoutEngine {
  readonly root: LayoutNode

  private viewport: ViewportSize
  private dirty = false
  private scheduled = false
  private disposed = false

  constructor(viewport: ViewportSize) {
    this.viewport = viewport
    this.root = new LayoutNode(this.requestFlush)
  }

  createNode(): LayoutNode {
    return new LayoutNode(this.requestFlush)
  }

  setViewport(viewport: ViewportSize): void {
    if (
      viewport.width === this.viewport.width &&
      viewport.height === this.viewport.height
    ) {
      return
    }
    this.viewport = viewport
    this.requestFlush()
  }

  getViewport(): ViewportSize {
    return this.viewport
  }

  // Synchronous pass — used by tests and by resize handling when the caller
  // needs rects immediately after a mutation.
  flushSync(): void {
    if (!this.dirty || this.disposed) {
      return
    }
    this.dirty = false
    this.root.yoga.calculateLayout(
      this.viewport.width,
      this.viewport.height,
      Direction.LTR,
    )
    this.commitTree(this.root)
  }

  // Intrinsic content size for measure vfuncs: lays the tree out WITHOUT
  // committing widget rects (GTK forbids allocation during measure) and
  // leaves the engine dirty so the next allocate-time flush recomputes
  // against the real viewport instead of these speculative constraints.
  measureContent(
    orientation: "horizontal" | "vertical",
    forSize: number,
  ): number {
    if (this.disposed) {
      return 0
    }
    const width =
      orientation === "vertical" && forSize > 0 ? forSize : undefined
    this.root.yoga.calculateLayout(width, undefined, Direction.LTR)
    const size =
      orientation === "horizontal"
        ? this.root.yoga.getComputedWidth()
        : this.root.yoga.getComputedHeight()
    this.dirty = true
    return Math.ceil(size)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.freeTree(this.root)
  }

  private requestFlush = (): void => {
    this.dirty = true
    if (this.scheduled || this.disposed) {
      return
    }
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      this.flushSync()
    })
  }

  // Pre-order walk: parents commit before children so a child is always
  // positioned inside an already-sized container.
  private commitTree(node: LayoutNode): void {
    const entries: Array<{ node: LayoutNode; rect: Rect; changed: boolean }> =
      []
    this.collectChanges(node, entries)
    for (const entry of entries) {
      entry.node.notifyCommit(entry.rect)
    }
    // onLayout fires after the whole pass is committed, like React Native.
    for (const entry of entries) {
      if (entry.changed) {
        entry.node.notifyLayout(entry.rect)
      }
    }
  }

  private collectChanges(
    node: LayoutNode,
    out: Array<{ node: LayoutNode; rect: Rect; changed: boolean }>,
  ): void {
    const change = node.collectChange()
    if (change !== null) {
      out.push({ node, rect: change.rect, changed: change.changed })
    }
    for (const child of node.children) {
      this.collectChanges(child, out)
    }
  }

  private freeTree(node: LayoutNode): void {
    for (const child of [...node.children]) {
      this.freeTree(child)
    }
    node.free()
  }
}
