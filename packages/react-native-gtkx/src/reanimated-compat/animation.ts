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
import {
  createValueAnimation,
  type AnimatedApi,
  type AnimatedValue,
  type CompositeAnimation,
  type FrameScheduler,
} from "../animated/index"
import { decayStep, resolveDecayConfig, type WithDecayConfig } from "./decay"
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

type DecaySpec = {
  kind: "decay"
  config: ReturnType<typeof resolveDecayConfig>
  callback?: AnimationCallback
}

type ClampSpec = {
  kind: "clamp"
  min?: number
  max?: number
  animation: AnimationSpec
}

export type AnimationSpec =
  | TimingSpec
  | SpringSpec
  | DelaySpec
  | SequenceSpec
  | RepeatSpec
  | DecaySpec
  | ClampSpec

const MARKER = "__rnGtkxReanimatedAnimation"

type MarkedSpec = AnimationSpec & { [MARKER]: true }

const mark = (spec: AnimationSpec): MarkedSpec =>
  Object.assign(spec, { [MARKER]: true as const })

export const isAnimationSpec = (value: unknown): value is AnimationSpec =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>)[MARKER] === true

// --- the initial run ----------------------------------------------------
//
// Upstream's `IN_STYLE_UPDATER`, and it is not a detail: the FIRST evaluation
// of a `useDerivedValue`/`useAnimatedStyle`/`useAnimatedProps` updater has no
// value to animate FROM, so every `with*` builder returns its target instead
// of an animation. `defineAnimation` does it in one line —
// `if (IN_STYLE_UPDATER.current) return starting` — and that line is what
// makes the documented pattern
//
//   const v = useDerivedValue(() => withSpring(active.value ? 1 : 0))
//
// work at all. Without it the shared value is SEEDED with the animation
// object itself and every later write finds a value that is not a number.
// Found by building `react-native-draggable-flatlist`, whose `ScaleDecorator`
// is exactly that pattern (`hooks/useOnCellActiveAnimation.ts`).
let inInitialRun = false

/**
 * Runs an updater in "seed the value" mode, where every animation collapses
 * to the value it would have finished at.
 */
export const initialUpdaterRun = <T>(updater: () => T): T => {
  inInitialRun = true
  try {
    return updater()
  } finally {
    inInitialRun = false
  }
}

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
  inInitialRun
    ? assertAnimatable(toValue, "withTiming")
    : (mark({
        kind: "timing",
        toValue: assertAnimatable(toValue, "withTiming"),
        config: config ?? {},
        callback,
      }) as unknown as number)

/** Lets you animate a value with spring physics. */
export const withSpring = (
  toValue: number,
  config?: WithSpringConfig,
  callback?: AnimationCallback,
): number =>
  inInitialRun
    ? assertAnimatable(toValue, "withSpring")
    : (mark({
        kind: "spring",
        toValue: assertAnimatable(toValue, "withSpring"),
        config: config ?? {},
        callback,
      }) as unknown as number)

