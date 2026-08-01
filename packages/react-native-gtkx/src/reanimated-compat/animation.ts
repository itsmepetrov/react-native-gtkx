// `withTiming` / `withSpring` / `withDelay` / `withSequence` / `withRepeat`.
//
// Upstream types these as returning the animated type itself
// (`withTiming(100)` is a `number`), because what starts the animation is
// ASSIGNING the result to a shared value. The cast at each return mirrors
// that trick rather than inventing a different API — see `mutable.ts`, which
// recognises the descriptor in its setter.
//
// The descriptors are plain data. Turning one into a running animation is
// `buildAnimation`, and it builds on the platform's own `src/animated/`
// engine: same frame scheduler, same closed-form solvers, same preemption
// rules. This layer adds no clock.
//
// It does NOT reuse `Animated.timing`/`Animated.spring`'s DEFAULTS, and that
// distinction is load-bearing. Reanimated's defaults are materially
// different animations:
//
//   | config          | RN Animated              | Reanimated 4               |
//   | --------------- | ------------------------ | -------------------------- |
//   | timing duration | 500 ms                   | 300 ms                     |
//   | timing easing   | inOut(ease)              | inOut(quad)                |
//   | spring          | damping 10, mass 1, k 100 | damping 120, mass 4, k 900 |
//
// The spring row is not a tuning difference: RN's default has damping ratio
// 0.5 and visibly bounces, Reanimated 4's is exactly critically damped and
// does not. Every config below is therefore passed explicitly.
import type {
  AnimatedApi,
  AnimatedValue,
  CompositeAnimation,
} from "../animated/index"
import { Easing, resolveEasing, type EasingFunction } from "./easing"

/** Called when an animation settles or is cancelled, as upstream. */
export type AnimationCallback = (finished?: boolean, current?: number) => void

export type WithTimingConfig = {
  duration?: number
  easing?: EasingFunction | { factory: () => EasingFunction }
}

/**
 * Upstream's config is a mutually exclusive union: either the physical
 * parameterisation (`stiffness`/`damping`) or the perceptual one
 * (`duration`/`dampingRatio`). Both are accepted here and normalised into the
 * physical one, which is what the platform's spring solver takes.
 */
export type WithSpringConfig = {
  mass?: number
  stiffness?: number
  damping?: number
  duration?: number
  dampingRatio?: number
  clamp?: { min?: number; max?: number }
  velocity?: number
  overshootClamping?: boolean
  energyThreshold?: number
}

type TimingSpec = {
  kind: "timing"
  toValue: number
  config: WithTimingConfig
  callback?: AnimationCallback
}

type SpringSpec = {
  kind: "spring"
  toValue: number
  config: WithSpringConfig
  callback?: AnimationCallback
}

type DelaySpec = {
  kind: "delay"
  delayMs: number
  animation: AnimationSpec
}

type SequenceSpec = {
  kind: "sequence"
  animations: AnimationSpec[]
}

type RepeatSpec = {
  kind: "repeat"
  animation: AnimationSpec
  numberOfReps: number
  reverse: boolean
  callback?: AnimationCallback
}

export type AnimationSpec =
  TimingSpec | SpringSpec | DelaySpec | SequenceSpec | RepeatSpec

const MARKER = "__rnGtkxReanimatedAnimation"

type MarkedSpec = AnimationSpec & { [MARKER]: true }

const mark = (spec: AnimationSpec): MarkedSpec =>
  Object.assign(spec, { [MARKER]: true as const })

export const isAnimationSpec = (value: unknown): value is AnimationSpec =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>)[MARKER] === true

// Upstream's own defaults, quoted in the table at the top of this file.
const DEFAULT_TIMING_DURATION = 300
const defaultTimingEasing = Easing.inOut(Easing.quad)

// GentleSpringConfig + energyThreshold, react-native-reanimated 4.5.3
// (src/animation/spring/springConfigs.ts).
const DEFAULT_SPRING_MASS = 4
const DEFAULT_SPRING_STIFFNESS = 900
const DEFAULT_SPRING_DAMPING = 120
const DEFAULT_SPRING_DURATION = 550
const DEFAULT_SPRING_DAMPING_RATIO = 1
const DEFAULT_ENERGY_THRESHOLD = 6e-9

const assertAnimatable = (value: unknown, api: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `react-native-reanimated: ${api}() on this platform animates finite numbers only, got ${typeof value === "string" ? `"${value}"` : String(value)}. ` +
        "Colors and layout properties cannot be driven imperatively here yet — see docs/api.md.",
    )
  }
  return value
}

