// An animation returned FROM a style or props updater, which is the shape the
// documentation of `useAnimatedStyle` is written in:
//
//   const style = useAnimatedStyle(() => ({
//     height: withSpring(open.value ? 320 : 0),
//   }))
//
// Assigning an animation to a shared value has always worked here
// (mutable.ts). Returning one from an updater did not, and it failed the way
// this repo likes least: silently. `with*` builders return a MARKED DESCRIPTOR
// outside the initial run (animation.ts), the style layer's leaf test is
// `typeof value === "number"`, and a descriptor is an object — so the property
// was neither driven nor written nor warned about. It simply sat in the style
// as `{kind: "spring", toValue: 543.4, …}`.
//
// Found by `spike/core-exports`, not by reading: `@gorhom/bottom-sheet` bounds
// its scrollable with `height: animate({point: …})` from `useAnimatedStyle`,
// and the probe's report that the height "is not reaching the Yoga node" was
// true for a reason one layer earlier than layout — the height was never a
// number on this platform at all. docs/research/animated-size.md §9.
//
// WHAT THIS MODULE IS. One running animation per key, on the platform's own
// `Animated.Value` and the platform's one frame scheduler — the same
// `buildAnimation` a shared value uses, so `withTiming`, `withSpring`,
// `withDelay`, `withSequence`, `withRepeat`, `withDecay` and `withClamp` all
// arrive here already implemented. The updater's object is republished with
// each animated key replaced by the number its animation is currently at, and
// a frame of a running animation costs no React render — it goes down exactly
// the path a shared value written every frame goes down.
//
// THREE RULES, and all three are upstream's — every one of them read out of
// `hook/useAnimatedStyle.ts`'s `styleUpdater`/`prepareAnimation` rather than
// inferred from behaviour:
//
//  - A key APPEARING for the first time is seeded at the animation's target
//    rather than animated to it. There is nothing to animate from, and it is
//    the same collapse `initialUpdaterRun` performs on the updater's first
//    run. Upstream reaches the same place from the other direction: its
//    `prepareAnimation` starts at `oldValues[key]`, which for a key that was
//    not in the last result is `undefined` and leaves the animation's own
//    `current` — its target — standing.
//  - A key whose previous result held a PLAIN NUMBER animates from that
//    number. `oldValues` is `state.last`, the whole previous updater result
//    kept raw, and `prepareAnimation`'s last branch is one line with the
//    comment already on it: `// previously it was a plain value, just set it
//    as starting point`. So `height: open.value ? withTiming(200) : 100` runs
//    100 → 200, and the idiom people actually write — snap shut, open
//    smoothly — animates. It did not here: the key was dropped when it held a
//    number and re-seeded when it next held an animation, so the seed went
//    straight to 200 and the animation never played at all. Silently, which
//    is the failure this repo ranks worst.
//  - A re-run that produces an EQUIVALENT animation does not restart it. A
//    mapper re-runs whenever anything it read changed, which for a real app is
//    many times a second, and rebuilding the spring each time would leave it
//    crawling. Equivalence is the descriptor's target and shape
//    (`animationSignature`), not object identity — every run builds a fresh
//    object.
//
// AND THE REVERSE DIRECTION, animation → plain number, which is upstream's
// too and is not the mirror image of the second rule: `styleUpdater`'s
// non-animated branch does `delete animations[key]` and pushes the value
// through `updateProps` in the SAME run, so the animation is cancelled — no
// callback, no settle — and the number lands at once. It does not ease back.
// The only thing this platform has to add is the render a refused property
// needs to land at all, because "at once" through React is still a render (see
// `onLanding`).
//
// WHERE THIS DIFFERS FROM UPSTREAM, said out loud: a restart picks the
// animation up at the value it is currently at, with the velocity the new
// descriptor asks for, where upstream also carries the previous animation's
// VELOCITY across. For a target that moves once that is the same animation;
// for a target that moves every frame ours is slightly more damped.
//
// AND THE CADENCE, the one rule here that is ours rather than upstream's — see
// LANDING_INTERVAL_MS. It exists because none of the above is enough for a
// property whose frames this platform refuses to write: for those, the value
// only exists on screen at whatever the last React render committed, and "the
// render at the settle" turned out to be arbitrarily far away.
import type { CompositeAnimation } from "../animated/index"
import {
  isAnimatableValue,
  maxAnimatableLeafDelta,
  sameAnimatableValue,
  type AnimatableValue,
} from "./animatable-value"
import {
  animationSignature,
  buildAnimation,
  isAnimationSpec,
  makeAnimationDriver,
  targetOf,
  type AnimationDriver,
  type AnimationEngine,
  type AnimationSpec,
} from "./animation"

