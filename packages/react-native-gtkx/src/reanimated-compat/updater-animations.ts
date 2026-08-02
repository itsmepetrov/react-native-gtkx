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

type Entry = {
  driver: AnimatedValue
  listenerId: string
  signature: string
  running: CompositeAnimation | null
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
 */
export const createUpdaterAnimations = (
  engine: AnimationEngine,
  publish: (resolved: UpdaterObject) => void,
  onSettled?: (key: string) => void,
): UpdaterAnimations => {
  const entries = new Map<string, Entry>()
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

  const ensure = (key: string, spec: AnimationSpec): Entry => {
    const signature = animationSignature(spec)
    const existing = entries.get(key)
    if (existing === undefined) {
      // Nothing to animate from — see the header.
      const driver = new engine.api.Value(targetOf(spec) ?? 0)
      const entry: Entry = {
        driver,
        listenerId: driver.addListener(() => {
          republish()
        }),
        signature,
        running: null,
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
      // moves, which is the cost the refusal exists to avoid.
      if (result.finished) {
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