/**
 * Lets you animate a value over a duration with an easing curve. Assign the
 * result to a shared value to start it.
 */
export const withTiming = (
  toValue: number,
  config?: WithTimingConfig,
  callback?: AnimationCallback,
): number =>
  mark({
    kind: "timing",
    toValue: assertAnimatable(toValue, "withTiming"),
    config: config ?? {},
    callback,
  }) as unknown as number

/** Lets you animate a value with spring physics. */
export const withSpring = (
  toValue: number,
  config?: WithSpringConfig,
  callback?: AnimationCallback,
): number =>
  mark({
    kind: "spring",
    toValue: assertAnimatable(toValue, "withSpring"),
    config: config ?? {},
    callback,
  }) as unknown as number

/** Delays another animation by `delayMs`. */
export const withDelay = (delayMs: number, animation: number): number => {
  if (!isAnimationSpec(animation)) {
    throw new Error(
      "react-native-reanimated: withDelay() takes an animation, e.g. withDelay(500, withTiming(1))",
    )
  }
  return mark({
    kind: "delay",
    delayMs,
    animation,
  }) as unknown as number
}

/** Runs animations one after another on the same shared value. */
export const withSequence = (...animations: number[]): number => {
  const specs: AnimationSpec[] = []
  for (const animation of animations) {
    if (!isAnimationSpec(animation)) {
      throw new Error(
        "react-native-reanimated: withSequence() takes animations, e.g. withSequence(withTiming(1), withTiming(0))",
      )
    }
    specs.push(animation)
  }
  return mark({ kind: "sequence", animations: specs }) as unknown as number
}

/**
 * Repeats an animation. `numberOfReps <= 0` repeats forever; `reverse` plays
 * every other repetition backwards.
 */
export const withRepeat = (
  animation: number,
  numberOfReps = 2,
  reverse = false,
  callback?: AnimationCallback,
): number => {
  if (!isAnimationSpec(animation)) {
    throw new Error(
      "react-native-reanimated: withRepeat() takes an animation, e.g. withRepeat(withTiming(1), 3)",
    )
  }
  return mark({
    kind: "repeat",
    animation,
    numberOfReps,
    reverse,
    callback,
  }) as unknown as number
}

// --- spring config normalisation ----------------------------------------

const bisect = (
  min: number,
  max: number,
  fn: (x: number) => number,
  precision: number,
  maxIterations = 100,
): number => {
  let low = min
  let high = max
  const direction = fn(high) >= fn(low) ? 1 : -1
  let current = (low + high) / 2
  for (let i = 0; i < maxIterations && Math.abs(fn(current)) > precision; i++) {
    if (fn(current) * direction < 0) {
      low = current
    } else {
      high = current
    }
    current = (low + high) / 2
  }
  return current
}

const energyOf = (
  displacement: number,
  velocity: number,
  stiffness: number,
  mass: number,
): number => 0.5 * stiffness * displacement ** 2 + 0.5 * mass * velocity ** 2

/**
 * Solves for the stiffness whose settling time matches a requested perceptual
 * duration, by bisection on the fraction of the initial energy left after
 * 1.5 × that duration. Ported from upstream's
 * `calculateNewStiffnessToMatchDuration` — the perceptual-duration spring is
 * a Reanimated concept with no RN equivalent, so there is nothing on the
 * platform side to reuse.
 */
const stiffnessForDuration = (
  x0: number,
  v0: number,
  durationMs: number,
  dampingRatio: number,
  mass: number,
  energyThreshold: number,
): number => {
  const PERCEPTUAL_COEFFICIENT = 1.5
  const settlingSeconds = (durationMs * PERCEPTUAL_COEFFICIENT) / 1000
  const initialEnergyFor = (stiffness: number): number =>
    energyOf(x0, v0, stiffness, mass)

  const energyFractionLeft = (stiffness: number): number => {
    const decay = Math.sqrt(stiffness / mass) * dampingRatio
    const envelope = Math.exp(-decay * settlingSeconds)
    const displacement = (x0 + (v0 + x0 * decay) * settlingSeconds) * envelope
    const velocity = displacement * -decay + (v0 + x0 * decay) * envelope
    const initial = initialEnergyFor(stiffness)
    if (initial === 0) {
      return -energyThreshold
    }
    return (
      energyOf(displacement, velocity, stiffness, mass) / initial -
      energyThreshold
    )
  }

  return bisect(
    Number.EPSILON,
    // Upstream's bound: even an 8 ms spring stays under 2e3, with margin.
    8e3,
    energyFractionLeft,
    energyThreshold * 1e-3,
  )
}