/** Delays another animation by `delayMs`. */
export const withDelay = (delayMs: number, animation: number): number => {
  // Upstream's `starting` for every composite is the animation it wraps,
  // which the initial run has already collapsed to a plain value.
  if (inInitialRun) {
    return animation
  }
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
  if (inInitialRun) {
    return animations[0] ?? 0
  }
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
  if (inInitialRun) {
    return animation
  }
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

/**
 * Coasts to a stop from an initial velocity — the release half of a fling.
 * Unlike every other animation here it has no target: where it lands is the
 * result of the velocity and the friction, which is exactly what makes it the
 * one an inertial gesture needs.
 *
 * ```tsx
 * onPanResponderRelease: (_, g) => {
 *   x.value = withDecay({ velocity: g.vx * 1000, clamp: [0, width] })
 * }
 * ```
 *
 * `velocity` is in units per SECOND, as upstream — `PanResponder`'s
 * `gestureState.vx` is per millisecond, so it wants the ×1000 above.
 */
export const withDecay = (
  config?: WithDecayConfig,
  callback?: AnimationCallback,
): number =>
  inInitialRun
    ? // Upstream seeds a decay with 0: it has no target to collapse to.
      0
    : (mark({
        kind: "decay",
        config: resolveDecayConfig(config),
        callback,
      }) as unknown as number)

/**
 * Confines another animation to a range: the inner animation runs its own
 * un-truncated course and what reaches the value is clipped to `[min, max]`.
 * That distinction is upstream's and it is observable — a spring clamped at
 * 100 that would have overshot to 120 sits at 100 and then comes back down,
 * rather than settling at 100 the moment it first arrives.
 */
export const withClamp = (
  config: { min?: number; max?: number },
  animation: number,
): number => {
  if (inInitialRun) {
    return animation
  }
  if (!isAnimationSpec(animation)) {
    throw new Error(
      "react-native-reanimated: withClamp() takes an animation, e.g. withClamp({ min: 0 }, withSpring(1))",
    )
  }
  if (
    config.min !== undefined &&
    config.max !== undefined &&
    config.max < config.min
  ) {
    throw new Error(
      `react-native-reanimated: withClamp() was given min ${config.min} above max ${config.max}.`,
    )
  }
  return mark({
    kind: "clamp",
    min: config.min,
    max: config.max,
    animation,
  }) as unknown as number
}

export type { WithDecayConfig } from "./decay"

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
    case "clamp":
      return targetOf(spec.animation)
    // A decay has no target by construction — where it lands is the result
    // rather than the input. `withRepeat(withDecay(...))` therefore replays
    // from the same origin rather than ping-ponging between two.
    case "decay":
      return null
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
    case "clamp":
      return { ...spec, animation: aimedAt(spec.animation, toValue) }
    // Nothing to re-aim: see targetOf.
    case "decay":
      return spec
  }
}

const callbackOf = (spec: AnimationSpec): AnimationCallback | undefined =>
  spec.kind === "timing" ||
  spec.kind === "spring" ||
  spec.kind === "repeat" ||
  spec.kind === "decay"
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

/**
 * What a descriptor needs to become a running animation: the platform's
 * Animated api for the animations it already has, and the frame scheduler
 * behind it for the one it does not (`withDecay` — see decay.ts). Both come
 * from the same place, so there is still exactly one clock under this layer.
 */
export type AnimationEngine = {
  api: AnimatedApi
  scheduler: FrameScheduler
}

const buildRepeat = (
  engine: AnimationEngine,
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
        child = buildAnimation(engine, driver, aimedAt(spec.animation, to))
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
  engine: AnimationEngine,
  driver: AnimatedValue,
  spec: AnimationSpec,
): CompositeAnimation => {
  const { api, scheduler } = engine
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
          buildAnimation(engine, driver, spec.animation),
        ])
      case "sequence":
        return api.sequence(
          spec.animations.map((child) => buildAnimation(engine, driver, child)),
        )
      case "repeat":
        return buildRepeat(engine, driver, spec)
      case "decay":
        return createValueAnimation(scheduler, driver, decayStep(spec.config))
      case "clamp":
        return buildClamp(engine, driver, spec)
    }
  }
  return reportingTo(build(), callbackOf(spec), driver)
}

/**
 * `withClamp` in full: the inner animation is built on a PRIVATE value and
 * what that value publishes is clipped onto the real driver. Running it
 * un-truncated is the whole behaviour — upstream keeps the clamped animation's
 * own `current` unbounded for exactly this reason — and the private node costs
 * one listener, no extra frame subscription and no second clock, because the
 * inner animation is an ordinary one built by the same function.
 */
const buildClamp = (
  engine: AnimationEngine,
  driver: AnimatedValue,
  spec: ClampSpec,
): CompositeAnimation => {
  const inner = new engine.api.Value(driver.__getValue())
  inner.addListener(({ value }) => {
    const clipped =
      spec.max !== undefined && value > spec.max
        ? spec.max
        : spec.min !== undefined && value < spec.min
          ? spec.min
          : value
    driver.__updateValue(clipped)
  })
  return buildAnimation(engine, inner, spec.animation)
}
