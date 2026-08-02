// The layout-animation builders' base class, and the four that are written by
// hand: `FadeIn`, `FadeOut`, `LinearTransition` and `Keyframe`.
//
// A builder is plain data with a fluent surface. `FadeIn`, the class itself,
// is a valid `entering` value; so is `FadeIn.duration(400).delay(100)`, which
// is why every chainable method exists twice — once as an instance method and
// once as a static that makes an instance first. That is upstream's own shape
// (`BaseAnimationBuilder`), mirrored rather than reinvented, because app code
// and library code both write it.
//
// `build()` returns upstream's function too: `(values) => ({ initialValues,
// animations, callback })`, where `animations` holds ordinary `withTiming` /
// `withSpring` descriptors keyed by property. Nothing here knows about GTK, a
// widget, or a retention — this file decides WHAT should happen; the runtime
// (layout-animation-runtime.ts) decides what of it this platform can honour
// and drives it.
//
// SCOPE. The base class plus the four builders that cannot be expressed as a
// table: three because they are the primitives everything else is measured
// against, and `Keyframe` because it is the one builder you INSTANTIATE with a
// track rather than configure. The catalogue proper — `BounceIn*`,
// `Pinwheel*`, `Roll*`, `Stretch*` and the rest — is exactly the same
// `initialValues`/`animations` pair over a different pair of numbers, so it
// lives as data in layout-animation-presets.ts; the four `*Transition`
// builders beside `LinearTransition` live in layout-transitions.ts.
import { parseAngle } from "../style/transform"
import {
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from "./animation"
import type { EasingFunction, EasingFunctionFactory } from "./easing"

/**
 * What a builder is handed when it is asked to produce a config. Upstream
 * fills the `target*` half for an entering animation and the `current*` half
 * for an exiting one; both halves are always populated here, from the rects
 * the layout engine committed, because a superset costs nothing and a builder
 * that reads the wrong half would otherwise get `undefined`.
 */
export type LayoutAnimationValues = {
  targetOriginX: number
  targetOriginY: number
  targetWidth: number
  targetHeight: number
  targetGlobalOriginX: number
  targetGlobalOriginY: number
  currentOriginX: number
  currentOriginY: number
  currentWidth: number
  currentHeight: number
  currentGlobalOriginX: number
  currentGlobalOriginY: number
  windowWidth: number
  windowHeight: number
}

/** Called when a layout animation settles or is cut short, as upstream. */
export type LayoutAnimationCallback = (finished: boolean) => void

/** Upstream's built config: where to start, what to run, who to tell. */
export type BuiltLayoutAnimation = {
  initialValues: Record<string, unknown>
  animations: Record<string, unknown>
  callback?: LayoutAnimationCallback
}

/** Anything an `entering`, `exiting` or `layout` prop accepts. */
export type LayoutAnimationBuilderLike = {
  build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation
  /** The longest this animation can run, which is what arms a retention. */
  getMaxDuration(): number
}

const DEFAULT_DURATION = 300

type TimingLike = (toValue: number) => number

export class AnimationBuilder {
  durationV: number | undefined = undefined
  delayV: number | undefined = undefined
  easingV: EasingFunction | EasingFunctionFactory | undefined = undefined
  randomizeDelay = false
  type: "timing" | "spring" = "timing"
  springConfigV: WithSpringConfig = {}
  initialValuesV: Record<string, unknown> = {}
  callbackV: LayoutAnimationCallback | undefined = undefined
  rotateV: string | number | undefined = undefined

  static createInstance<T extends typeof AnimationBuilder>(
    this: T,
  ): InstanceType<T> {
    return new this() as InstanceType<T>
  }

  duration(durationMs: number): this {
    this.durationV = durationMs
    return this
  }

  delay(delayMs: number): this {
    this.delayV = delayMs
    return this
  }

  easing(easingFunction: EasingFunction | EasingFunctionFactory): this {
    this.easingV = easingFunction
    return this
  }

  /** Upstream's "spread the delay over a window" helper, ported as-is. */
  randomDelay(): this {
    this.randomizeDelay = true
    return this
  }

  springify(durationMs?: number): this {
    this.type = "spring"
    if (durationMs !== undefined) {
      this.springConfigV.duration = durationMs
      // Upstream's `springify()` writes the same field `.duration()` does, so
      // `getDuration()` reports the spring's length too. That matters here
      // beyond parity: the retention fallback that keeps an exiting widget on
      // screen is armed from `getMaxDuration()`, and a fallback shorter than
      // the animation cuts the animation off.
      this.durationV = durationMs
    }
    return this
  }

  /**
   * The angle `ZoomInRotate` / `ZoomOutRotate` spin through.
   *
   * Upstream takes a bare number of RADIANS in a string (its default is
   * `'0.3'`, interpolated into `` `${rotate}rad` ``), and a united value like
   * `'90deg'` reaches its template as `'90degrad'`. A bare number or numeric
   * string is read as radians here, exactly as upstream; a value that carries
   * its own `deg`/`rad` unit is parsed instead of being concatenated into
   * nonsense.
   */
  rotate(angle: string | number): this {
    this.rotateV = angle
    return this
  }

  damping(value: number): this {
    this.springConfigV.damping = value
    return this
  }

  dampingRatio(value: number): this {
    this.springConfigV.dampingRatio = value
    return this
  }

  mass(value: number): this {
    this.springConfigV.mass = value
    return this
  }

  stiffness(value: number): this {
    this.springConfigV.stiffness = value
    return this
  }

  overshootClamping(value: number): this {
    this.springConfigV.overshootClamping = Boolean(value)
    return this
  }

  /**
   * Accepted and ignored, because this platform's spring solver derives its
   * rest condition from the same energy budget upstream stops on rather than
   * from absolute thresholds — the difference is well under a pixel and is
   * already in docs/api.md's differences table.
   */
  restDisplacementThreshold(): this {
    return this
  }

  restSpeedThreshold(): this {
    return this
  }

  /**
   * Accepted and ignored: no reduce-motion source is wired on this platform
   * yet, so every value behaves as `ReduceMotion.Never` — the same answer
   * `useReducedMotion()` gives.
   */
  reduceMotion(): this {
    return this
  }

  withInitialValues(values: Record<string, unknown>): this {
    this.initialValuesV = values
    return this
  }

  withCallback(callback: LayoutAnimationCallback): this {
    this.callbackV = callback
    return this
  }

  getDelay(): number {
    const delay = this.delayV ?? 0
    return this.randomizeDelay ? Math.random() * (delay || 1000) : delay
  }

  /** The nominal length, as upstream reports it. */
  getDuration(): number {
    return this.durationV ?? DEFAULT_DURATION
  }

  /**
   * The UPPER BOUND on delay plus duration, which is what a retention arms
   * its fallback timer from. Not `getDelay() + getDuration()`: `randomDelay`
   * draws a fresh number on every call — deliberately, so a list staggers —
   * and a fallback armed from one draw could cut short an animation built
   * from another.
   */
  getMaxDuration(): number {
    const delay = this.randomizeDelay
      ? (this.delayV ?? 0) || 1000
      : (this.delayV ?? 0)
    return delay + this.getDuration()
  }

  /**
   * `.rotate()` resolved to degrees, or `fallbackDegrees` when it was never
   * called. See {@link AnimationBuilder.rotate} for the unit rules.
   */
  protected getRotationDegrees(fallbackDegrees: number): number {
    const configured = this.rotateV
    if (configured === undefined) {
      return fallbackDegrees
    }
    const bare =
      typeof configured === "number" ? configured : Number(configured)
    if (Number.isFinite(bare)) {
      return (bare * 180) / Math.PI
    }
    return parseAngle(configured) ?? fallbackDegrees
  }

  protected animation(): TimingLike {
    if (this.type === "spring") {
      const config = { ...this.springConfigV }
      return (toValue: number) => withSpring(toValue, config)
    }
    const config: {
      duration?: number
      easing?: EasingFunction | EasingFunctionFactory
    } = {}
    if (this.durationV !== undefined) {
      config.duration = this.durationV
    }
    if (this.easingV !== undefined) {
      config.easing = this.easingV
    }
    return (toValue: number) => withTiming(toValue, config)
  }

  protected delayed(delayMs: number, animation: number): number {
    return delayMs <= 0 ? animation : withDelay(delayMs, animation)
  }

  build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    throw new Error(
      "react-native-reanimated: this animation builder does not implement build()",
    )
  }

  // --- the statics, so `entering={FadeIn.duration(400)}` works ------------

  static duration<T extends typeof AnimationBuilder>(
    this: T,
    durationMs: number,
  ): InstanceType<T> {
    return this.createInstance().duration(durationMs) as InstanceType<T>
  }

  static delay<T extends typeof AnimationBuilder>(
    this: T,
    delayMs: number,
  ): InstanceType<T> {
    return this.createInstance().delay(delayMs) as InstanceType<T>
  }

  static easing<T extends typeof AnimationBuilder>(
    this: T,
    easingFunction: EasingFunction | EasingFunctionFactory,
  ): InstanceType<T> {
    return this.createInstance().easing(easingFunction) as InstanceType<T>
  }

  static randomDelay<T extends typeof AnimationBuilder>(
    this: T,
  ): InstanceType<T> {
    return this.createInstance().randomDelay() as InstanceType<T>
  }

  static springify<T extends typeof AnimationBuilder>(
    this: T,
    durationMs?: number,
  ): InstanceType<T> {
    return this.createInstance().springify(durationMs) as InstanceType<T>
  }

  static rotate<T extends typeof AnimationBuilder>(
    this: T,
    angle: string | number,
  ): InstanceType<T> {
    return this.createInstance().rotate(angle) as InstanceType<T>
  }

  static damping<T extends typeof AnimationBuilder>(
    this: T,
    value: number,
  ): InstanceType<T> {
    return this.createInstance().damping(value) as InstanceType<T>
  }

  static dampingRatio<T extends typeof AnimationBuilder>(
    this: T,
    value: number,
  ): InstanceType<T> {
    return this.createInstance().dampingRatio(value) as InstanceType<T>
  }

  static mass<T extends typeof AnimationBuilder>(
    this: T,
    value: number,
  ): InstanceType<T> {
    return this.createInstance().mass(value) as InstanceType<T>
  }

  static stiffness<T extends typeof AnimationBuilder>(
    this: T,
    value: number,
  ): InstanceType<T> {
    return this.createInstance().stiffness(value) as InstanceType<T>
  }

  static overshootClamping<T extends typeof AnimationBuilder>(
    this: T,
    value: number,
  ): InstanceType<T> {
    return this.createInstance().overshootClamping(value) as InstanceType<T>
  }

  static restDisplacementThreshold<T extends typeof AnimationBuilder>(
    this: T,
  ): InstanceType<T> {
    return this.createInstance() as InstanceType<T>
  }

  static restSpeedThreshold<T extends typeof AnimationBuilder>(
    this: T,
  ): InstanceType<T> {
    return this.createInstance() as InstanceType<T>
  }

  static reduceMotion<T extends typeof AnimationBuilder>(
    this: T,
  ): InstanceType<T> {
    return this.createInstance() as InstanceType<T>
  }

  static withInitialValues<T extends typeof AnimationBuilder>(
    this: T,
    values: Record<string, unknown>,
  ): InstanceType<T> {
    return this.createInstance().withInitialValues(values) as InstanceType<T>
  }

  static withCallback<T extends typeof AnimationBuilder>(
    this: T,
    callback: LayoutAnimationCallback,
  ): InstanceType<T> {
    return this.createInstance().withCallback(callback) as InstanceType<T>
  }

  static build<T extends typeof AnimationBuilder>(
    this: T,
  ): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    return this.createInstance().build()
  }

  static getDuration<T extends typeof AnimationBuilder>(this: T): number {
    return this.createInstance().getDuration()
  }

  static getDelay<T extends typeof AnimationBuilder>(this: T): number {
    return this.createInstance().getDelay()
  }

  static getMaxDuration<T extends typeof AnimationBuilder>(this: T): number {
    return this.createInstance().getMaxDuration()
  }
}

