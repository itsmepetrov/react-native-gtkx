// `AnimatableValue`: upstream's real contract for what `withTiming`/
// `withSpring` accept, read out of `react-native-reanimated` 4.5.3's
// `src/animation/util.ts` (`decorateAnimation`) and `src/hook/useAnimatedStyle.ts`
// (`prepareAnimation`) — not inferred, not guessed at "probably per-key
// seeding" the way the task that asked for this started out.
//
// UPSTREAM'S RECURSIVE RULE, transcribed from `decorateAnimation`. The
// factory-built animation (a `TimingAnimation`/`SpringAnimation`) is generic
// over a single number; `decorateAnimation` wraps its `onStart`/`onFrame` so
// the SAME animation can drive a colour, a matrix, an array or an object,
// dispatched once per `onStart` call on the VALUE it is handed:
//
//   - a plain number: the base numeric step runs unchanged (untouched here).
//   - an object (`typeof value === "object"`, not an array, not a colour):
//     `objectOnStart` walks `for (const key in value)` — the FROM value's
//     OWN keys, not the target's — clones the (callback-stripped) animation
//     once per key, sets that clone's `toValue` to `toValue[key]` (which is
//     `undefined` for a key the target does not have), and re-assigns the
//     clone's `onStart` to the SAME decorated dispatcher, so a nested object
//     recurses. `objectOnFrame` steps every clone and folds a FRESH object
//     together every frame; the whole animation is `finished` only when every
//     clone is (`finished = finished && result`, an AND across every leaf).
//   - an array (`Array.isArray(value)`): `arrayOnStart`/`arrayOnFrame` walk
//     the SAME way, index by index, but the clones keep the animation's own
//     BASE (undecorated) `onStart` rather than the dispatcher — an array's
//     elements are always plain numbers upstream, never nested objects.
//
// Two consequences worth stating because they are easy to get backwards:
//
//   1. Upstream's own object/array walk is driven by the FROM value's shape,
//      and a target key the from-value lacks is silently never animated (its
//      clone is never created). This is what "an accident, not a feature"
//      looks like in practice — a target that grew a key nobody notices.
//      THIS PLATFORM THROWS INSTEAD, at the point an object-targeted
//      animation is built (`buildAnimation`/`zipAnimatableLeaves` below): the
//      "fail loudly, not silently" rule this whole layer already follows for
//      a non-finite target (`assertAnimatableValue`) extends to a reshaped
//      one. docs/api.md's Differences row says so.
//   2. There is exactly ONE callback per animation, at the top of the tree —
//      `animationCopy` used for every leaf clone has `delete
//      animationCopy.callback`, so a leaf can never report its own
//      completion. Only the root's callback exists, and it fires once, when
//      the root's `onFrame` returns `finished`.
//
// THE SEEDING RULE upstream's `prepareAnimation` adds on top (useAnimatedStyle.ts):
// a key that is newly animating this run starts from `oldValues[key]` — the
// PREVIOUS updater result's raw value at that key — but only when that value
// is USABLE as a starting point:
//
//   let value = animation.current               // default: the target
//   if (lastValue is a number or anything non-object) value = lastValue
//   else if (lastValue has an own `.value`)      value = lastValue.value    // was a shared value
//   else if (lastValue has an own `.onFrame`)     value = (previous animation's .current)
//   // a lastValue that is a PLAIN OBJECT — no `.value`, no `.onFrame` — is
//   // NEVER read from. `value` stays the default: the target.
//
// So a key that held a plain NUMBER seeds from it (already this platform's
// rule, `updater-animations.ts`'s `startingPoint` — unchanged by this file).
// A key that held a plain OBJECT — an ordinary `{x, y}`, not a shared value
// or an animation node — does NOT seed from it, upstream's `typeof lastValue
// === "object"` branch simply has no case that matches a plain data object.
// It is treated exactly like a key that was ABSENT: seeded at the target,
// never animated to it. This is the one genuinely surprising rule this file
// exists to pin down, and it costs nothing extra to implement: this
// platform's `startingPoint` already returns `undefined` for anything that
// is not a finite number, which — now that objects are legal targets too —
// already IS upstream's rule, unchanged.
import type {
  CompositeAnimation,
  EasingFunction,
  EndCallback,
  FrameScheduler,
  MakeStep,
} from "../animated/index"
import { springStep, timingStep } from "../animated/index"
import type { WithSpringConfig } from "./animation"

