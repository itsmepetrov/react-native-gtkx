// RN's touch payload. One shape, shared by Pressable today and by the touch
// and responder props when they land — in RN a single native touch stream
// feeds both, and splitting it here would guarantee the two drift.
//
// Two details that look cosmetic and are not:
//
// - `timestamp` must be monotonic and finer than a millisecond tick.
//   PanResponder and TouchHistoryMath compute velocity by differencing it,
//   so a coarse clock makes consecutive frames compare equal and silently
//   reports ZERO movement. That is the standing diagnosis for
//   react-native-windows' New-Architecture PanResponder bug (#14119, open
//   since 2024-11): Date.now() granularity, not a logic error.
// - `pageX/pageY` and `locationX/locationY` are different spaces (window vs
//   target-relative) and code in the wild reads both. Reporting one twice
//   is the kind of bug that only shows up once something is nested.
import type { Gtk } from "../gtkx/bridge/index"
import { computePointInWindow } from "../gtkx/bridge/index"

/** One touch point, in RN's shape. */
export type NativeTouch = {
  // A desktop pointer is a single fabricated touch: RN's own event plugin
  // has always had a mouse path, and react-native-web documents converting
  // mouse events into one emulated touch. Real multitouch will hand out the
  // GdkEventSequence's own identity here.
  identifier: number
  // Stable per-widget id; RN's is a React node handle, which we have no
  // equivalent of. Null before the widget exists.
  target: number | null
  // Relative to the target view.
  locationX: number
  locationY: number
  // Relative to the window ("page" in RN's vocabulary).
  pageX: number
  pageY: number
  timestamp: number
  // No pressure-sensitive input plumbed yet; RN reports 0 for devices
  // without it, which is exactly what a mouse is.
  force: number
}

export type PressEvent = {
  nativeEvent: NativeTouch & {
    touches: readonly NativeTouch[]
    changedTouches: readonly NativeTouch[]
  }
}

// performance.now() is monotonic and sub-millisecond — see the note above.
export const touchTimestamp = (): number => performance.now()

let nextTargetId = 1
const targetIds = new WeakMap<object, number>()

/** A stable numeric id for a widget, standing in for RN's node handle. */
export const targetIdOf = (widget: object | null): number | null => {
  if (!widget) {
    return null
  }
  const existing = targetIds.get(widget)
  if (existing !== undefined) {
    return existing
  }
  const id = nextTargetId
  nextTargetId += 1
  targetIds.set(widget, id)
  return id
}

/**
 * Builds a touch from coordinates in the target widget's own space — which
 * is what every GTK gesture reports.
 */
export const createTouch = (
  widget: Gtk.Widget | null,
  locationX: number,
  locationY: number,
  identifier = 0,
): NativeTouch => {
  const page = widget
    ? computePointInWindow(widget, locationX, locationY)
    : null
  return {
    identifier,
    target: targetIdOf(widget),
    locationX,
    locationY,
    // A widget outside a window has no page space; falling back to the
    // local point keeps the fields numeric without pretending to a
    // translation that does not exist.
    pageX: page?.x ?? locationX,
    pageY: page?.y ?? locationY,
    timestamp: touchTimestamp(),
    force: 0,
  }
}

/** Wraps a single touch as a complete RN press event. */
export const createPressEvent = (touch: NativeTouch): PressEvent => ({
  nativeEvent: { ...touch, touches: [touch], changedTouches: [touch] },
})
