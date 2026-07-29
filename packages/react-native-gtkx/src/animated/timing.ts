// Animated.timing: duration-based easing toward toValue with RN defaults
// (duration 500 ms, easing inOut(ease)). delay waits out frames without
// touching the value; duration 0 jumps to toValue on the first frame past
// the delay.

import { Easing } from "./easing"
import { warnNativeDriverIgnored } from "./native-driver"
import type { CompositeAnimation, FrameScheduler, TimingConfig } from "./types"
import type { AnimatedValue } from "./value"
import { createValueAnimation } from "./value-animation"

const defaultEasing = Easing.inOut(Easing.ease)

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

  return createValueAnimation(scheduler, value, (startValue) => (elapsedMs) => {
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
  })
}