/** Upstream's `AnimatableValue`, minus colour strings — those keep the
 * existing, separate `interpolateColor` path (docs/api.md), so a leaf here
 * is always a number. */
export type AnimatableValue = number | AnimatableArray | AnimatableObject

export type AnimatableArray = readonly number[]

export type AnimatableObject = { readonly [key: string]: AnimatableValue }

/** A path from the root of an `AnimatableValue` to one of its number leaves. */
export type LeafPath = ReadonlyArray<string | number>

const pathToString = (path: LeafPath): string =>
  path.length === 0 ? "(root)" : path.join(".")

/**
 * True for anything `withTiming`/`withSpring` can legally target: a finite
 * number, a plain object of these (recursively — upstream's `objectOnStart`
 * re-decorates its clones' `onStart`, so nested objects genuinely work), or
 * a plain array of finite numbers (upstream's arrays are flat: a clone's
 * `onStart` is the undecorated base one, so an array element is always a
 * number, never itself an object or array).
 */
export const isAnimatableValue = (value: unknown): value is AnimatableValue => {
  if (typeof value === "number") {
    return Number.isFinite(value)
  }
  if (Array.isArray(value)) {
    return value.every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).every(isAnimatableValue)
  }
  return false
}

/**
 * Validates and returns `value` unchanged — no cloning, exactly upstream's
 * `defineAnimation` returning `starting` by reference under
 * `IN_STYLE_UPDATER`. Throws the same shape of error the number-only gate
 * always has, widened to name the actual offending leaf.
 */
export const assertAnimatableValue = <T>(value: T, api: string): T => {
  if (!isAnimatableValue(value)) {
    throw new Error(
      `react-native-reanimated: ${api}() on this platform animates finite numbers, and plain objects/arrays whose leaves are finite numbers. Got ${
        typeof value === "string" ? `"${String(value)}"` : String(value)
      }. Colors and layout properties cannot be driven imperatively here yet — see docs/api.md.`,
    )
  }
  return value
}

/** A single leaf: where it lives in the shape, and its two endpoints. */
type LeafEndpoints = { path: LeafPath; from: number; to: number }

/**
 * The shape a merged frame is rebuilt from: a tree with the SAME keys/indices
 * as the origin value, and a leaf index in place of every number — recorded
 * once, at the start of an animation, and reused every frame
 * (`rebuildAnimatableValue`) rather than re-walked.
 */
export type AnimatableShape =
  | { kind: "leaf"; index: number }
  | { kind: "array"; children: readonly AnimatableShape[] }
  | { kind: "object"; children: Readonly<Record<string, AnimatableShape>> }

const shapeMismatch = (
  api: string,
  path: LeafPath,
  from: unknown,
  to: unknown,
): Error =>
  new Error(
    `react-native-reanimated: ${api}() was given a target whose shape does not match the value it is animating from, at ${pathToString(path)} ` +
      `(from ${JSON.stringify(from)}, to ${JSON.stringify(to)}). ` +
      "Upstream drives this from the FROM value's own keys and silently leaves a mismatched one at its previous value forever — " +
      "this platform throws instead, naming where the shapes disagree. See docs/api.md, “Animated values”.",
  )

