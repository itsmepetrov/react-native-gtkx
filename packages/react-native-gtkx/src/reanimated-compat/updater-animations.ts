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
// TWO RULES, and both are upstream's:
//
//  - A key APPEARING for the first time is seeded at the animation's target
//    rather than animated to it. There is nothing to animate from, and it is
//    the same collapse `initialUpdaterRun` performs on the updater's first
//    run. Upstream reaches the same place from the other direction: its
//    `prepareAnimation` starts at `oldValues[key]`, which for a key that was
//    not in the last result is the initial run's own value.
//  - A re-run that produces an EQUIVALENT animation does not restart it. A
//    mapper re-runs whenever anything it read changed, which for a real app is
//    many times a second, and rebuilding the spring each time would leave it
//    crawling. Equivalence is the descriptor's target and shape
//    (`animationSignature`), not object identity — every run builds a fresh
//    object.
//
// WHERE THIS DIFFERS FROM UPSTREAM, said out loud: a restart picks the
// animation up at the value it is currently at, with the velocity the new
// descriptor asks for, where upstream also carries the previous animation's
// VELOCITY across. For a target that moves once that is the same animation;
// for a target that moves every frame ours is slightly more damped.
//
// AND THE CADENCE, which is the third rule and the only one that is ours
// rather than upstream's — see LANDING_INTERVAL_MS. It exists because the
// first two are not enough for a property whose frames this platform refuses
// to write: for those, the value only exists on screen at whatever the last
// React render committed, and "the render at the settle" turned out to be
// arbitrarily far away.
import type { AnimatedValue, CompositeAnimation } from "../animated/index"
import {
  animationSignature,
  buildAnimation,
  isAnimationSpec,
  targetOf,
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
  driver: AnimatedValue
  listenerId: string
  signature: string
  running: CompositeAnimation | null
  // The value React was last given for this key, and the moment it was given
  // — the two the cadence is measured against. They survive a restart on
  // purpose: what matters is how stale REACT's copy is, not how far the
  // animation currently in flight has come.
  landedValue: number
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
 * @param onLanding Called while an animation on `key` is still running, at
 *   most once per `LANDING_INTERVAL_MS` and only when the value has moved far
 *   enough to change a committed layout. Same job as `onSettled` and the same
 *   handling at the call site; it is a separate callback because a settle and
 *   a value merely passing through are different claims, and only the first
 *   one is a promise kept. Omit it and the cadence costs nothing at all — a
 *   caller with no refused properties (`useAnimatedProps`) does.
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

  const drop = (key: string): void => {
    const entry = entries.get(key)
    if (entry === undefined) {
      return
    }
    entries.delete(key)
    entry.running?.stop()
    entry.driver.removeListener(entry.listenerId)
  }

  const republish = (): void => {
    if (resolving || lastSource === null) {
      return
    }
    publish(resolve(lastSource))
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

  /** The cadence: see LANDING_INTERVAL_MS. */
  const considerLanding = (key: string, value: number): void => {
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
    if (Math.abs(value - entry.landedValue) < LANDING_EPSILON) {
      return
    }
    markLanded(entry)
    onLanding(key)
  }

  const ensure = (key: string, spec: AnimationSpec): Entry => {
    const signature = animationSignature(spec)
    const existing = entries.get(key)
    if (existing === undefined) {
      // Nothing to animate from — see the header.
      const driver = new engine.api.Value(targetOf(spec) ?? 0)
      const entry: Entry = {
        driver,
        listenerId: driver.addListener(({ value }) => {
          republish()
          considerLanding(key, value)
        }),
        signature,
        running: null,
        // The seed itself needs no render of its own: a key appearing changes
        // the style's SHAPE, and the caller already pays one render for that
        // (hooks.ts). The cadence therefore starts here, at the seed.
        landedValue: driver.__getValue(),
        landedAt: now(),
      }
      entries.set(key, entry)
      return entry
    }
    if (existing.signature === signature) {
      return existing
    }
    existing.signature = signature
    existing.running?.stop()
    const animation = buildAnimation(engine, existing.driver, spec)
    existing.running = animation
    animation.start((result) => {
      if (existing.running === animation) {
        existing.running = null
      }
      // `finished` only: a restart stops the previous animation, and reporting
      // that as a settle would publish through React on every frame the target
      // moves, which is the cost the refusal exists to avoid. A restart is
      // still covered — the cadence above is what carries a target that keeps
      // moving, and it does not care whose animation the frames belong to.
      if (result.finished) {
        markLanded(existing)
        onSettled?.(key)
      }
    })
    return existing
  }

  const resolve = (source: UpdaterObject): UpdaterObject => {
    resolving = true
    try {
      let resolved: UpdaterObject | null = null
      for (const key of Object.keys(source)) {
        const value = source[key]
        if (!isAnimationSpec(value)) {
          // A plain value replacing an animation stops it, exactly as an
          // assignment to a shared value does.
          drop(key)
          continue
        }
        resolved ??= { ...source }
        resolved[key] = ensure(key, value).driver.__getValue()
      }
      for (const key of [...entries.keys()]) {
        if (!(key in source)) {
          drop(key)
        }
      }
      return resolved ?? source
    } finally {
      resolving = false
    }
  }

  return {
    run(source) {
      lastSource = source
      publish(resolve(source))
    },
    dispose() {
      for (const key of [...entries.keys()]) {
        drop(key)
      }
      lastSource = null
    },
  }
}
