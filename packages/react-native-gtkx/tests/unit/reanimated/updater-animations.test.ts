// An animation returned FROM a style updater, which is how the whole of
// Reanimated's documentation writes one:
//
//   useAnimatedStyle(() => ({ height: withSpring(open.value ? 320 : 0) }))
//
// It did nothing here until `spike/core-exports` caught it: a `with*` builder
// returns a marked descriptor outside the initial run, the style layer's leaf
// test is `typeof value === "number"`, and so the property was neither driven
// nor written nor warned about — it sat in the style as a spring descriptor.
// Every case below is about the descriptor becoming a number.
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
