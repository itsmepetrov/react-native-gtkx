// Animated.spring: analytic damped harmonic oscillator — the same closed-form
// solution RN uses — evaluated from the elapsed time the frame scheduler
// reports, so the trajectory is deterministic for any frame cadence. The run
// completes when both velocity and displacement fall under the rest
// thresholds (or as soon as overshootClamping trips), then snaps exactly to
// toValue.

import { warnNativeDriverIgnored } from "./native-driver"
import type { CompositeAnimation, FrameScheduler, SpringConfig } from "./types"
import type { AnimatedValue } from "./value"
import type { MakeStep } from "./value-animation"
import { createValueAnimation } from "./value-animation"

/**
 * The pure per-frame math, with no `AnimatedValue` or scheduler attached —
 * exported for the same reason `timingStep` is (see timing.ts): a caller
 * animating one leaf of an object/array target needs this exact solver, not
 * a re-derivation of it, and needs it without a single number driver
 * attached. `createSpring` below is a thin wrapper over this and
 * `createValueAnimation`.
 */
export const springStep = (config: SpringConfig): MakeStep => {
  const { toValue, delay = 0 } = config
  const stiffness = config.stiffness ?? 100
  const damping = config.damping ?? 10
  const mass = config.mass ?? 1
  const initialVelocity = config.initialVelocity ?? 0
  const overshootClamping = config.overshootClamping ?? false
  const restDisplacementThreshold = config.restDisplacementThreshold ?? 0.001
  const restSpeedThreshold = config.restSpeedThreshold ?? 0.001
  if (stiffness <= 0 || damping <= 0 || mass <= 0) {
    throw new Error(
      "Animated.spring: stiffness, damping and mass must be positive",
    )
  }

  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const omega0 = Math.sqrt(stiffness / mass) // undamped frequency, rad/s
  const omega1 = omega0 * Math.sqrt(Math.abs(1 - zeta * zeta))

  return (startValue) => {
    const x0 = toValue - startValue
    const v0 = -initialVelocity
    return (elapsedMs) => {
      const t = (elapsedMs - delay) / 1000
      if (t < 0) {
        return { position: null, done: false }
      }

      let position: number
      let velocity: number
      if (zeta < 1) {
        // Underdamped oscillation.
        const envelope = Math.exp(-zeta * omega0 * t)
        const sin = Math.sin(omega1 * t)
        const cos = Math.cos(omega1 * t)
        const a2 = (v0 + zeta * omega0 * x0) / omega1
        position = toValue - envelope * (a2 * sin + x0 * cos)
        velocity =
          zeta * omega0 * envelope * (a2 * sin + x0 * cos) -
          envelope * (cos * (v0 + zeta * omega0 * x0) - omega1 * x0 * sin)
      } else {
        // Critically damped (RN applies the same formula when overdamped).
        const envelope = Math.exp(-omega0 * t)
        position = toValue - envelope * (x0 + (v0 + omega0 * x0) * t)
        velocity = envelope * (v0 * (t * omega0 - 1) + t * x0 * omega0 * omega0)
      }

      // Checked before publishing, so a clamped spring never reports a value
      // past its target.
      const overshooting =
        overshootClamping &&
        (startValue < toValue ? position > toValue : position < toValue)
      const atRest =
        Math.abs(velocity) <= restSpeedThreshold &&
        Math.abs(toValue - position) <= restDisplacementThreshold
      if (overshooting || atRest) {
        return { position: toValue, done: true }
      }
      return { position, done: false }
    }
  }
}

export const createSpring = (
  scheduler: FrameScheduler,
  value: AnimatedValue,
  config: SpringConfig,
): CompositeAnimation => {
  // Built before the native-driver check, so an invalid config still throws
  // first — exactly the order this had before the math moved into springStep.
  const step = springStep(config)
  if (config.useNativeDriver) {
    warnNativeDriverIgnored()
  }
  return createValueAnimation(scheduler, value, step)
}