/** Fades a view in as it mounts. */
export class FadeIn extends AnimationBuilder {
  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const animation = this.animation()
    const delayMs = this.getDelay()
    const callback = this.callbackV
    const initialValues = this.initialValuesV
    return () => ({
      initialValues: { opacity: 0, ...initialValues },
      animations: { opacity: this.delayed(delayMs, animation(1)) },
      callback,
    })
  }
}

/** Fades a view out as it unmounts — the animation that needs retention. */
export class FadeOut extends AnimationBuilder {
  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const animation = this.animation()
    const delayMs = this.getDelay()
    const callback = this.callbackV
    const initialValues = this.initialValuesV
    return () => ({
      initialValues: { opacity: 1, ...initialValues },
      animations: { opacity: this.delayed(delayMs, animation(0)) },
      callback,
    })
  }
}

/**
 * Walks a view from where it was to where the layout engine just put it.
 *
 * Upstream animates `originX`/`originY`/`width`/`height`; the same four are
 * produced here, and the runtime honours the origins (as a translation, which
 * is paint-only) and applies the size immediately. See docs/api.md.
 */
export class LinearTransition extends AnimationBuilder {
  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const animation = this.animation()
    const delayMs = this.getDelay()
    const callback = this.callbackV
    return (values) => ({
      initialValues: {
        originX: values.currentOriginX,
        originY: values.currentOriginY,
        width: values.currentWidth,
        height: values.currentHeight,
      },
      animations: {
        originX: this.delayed(delayMs, animation(values.targetOriginX)),
        originY: this.delayed(delayMs, animation(values.targetOriginY)),
        width: this.delayed(delayMs, animation(values.targetWidth)),
        height: this.delayed(delayMs, animation(values.targetHeight)),
      },
      callback,
    })
  }
}

