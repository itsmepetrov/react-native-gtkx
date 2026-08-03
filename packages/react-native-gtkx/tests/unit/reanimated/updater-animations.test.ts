// An animation returned FROM a style updater, which is how the whole of
// Reanimated's documentation writes one:
//
//   useAnimatedStyle(() => ({ height: withSpring(open.value ? 320 : 0) }))
//
// It did nothing here until `spike/core-exports` caught it: a `with*` builder
// returns a marked descriptor outside the initial run, the style layer's leaf
// test is `typeof value === "number"`, and so the property was neither driven
// nor written nor warned about — it sat in the style as a spring descriptor.
// Every case below is about the descriptor becoming a number, and the group
// under `landingCollector` is about WHEN that number is allowed to reach
// React: one render at the settle turned out to be a promise that a target
// moving every frame never comes due on.
import { beforeEach, expect, test } from "vitest"
import { createAnimated } from "../../../src/animated/index"
import {
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type AnimationEngine,
} from "../../../src/reanimated-compat/animation"
import { createUpdaterAnimations } from "../../../src/reanimated-compat/updater-animations"
import {
  createManualScheduler,
  type ManualScheduler,
} from "../animated/manual-scheduler"

let manual: ManualScheduler
let engine: AnimationEngine

beforeEach(() => {
  manual = createManualScheduler()
  engine = {
    api: createAnimated(manual.scheduler),
    scheduler: manual.scheduler,
  }
})

/**
 * The manual scheduler delivers exactly ONE frame per `advance`, so time and
 * frames are separate axes here: a run of an animation needs both to have
 * passed. Every wait below is expressed in real frames at 60 Hz.
 */
const runFrames = (count: number): void => {
  for (let i = 0; i < count; i += 1) {
    manual.advance(1000 / 60)
  }
}

/** Collects everything published, which is what a mapper hands to `apply`. */
const collector = () => {
  const published: Record<string, unknown>[] = []
  return {
    published,
    last: () => published[published.length - 1],
  }
}

test("a plain value is published untouched, and the object is not copied", () => {
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  const source = { opacity: 1, width: 40 }
  animations.run(source)
  // Identity, not equality: an updater result with no animation in it must
  // cost nothing at all, and a copy per frame is not nothing.
  expect(sink.last()).toBe(source)
})

test("a key animating for the first time is seeded at the target, not animated to it", () => {
  // There is nothing to animate FROM. Upstream lands in the same place from
  // the other direction — its `prepareAnimation` starts at the previous
  // result's value, which for a key that was not in it is the initial run's.
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: withTiming(320, { duration: 300 }) })
  expect(sink.last()).toEqual({ height: 320 })
  // And nothing is running, so no frame is subscribed.
  expect(manual.activeCount()).toBe(0)
})

test("a new target animates from where the value is, publishing every frame", () => {
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: withTiming(0, { duration: 300 }) })
  expect(sink.last()).toEqual({ height: 0 })

  animations.run({ height: withTiming(300, { duration: 300 }) })
  runFrames(9)
  const midway = sink.last()!.height as number
  expect(midway).toBeGreaterThan(0)
  expect(midway).toBeLessThan(300)
  runFrames(20)
  expect(sink.last()).toEqual({ height: 300 })
})

test("an equivalent descriptor from a later run does not restart the animation", () => {
  // A mapper re-runs whenever anything it read changed, so the SAME animation
  // arrives as a fresh object many times a second. Restarting on each one
  // leaves it crawling: measured against `@gorhom/bottom-sheet`, whose height
  // spring is rebuilt on every frame of the sheet's own transition.
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: withTiming(0, { duration: 300 }) })
  animations.run({ height: withTiming(300, { duration: 300 }) })
  runFrames(9)
  const midway = sink.last()!.height as number

  // Same animation, new object — the run must not reset progress.
  animations.run({ height: withTiming(300, { duration: 300 }) })
  expect(sink.last()!.height).toBe(midway)
  runFrames(2)
  expect(sink.last()!.height as number).toBeGreaterThan(midway)
})

test("a moved target picks the animation up where it is rather than jumping", () => {
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: withTiming(0, { duration: 300 }) })
  animations.run({ height: withTiming(300, { duration: 300 }) })
  runFrames(9)
  const midway = sink.last()!.height as number

  animations.run({ height: withTiming(100, { duration: 300 }) })
  // No discontinuity: the next published value is still the one on screen.
  expect(sink.last()!.height).toBe(midway)
  runFrames(25)
  expect(sink.last()).toEqual({ height: 100 })
})

test("a plain value replacing an animation stops it, as an assignment does", () => {
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: withTiming(0, { duration: 300 }) })
  animations.run({ height: withTiming(300, { duration: 300 }) })
  runFrames(4)
  animations.run({ height: 12 })
  expect(sink.last()).toEqual({ height: 12 })
  const publishedCount = sink.published.length
  runFrames(25)
  expect(sink.published.length).toBe(publishedCount)
})

test("settling reports once per animation, and never on a restart", () => {
  // The whole point of the report: a property this platform will not drive at
  // frame rate promises the value "on the next React render", and for a value
  // that only moves inside an animation there is no next render unless one is
  // asked for. Asking once a frame would BE the cost the refusal avoids.
  const settled: string[] = []
  const animations = createUpdaterAnimations(
    engine,
    () => {},
    (key) => {
      settled.push(key)
    },
  )
  animations.run({ height: withTiming(0, { duration: 300 }) })
  animations.run({ height: withTiming(300, { duration: 300 }) })
  runFrames(6)
  // Re-aimed mid-flight: the previous animation is cancelled, not settled.
  animations.run({ height: withTiming(200, { duration: 300 }) })
  expect(settled).toEqual([])
  runFrames(25)
  expect(settled).toEqual(["height"])
})

