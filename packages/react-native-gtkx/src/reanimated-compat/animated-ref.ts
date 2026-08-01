// `useAnimatedRef` and `measure`.
//
// Upstream's `measure()` is synchronous but may only be called INSIDE a
// worklet, because only the UI thread holds the current shadow tree. Here it
// is synchronous for a simpler reason — there is one thread, and the
// platform's own `measure()` already invokes its callback before returning.
// So it works from anywhere, which is strictly more permissive than upstream
// and needs no worklet.
//
// It still returns null before the first committed layout. That is not a
// shortcut: it is RN's contract, which the platform implements faithfully —
// a view whose rect has not been committed, or that is not in a window, has
// nothing true to report, and RN answers by not calling back rather than by
// inventing a number.
import { useState } from "react"
import type { MeasureHandle } from "../components/measure"

/**
 * A ref that is also callable, as upstream's is: React sets it through the
 * call, and `measure()` reads it back through a call with no argument.
 *
 * The no-argument read is this platform's own shape rather than upstream's.
 * Upstream's callback ref RETURNS the instance, which React 19 reads as a
 * callback-ref cleanup value and complains about; discriminating on the
 * argument keeps both callers working and keeps React quiet.
 */
export type AnimatedRef<T> = {
  (): T | null
  (instance: T | null): void
  current: T | null
}

export type MeasuredDimensions = {
  x: number
  y: number
  width: number
  height: number
  pageX: number
  pageY: number
}

// useState, not a lazily-filled useRef: the ref is READ during render (it is
// the hook's return value), and reading a ref during render is exactly what
// react-hooks/refs exists to stop. Upstream's own `useSharedValue` reaches
// for useState for the same reason.
export const useAnimatedRef = <T = MeasureHandle>(): AnimatedRef<T> => {
  const [animatedRef] = useState<AnimatedRef<T>>(() => {
    const handle = ((instance?: T | null) => {
      if (instance === undefined) {
        return handle.current
      }
      // Cleared on unmount (React passes null), unlike upstream, which keeps
      // the last instance forever. Measuring a widget that has been freed is
      // not a measurement worth having.
      handle.current = instance
      return undefined
    }) as AnimatedRef<T>
    handle.current = null
    return handle
  })
  return animatedRef
}

type Measurable = Partial<MeasureHandle>

/**
 * Reads a view's geometry: its own size, its position in its parent and its
 * position in the window. Returns null when the view is not mounted or its
 * layout has not been committed yet.
 */
export const measure = <T>(
  animatedRef: AnimatedRef<T> | { current: T | null } | null | undefined,
): MeasuredDimensions | null => {
  if (!animatedRef) {
    return null
  }
  const instance =
    typeof animatedRef === "function" ? animatedRef() : animatedRef.current
  const handle = instance as Measurable | null
  if (!handle || typeof handle.measure !== "function") {
    return null
  }
  let measured: MeasuredDimensions | null = null
  handle.measure((x, y, width, height, pageX, pageY) => {
    measured = { x, y, width, height, pageX, pageY }
  })
  return measured
}