/** What an updater returns: a style object, or a props object. */
export type UpdaterObject = Record<string, unknown>

// How far behind its own animation a property this platform will not drive at
// frame rate is allowed to fall.
//
// The settle alone is not an answer, and `@gorhom/bottom-sheet` MOUNTING is
// the measurement that says so. Its content mask is bounded by an animated
// `height` whose target is derived from the sheet's own POSITION, so every
// frame of the opening spring re-aims it — 37 re-aims over 673 ms, each
// cancelling the last, so not one of them a settle — and then a further
// 677 ms for the final spring to converge. Measured on the gallery's
// `upstream-bottom-sheet` screen: the seed was 95.9 px (gorhom's
// `animatedContentHeightMax` was still 0 on the mapper run that first
// produced a `height` at all, and the real 832 px arrived 27 ms later, by
// which time the key already had an entry and a moving target is an animation
// rather than a seed), and `height` reached Yoga exactly TWICE in the whole
// mount: 95.9 px at once, 954.6 px 1378 ms later. For 1.38 s the mask was a
// tenth of its size, the list inside it had no bounded parent, and it mounted
// zero of its 18 rows. Correct by the settle rule and plainly wrong to
// anybody opening the screen.
//
// So the value lands on a cadence as well. 100 ms because that is the bound
// under which a change still reads as immediate, and because it bounds the
// cost by the CLOCK rather than by the animation: at most ten renders a
// second per animated key, against sixty frames. The same mount now lands the
// mask at 266 → 546 → 649 → 731 → 792 → 832 → 896 → 939 → 951 → 954 px before
// settling at 954.6 — the shape the animation has, at a tenth of its rate —
// with the first at ~100 ms rather than 1.38 s.
//
// What it costs, both halves measured in one `spike/core-exports` run on the
// same machine: 4 settles and 4 renders against 290 refused-property frames
// before, 4 settles + 38 landings and 42 renders against 294 after. Still an
// order of magnitude under the per-frame layout write the refusal exists to
// avoid, and no longer a promise that may never come due.
// docs/research/animated-size.md §10.
const LANDING_INTERVAL_MS = 100

// A landing that cannot move a widget is a render for nothing: GTK allocates
// whole pixels, so a sub-pixel step changes no committed geometry. It is what
// keeps a long animation over a short distance from spending ten renders a
// second to travel one pixel — gorhom's `paddingBottom` crosses 26 px over the
// same 1.38 s and lands 8 times, not 13.
const LANDING_EPSILON = 1

type Entry = {
  driver: AnimationDriver
  listenerId: string
  signature: string
  running: CompositeAnimation | null
  // The value React was last given for this key, and the moment it was given
  // — the two the cadence is measured against. They survive a restart on
  // purpose: what matters is how stale REACT's copy is, not how far the
  // animation currently in flight has come. A number for a scalar key, an
  // object/array for a shape one (AnimatableValue, animatable-value.ts).
  landedValue: AnimatableValue
  landedAt: number
}

export type UpdaterAnimations = {
  /**
   * Resolves `source`'s animations and publishes the result. Called from the
   * mapper, so `source` is a fresh object every time.
   */
  run(source: UpdaterObject): void
  dispose(): void
}

/**
 * @param publish Receives the updater's object with every animated key
 *   replaced by a number. Called once per mapper run and once per animation
 *   frame.
 * @param onSettled Called when an animation on `key` reaches its target on its
 *   own (never when it is cancelled or replaced). The style layer uses it for
 *   the properties it refuses to drive at frame rate, whose contract is that
 *   the value lands on the next React render — without it, that promise is
 *   only kept when something else happens to re-render.
 * @param onLanding Called when `key`'s current value has to reach React
 *   without its animation having reached a target. Two occasions: while an
 *   animation runs, at most once per `LANDING_INTERVAL_MS` and only when the
 *   value has moved far enough to change a committed layout (the cadence); and
 *   when a plain number REPLACES a running animation, where upstream cancels
 *   and snaps and a refused property cannot snap without a render. The snap is
 *   deliberately not rate-limited — it is a state change rather than a step of
 *   one, it happens once per mapper run that flips the key rather than once per
 *   frame, and upstream pushes exactly the same number of `updateProps` for it.
 *   Same job as `onSettled` and the same handling at the call site; it is a
 *   separate callback because a settle and a value that has merely got to be
 *   published are different claims, and only the first one is a promise kept.
 *   Omit it and both cost nothing at all — a caller with no refused properties
 *   (`useAnimatedProps`) does.
 */
