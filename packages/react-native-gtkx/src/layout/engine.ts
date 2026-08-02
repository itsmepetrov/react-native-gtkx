import type { Rect } from "../contracts"
import {
  perfAddTime,
  perfBurst,
  perfCount,
  perfEnabled,
  perfGauge,
  perfNow,
} from "../perf"
import { getLiveNodeCount, LayoutNode } from "./node"
import { Direction } from "./yoga"

export type ViewportSize = { width: number; height: number }

// One engine per window root. Batches every mutation (style, tree, measure
// invalidation) into a single Yoga pass per microtask, then walks the shadow
// tree, diffs rects and fires commit (widget move) + onLayout callbacks only
// for nodes whose rect actually changed.
//
// The commit walk is INCREMENTAL: it descends only where this pass can have
// changed something, so a small mutation inside a large stable shell costs
// O(changed) instead of O(all nodes). Two signals drive the descent, and both
// are needed:
//   - Yoga's per-node `hasNewLayout` flag, which Yoga sets on every node it
//     actually laid out. It covers the nodes a dirty set cannot know about:
//     mutating one child re-lays out its FOLLOWING SIBLINGS (they shift) and
//     any ancestor whose size followed, while untouched subtrees keep their
//     cached layout — and their rects are parent-relative, so an unvisited
//     subtree of a moved container is genuinely unchanged.
//   - the engine's own dirty set (which node each mutation came from), which
//     covers commits Yoga's flag does not imply: a re-measured leaf whose rect
//     is identical still has to recommit, because measuring reset its widget
//     size request.
export type LayoutEngineOptions = {
  /**
   * Whether this root REPORTS its Yoga content size to GTK rather than
   * adopting a rectangle it is given — `IntrinsicRoot`, i.e. React Native
   * content mounted directly in a GTK chrome slot.
   *
   * The one thing that reads it is the animated-size rule
   * (../style/animated-size.ts): under a content-sized root every ancestor's
   * size is derived from its children all the way up to the toplevel's own
   * size request, which is the single configuration where a size write really
   * does resize the window (docs/research/animated-size.md §4). Under an
   * ordinary `Root` the climb ends at a viewport instead, and it cannot.
   */
  contentSized?: boolean
}

export class LayoutEngine {
  readonly root: LayoutNode

  readonly contentSized: boolean

  private viewport: ViewportSize
  private dirty = false
  private scheduled = false
  private disposed = false
  // Nodes mutated since the last flush (setStyle/insertChild/removeChild/
  // markDirty/setMeasureFn). Cleared by every flush.
  private dirtyNodes = new Set<LayoutNode>()
  // Set when the engine is dirtied by something that is not a single node —
  // a viewport change or a speculative measureContent pass, both of which can
  // move anything — and for the first flush, where nothing has a rect yet.
  private walkAll = true

  constructor(viewport: ViewportSize, options?: LayoutEngineOptions) {
    this.viewport = viewport
    this.contentSized = options?.contentSized ?? false
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
    this.walkAll = true
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
    const start = perfEnabled ? perfNow() : 0
    this.root.yoga.calculateLayout(
      this.viewport.width,
      this.viewport.height,
      Direction.LTR,
    )
    if (perfEnabled) {
      perfAddTime("engine.yoga", perfNow() - start)
    }
    this.commitTree(this.root)
    if (perfEnabled) {
      const elapsed = perfNow() - start
      perfAddTime("engine.flush", elapsed)
      perfBurst("engine.flushMsPerFrame", elapsed)
    }
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
    // Speculative constraints may have re-measured leaves anywhere in the
    // tree; the next real flush has to re-commit all of them.
    this.walkAll = true
    return Math.ceil(size)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.freeTree(this.root)
    this.dirtyNodes.clear()
  }

  private requestFlush = (node?: LayoutNode): void => {
    this.dirty = true
    if (node === undefined) {
      this.walkAll = true
    } else {
      this.dirtyNodes.add(node)
    }
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
    const walkAll = this.walkAll
    const visited = this.collectChanges(
      node,
      entries,
      walkAll,
      walkAll ? null : this.dirtyPath(),
    )
    // Mutations made by the callbacks below belong to the NEXT flush.
    this.walkAll = false
    this.dirtyNodes.clear()
    if (perfEnabled) {
      perfCount("engine.flushes")
      perfCount("engine.commits", entries.length)
      perfCount("engine.visited", visited)
      perfGauge("engine.nodes", getLiveNodeCount())
    }
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

  // Every dirty node plus its ancestors: the paths the walk must follow even
  // where Yoga reports no new layout. Nodes already detached from the root
  // (freed mid-tick) simply lead nowhere — the walk never reaches them.
  private dirtyPath(): Set<LayoutNode> {
    const path = new Set<LayoutNode>()
    for (const node of this.dirtyNodes) {
      let current: LayoutNode | null = node
      while (current !== null && !path.has(current)) {
        path.add(current)
        current = current.parent
      }
    }
    return path
  }

  // Returns the number of visited nodes (perf: the walk size per flush).
  private collectChanges(
    node: LayoutNode,
    out: Array<{ node: LayoutNode; rect: Rect; changed: boolean }>,
    walkAll: boolean,
    path: Set<LayoutNode> | null,
  ): number {
    const change = node.collectChange()
    if (change !== null) {
      out.push({ node, rect: change.rect, changed: change.changed })
    }
    // Consume the flag: only nodes Yoga lays out again will raise it anew.
    node.yoga.markLayoutSeen()
    let visited = 1
    for (const child of node.children) {
      if (
        walkAll ||
        child.yoga.hasNewLayout() ||
        (path !== null && path.has(child))
      ) {
        visited += this.collectChanges(child, out, walkAll, path)
      }
    }
    return visited
  }

  private freeTree(node: LayoutNode): void {
    for (const child of [...node.children]) {
      this.freeTree(child)
    }
    node.free()
  }
}