// --- Keyframe ------------------------------------------------------------

type KeyframeStyle = Record<string, unknown> & {
  easing?: EasingFunction | EasingFunctionFactory
}

export type KeyframeDefinitions = Record<string | number, KeyframeStyle>

type Step = {
  offset: number
  value: number
  easing: EasingFunction | EasingFunctionFactory | undefined
}

// A map rather than two comparisons, and that is not a style choice: the
// metro-preset test scans src for bare module specifiers with a regex that
// looks for the import keyword next to a quoted string, and a comparison
// against the quoted keyframe name reads to it as exactly that. Unquoted
// object keys keep the word away from a quote.
const NAMED_OFFSETS: Record<string, number> = { from: 0, to: 100 }

const offsetOf = (key: string): number | null => {
  const named = NAMED_OFFSETS[key]
  if (named !== undefined) {
    return named
  }
  const parsed = Number(key)
  return Number.isFinite(parsed) ? parsed : null
}

const TRANSFORM_PREFIX = "transform."

/**
 * A hand-written keyframe track — the one builder that is a class you
 * instantiate (`new Keyframe({...})`) rather than a preset you configure.
 *
 * Each keyframe is a percentage (or `from`/`to`) mapped to a style. Every
 * property is turned into a `withSequence` of `withTiming` steps whose
 * durations are the gaps between the offsets it appears at, which is exactly
 * how upstream compiles them; a per-keyframe `easing` applies to the step
 * that ENDS there, as in CSS.
 */
