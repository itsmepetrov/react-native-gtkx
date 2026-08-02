// Public contracts of the Animated module. The module is pure: no bridge or
// gtkx imports, no timers, no Date — time only ever arrives through the
// injected FrameScheduler, so the GTK frame clock (production) and a manual
// test driver are interchangeable.

import type { EasingFunction } from "./easing"

// Frame driver injected by the host (GTK frame clock in production, a manual
// scheduler in tests). schedule() books a one-shot callback for the next
// frame — re-book from inside the callback to keep ticking — and returns an
// unsubscribe that cancels the pending callback.
//
// `now()` reads the SAME clock the frame callback is stamped with, off-frame.
// It is what lets an animation anchor t = 0 to the moment it was started
// rather than to the first frame that happens to arrive — see
// value-animation.ts, which explains why that distinction is worth a method.
// Optional so a driver that only has frame stamps still satisfies the type.
export type FrameScheduler = {
  schedule(cb: (timeMs: number) => void): () => void
  now?(): number
}

export type EndResult = { finished: boolean }

export type EndCallback = (result: EndResult) => void

// RN CompositeAnimation subset, plus reset() which loop() relies on to snap
// values back before each iteration (RN has it too).
export type CompositeAnimation = {
  start(callback?: EndCallback): void
  stop(): void
  reset(): void
}

export type ValueListener = (event: { value: number }) => void

export type InterpolationListener = (event: { value: number | string }) => void

export type ExtrapolateType = "extend" | "clamp" | "identity"

export type InterpolationConfig = {
  inputRange: number[]
  outputRange: number[] | string[]
  // Applied to both sides of the input range (RN's extrapolateLeft/Right are
  // not split out in this subset). Default: "extend".
  extrapolate?: ExtrapolateType
}

export type TimingConfig = {
  toValue: number
  duration?: number
  delay?: number
  easing?: EasingFunction
  // Accepted for RN source compatibility; the GTK backend has no native
  // driver (everything already runs on the direct frame-clock path), so the
  // flag is ignored with a single dev warning per session.
  useNativeDriver?: boolean
}

export type SpringConfig = {
  toValue: number
  stiffness?: number
  damping?: number
  mass?: number
  initialVelocity?: number
  overshootClamping?: boolean
  restDisplacementThreshold?: number
  restSpeedThreshold?: number
  delay?: number
  useNativeDriver?: boolean
}

export type ParallelConfig = {
  // Like RN: when one child ends unfinished, stop the remaining ones too.
  // Default: true.
  stopTogether?: boolean
}

export type LoopConfig = {
  // -1 (default) loops forever.
  iterations?: number
  // Snap the child animation back to its starting value before every
  // iteration (RN default: true).
  resetBeforeIteration?: boolean
}