const buildShape = (
  api: string,
  from: AnimatableValue,
  to: AnimatableValue,
  path: LeafPath,
  leaves: LeafEndpoints[],
): AnimatableShape => {
  if (typeof from === "number") {
    if (typeof to !== "number") {
      throw shapeMismatch(api, path, from, to)
    }
    const index = leaves.length
    leaves.push({ path, from, to })
    return { kind: "leaf", index }
  }
  if (Array.isArray(from)) {
    if (!Array.isArray(to) || to.length !== from.length) {
      throw shapeMismatch(api, path, from, to)
    }
    return {
      kind: "array",
      children: from.map((item, index) =>
        buildShape(api, item, to[index]!, [...path, index], leaves),
      ),
    }
  }
  // A plain object (isAnimatableValue already refused everything else).
  const fromObject = from as AnimatableObject
  if (typeof to !== "object" || to === null || Array.isArray(to)) {
    throw shapeMismatch(api, path, from, to)
  }
  const toObject = to as AnimatableObject
  const fromKeys = Object.keys(fromObject).sort()
  const toKeys = Object.keys(toObject).sort()
  if (
    fromKeys.length !== toKeys.length ||
    fromKeys.some((key, index) => key !== toKeys[index])
  ) {
    throw shapeMismatch(api, path, from, to)
  }
  const children: Record<string, AnimatableShape> = {}
  for (const key of fromKeys) {
    children[key] = buildShape(
      api,
      fromObject[key]!,
      toObject[key]!,
      [...path, key],
      leaves,
    )
  }
  return { kind: "object", children }
}

/**
 * Walks `from` and `to` together into a flat leaf list plus the shape to
 * rebuild frames from. Throws when the two do not line up — see the header:
 * this is the one place this platform's behaviour is a deliberate, documented
 * departure from upstream's silent drop.
 */
export const zipAnimatableLeaves = (
  api: string,
  from: AnimatableValue,
  to: AnimatableValue,
): { shape: AnimatableShape; leaves: LeafEndpoints[] } => {
  const leaves: LeafEndpoints[] = []
  const shape = buildShape(api, from, to, [], leaves)
  return { shape, leaves }
}

/** The inverse of the walk above: leaf values, in `zipAnimatableLeaves` order, folded back into `shape`'s structure. */
export const rebuildAnimatableValue = (
  shape: AnimatableShape,
  values: readonly number[],
): AnimatableValue => {
  switch (shape.kind) {
    case "leaf":
      return values[shape.index]!
    case "array":
      return shape.children.map(
        (child) => rebuildAnimatableValue(child, values) as number,
      )
    case "object": {
      const result: Record<string, AnimatableValue> = {}
      for (const key of Object.keys(shape.children)) {
        result[key] = rebuildAnimatableValue(shape.children[key]!, values)
      }
      return result
    }
  }
}

/**
 * A deterministic string for an `AnimatableValue`, key order independent —
 * `animationSignature` (animation.ts) uses this so two target objects built
 * with the same keys in a different order (`{x, y}` vs `{y, x}`, both
 * entirely normal across two renders) are recognised as the same animation
 * rather than restarting it.
 */
