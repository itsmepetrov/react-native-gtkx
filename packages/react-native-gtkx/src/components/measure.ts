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

/** The measurement half of a component ref, matching RN's method set. */
export type MeasureHandle = {
  measure(callback: MeasureOnSuccessCallback): void
  measureInWindow(callback: MeasureInWindowOnSuccessCallback): void
  measureLayout(
    relativeTo: MeasureHandle,
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
      const other = widgetOf.get(relativeTo)?.() ?? null
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