/**
 * The cadence — LANDING_INTERVAL_MS. `landings` and `settles` are collected
 * apart because they are different claims: only the settle says the animation
 * is over.
 */
const landingCollector = () => {
  const settles: string[] = []
  const landings: string[] = []
  const animations = createUpdaterAnimations(
    engine,
    () => {},
    (key) => {
      settles.push(key)
    },
    (key) => {
      landings.push(key)
    },
  )
  return { animations, settles, landings }
}

test("a running animation lands on a cadence, not only when it settles", () => {
  // The settle alone kept the refusal's promise only when it came soon.
  // Measured on `@gorhom/bottom-sheet`'s mount, it came 1.38 s after the mask
  // needed a height, and the list inside mounted zero cells in the meantime.
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(0, { duration: 1000 }) })
  probe.animations.run({ height: withTiming(1000, { duration: 1000 }) })

  // Five frames is 83 ms — inside the interval, so nothing has landed yet
  // even though the value has moved a long way.
  runFrames(5)
  expect(probe.landings).toEqual([])

  // The sixth crosses 100 ms.
  runFrames(1)
  expect(probe.landings).toEqual(["height"])
  // …and the seventh does not, because the interval starts again from there.
  runFrames(1)
  expect(probe.landings).toEqual(["height"])
  expect(probe.settles).toEqual([])

  runFrames(60)
  expect(probe.settles).toEqual(["height"])
  // Ten landings a second at the very most: a 1000 ms animation cannot cost
  // more than ten, against the sixty frames it publishes.
  expect(probe.landings.length).toBeLessThanOrEqual(10)
})

test("a target that keeps moving lands anyway, though it never settles", () => {
  // This IS the gorhom mount: the mask's target is derived from the sheet's
  // own position, so every frame of the opening spring re-aims it and every
  // re-aim cancels the animation that was running. Nothing settles, so under
  // the settle rule alone nothing ever reached Yoga.
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(0, { duration: 400 }) })
  for (let frame = 0; frame < 30; frame += 1) {
    probe.animations.run({
      height: withTiming(1000 + frame, { duration: 400 }),
    })
    runFrames(1)
  }
  expect(probe.settles).toEqual([])
  expect(probe.landings.length).toBeGreaterThan(0)
})

test("a step too small to move a widget does not land", () => {
  // GTK allocates whole pixels, so a sub-pixel change commits no new
  // geometry and a render for it is a render for nothing.
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(0, { duration: 2000 }) })
  probe.animations.run({ height: withTiming(0.4, { duration: 2000 }) })
  runFrames(60)
  expect(probe.landings).toEqual([])
  runFrames(90)
  // It still settles: the promise the settle makes is unchanged.
  expect(probe.settles).toEqual(["height"])
})

test("the settle restarts the interval, so a new animation is not owed a landing at once", () => {
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(0, { duration: 100 }) })
  probe.animations.run({ height: withTiming(300, { duration: 100 }) })
  // Stopped ON the settle rather than a fixed number of frames past it: the
  // interval is measured from the last value React was given, and the settle
  // gave it one.
  while (probe.settles.length === 0) {
    runFrames(1)
  }
  const landingsAtSettle = probe.landings.length

  probe.animations.run({ height: withTiming(600, { duration: 100 }) })
  runFrames(3)
  expect(probe.landings.length).toBe(landingsAtSettle)
})

test("a caller that asks for no cadence gets none", () => {
  // `useAnimatedProps` drives every numeric prop it publishes, so it has no
  // refused property to keep a promise about and passes neither callback.
  const settles: string[] = []
  const animations = createUpdaterAnimations(
    engine,
    () => {},
    (key) => {
      settles.push(key)
    },
  )
  animations.run({ height: withTiming(0, { duration: 1000 }) })
  animations.run({ height: withTiming(1000, { duration: 1000 }) })
  runFrames(30)
  expect(settles).toEqual([])
  runFrames(40)
  expect(settles).toEqual(["height"])
})

test("the composites arrive already implemented, because they are the same builder", () => {
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ width: withTiming(0, { duration: 100 }) })
  animations.run({
    width: withDelay(100, withTiming(50, { duration: 100 })),
  })
  runFrames(4)
  expect(sink.last()).toEqual({ width: 0 })
  runFrames(20)
  expect(sink.last()).toEqual({ width: 50 })

  animations.run({
    width: withSequence(
      withTiming(10, { duration: 100 }),
      withTiming(90, { duration: 100 }),
    ),
  })
  runFrames(4)
  expect(sink.last()!.width as number).toBeLessThan(50)
  runFrames(20)
  expect(sink.last()).toEqual({ width: 90 })
})

test("two keys animate independently and publish the whole object each frame", () => {
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({
    height: withTiming(0, { duration: 200 }),
    paddingBottom: withTiming(0, { duration: 200 }),
  })
  animations.run({
    height: withTiming(200, { duration: 200 }),
    paddingBottom: withTiming(40, { duration: 200 }),
  })
  runFrames(20)
  expect(sink.last()).toEqual({ height: 200, paddingBottom: 40 })
})

test("dispose stops everything and publishes nothing more", () => {
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: withSpring(0) })
  animations.run({ height: withSpring(400) })
  runFrames(3)
  const publishedCount = sink.published.length
  animations.dispose()
  runFrames(60)
  expect(sink.published.length).toBe(publishedCount)
})
