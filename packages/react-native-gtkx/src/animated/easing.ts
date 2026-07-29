// RN-compatible Easing subset. Every base function maps progress t in [0, 1]
// to a gain; in/out/inOut are modifiers over any base function, as in RN.

export type EasingFunction = (t: number) => number

// Cubic bezier solver — the same approach as the bezier-easing package RN
// embeds: a coarse sample table brackets the parameter, Newton-Raphson
// refines it, and binary subdivision is the fallback where the curve is too
// flat for Newton to be reliable.
const SPLINE_TABLE_SIZE = 11
const SAMPLE_STEP = 1 / (SPLINE_TABLE_SIZE - 1)
const NEWTON_ITERATIONS = 4
const NEWTON_MIN_SLOPE = 0.001
const SUBDIVISION_PRECISION = 1e-7
const SUBDIVISION_MAX_ITERATIONS = 10

const coeffA = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1
const coeffB = (a1: number, a2: number) => 3 * a2 - 6 * a1
const coeffC = (a1: number) => 3 * a1

const calcBezier = (t: number, a1: number, a2: number) =>
  ((coeffA(a1, a2) * t + coeffB(a1, a2)) * t + coeffC(a1)) * t

const getSlope = (t: number, a1: number, a2: number) =>
  3 * coeffA(a1, a2) * t * t + 2 * coeffB(a1, a2) * t + coeffC(a1)

const bezier = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EasingFunction => {
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new Error("Easing.bezier: x1 and x2 must be in the [0, 1] range")
  }
  if (x1 === y1 && x2 === y2) {
    return (t) => t
  }

  const samples = new Float64Array(SPLINE_TABLE_SIZE)
  for (let i = 0; i < SPLINE_TABLE_SIZE; i++) {
    samples[i] = calcBezier(i * SAMPLE_STEP, x1, x2)
  }

  const getTForX = (x: number): number => {
    let intervalStart = 0
    let currentSample = 1
    for (
      ;
      currentSample < SPLINE_TABLE_SIZE - 1 && samples[currentSample]! <= x;
      currentSample++
    ) {
      intervalStart += SAMPLE_STEP
    }
    currentSample--

    const dist =
      (x - samples[currentSample]!) /
      (samples[currentSample + 1]! - samples[currentSample]!)
    let guess = intervalStart + dist * SAMPLE_STEP

    const initialSlope = getSlope(guess, x1, x2)
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      for (let i = 0; i < NEWTON_ITERATIONS; i++) {
        const slope = getSlope(guess, x1, x2)
        if (slope === 0) {
          return guess
        }
        guess -= (calcBezier(guess, x1, x2) - x) / slope
      }
      return guess
    }
    if (initialSlope === 0) {
      return guess
    }

    let lower = intervalStart
    let upper = intervalStart + SAMPLE_STEP
    let t = guess
    for (let i = 0; i < SUBDIVISION_MAX_ITERATIONS; i++) {
      t = lower + (upper - lower) / 2
      const error = calcBezier(t, x1, x2) - x
      if (Math.abs(error) <= SUBDIVISION_PRECISION) {
        break
      }
      if (error > 0) {
        upper = t
      } else {
        lower = t
      }
    }
    return t
  }

  return (t) => {
    if (t <= 0) {
      return 0
    }
    if (t >= 1) {
      return 1
    }
    return calcBezier(getTForX(t), y1, y2)
  }
}

export const Easing = {
  linear: ((t) => t) as EasingFunction,
  ease: bezier(0.42, 0, 1, 1),
  quad: ((t) => t * t) as EasingFunction,
  cubic: ((t) => t * t * t) as EasingFunction,
  bezier,
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
