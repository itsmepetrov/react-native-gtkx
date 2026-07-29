// Animated.timing: duration-based easing toward toValue with RN defaults
// (duration 500 ms, easing inOut(ease)). delay waits out frames without
// touching the value; duration 0 jumps to toValue on the first frame past
// the delay.

import { Easing } from "./easing.js"
import { warnNativeDriverIgnored } from "./native-driver.js"
import type {
  CompositeAnimation,
  FrameScheduler,
  TimingConfig,
} from "./types.js"
import { createValueAnimation } from "./value-animation.js"
import type { AnimatedValue } from "./value.js"

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
