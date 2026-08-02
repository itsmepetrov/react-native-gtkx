// RN's imperative geometry API (measure / measureInWindow / measureLayout),
// shared by every component that exposes a ref.
//
// The size and the parent-relative position come from the Yoga rect the
// component's layout node already holds — that is the layout truth, and it
// is what RN reports (a rotated view still measures its own box, not its
// axis-aligned bounding box). Only the translation into another coordinate
// space goes through GTK, where compute_point walks the transform chain and
// therefore already accounts for scroll offsets.
//
// RN's contract on failure is to not call back rather than to invent a
// number: a view whose layout has not been committed yet (before the first
// onLayout) or that is not in a window has nothing true to report.
import type { RefObject } from "react"
import type { LayoutNodeApi } from "../contracts"
import {
  computePointIn,
  computePointInWindow,
  type Gtk,
} from "../gtkx/bridge/index"

export type MeasureOnSuccessCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number,
) => void

export type MeasureInWindowOnSuccessCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
) => void

export type MeasureLayoutOnSuccessCallback = (
  left: number,
  top: number,
  width: number,
  height: number,
) => void

/**
 * RN's opaque reference to a mounted host view — what `findNodeHandle`
 * returns and what `measureLayout` accepts as its first argument. A number,
 * as it is on every RN platform: the value crosses no boundary here, but the
 * libraries that ask for one compare it, store it in a map and hand it back,
 * and an object would only be a different type wearing the same name.
 */
export type NodeHandle = number

/** The measurement half of a component ref, matching RN's method set. */
export type MeasureHandle = {
  measure(callback: MeasureOnSuccessCallback): void
  measureInWindow(callback: MeasureInWindowOnSuccessCallback): void
  measureLayout(
    relativeTo: MeasureHandle | NodeHandle,
    onSuccess: MeasureLayoutOnSuccessCallback,
    onFail?: () => void,
  ): void
}

// measureLayout needs the OTHER view's widget, and the public handle type
// deliberately does not carry one — a portable API should not hand out a
// Gtk.Widget. The lookup lives here instead, keyed by the handle identity.
//
// It is also the seam every animated component reaches through: driving
// `opacity` and `transform` imperatively needs the widget behind a ref, and
// this map already holds exactly that association for every component that
// exposes a handle. Widening it beats adding a second, parallel registry.
const widgetOf = new WeakMap<object, () => Gtk.Widget | null>()

/**
 * @internal Registers `handle` as standing for `widgetRef`'s widget.
 *
 * `createMeasureHandle` does this for the handles it builds; components that
 * COMPOSE one into a larger handle (ScrollView adds `scrollTo`/`scrollToEnd`)
 * create a new object, which is a new identity and therefore needs its own
 * entry — otherwise `measureLayout(scrollViewRef, …)` silently fails.
 */
export const registerHandleWidget = (
  handle: object,
  widgetRef: RefObject<Gtk.Widget | null>,
): void => {
  widgetOf.set(handle, () => widgetRef.current)
}

/**
 * @internal The `Gtk.Widget` behind a component handle, or null when the
 * value is not a handle at all (a component that forwards no ref, or one
 * whose ref is something else entirely).
 *
 * Deliberately not exported from the package: a portable API does not hand
 * out widgets. This is how `createAnimatedComponent` reaches the widget it
 * has to write opacity and transforms to.
 */
export const widgetForHandle = (handle: unknown): Gtk.Widget | null => {
  if (handle === null || typeof handle !== "object") {
    return null
  }
  return widgetOf.get(handle)?.() ?? null
}

