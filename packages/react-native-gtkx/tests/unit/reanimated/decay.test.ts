// `withDecay` and `withClamp`, on the same deterministic frame driver every
// other animation in this layer is tested with.
//
// The assertions are about SHAPE rather than about exact positions, and that
// is deliberate: the step function is upstream's, frame-timing dependent by
// construction, and pinning a pixel would pin the frame cadence too. What a
// port has to get right is that the velocity decays, that the value stops on
// its own, that `clamp` ends exactly on its bound and that the rubber band
// goes past one and comes back — all of which are checkable without a golden
// number.
import { beforeEach, expect, test, vi } from "vitest"
import { createAnimated } from "../../../src/animated/index"
import {
  withClamp,
  withDecay,
  withSpring,
  withTiming,
} from "../../../src/reanimated-compat/animation"
import { createMakeMutable } from "../../../src/reanimated-compat/mutable"
import {
  createManualScheduler,
  type ManualScheduler,
} from "../animated/manual-scheduler"

type MakeMutable = ReturnType<typeof createMakeMutable>

const FRAME = 16

let manual: ManualScheduler
let makeMutable: MakeMutable

beforeEach(() => {
  manual = createManualScheduler()
  makeMutable = createMakeMutable(
    createAnimated(manual.scheduler),
    manual.scheduler,
  )
})

/** Runs frames until the animation drops its subscription, or `limit` frames. */
const settle = (limit = 600): number => {
  let frames = 0
  manual.advance(0)
  while (manual.activeCount() > 0 && frames < limit) {
    manual.advance(FRAME)
    frames += 1
  }
  return frames
}

test("withDecay coasts in the direction of the velocity and stops on its own", () => {
  const value = makeMutable(0)
  const positions: number[] = []
  value.addListener(1, (next: number) => positions.push(next))

  value.value = withDecay({ velocity: 800 })
  const frames = settle()

  // It stopped by itself rather than by running out of frames.
  expect(manual.activeCount()).toBe(0)
  expect(frames).toBeLessThan(600)
  // It travelled forwards, monotonically.
  expect(value.value).toBeGreaterThan(0)
  for (let i = 1; i < positions.length; i++) {
    expect(positions[i]!).toBeGreaterThanOrEqual(positions[i - 1]!)
  }
  // And it DECELERATED: the last frame's step is a fraction of the first's.
  // (Both are measured over the same frame interval, so this is velocity.)
  const first = positions[1]! - positions[0]!
  const last = positions.at(-1)! - positions.at(-2)!
  expect(first).toBeGreaterThan(0)
  expect(last).toBeLessThan(first / 2)
})

test("a negative velocity coasts the other way", () => {
  const value = makeMutable(0)
  value.value = withDecay({ velocity: -800 })
  settle()
  expect(value.value).toBeLessThan(0)
})

test("deceleration decides how far a fling travels", () => {
  const slippery = makeMutable(0)
  slippery.value = withDecay({ velocity: 600, deceleration: 0.999 })
  settle()

  manual = createManualScheduler()
  makeMutable = createMakeMutable(
    createAnimated(manual.scheduler),
    manual.scheduler,
  )
  const grippy = makeMutable(0)
  grippy.value = withDecay({ velocity: 600, deceleration: 0.99 })
  settle()

  expect(slippery.value).toBeGreaterThan(grippy.value)
})

test("velocity 0 (the default) settles immediately without moving", () => {
  const value = makeMutable(7)
  value.value = withDecay()
  settle()
  expect(value.value).toBe(7)
})

test("clamp stops the fling exactly on its bound", () => {
  const value = makeMutable(0)
  value.value = withDecay({ velocity: 4000, clamp: [-50, 100] })
  settle()
  expect(value.value).toBe(100)
  expect(manual.activeCount()).toBe(0)
})

test("clamp catches a fling going the other way on the other bound", () => {
  const value = makeMutable(0)
  value.value = withDecay({ velocity: -4000, clamp: [-50, 100] })
  settle()
  expect(value.value).toBe(-50)
})

test("a fling that never reaches its clamp is unaffected by it", () => {
  const value = makeMutable(0)
  value.value = withDecay({ velocity: 100, clamp: [-10000, 10000] })
  settle()
  expect(value.value).toBeGreaterThan(0)
  expect(value.value).toBeLessThan(10000)
})