/**
 * Keeps the overshoot inside `clamp` by raising the damping ratio, using
 * upstream's approximation: the first two extrema of a damped oscillation sit
 * at `exp(-zeta * PI)` and `exp(-zeta * 2 * PI)` of the initial displacement,
 * so the zeta that puts them on the bound is a logarithm away.
 */
const zetaForClamp = (
  zeta: number,
  startDisplacement: number,
  toValue: number,
  clamp: { min?: number; max?: number },
): number => {
  if (startDisplacement === 0) {
    return zeta
  }
  const [firstBound, secondBound] =
    startDisplacement <= 0 ? [clamp.min, clamp.max] : [clamp.max, clamp.min]
  const candidates = [zeta]
  if (secondBound !== undefined) {
    const extremum = Math.abs((secondBound - toValue) / startDisplacement)
    candidates.push(Math.abs(Math.log(extremum) / Math.PI))
  }
  if (firstBound !== undefined) {
    const extremum = Math.abs((firstBound - toValue) / startDisplacement)
    candidates.push(Math.abs(Math.log(extremum) / (2 * Math.PI)))
  }
  // Bigger zeta means smaller bounces, so the strictest candidate wins.
  return Math.max(...candidates)
}

type PlatformSpringConfig = {
  toValue: number
  mass: number
  stiffness: number
  damping: number
  initialVelocity: number
  overshootClamping: boolean
  restDisplacementThreshold: number
  restSpeedThreshold: number
}

/**
 * Turns a Reanimated spring config into the platform solver's config.
 *
 * The rest condition is the one place the two genuinely differ. Upstream
 * stops when the oscillator's remaining energy falls to `energyThreshold` of
 * its initial energy — a RELATIVE criterion; the platform's solver stops on
 * absolute displacement and speed thresholds. Rather than accept RN's
 * absolute defaults (which would end a 400px spring at a different point than
 * a 4px one), the thresholds are derived per animation from the same energy
 * budget, so the stopping point tracks upstream's to well under a pixel.
 */
export const toPlatformSpringConfig = (
  config: WithSpringConfig,
  toValue: number,
  from: number,
): PlatformSpringConfig => {
  const mass = config.mass ?? DEFAULT_SPRING_MASS
  const velocity = config.velocity ?? 0
  const energyThreshold = config.energyThreshold ?? DEFAULT_ENERGY_THRESHOLD
  const useDuration =
    config.duration !== undefined || config.dampingRatio !== undefined

  const displacement = from - toValue

  let stiffness: number
  let zeta: number
  if (useDuration) {
    const duration = config.duration ?? DEFAULT_SPRING_DURATION
    zeta = config.dampingRatio ?? DEFAULT_SPRING_DAMPING_RATIO
    stiffness =
      duration <= 0
        ? Number.POSITIVE_INFINITY
        : stiffnessForDuration(
            displacement,
            velocity,
            duration,
            zeta,
            mass,
            energyThreshold,
          )
  } else {
    stiffness = config.stiffness ?? DEFAULT_SPRING_STIFFNESS
    const damping = config.damping ?? DEFAULT_SPRING_DAMPING
    zeta = damping / (2 * Math.sqrt(stiffness * mass))
  }

  if (config.clamp) {
    zeta = zetaForClamp(zeta, displacement, toValue, config.clamp)
  }

  // A zero/degenerate duration means "be there already"; the platform solver
  // rejects a non-finite stiffness, so collapse it to a 0 ms timing instead.
  const resolvedStiffness = Number.isFinite(stiffness)
    ? Math.max(stiffness, Number.EPSILON)
    : 1e6

  const initialEnergy = energyOf(
    displacement,
    velocity,
    resolvedStiffness,
    mass,
  )
  const restEnergy = energyThreshold * initialEnergy

  return {
    toValue,
    mass,
    stiffness: resolvedStiffness,
    damping: Math.max(
      zeta * 2 * Math.sqrt(resolvedStiffness * mass),
      Number.EPSILON,
    ),
    initialVelocity: velocity,
    overshootClamping: config.overshootClamping ?? false,
    // Semi-axes of the energy ellipse: |x| where all the remaining energy is
    // potential, |v| where all of it is kinetic. A spring at rest is inside
    // both.
    restDisplacementThreshold: Math.max(
      Math.sqrt((2 * restEnergy) / resolvedStiffness),
      Number.MIN_VALUE,
    ),
    restSpeedThreshold: Math.max(
      Math.sqrt((2 * restEnergy) / mass),
      Number.MIN_VALUE,
    ),
  }
}

// --- building a running animation ---------------------------------------