export const animatableValueSignature = (value: AnimatableValue): string => {
  if (typeof value === "number") {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => item).join(",")}]`
  }
  const object = value as AnimatableObject
  const keys = Object.keys(object).sort()
  return `{${keys.map((key) => `${key}:${animatableValueSignature(object[key]!)}`).join(",")}}`
}

/**
 * Structural, not reference, equality — an object rebuilt fresh every frame
 * (`rebuildAnimatableValue`) is never `Object.is` the value it replaces even
 * when every leaf agrees. Used where the number-only code compared with
 * `Object.is` (`updater-animations.ts`'s snap-on-replacement rule); returns
 * `false` on a shape it cannot line up rather than throwing — this is a
 * comparison, not a build, and "different" is always a safe answer here.
 */
export const sameAnimatableValue = (
  a: AnimatableValue,
  b: AnimatableValue,
): boolean => {
  if (typeof a === "number" || typeof b === "number") {
    // Object.is, not ===: -0/0 and NaN/NaN are distinct/equal respectively,
    // matching what the number-only code compared landed values with before
    // this function existed.
    return Object.is(a, b)
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    return a.every((item, index) => Object.is(item, b[index]))
  }
  const objectA = a as AnimatableObject
  const objectB = b as AnimatableObject
  const keysA = Object.keys(objectA)
  const keysB = Object.keys(objectB)
  if (keysA.length !== keysB.length) {
    return false
  }
  return keysA.every(
    (key) =>
      key in objectB && sameAnimatableValue(objectA[key]!, objectB[key]!),
  )
}

/**
 * The largest change any single leaf underwent, for the landing cadence's
 * epsilon check (`updater-animations.ts`): the old question — did the number
 * move a pixel — becomes: did any leaf move a pixel. A `{x, y}` position where
 * only `y` is moving still has to land.
 */
export const maxAnimatableLeafDelta = (
  a: AnimatableValue,
  b: AnimatableValue,
): number => {
  if (typeof a === "number") {
    return typeof b === "number" ? Math.abs(a - b) : Number.POSITIVE_INFINITY
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      return Number.POSITIVE_INFINITY
    }
    return Math.max(
      0,
      ...a.map((item, index) => maxAnimatableLeafDelta(item, b[index]!)),
    )
  }
  const objectA = a as AnimatableObject
  const objectB = b as AnimatableObject
  const keys = Object.keys(objectA)
  if (typeof b !== "object" || b === null || Array.isArray(b)) {
    return Number.POSITIVE_INFINITY
  }
  return Math.max(
    0,
    ...keys.map((key) =>
      key in objectB
        ? maxAnimatableLeafDelta(objectA[key]!, objectB[key]!)
        : Number.POSITIVE_INFINITY,
    ),
  )
}

/**
 * A `MakeStep` over a whole `AnimatableValue`: every leaf gets its own
 * `timingStep`/`springStep` (upstream's per-leaf clone, `objectOnStart`) —
 * SAME duration/easing/config for a timing leaf, an INDEPENDENTLY solved
 * spring per leaf (each one's stiffness/damping only depends on ITS OWN
 * displacement — `toPlatformSpringConfig` already computes it that way for
 * the single-number case, called once per leaf here) — stepped in lockstep
 * off ONE elapsed clock so the merged object publishes exactly once a frame,
 * never once per leaf. `done` is the AND across every leaf, matching
 * upstream's `objectOnFrame`.
 */
export type LeafStepFactory = (from: number, to: number) => MakeStep

export const shapeMakeSteps = (
  api: string,
  toValue: AnimatableValue,
  leafStepFor: LeafStepFactory,
): ((startValue: AnimatableValue) => (elapsedMs: number) => {
  position: AnimatableValue | null
  done: boolean
}) => {
  return (startValue) => {
    const { shape, leaves } = zipAnimatableLeaves(api, startValue, toValue)
    const stepFns = leaves.map(({ from, to }) => leafStepFor(from, to)(from))
    return (elapsedMs) => {
      let allDone = true
      const positions: number[] = []
      for (const stepFn of stepFns) {
        const result = stepFn(elapsedMs)
        // Every leaf here has delay 0 (withDelay wraps the WHOLE animation,
        // never one leaf) so a step never actually returns a null position —
        // this is defensive, not a case that fires.
        positions.push(result.position ?? Number.NaN)
        if (!result.done) {
          allDone = false
        }
      }
      return {
        position: rebuildAnimatableValue(shape, positions),
        done: allDone,
      }
    }
  }
}

/** `shapeMakeSteps` specialised for `withTiming`: every leaf shares the same duration/easing. */
export const timingShapeMakeSteps = (
  toValue: AnimatableValue,
  duration: number,
  easing: EasingFunction,
) =>
  shapeMakeSteps("withTiming", toValue, (from, to) =>
    timingStep(to, duration, easing),
  )

/**
 * `shapeMakeSteps` specialised for `withSpring`: each leaf's physical
 * parameters are solved independently, via `toPlatformSpringConfig` (passed
 * in — animation.ts owns it — rather than duplicated here).
 */
export const springShapeMakeSteps = (
  toValue: AnimatableValue,
  toPlatformSpringConfig: (
    config: WithSpringConfig,
    toValue: number,
    from: number,
  ) => Parameters<typeof springStep>[0],
  config: WithSpringConfig,
) =>
  shapeMakeSteps("withSpring", toValue, (from, to) =>
    springStep(toPlatformSpringConfig(config, to, from)),
  )

type ShapeListener = (event: { value: AnimatableValue }) => void

/**
 * The object/array counterpart of `AnimatedValue` — deliberately minimal
 * rather than a generalisation of that class: no offset, no `interpolate`,
 * no self-tracked "current animation" (every caller here already stops the
 * previous `CompositeAnimation` itself before starting a new one — mutable.ts
 * and updater-animations.ts both do, same as they always have). What it DOES
 * match is the structural shape `buildAnimation`, mutable.ts and
 * updater-animations.ts actually read off a driver: `__getValue`,
 * `addListener`/`removeListener`, and `setValue` for `buildRepeat`'s replay
 * branch (the one place a driver is force-set from outside an animation).
 */
export class AnimatedShapeValue {
  private _value: AnimatableValue
  private readonly _listeners = new Map<string, ShapeListener>()
  private _nextListenerId = 1

  constructor(value: AnimatableValue) {
    this._value = value
  }

  __getValue(): AnimatableValue {
    return this._value
  }

  /** @internal Called once per animation frame, after every leaf has stepped. */
  __updateValue(value: AnimatableValue): void {
    this._value = value
    for (const listener of [...this._listeners.values()]) {
      listener({ value })
    }
  }

  /** RN's own escape hatch: force the value, notifying listeners — what `withRepeat`'s non-reverse replay uses to snap back between iterations. */
  setValue(value: AnimatableValue): void {
    this.__updateValue(value)
  }

  addListener(listener: ShapeListener): string {
    const id = String(this._nextListenerId++)
    this._listeners.set(id, listener)
    return id
  }

  removeListener(id: string): void {
    this._listeners.delete(id)
  }
}

/**
 * `createValueAnimation`'s counterpart for an `AnimatedShapeValue` — same
 * start/stop/preemption contract (a second `start()` on the same
 * `CompositeAnimation` preempts the first, reporting `{finished: false}`),
 * deliberately re-implemented rather than generalising `createValueAnimation`
 * itself: that function is `src/animated`'s, i.e. RN's own Animated engine,
 * scalar by the RN spec it mirrors (`Animated.ValueXY` is RN's own answer to
 * a pair, and is a different, narrower thing). This is reanimated-compat's
 * own extension point, the same way `decayStep` + the PUBLIC
 * `createValueAnimation` was for `withDecay` — except here the driver itself
 * is not the platform's, so the harness around it is not either.
 */
export const createShapeValueAnimation = (
  scheduler: FrameScheduler,
  value: AnimatedShapeValue,
  makeSteps: ReturnType<typeof shapeMakeSteps>,
): CompositeAnimation => {
  let activeStop: (() => void) | null = null

  const start = (callback?: EndCallback): void => {
    // A second start() on the SAME CompositeAnimation preempts the first,
    // reporting { finished: false } to its own callback — RN parity, and
    // resolved fully before the new run's state exists below, so there is no
    // reentrancy between the two.
    activeStop?.()

    const step = makeSteps(value.__getValue())
    let startTime: number | null = scheduler.now?.() ?? null
    let ended = false
    let cancelFrame: (() => void) | null = null

    const end = (finished: boolean): void => {
      if (ended) {
        return
      }
      ended = true
      cancelFrame?.()
      cancelFrame = null
      if (activeStop === stop) {
        activeStop = null
      }
      callback?.({ finished })
    }

    const stop = (): void => end(false)

    const onFrame = (timeMs: number): void => {
      cancelFrame = null
      if (ended) {
        return
      }
      if (startTime === null) {
        startTime = timeMs
      }
      const { position, done } = step(timeMs - startTime)
      if (position !== null) {
        value.__updateValue(position)
      }
      if (done) {
        end(true)
        return
      }
      cancelFrame = scheduler.schedule(onFrame)
    }

    activeStop = stop
    cancelFrame = scheduler.schedule(onFrame)
  }

  return {
    start,
    stop: () => activeStop?.(),
    // No known caller resets a shape animation (loop()/withRepeat's own
    // reverse and replay branches drive the value directly) — a snap back to
    // a construction-time value would need one, and nothing needs it yet.
    reset: () => {},
  }
}
