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

test("a key whose previous result held a plain number animates from that number", () => {
  // `height: open.value ? withTiming(200) : 100` — snap shut, open smoothly,
  // which is what people write when only one direction needs animating. The
  // key held 100, so 100 is what there is to animate FROM: upstream's
  // `prepareAnimation` takes `oldValues[key]` and its last branch is
  // "previously it was a plain value, just set it as starting point".
  //
  // This used to drop the key while it held the number and re-seed it when it
  // next held an animation, so the seed went straight to 200 and the animation
  // never played. Nothing warned and the resting size was right.
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: 100 })
  expect(sink.last()).toEqual({ height: 100 })

  animations.run({ height: withTiming(200, { duration: 300 }) })
  // The animation's FIRST published value is where it came from, not where it
  // is going. That single assertion is the whole defect.
  expect(sink.last()).toEqual({ height: 100 })
  runFrames(9)
  const midway = sink.last()!.height as number
  expect(midway).toBeGreaterThan(100)
  expect(midway).toBeLessThan(200)
  runFrames(25)
  expect(sink.last()).toEqual({ height: 200 })
})

test("a spring takes the previous plain number as its origin too", () => {
  // Not the same code path as a timing: a spring reads its origin off the
  // driver when it is BUILT (animation.ts, toPlatformSpringConfig), so the
  // driver has to be seeded before anything is built on it.
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: 40 })
  animations.run({ height: withSpring(300) })
  expect(sink.last()).toEqual({ height: 40 })
  runFrames(4)
  const midway = sink.last()!.height as number
  expect(midway).toBeGreaterThan(40)
  expect(midway).toBeLessThan(300)
})

test("a key ABSENT from the previous result is still seeded at the target", () => {
  // The distinction the fix rests on. Upstream's `oldValues[key]` is
  // `undefined` for a key that was not in the last result, and an animation
  // whose starting point is undefined keeps its own `current` — the target. So
  // "was 100 a moment ago" and "was not there a moment ago" are different
  // questions with different answers, and only the first one animates.
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ opacity: 1 })
  animations.run({ opacity: 1, height: withTiming(200, { duration: 300 }) })
  expect(sink.last()).toEqual({ opacity: 1, height: 200 })
  expect(manual.activeCount()).toBe(0)
})

test("a previous value that is not a number leaves nothing to animate from", () => {
  // A percentage has no point base and a colour is not a number the drivers
  // here can start at, so both fall back to the seed rather than being coerced
  // into one.
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: "50%" })
  animations.run({ height: withTiming(200, { duration: 300 }) })
  expect(sink.last()).toEqual({ height: 200 })
  expect(manual.activeCount()).toBe(0)
})

test("the number animated from is the PREVIOUS run's, not an older one", () => {
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: 10 })
  animations.run({ height: 150 })
  animations.run({ height: withTiming(400, { duration: 300 }) })
  expect(sink.last()).toEqual({ height: 150 })
})

test("a frame of a running animation does not re-seed from the previous result", () => {
  // Every frame republishes the WHOLE object, which re-enters the same resolve
  // the mapper's run goes through. It must not look a starting point up again:
  // the animation is already running from one.
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: 100 })
  animations.run({ height: withTiming(200, { duration: 300 }) })
  runFrames(6)
  const values = sink.published.map((entry) => entry.height as number)
  // Monotonic: a re-seed would show up as the value dropping back to 100.
  for (let i = 1; i < values.length; i += 1) {
    expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]!)
  }
})

test("an animation that follows a plain number is cancelled and snaps back, not eased", () => {
  // The reverse direction, and it is NOT the mirror image: upstream's
  // `styleUpdater` deletes the animation and pushes the plain value through
  // `updateProps` in the same run, so it lands at once with no callback and no
  // settle. There is no "animate back to 100" anywhere in it.
  const sink = collector()
  const animations = createUpdaterAnimations(engine, (resolved) => {
    sink.published.push(resolved)
  })
  animations.run({ height: 100 })
  animations.run({ height: withTiming(200, { duration: 300 }) })
  runFrames(9)
  expect(sink.last()!.height as number).toBeGreaterThan(100)

  animations.run({ height: 100 })
  expect(sink.last()).toEqual({ height: 100 })
  const publishedCount = sink.published.length
  runFrames(30)
  // Nothing is still running, so nothing publishes.
  expect(sink.published.length).toBe(publishedCount)
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

test("a plain number replacing a RUNNING animation lands at once", () => {
  // Upstream snaps in the same run, through `updateProps`. On a property this
  // platform refuses to drive, "snap" is a React render or it is nothing: the
  // frames up to here never went through React, so React's copy of the key is
  // whatever the last landing left and the old value stays on screen. Not
  // rate-limited by the cadence either — this is a state change rather than a
  // step of one.
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(0, { duration: 1000 }) })
  probe.animations.run({ height: withTiming(1000, { duration: 1000 }) })
  runFrames(2)
  expect(probe.landings).toEqual([])

  probe.animations.run({ height: 42 })
  expect(probe.landings).toEqual(["height"])
  // And it is not a settle: the animation was cancelled, and reporting one
  // would be a lie about a promise kept.
  expect(probe.settles).toEqual([])
})

test("a plain number replacing a SETTLED animation lands too", () => {
  // "Was it running" is the wrong question and this is the case that says so:
  // the settle put 300 into React and then the key went back to 100, which no
  // animation is ever going to publish. What decides it is `landedValue` — the
  // last value a render was asked for — and nothing else.
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(0, { duration: 100 }) })
  probe.animations.run({ height: withTiming(300, { duration: 100 }) })
  while (probe.settles.length === 0) {
    runFrames(1)
  }
  const landingsAtSettle = probe.landings.length

  probe.animations.run({ height: 100 })
  expect(probe.landings.length).toBe(landingsAtSettle + 1)
})

test("a plain number equal to the one React already has asks for no render", () => {
  // A seeded key never ran a frame outside React, so the number React holds is
  // already this one and a render for it would be a render for nothing.
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(200, { duration: 300 }) })
  probe.animations.run({ height: 200 })
  expect(probe.landings).toEqual([])
  expect(probe.settles).toEqual([])

  // And a plain number that merely changes afterwards is not this module's
  // business at all: there is no entry left, so it is the ordinary refused
  // path, whose value lands on the next React render for whatever reason one
  // happens.
  probe.animations.run({ height: 120 })
  expect(probe.landings).toEqual([])
})

test("a percentage replacing an animation asks for no render of its own", () => {
  // It changes the set of animatable leaves, so the caller rebuilds the style
  // and pays exactly one render for the shape change (hooks.ts). A second one
  // would double it.
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(0, { duration: 1000 }) })
  probe.animations.run({ height: withTiming(1000, { duration: 1000 }) })
  runFrames(2)
  probe.animations.run({ height: "50%" })
  expect(probe.landings).toEqual([])
  expect(probe.settles).toEqual([])
})

test("a key that VANISHES from the result asks for no render of its own", () => {
  // It changes the style's SHAPE, and the caller already pays exactly one
  // render for that (hooks.ts) — asking for a second would double it.
  const probe = landingCollector()
  probe.animations.run({ height: withTiming(0, { duration: 1000 }) })
  probe.animations.run({ height: withTiming(1000, { duration: 1000 }) })
  runFrames(2)
  probe.animations.run({ opacity: 1 })
  expect(probe.landings).toEqual([])
  expect(probe.settles).toEqual([])
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