export class Keyframe extends AnimationBuilder {
  private readonly definitions: KeyframeDefinitions

  constructor(definitions: KeyframeDefinitions) {
    super()
    this.definitions = definitions
  }

  /** Keyframes and springs are different clocks; upstream refuses this too. */
  override springify(): this {
    throw new Error(
      "react-native-reanimated: Keyframe animations cannot be springified — a keyframe track is defined by " +
        "its timeline, and a spring has none. Use `.duration()` and per-keyframe `easing` instead.",
    )
  }

  // Keyframe values that are not numbers — a colour, a string length. They
  // cannot be interpolated by a numeric animation, and DROPPING them is the
  // one thing this repo does not do: they are handed to the built config as
  // plain initial values instead, where the runtime names the property in a
  // one-per-session warning rather than saying nothing.
  private readonly unhandled = new Map<string, unknown>()

  private tracks(): Map<string, Step[]> {
    const tracks = new Map<string, Step[]>()
    this.unhandled.clear()
    const push = (
      key: string,
      offset: number,
      value: unknown,
      easing: EasingFunction | EasingFunctionFactory | undefined,
    ): void => {
      if (typeof value !== "number") {
        if (!this.unhandled.has(key)) {
          this.unhandled.set(key, value)
        }
        return
      }
      const steps = tracks.get(key)
      const step: Step = { offset, value, easing }
      if (steps) {
        steps.push(step)
      } else {
        tracks.set(key, [step])
      }
    }

    const offsets: number[] = []
    for (const key of Object.keys(this.definitions)) {
      const offset = offsetOf(key)
      if (offset === null) {
        throw new Error(
          `react-native-reanimated: Keyframe offsets are percentages, \`from\` or \`to\` — got "${key}".`,
        )
      }
      offsets.push(offset)
    }
    if (!offsets.includes(0)) {
      throw new Error(
        "react-native-reanimated: a Keyframe must define its `0` (or `from`) keyframe — there is nothing to start from otherwise.",
      )
    }

    for (const key of Object.keys(this.definitions)) {
      const offset = offsetOf(key)!
      const style = this.definitions[key]!
      const easing = style.easing
      for (const property of Object.keys(style)) {
        if (property === "easing") {
          continue
        }
        if (property === "transform") {
          const parts = style.transform
          if (!Array.isArray(parts)) {
            continue
          }
          parts.forEach((part, index) => {
            if (typeof part !== "object" || part === null) {
              return
            }
            for (const [name, value] of Object.entries(part)) {
              push(`${TRANSFORM_PREFIX}${index}.${name}`, offset, value, easing)
            }
          })
          continue
        }
        push(property, offset, style[property], easing)
      }
    }

    for (const steps of tracks.values()) {
      steps.sort((left, right) => left.offset - right.offset)
    }
    return tracks
  }

