// `withDecay` — the release-and-coast half of every fling.
//
// This is the one animation whose maths belongs to Reanimated rather than to
// React Native: `Animated.decay` exists upstream in RN too, but it is a
// different curve with a different parameterisation (velocity in px/ms, a
// single closed-form exponential, a 0.1px rest test), and neither `clamp` nor
// the rubber band exists there at all. So the step function below is ported
// from react-native-reanimated 4.5.3's own
// `src/animation/decay/{rigidDecay,rubberBandDecay}.ts` line for line, and
// runs on the platform's frame loop like every other animation in this layer —
// no second clock, no new engine, just a different per-frame step.
//
// PORTED AS-IS INCLUDES THE ODD PART, deliberately. Upstream multiplies the
// ALREADY-DECAYED velocity by `exp(-k * totalElapsed)` on every frame rather
// than the initial velocity, so the decay compounds into a Gaussian rather
// than the exponential the `deceleration` name suggests. That is what shipped
// apps are tuned against — a fling that travels the "correct" exponential
// distance here would overshoot every list those apps calibrated on mobile —
// so it is reproduced rather than corrected.
//
// The one value that is a CHOICE: `VELOCITY_EPS`, upstream's stop threshold,
// is `IS_WEB ? 1/20 : 1`. This platform is not the web — pixels are device
// pixels and velocities arrive in px/s exactly as on a phone — so it takes
// the native branch, which is also the one react-native-windows takes.
import type { MakeStep } from "../animated/index"

const SLOPE_FACTOR = 0.1
const VELOCITY_EPS = 1
const DERIVATIVE_EPS = 0.1
/** Upstream's cap on a single frame's contribution: a stalled frame cannot fling. */
const MAX_FRAME_MS = 64

/**
 * Upstream's config, unchanged. `clamp` is a `[min, max]` pair rather than the
 * `{ min, max }` object `withSpring` takes — that asymmetry is upstream's and
 * copying it is what lets source move over untouched.
 */
export type WithDecayConfig = {
  /** Initial velocity, in units per second. Defaults to 0. */
  velocity?: number
  /** How fast the velocity decays, 0-1. Defaults to 0.998. */
  deceleration?: number
  /** Multiplier applied to the velocity every frame. Defaults to 1. */
  velocityFactor?: number
  /** Range the value is confined to. */
  clamp?: [min: number, max: number]
  /** Bounce past `clamp` and settle back onto it. Requires `clamp`. */
  rubberBandEffect?: boolean
  /** Strength of that bounce. Defaults to 0.6. */
  rubberBandFactor?: number
}

type ResolvedDecayConfig = Required<Omit<WithDecayConfig, "clamp">> & {
  clamp?: [min: number, max: number]
}

const DEFAULTS = {
  velocity: 0,
  deceleration: 0.998,
  velocityFactor: 1,
  rubberBandEffect: false,
  rubberBandFactor: 0.6,
} as const

/**
 * Fills in upstream's defaults and applies upstream's own validation — which
 * runs here at the `withDecay()` call rather than on the animation's first
 * frame, so a bad config throws at the line that wrote it.
 */
export const resolveDecayConfig = (
  config: WithDecayConfig = {},
): ResolvedDecayConfig => {
  const resolved: ResolvedDecayConfig = { ...DEFAULTS, ...config }
  if (config.clamp !== undefined) {
    if (!Array.isArray(config.clamp)) {
      throw new Error(
        `react-native-reanimated: withDecay()'s \`clamp\` must be an array but is ${typeof config.clamp}.`,
      )
    }
    if (config.clamp.length !== 2) {
      throw new Error(
        `react-native-reanimated: withDecay()'s \`clamp\` must contain 2 items but has ${config.clamp.length}.`,
      )
    }
  }
  if (resolved.velocityFactor <= 0) {
    throw new Error(
      `react-native-reanimated: withDecay()'s \`velocityFactor\` must be greater than 0 but is ${resolved.velocityFactor}.`,
    )
  }
  if (resolved.rubberBandEffect && !resolved.clamp) {
    throw new Error(
      "react-native-reanimated: withDecay() needs a `clamp` range when `rubberBandEffect` is set.",
    )
  }
  return resolved
}

const usesRubberBand = (
  config: ResolvedDecayConfig,
): config is ResolvedDecayConfig & { clamp: [number, number] } =>
  config.rubberBandEffect && Array.isArray(config.clamp)

/**
 * The per-frame step, in the shape the platform's value animation takes:
 * elapsed milliseconds since the animation's first frame in, the next position
 * and whether it has settled out. All of upstream's cross-frame state —
 * current position, current velocity, the previous timestamp, and whether the
 * rubber band has engaged — lives in this closure, which is rebuilt on every
 * `start()`, so a restart picks up from wherever the value is now.
 */
export const decayStep =
  (config: ResolvedDecayConfig): MakeStep =>
  (startValue) => {
    const initialVelocity = config.velocity
    const rubberBand = usesRubberBand(config)
    let current = startValue
    let velocity = initialVelocity
    let lastTimestamp = 0
    let springActive = false

    return (elapsedMs) => {
      const deltaTime = Math.min(
        Math.max(elapsedMs - lastTimestamp, 0),
        MAX_FRAME_MS,
      )
      const envelope = Math.exp(
        -(1 - config.deceleration) * elapsedMs * SLOPE_FACTOR,
      )

      if (rubberBand) {
        const clamp = config.clamp
        // The nearer bound is the one the band pulls back to.
        const bound =
          Math.abs(current - clamp[0]) < Math.abs(current - clamp[1])
            ? clamp[0]
            : clamp[1]
        const overshoot =
          current < clamp[0] || current > clamp[1] ? current - bound : 0
        const nextVelocity =
          velocity * envelope - overshoot * config.rubberBandFactor

        if (Math.abs(overshoot) > DERIVATIVE_EPS) {
          springActive = true
        } else if (springActive) {
          // It went past the bound and has come back: land exactly on it.
          return { position: bound, done: true }
        } else if (Math.abs(nextVelocity) < VELOCITY_EPS) {
          return { position: current, done: true }
        }

        current += (nextVelocity * config.velocityFactor * deltaTime) / 1000
        velocity = nextVelocity
        lastTimestamp = elapsedMs
        return { position: current, done: false }
      }

      const nextVelocity = velocity * envelope
      current += (nextVelocity * config.velocityFactor * deltaTime) / 1000
      velocity = nextVelocity
      lastTimestamp = elapsedMs

      if (config.clamp) {
        // Which bound stops it is decided by the INITIAL direction, not the
        // current one: upstream's own rule, and the reason a fling that starts
        // inside the range and reverses is not stopped by the far edge.
        if (initialVelocity < 0 && current <= config.clamp[0]) {
          return { position: config.clamp[0], done: true }
        }
        if (initialVelocity > 0 && current >= config.clamp[1]) {
          return { position: config.clamp[1], done: true }
        }
      }
      return { position: current, done: Math.abs(nextVelocity) < VELOCITY_EPS }
    }
  }
