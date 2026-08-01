// Reanimated's Easing, which is NOT React Native's Easing and cannot be
// re-exported from `src/animated/easing.ts`:
//
//   - `Easing.bezier(...)` returns `{ factory }` here, a plain function in RN.
//     `withTiming` unwraps the factory; `Easing.bezierFn` is the RN-shaped
//     escape hatch. Re-exporting the platform's would make
//     `easing: Easing.bezier(.25,.1,.25,1)` a silently wrong easing rather
//     than an error.
//   - Reanimated ships `poly`, `sin`, `circle`, `exp`, `elastic`, `back`,
//     `bounce` and `steps`, none of which the platform's RN-faithful subset
//     has.
//
// The curve solver itself is shared: `Easing.bezier` in `src/animated` is the
// same sampled-Newton bezier the `bezier-easing` package implements and that
// both libraries embed, so this module borrows it rather than carrying a
// second copy.
import { Easing as PlatformEasing } from "../animated/index"

export type EasingFunction = (t: number) => number

/**
 * Reanimated wraps bezier curves in a factory so the (comparatively
 * expensive) sample table is built when the animation starts rather than when
 * the config object is written. `withTiming` accepts either shape.
 */
export type EasingFunctionFactory = { factory: () => EasingFunction }

const bezierSolver = PlatformEasing.bezier

const linear: EasingFunction = (t) => t

const ease: EasingFunction = bezierSolver(0.42, 0, 1, 1)

const quad: EasingFunction = (t) => t * t

const cubic: EasingFunction = (t) => t * t * t

const poly =
  (n: number): EasingFunction =>
  (t) =>
    Math.pow(t, n)

const sin: EasingFunction = (t) => 1 - Math.cos((t * Math.PI) / 2)

const circle: EasingFunction = (t) => 1 - Math.sqrt(1 - t * t)

const exp: EasingFunction = (t) => Math.pow(2, 10 * (t - 1))

const elastic = (bounciness = 1): EasingFunction => {
  const p = bounciness * Math.PI
  return (t) => 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * p)
}

const back =
  (s = 1.70158): EasingFunction =>
  (t) =>
    t * t * ((s + 1) * t - s)

const bounce: EasingFunction = (t) => {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t
  }
  if (t < 2 / 2.75) {
    const shifted = t - 1.5 / 2.75
    return 7.5625 * shifted * shifted + 0.75
  }
  if (t < 2.5 / 2.75) {
    const shifted = t - 2.25 / 2.75
    return 7.5625 * shifted * shifted + 0.9375
  }
  const shifted = t - 2.625 / 2.75
  return 7.5625 * shifted * shifted + 0.984375
}

const bezier = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EasingFunctionFactory => ({
  factory: () => bezierSolver(x1, y1, x2, y2),
})

const bezierFn = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EasingFunction => bezierSolver(x1, y1, x2, y2)

const steps =
  (n = 10, roundToNextStep = true): EasingFunction =>
  (t) => {
    const value = Math.min(Math.max(t, 0), 1) * n
    return roundToNextStep ? Math.ceil(value) / n : Math.floor(value) / n
  }

export const Easing = {
  linear,
  ease,
  quad,
  cubic,
  poly,
  sin,
  circle,
  exp,
  elastic,
  back,
  bounce,
  bezier,
  bezierFn,
  steps,
  in: (easing: EasingFunction): EasingFunction => easing,
  out:
    (easing: EasingFunction): EasingFunction =>
    (t) =>
      1 - easing(1 - t),
  inOut:
    (easing: EasingFunction): EasingFunction =>
    (t) =>
      t < 0.5 ? easing(t * 2) / 2 : 1 - easing((1 - t) * 2) / 2,
}

/** Accepts either shape `withTiming`'s `easing` config takes. */
export const resolveEasing = (
  easing: EasingFunction | EasingFunctionFactory,
): EasingFunction => (typeof easing === "function" ? easing : easing.factory())
