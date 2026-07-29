import type {
  LayoutNodeApi,
  LayoutStyle,
  MeasureFn,
  Rect,
} from "../contracts.js"
import { applyLayoutStyle, applyNodeDefaults } from "./apply-style.js"
import { createYogaNode, MEASURE_MODE, type YogaNode } from "./yoga.js"

type DirtyListener = () => void

let liveNodeCount = 0

// Number of not-yet-freed nodes; used by tests to detect leaks.
export const getLiveNodeCount = (): number => liveNodeCount

// Shadow-tree node: owns one Yoga node, mirrors the React component tree.
// Components talk to it through the LayoutNodeApi contract; the engine walks
// it after every layout pass to diff rects and notify commit/onLayout hooks.
export class LayoutNode implements LayoutNodeApi {
  readonly yoga: YogaNode
  parent: LayoutNode | null = null
  readonly children: LayoutNode[] = []

  private onDirty: DirtyListener
  private onLayoutCallback: ((rect: Rect) => void) | null = null
  private commitCallback: ((rect: Rect) => void) | null = null
  private lastRect: Rect | null = null
  private freed = false
  private hasMeasure = false
  private forceCommit = false

  constructor(onDirty: DirtyListener) {
    this.yoga = createYogaNode()
    applyNodeDefaults(this.yoga)
    this.onDirty = onDirty
    liveNodeCount += 1
  }

  setStyle(style: LayoutStyle): void {
    if (this.freed) {
      return
    }
    applyLayoutStyle(this.yoga, style)
    this.onDirty()
  }

  setMeasureFn(measure: MeasureFn | null): void {
    if (this.freed) {
      return
    }
    if (measure === null) {
      // Unsetting an absent measure func destroys a null wasm binding and
      // crashes yoga-wasm — track presence explicitly.
      if (this.hasMeasure) {
        this.yoga.unsetMeasureFunc()
        this.hasMeasure = false
      }
    } else {
      this.yoga.setMeasureFunc((width, widthMode, height, heightMode) =>
        measure(
          width,
          MEASURE_MODE[widthMode],
          height,
          MEASURE_MODE[heightMode],
        ),
      )
      this.hasMeasure = true
    }
    this.onDirty()
  }

  markDirty(): void {
    // Only measure-backed leaves may be marked dirty in Yoga.
    if (this.freed || !this.hasMeasure) {
      return
    }
    this.yoga.markDirty()
    // Re-measuring resets the widget size request; even an unchanged rect
    // must recommit so the request is re-applied.
    this.forceCommit = true
    this.onDirty()
  }

  getRect(): Rect | null {
    return this.lastRect
  }

  setOnLayout(callback: ((rect: Rect) => void) | null): void {
    this.onLayoutCallback = callback
  }

  // The commit hook is the write path to GTK: the component layer moves its
  // widget inside the parent GtkFixed when the engine reports a new rect.
  setCommit(callback: ((rect: Rect) => void) | null): void {
    this.commitCallback = callback
    // A late-registered commit hook must still receive the current rect.
    if (callback !== null && this.lastRect !== null) {
      callback(this.lastRect)
    }
  }

  insertChild(child: LayoutNode, index: number): void {
    if (this.freed || child.freed) {
      return
    }
    child.parent = this
    this.children.splice(index, 0, child)
    this.yoga.insertChild(child.yoga, index)
    this.onDirty()
  }

  removeChild(child: LayoutNode): void {
    const index = this.children.indexOf(child)
    if (index === -1) {
      return
    }
    this.children.splice(index, 1)
    child.parent = null
    // Touching the wasm node of a freed parent corrupts the emscripten heap.
    if (!this.freed && !child.freed) {
      this.yoga.removeChild(child.yoga)
      this.onDirty()
    }
  }

  // Reads the computed rect (parent-relative). Measured leaves always
  // recommit: any Yoga-invoked re-measure resets their widget size request,
  // and Yoga may re-measure without markDirty (constraint changes), so the
  // request must be re-applied after every pass. onLayout still fires only
  // on real changes.
  collectChange(): { rect: Rect; changed: boolean } | null {
    const rect: Rect = {
      x: this.yoga.getComputedLeft(),
      y: this.yoga.getComputedTop(),
      width: this.yoga.getComputedWidth(),
      height: this.yoga.getComputedHeight(),
    }
    const previous = this.lastRect
    const unchanged =
      previous !== null &&
      previous.x === rect.x &&
      previous.y === rect.y &&
      previous.width === rect.width &&
      previous.height === rect.height
    const changed = this.forceCommit || !unchanged
    this.forceCommit = false
    if (!changed && !this.hasMeasure) {
      return null
    }
    this.lastRect = rect
    return { rect, changed }
  }

  notifyCommit(rect: Rect): void {
    this.commitCallback?.(rect)
  }

  notifyLayout(rect: Rect): void {
    this.onLayoutCallback?.(rect)
  }

  free(): void {
    if (this.freed) {
      return
    }
    this.parent?.removeChild(this)
    // React unmounts parents before children (effect cleanup order), so a
    // container can be freed while its children are still linked — detach
    // them first or their own free() would touch freed wasm memory.
    for (const child of [...this.children]) {
      this.removeChild(child)
    }
    if (this.hasMeasure) {
      this.yoga.unsetMeasureFunc()
      this.hasMeasure = false
    }
    this.freed = true
    this.yoga.free()
    liveNodeCount -= 1
  }
}