test("rubberBandEffect overshoots the bound and settles back onto it", () => {
  const value = makeMutable(0)
  const positions: number[] = []
  value.addListener(1, (next: number) => positions.push(next))

  value.value = withDecay({
    velocity: 4000,
    clamp: [0, 100],
    rubberBandEffect: true,
  })
  settle()

  // Went past the bound...
  expect(Math.max(...positions)).toBeGreaterThan(100)
  // ...and came back exactly onto it.
  expect(value.value).toBe(100)
  expect(manual.activeCount()).toBe(0)
})

test("withDecay's callback reports the value it settled at", () => {
  const value = makeMutable(0)
  const callback = vi.fn()
  value.value = withDecay({ velocity: 500 }, callback)
  settle()
  expect(callback).toHaveBeenCalledTimes(1)
  expect(callback.mock.calls[0]![0]).toBe(true)
  expect(callback.mock.calls[0]![1]).toBeCloseTo(value.value as number, 5)
})

test("a plain write cancels a running decay where it stands", () => {
  const value = makeMutable(0)
  const callback = vi.fn()
  value.value = withDecay({ velocity: 800 }, callback)
  manual.advance(0)
  manual.advance(FRAME)
  manual.advance(FRAME)

  value.value = 42
  expect(value.value).toBe(42)
  expect(manual.activeCount()).toBe(0)
  expect(callback).toHaveBeenCalledWith(false, expect.any(Number))
})

test("withDecay rejects the configs upstream rejects, at the call site", () => {
  expect(() => withDecay({ velocityFactor: 0 })).toThrow(/velocityFactor/)
  expect(() => withDecay({ rubberBandEffect: true })).toThrow(/clamp/)
  expect(() =>
    withDecay({ clamp: [1] as unknown as [number, number] }),
  ).toThrow(/2 items/)
})

test("withClamp confines another animation to its range", () => {
  const value = makeMutable(0)
  const positions: number[] = []
  value.addListener(1, (next: number) => positions.push(next))

  value.value = withClamp({ min: 0, max: 50 }, withTiming(200, { duration: 0 }))
  settle()

  expect(value.value).toBe(50)
  expect(Math.max(...positions)).toBe(50)
})

test("withClamp lets the inner animation run un-truncated underneath", () => {
  // Upstream's distinction, and it is observable: an overshooting spring
  // clamped at its target sits ON the clamp while the spring is past it, then
  // comes back DOWN as the spring settles — rather than ending the moment the
  // value first arrives.
  const value = makeMutable(0)
  const positions: number[] = []
  value.addListener(1, (next: number) => positions.push(next))

  value.value = withClamp(
    { max: 100 },
    withSpring(100, { stiffness: 200, damping: 5, mass: 1 }),
  )
  settle()

  expect(Math.max(...positions)).toBe(100)
  // The clamp was actually hit more than once (the overshoot was flattened
  // onto it), which a value that merely stopped at 100 would not produce.
  expect(
    positions.filter((position) => position === 100).length,
  ).toBeGreaterThan(1)
  expect(value.value).toBeCloseTo(100, 1)
})

test("withClamp with only one bound leaves the other side alone", () => {
  const value = makeMutable(0)
  value.value = withClamp({ min: -10 }, withTiming(-200, { duration: 0 }))
  settle()
  expect(value.value).toBe(-10)

  const other = makeMutable(0)
  other.value = withClamp({ min: -10 }, withTiming(200, { duration: 0 }))
  settle()
  expect(other.value).toBe(200)
})

test("withClamp clamps a decay, which is the fling-with-a-limit case", () => {
  const value = makeMutable(0)
  value.value = withClamp({ max: 30 }, withDecay({ velocity: 2000 }))
  settle()
  expect(value.value).toBe(30)
})

test("withClamp refuses a non-animation and an inverted range", () => {
  expect(() => withClamp({ min: 0 }, 5)).toThrow(/takes an animation/)
  expect(() => withClamp({ min: 10, max: 0 }, withTiming(1))).toThrow(
    /above max/,
  )
})