export const createUpdaterAnimations = (
  engine: AnimationEngine,
  publish: (resolved: UpdaterObject) => void,
  onSettled?: (key: string) => void,
  onLanding?: (key: string) => void,
): UpdaterAnimations => {
  const entries = new Map<string, Entry>()
  // The clock the animations themselves run on, never `Date` — the whole
  // layer is driven by one injected scheduler so a test can take it
  // (components/frame-scheduler.ts). A driver that only has frame stamps and
  // no off-frame `now` cannot have a cadence, and falls back to the settle.
  const hasClock = engine.scheduler.now !== undefined
  const now = (): number => engine.scheduler.now?.() ?? 0
  let lastSource: UpdaterObject | null = null
  // A frame of one key's animation republishes the WHOLE object, which
  // re-enters `resolve`. The guard keeps that from restarting anything: the
  // run in progress publishes the final state itself.
  let resolving = false

  /**
   * @param replacement The plain value that took the key over, or `undefined`
   *   when the key left the updater's result altogether.
   *
   *   A number here owes the caller a render, and `landedValue` is what decides
   *   it: that field is this module's whole model of what REACT holds for the
   *   key, and everything since the last landing or settle went to the widget
   *   without passing through React. So a plain number that differs from it has
   *   to be published or it never arrives — on a refused property the snap IS
   *   a render, and neither the cadence nor a settle is ever going to come for
   *   it. Compared without the cadence's one-pixel epsilon and for the same
   *   reason a settle ignores it: this is a resting value rather than a step
   *   towards one, and there is nothing after it to correct a skipped render.
   *
   *   Not asked for otherwise. A key that VANISHED, or one replaced by a
   *   percentage or a colour, changes the style's SHAPE, and the caller already
   *   pays exactly one render for that (hooks.ts); a value equal to the one
   *   React already has is a render for nothing.
   */
  const drop = (key: string, replacement: unknown): void => {
    const entry = entries.get(key)
    if (entry === undefined) {
      return
    }
    entries.delete(key)
    entry.running?.stop()
    entry.driver.removeListener(entry.listenerId)
    // A number originally; now also an object/array of numbers — either way
    // a resting AnimatableValue owes the caller a render if it differs from
    // what React was last given. `sameAnimatableValue` replaces the original
    // `Object.is`: a merged object is rebuilt fresh every frame
    // (rebuildAnimatableValue), so it is never the SAME reference as the
    // landed value even when every leaf agrees.
    if (
      isAnimatableValue(replacement) &&
      !sameAnimatableValue(replacement, entry.landedValue)
    ) {
      onLanding?.(key)
    }
  }

  const republish = (): void => {
    if (resolving || lastSource === null) {
      return
    }
    // No previous result on a frame: nothing can START an animation here — the
    // source has not changed — so there is nothing to look a starting point up
    // for.
    publish(resolve(lastSource, null))
  }

  /**
   * Records that `key`'s current value is the one React now holds. Called
   * wherever a render is asked for, so the cadence is measured from the last
   * value React was actually given rather than from the last frame.
   */
  const markLanded = (entry: Entry): void => {
    entry.landedValue = entry.driver.__getValue()
    entry.landedAt = now()
  }

  /**
   * The cadence: see LANDING_INTERVAL_MS. For a shape key (`{x, y}`, …) "far
   * enough to change a committed layout" is ANY leaf crossing the epsilon —
   * `maxAnimatableLeafDelta` is the largest single-leaf change, not a sum, so
   * a diagonal move is not double-counted into landing twice as often.
   */
  const considerLanding = (key: string, value: AnimatableValue): void => {
    if (onLanding === undefined || !hasClock) {
      return
    }
    const entry = entries.get(key)
    if (entry === undefined) {
      return
    }
    if (now() - entry.landedAt < LANDING_INTERVAL_MS) {
      return
    }
    if (maxAnimatableLeafDelta(value, entry.landedValue) < LANDING_EPSILON) {
      return
    }
    markLanded(entry)
    onLanding(key)
  }

  /** Aims `entry`'s driver at `spec`, replacing whatever it was running. */
  const start = (
    key: string,
    entry: Entry,
    spec: AnimationSpec,
    signature: string,
  ): Entry => {
    entry.signature = signature
    entry.running?.stop()
    const animation = buildAnimation(engine, entry.driver, spec)
    entry.running = animation
    animation.start((result) => {
      if (entry.running === animation) {
        entry.running = null
      }
      // `finished` only: a restart stops the previous animation, and reporting
      // that as a settle would publish through React on every frame the target
      // moves, which is the cost the refusal exists to avoid. A restart is
      // still covered — the cadence above is what carries a target that keeps
      // moving, and it does not care whose animation the frames belong to.
      if (result.finished) {
        markLanded(entry)
        onSettled?.(key)
      }
    })
    return entry
  }

  /**
   * Where an animation that is starting has to start FROM, for a key that was
   * not animating a moment ago: the value the PREVIOUS updater result held for
   * it, and only when that is a real number.
   *
   * This is `prepareAnimation(…, oldValues[key])` and nothing more —
   * `oldValues` is `state.last`, upstream's copy of the whole previous updater
   * result — so the second of the header's three rules costs no bookkeeping at
   * all. The previous result is an object this module was already holding for
   * `republish`; reading one key out of it is the entire mechanism, and the
   * entry does not have to carry a value across runs or outlive its animation.
   *
   * Numbers only, and `undefined` for everything else — which, now that a key
   * can hold an OBJECT too, is worth stating precisely: a plain object
   * (`{x: 5, y: 10}`) does NOT carry over here, on purpose, and it is
   * upstream's own rule, not a gap in this one. `prepareAnimation`'s branches
   * are `typeof lastValue === "object"` → was it a shared value (`.value`) or
   * an animation node (`.onFrame`)? Neither matches a plain data object, so
   * `value` is left at its default — the animation's own target. A key whose
   * previous value was a plain OBJECT is therefore seeded at the target
   * exactly like a key that was absent, and only a plain NUMBER ever carries
   * over as a starting point. This function already implemented that rule by
   * accident, before objects were legal at all; nothing here changed.
   */
  const startingPoint = (
    previous: UpdaterObject | null,
    key: string,
  ): number | undefined => {
    const value = previous?.[key]
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined
  }

  const ensure = (
    key: string,
    spec: AnimationSpec,
    previous: UpdaterObject | null,
  ): Entry => {
    const signature = animationSignature(spec)
    const existing = entries.get(key)
    if (existing !== undefined) {
      return existing.signature === signature
        ? existing
        : start(key, existing, spec, signature)
    }
    const from = startingPoint(previous, key)
    // The driver is seeded before anything is built on purpose: a spring reads
    // its origin off the value it is given (animation.ts), so this IS where
    // "animate from the old number" happens. makeAnimationDriver picks the
    // right driver kind for the seed — a number for a scalar key, a shape
    // (animatable-value.ts) for an object/array one.
    const driver = makeAnimationDriver(
      engine.api,
      from ?? targetOf(spec) ?? 0,
      `the "${key}" key of an updater's result`,
    )
    const entry: Entry = {
      driver,
      listenerId: driver.addListener(({ value }) => {
        republish()
        considerLanding(key, value)
      }),
      signature,
      running: null,
      // Whichever branch follows, React's copy of this key is the value the
      // driver starts at: a seed changes the style's SHAPE and the caller
      // already pays one render for that (hooks.ts), and a starting point that
      // came out of the previous result is a number React was already handed.
      // So the cadence starts here either way.
      landedValue: driver.__getValue(),
      landedAt: now(),
    }
    entries.set(key, entry)
    // Nothing to animate from: seeded at the target and not started at all,
    // which is the first of the header's three rules.
    return from === undefined ? entry : start(key, entry, spec, signature)
  }

  const resolve = (
    source: UpdaterObject,
    previous: UpdaterObject | null,
  ): UpdaterObject => {
    resolving = true
    try {
      let resolved: UpdaterObject | null = null
      for (const key of Object.keys(source)) {
        const value = source[key]
        if (!isAnimationSpec(value)) {
          // A plain value replacing an animation cancels it and snaps, exactly
          // as an assignment to a shared value does and exactly as upstream's
          // `delete animations[key]` + `updateProps` in the same run does. The
          // number itself is published below, by identity.
          drop(key, value)
          continue
        }
        resolved ??= { ...source }
        resolved[key] = ensure(key, value, previous).driver.__getValue()
      }
      for (const key of [...entries.keys()]) {
        if (!(key in source)) {
          drop(key, undefined)
        }
      }
      return resolved ?? source
    } finally {
      resolving = false
    }
  }

  return {
    run(source) {
      // `state.last`, upstream's name for it: the result this run's animations
      // measure themselves against. Held for one run only, and it was already
      // being held.
      const previous = lastSource
      lastSource = source
      publish(resolve(source, previous))
    },
    dispose() {
      for (const key of [...entries.keys()]) {
        // Nothing is owed a render: the component is going away.
        drop(key, undefined)
      }
      lastSource = null
    },
  }
}
