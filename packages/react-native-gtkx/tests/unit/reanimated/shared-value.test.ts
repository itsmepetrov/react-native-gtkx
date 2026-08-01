// The shared value and the animations assigned to it, driven by a manual
// frame scheduler — the same deterministic driver the platform's own Animated
// tests use, which is the point: this layer adds no second clock.
import { beforeEach, expect, test, vi } from "vitest"
import { createAnimated } from "../../../src/animated/index"
import {
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "../../../src/reanimated-compat/animation"
import { Easing } from "../../../src/reanimated-compat/easing"
import {
  cancelAnimation,
  createMakeMutable,
  isSharedValue,
} from "../../../src/reanimated-compat/mutable"
import {
  createManualScheduler,
  type ManualScheduler,
} from "../animated/manual-scheduler"

type MakeMutable = ReturnType<typeof createMakeMutable>

let manual: ManualScheduler
let makeMutable: MakeMutable

beforeEach(() => {
  manual = createManualScheduler()
  makeMutable = createMakeMutable(
    createAnimated(manual.scheduler),
    manual.scheduler,
  )
})

test("writes publish to listeners in both calling conventions", () => {
  // Upstream's is addListener(id, listener) with the raw value; this
  // platform's animated nodes use addListener(callback) => id with { value },
  // and BOTH reach a shared value. Supporting one silently breaks the other.
  const value = makeMutable(0)
  const upstream: number[] = []
  const node: number[] = []

  value.addListener(1, (next: number) => upstream.push(next))
  const nodeId = value.addListener(({ value: next }: { value: number }) =>
    node.push(next),
  )

  value.value = 5
  expect(upstream).toEqual([5])
  expect(node).toEqual([5])

  // A caller-chosen id of "1" must not collide with the generated one.
  value.removeListener(nodeId)
  value.value = 6
  expect(upstream).toEqual([5, 6])
  expect(node).toEqual([5])

  value.removeListener(1)
  value.value = 7
  expect(upstream).toEqual([5, 6])
})

test("a shared value satisfies the platform's structural animated-node check", () => {
  // src/components/animated.tsx recognises animated nodes by addListener +
  // __getValue. This is what makes Animated.View drive one with no change to
  // the view layer.
  const value = makeMutable(3)
  expect(typeof value.addListener).toBe("function")
  expect(typeof value.__getValue).toBe("function")
  expect(value.__getValue()).toBe(3)
})

test("isSharedValue recognises the brand upstream's consumers check", () => {
  expect(isSharedValue(makeMutable(0))).toBe(true)
  expect(isSharedValue({ value: 0 })).toBe(false)
  expect(isSharedValue(null)).toBe(false)
  expect(isSharedValue(undefined)).toBe(false)
})

test("set() takes a value or an updater, get() reads", () => {
  const value = makeMutable(1)
  value.set(2)
  expect(value.get()).toBe(2)
  value.set((current) => current + 3)
  expect(value.get()).toBe(5)
})

test("modify() republishes even when the value is unchanged", () => {
  const value = makeMutable({ items: [1] })
  let notifications = 0
  value.addListener(() => {
    notifications++
  })
  value.modify((current) => {
    current.items.push(2)
    return current
  })
  expect(notifications).toBe(1)
  expect(value.value.items).toEqual([1, 2])

  value.modify((current) => current, false)
  expect(notifications).toBe(1)
})

test("withTiming drives the value to its target on upstream's defaults", () => {
  const value = makeMutable(0)
  value.value = withTiming(100)

  manual.advance(0)
  expect(value.value).toBe(0)

  // Upstream's default duration is 300 ms (RN Animated's is 500), so the
  // animation must be over well before 500.
  manual.advance(150)
  expect(value.value).toBeGreaterThan(0)
  expect(value.value).toBeLessThan(100)

  manual.advance(150)
  expect(value.value).toBe(100)
  expect(manual.activeCount()).toBe(0)
})

test("withTiming honours duration, easing and its completion callback", () => {
  const value = makeMutable(0)
  const finished = vi.fn()
  value.value = withTiming(
    10,
    { duration: 100, easing: Easing.linear },
    finished,
  )

  manual.advance(0)
  manual.advance(50)
  expect(value.value).toBeCloseTo(5, 5)
  expect(finished).not.toHaveBeenCalled()

  manual.advance(50)
  expect(value.value).toBe(10)
  expect(finished).toHaveBeenCalledWith(true, 10)
})

test("withTiming accepts Easing.bezier's factory shape", () => {
  // Reanimated's Easing.bezier returns { factory }, RN's returns a function.
  // Passing the factory must animate rather than throw.
  const value = makeMutable(0)
  value.value = withTiming(1, {
    duration: 100,
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  })
  manual.advance(0)
  manual.advance(100)
  expect(value.value).toBe(1)
})

test("assigning a plain value cancels a running animation where it stands", () => {
  const value = makeMutable(0)
  const finished = vi.fn()
  value.value = withTiming(
    100,
    { duration: 100, easing: Easing.linear },
    finished,
  )
  manual.advance(0)
  manual.advance(50)
  const midpoint = value.value

  value.value = 42
  expect(value.value).toBe(42)
  expect(finished).toHaveBeenCalledWith(false, midpoint)

  manual.advance(50)
  expect(value.value).toBe(42)
  expect(manual.activeCount()).toBe(0)
})

test("cancelAnimation leaves the value where it stopped", () => {
  const value = makeMutable(0)
  value.value = withTiming(100, { duration: 100, easing: Easing.linear })
  manual.advance(0)
  manual.advance(50)
  const midpoint = value.value

  cancelAnimation(value)
  manual.advance(100)
  expect(value.value).toBe(midpoint)
  expect(manual.activeCount()).toBe(0)
})

test("a newer animation preempts the older one", () => {
  const value = makeMutable(0)
  const first = vi.fn()
  value.value = withTiming(100, { duration: 100, easing: Easing.linear }, first)
  manual.advance(0)
  manual.advance(50)

  value.value = withTiming(0, { duration: 100, easing: Easing.linear })
  expect(first).toHaveBeenCalledWith(false, expect.any(Number))
  manual.advance(0)
  manual.advance(100)
  expect(value.value).toBe(0)
})

test("withSequence runs its children in order, each with its own callback", () => {
  const value = makeMutable(0)
  const order: string[] = []
  value.value = withSequence(
    withTiming(10, { duration: 100, easing: Easing.linear }, () =>
      order.push("first"),
    ),
    withTiming(20, { duration: 100, easing: Easing.linear }, () =>
      order.push("second"),
    ),
  )

  manual.advance(0)
  manual.advance(100)
  expect(value.value).toBe(10)
  expect(order).toEqual(["first"])

  manual.advance(0)
  manual.advance(100)
  expect(value.value).toBe(20)
  expect(order).toEqual(["first", "second"])
})

test("withDelay waits without touching the value", () => {
  const value = makeMutable(7)
  value.value = withDelay(
    100,
    withTiming(9, { duration: 100, easing: Easing.linear }),
  )

  manual.advance(0)
  manual.advance(90)
  expect(value.value).toBe(7)

  manual.advance(10)
  manual.advance(0)
  manual.advance(100)
  expect(value.value).toBe(9)
})

test("withRepeat replays from the start value", () => {
  const value = makeMutable(0)
  const done = vi.fn()
  value.value = withRepeat(
    withTiming(10, { duration: 100, easing: Easing.linear }),
    2,
    false,
    done,
  )

  manual.advance(0)
  manual.advance(100)
  // First repetition finished; the second snaps back to 0 and replays.
  expect(value.value).toBe(0)

  manual.advance(0)
  manual.advance(100)
  expect(value.value).toBe(10)
  expect(done).toHaveBeenCalledWith(true, 10)
})

test("withRepeat(reverse) ping-pongs back to where it started", () => {
  const value = makeMutable(0)
  value.value = withRepeat(
    withTiming(10, { duration: 100, easing: Easing.linear }),
    2,
    true,
  )

  manual.advance(0)
  manual.advance(100)
  expect(value.value).toBe(10)

  manual.advance(0)
  manual.advance(50)
  expect(value.value).toBeCloseTo(5, 5)

  manual.advance(50)
  expect(value.value).toBe(0)
})

test("an infinite withRepeat keeps going and stops on cancel", () => {
  const value = makeMutable(0)
  value.value = withRepeat(
    withTiming(1, { duration: 100, easing: Easing.linear }),
    -1,
  )

  for (let i = 0; i < 6; i++) {
    manual.advance(0)
    manual.advance(100)
  }
  expect(manual.activeCount()).toBeGreaterThan(0)

  cancelAnimation(value)
  expect(manual.activeCount()).toBe(0)
})

test("withSpring settles at its target and holds", () => {
  const value = makeMutable(0)
  const done = vi.fn()
  value.value = withSpring(100, undefined, done)

  manual.advance(0)
  for (let i = 0; i < 200 && manual.activeCount() > 0; i++) {
    manual.advance(16)
  }

  expect(value.value).toBe(100)
  expect(done).toHaveBeenCalledWith(true, 100)
  expect(manual.activeCount()).toBe(0)
})

test("withSpring's default is critically damped, not RN Animated's bouncy one", () => {
  // GentleSpringConfig (damping 120, mass 4, stiffness 900) has damping ratio
  // exactly 1. RN's default (10/1/100) is 0.5 and overshoots visibly. Reusing
  // Animated.spring's defaults would silently change every spring in an app.
  const value = makeMutable(0)
  value.value = withSpring(100)
  manual.advance(0)
  let peak = 0
  for (let i = 0; i < 200 && manual.activeCount() > 0; i++) {
    manual.advance(16)
    peak = Math.max(peak, value.value)
  }
  expect(peak).toBeLessThanOrEqual(100)
})

test("withSpring accepts the perceptual duration/dampingRatio config", () => {
  const value = makeMutable(0)
  value.value = withSpring(50, { duration: 300, dampingRatio: 1 })
  manual.advance(0)
  for (let i = 0; i < 400 && manual.activeCount() > 0; i++) {
    manual.advance(16)
  }
  expect(value.value).toBe(50)
})

test("an animation assigned to a non-numeric value refuses loudly", () => {
  // The property gap, made visible: a colour cannot be driven here yet, and
  // saying so beats animating nothing.
  const colour = makeMutable("#ff0000")
  expect(() => {
    colour.value = withTiming(1) as unknown as string
  }).toThrow(/shared value holding a number/)
})

test("withTiming refuses a non-numeric target at the call site", () => {
  expect(() => withTiming("#ff0000" as unknown as number)).toThrow(
    /animates finite numbers only/,
  )
})

test("withSequence and withRepeat refuse a plain value", () => {
  expect(() => withSequence(1 as number)).toThrow(/takes animations/)
  expect(() => withRepeat(1 as number)).toThrow(/takes an animation/)
  expect(() => withDelay(10, 1 as number)).toThrow(/takes an animation/)
})
