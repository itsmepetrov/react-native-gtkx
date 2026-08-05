// Animated.timing: duration-based easing toward toValue with RN defaults
// (duration 500 ms, easing inOut(ease)). delay waits out frames without
// touching the value; duration 0 jumps to toValue on the first frame past
// the delay.

import type { EasingFunction } from "./easing"
import { Easing } from "./easing"
import { warnNativeDriverIgnored } from "./native-driver"
import type { CompositeAnimation, FrameScheduler, TimingConfig } from "./types"
import type { AnimatedValue } from "./value"
import type { MakeStep } from "./value-animation"
import { createValueAnimation } from "./value-animation"

const defaultEasing = Easing.inOut(Easing.ease)

/**
 * The pure per-frame math, with no `AnimatedValue` or scheduler attached —
 * exported so a caller that needs the exact same curve without a single
 * number driver (reanimated-compat's object/array leaves, one `MakeStep` per
 * leaf) reuses it rather than re-deriving it. `createTiming` below is a thin
 * wrapper over this and `createValueAnimation`.
 */
export const timingStep =
  (
    toValue: number,
    duration: number,
    easing: EasingFunction,
    delay = 0,
  ): MakeStep =>
  (startValue) =>
  (elapsedMs) => {
    const t = elapsedMs - delay
    if (t < 0) {
      return { position: null, done: false }
    }
    if (duration <= 0 || t >= duration) {
      return { position: toValue, done: true }
    }
    return {
      position: startValue + easing(t / duration) * (toValue - startValue),
      done: false,
    }
  }

export const createTiming = (
  scheduler: FrameScheduler,
  value: AnimatedValue,
  config: TimingConfig,
): CompositeAnimation => {
  const { toValue, delay = 0 } = config
  const duration = config.duration ?? 500
  const easing = config.easing ?? defaultEasing
  if (config.useNativeDriver) {
    warnNativeDriverIgnored()
  }

  return createValueAnimation(
    scheduler,
    value,
    timingStep(toValue, duration, easing, delay),
  )
}