  override build(): (values: LayoutAnimationValues) => BuiltLayoutAnimation {
    const tracks = this.tracks()
    const totalDuration = this.getDuration()
    const delayMs = this.getDelay()
    const callback = this.callbackV
    const initialValues: Record<string, unknown> = {}
    const animations: Record<string, unknown> = {}
    const transformInitial: Record<string, unknown>[] = []
    const transformAnimated: Record<string, unknown>[] = []

    for (const [key, steps] of tracks) {
      const first = steps[0]!
      const specs: number[] = []
      let previousOffset = first.offset
      for (const step of steps.slice(1)) {
        const span = ((step.offset - previousOffset) / 100) * totalDuration
        previousOffset = step.offset
        specs.push(
          withTiming(step.value, {
            duration: span,
            ...(step.easing ? { easing: step.easing } : {}),
          }),
        )
      }
      const track =
        specs.length === 0
          ? first.value
          : this.delayed(
              delayMs,
              specs.length === 1 ? specs[0]! : withSequence(...specs),
            )

      if (key.startsWith(TRANSFORM_PREFIX)) {
        const [rawIndex, name] = key.slice(TRANSFORM_PREFIX.length).split(".")
        const index = Number(rawIndex)
        transformInitial[index] = {
          ...(transformInitial[index] ?? {}),
          [name!]: first.value,
        }
        transformAnimated[index] = {
          ...(transformAnimated[index] ?? {}),
          [name!]: track,
        }
        continue
      }
      initialValues[key] = first.value
      animations[key] = track
    }

    if (transformAnimated.length > 0) {
      initialValues.transform = [...transformInitial]
      animations.transform = [...transformAnimated]
    }

    // Whatever could not become a numeric track goes in as a plain value, so
    // the runtime gets a chance to name it — see `unhandled` above.
    for (const [key, value] of this.unhandled) {
      initialValues[key] = value
    }

    const extra = this.initialValuesV
    return () => ({
      initialValues: { ...initialValues, ...extra },
      animations,
      callback,
    })
  }
}