// --- node handles --------------------------------------------------------
//
// RN's `findNodeHandle` hands out an integer that stands for a mounted host
// VIEW. On a bridge platform the integer is the native view tag and the
// number is the only thing that can cross; here nothing has to cross, so the
// number is minted on demand and means exactly one thing — "the widget it
// was minted for".
//
// Keyed by the WIDGET rather than by the handle object, which is what makes
// it behave like RN's: two refs onto the same view report the same tag, and
// the tag survives a re-render that rebuilt the handle object. It is also why
// this is not a second registry — `widgetOf` above is still the only thing
// that knows what a handle stands for, and a tag is minted from its answer.
//
// A widget that is gone leaves a tag that resolves to null, which is what a
// stale RN tag does too.
const tagOfWidget = new WeakMap<Gtk.Widget, NodeHandle>()
const widgetOfTag = new Map<NodeHandle, WeakRef<Gtk.Widget>>()
let nextTag = 1

/**
 * @internal Registers `handle` as standing for whatever widget `other`
 * stands for.
 *
 * For a COMPOSITE that renders a host component and wants to be reachable as
 * that host: a windowed list owns no widget of its own, but the ScrollView it
 * renders is the thing another view measures against and the thing
 * `findNodeHandle` should answer with. RN resolves a `FlatList`'s node handle
 * through to its inner scroll view for the same reason.
 *
 * It deliberately does NOT give the composite `measure()`/`measureInWindow()`
 * — see the note on `VirtualizedListHandle`. Being measurable AGAINST is a
 * weaker claim than reporting your own geometry.
 */
export const registerHandleAlias = (
  handle: object,
  other: () => unknown,
): void => {
  widgetOf.set(handle, () => widgetForHandle(other()))
}

/**
 * @internal The tag standing for the widget behind `handle`, minted on first
 * ask. Null when the value is not a component handle, or when its widget is
 * not mounted — RN returns null in both cases too.
 */
export const nodeHandleFor = (handle: unknown): NodeHandle | null => {
  const widget = widgetForHandle(handle)
  if (widget === null) {
    return null
  }
  const existing = tagOfWidget.get(widget)
  if (existing !== undefined) {
    return existing
  }
  const tag = nextTag
  nextTag += 1
  tagOfWidget.set(widget, tag)
  widgetOfTag.set(tag, new WeakRef(widget))
  return tag
}

/** @internal The widget a tag was minted for, or null once it is gone. */
export const widgetForNodeHandle = (tag: NodeHandle): Gtk.Widget | null => {
  const widget = widgetOfTag.get(tag)?.deref() ?? null
  if (widget === null) {
    widgetOfTag.delete(tag)
  }
  return widget
}

/** The widget behind either spelling of "that other view" that RN accepts. */
const widgetForTarget = (
  target: MeasureHandle | NodeHandle,
): Gtk.Widget | null =>
  typeof target === "number"
    ? widgetForNodeHandle(target)
    : widgetForHandle(target)

export const createMeasureHandle = (
  widgetRef: RefObject<Gtk.Widget | null>,
  node: LayoutNodeApi,
): MeasureHandle => {
  const handle: MeasureHandle = {
    measure(callback) {
      const widget = widgetRef.current
      const rect = node.getRect()
      if (!widget || !rect) {
        return
      }
      const page = computePointInWindow(widget, 0, 0)
      if (!page) {
        return
      }
      callback(rect.x, rect.y, rect.width, rect.height, page.x, page.y)
    },

    measureInWindow(callback) {
      const widget = widgetRef.current
      const rect = node.getRect()
      if (!widget || !rect) {
        return
      }
      const page = computePointInWindow(widget, 0, 0)
      if (!page) {
        return
      }
      callback(page.x, page.y, rect.width, rect.height)
    },

    measureLayout(relativeTo, onSuccess, onFail) {
      const widget = widgetRef.current
      const other = widgetForTarget(relativeTo)
      const rect = node.getRect()
      if (!widget || !other || !rect) {
        onFail?.()
        return
      }
      const origin = computePointIn(widget, other, 0, 0)
      if (!origin) {
        onFail?.()
        return
      }
      onSuccess(origin.x, origin.y, rect.width, rect.height)
    },
  }

  registerHandleWidget(handle, widgetRef)
  return handle
}