/** The last value an animation aims at, used by `withRepeat`'s reverse. */
const targetOf = (spec: AnimationSpec): number | null => {
  switch (spec.kind) {
    case "timing":
    case "spring":
      return spec.toValue
    case "delay":
      return targetOf(spec.animation)
    case "sequence": {
      const last = spec.animations[spec.animations.length - 1]
      return last ? targetOf(last) : null
    }
    case "repeat":
      return targetOf(spec.animation)
  }
}

/** A copy of `spec` aimed at `toValue`, for a reversed repetition. */
const aimedAt = (spec: AnimationSpec, toValue: number): AnimationSpec => {
  switch (spec.kind) {
    case "timing":
    case "spring":
      return { ...spec, toValue }
    case "delay":
      return { ...spec, animation: aimedAt(spec.animation, toValue) }
    case "sequence": {
      const animations = [...spec.animations]
      const lastIndex = animations.length - 1
      const last = animations[lastIndex]
      if (last) {
        animations[lastIndex] = aimedAt(last, toValue)
      }
      return { ...spec, animations }
    }
    case "repeat":
      return { ...spec, animation: aimedAt(spec.animation, toValue) }
  }
}

const callbackOf = (spec: AnimationSpec): AnimationCallback | undefined =>
  spec.kind === "timing" || spec.kind === "spring" || spec.kind === "repeat"
    ? spec.callback
    : undefined

/**
 * Fires the descriptor's own callback when its animation settles — including
 * when it is cancelled, which reports `finished: false`, as upstream does.
 * Every node carries one, so the per-child callbacks of a `withSequence` and
 * the per-repetition callbacks of a `withRepeat` fire without the caller
 * having to unpick the tree.
 */
const reportingTo = (
  animation: CompositeAnimation,
  callback: AnimationCallback | undefined,
  driver: AnimatedValue,
): CompositeAnimation =>
  callback
    ? {
        start: (onEnd) => {
          animation.start((result) => {
            callback(result.finished, driver.__getValue())
            onEnd?.(result)
          })
        },
        stop: () => animation.stop(),
        reset: () => animation.reset(),
      }
    : animation

const buildRepeat = (
  api: AnimatedApi,
  driver: AnimatedValue,
  spec: RepeatSpec,
): CompositeAnimation => {
  let child: CompositeAnimation | null = null
  let cancelled = false

  return {
    start(onEnd) {
      cancelled = false
      const origin = driver.__getValue()
      let from = origin
      let to = targetOf(spec.animation) ?? origin
      let completed = 0

      const runIteration = (): void => {
        child = buildAnimation(api, driver, aimedAt(spec.animation, to))
        child.start((result) => {
          if (cancelled || !result.finished) {
            onEnd?.(result)
            return
          }
          completed += 1
          if (spec.numberOfReps > 0 && completed >= spec.numberOfReps) {
            onEnd?.({ finished: true })
            return
          }
          if (spec.reverse) {
            // Ping-pong: the value is already at `to`, so the next
            // repetition simply aims back at where this one started.
            const previousTarget = to
            to = from
            from = previousTarget
          } else {
            // Replay: snap back to where the repeat began and run again,
            // which is what upstream's onStart(startValue) amounts to.
            driver.setValue(from)
          }
          runIteration()
        })
      }

      runIteration()
    },
    stop() {
      cancelled = true
      child?.stop()
    },
    reset() {
      child?.reset()
    },
  }
}

/**
 * Turns a descriptor into a running animation on `driver`. Every leaf is one
 * of the platform's own animations, so the whole tree runs off the single
 * injected frame scheduler.
 */
export const buildAnimation = (
  api: AnimatedApi,
  driver: AnimatedValue,
  spec: AnimationSpec,
): CompositeAnimation => {
  const build = (): CompositeAnimation => {
    switch (spec.kind) {
      case "timing":
        return api.timing(driver, {
          toValue: spec.toValue,
          duration: spec.config.duration ?? DEFAULT_TIMING_DURATION,
          easing: spec.config.easing
            ? resolveEasing(spec.config.easing)
            : defaultTimingEasing,
        })
      case "spring":
        return api.spring(
          driver,
          toPlatformSpringConfig(
            spec.config,
            spec.toValue,
            driver.__getValue(),
          ),
        )
      case "delay":
        return api.sequence([
          api.delay(spec.delayMs),
          buildAnimation(api, driver, spec.animation),
        ])
      case "sequence":
        return api.sequence(
          spec.animations.map((child) => buildAnimation(api, driver, child)),
        )
      case "repeat":
        return buildRepeat(api, driver, spec)
    }
  }
  return reportingTo(build(), callbackOf(spec), driver)
}
