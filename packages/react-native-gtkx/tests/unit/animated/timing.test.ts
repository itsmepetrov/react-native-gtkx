import { afterEach, describe, expect, it, vi } from "vitest"
import { createAnimated, Easing } from "../../../src/animated/index"
import { createManualScheduler } from "./manual-scheduler"

const setup = () => {
  const manual = createManualScheduler()
  return { manual, api: createAnimated(manual.scheduler) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Animated.timing", () => {
  it("animates linearly from 0 to 1 over the duration", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    api
      .timing(value, { toValue: 1, duration: 100, easing: Easing.linear })
      .start(end)
    // The first frame establishes t = 0 for the run.
    manual.advance(0)
    expect(value.__getValue()).toBe(0)
    manual.advance(25)
    expect(value.__getValue()).toBeCloseTo(0.25, 12)
    manual.advance(25)
    expect(value.__getValue()).toBeCloseTo(0.5, 12)
    manual.advance(25)
    expect(value.__getValue()).toBeCloseTo(0.75, 12)
    expect(end).not.toHaveBeenCalled()
    manual.advance(25)
    expect(value.__getValue()).toBe(1)
    expect(end).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledWith({ finished: true })
  })

  it("animates between arbitrary values, descending included", () => {
    const { manual, api } = setup()
    const value = new api.Value(10)
    api
      .timing(value, { toValue: 4, duration: 100, easing: Easing.linear })
      .start()
    manual.advance(0)
    manual.advance(50)
    expect(value.__getValue()).toBeCloseTo(7, 12)
    manual.advance(50)
    expect(value.__getValue()).toBe(4)
  })

  it("applies a custom easing curve", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    api
      .timing(value, { toValue: 1, duration: 100, easing: Easing.quad })
      .start()
    manual.advance(0)
    manual.advance(50)
    expect(value.__getValue()).toBeCloseTo(0.25, 12)
  })

  it("defaults to inOut(ease): slow start, 0.5 midpoint, monotonic", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const seen: number[] = []
    value.addListener(({ value: v }) => {
      seen.push(v)
    })
    api.timing(value, { toValue: 1, duration: 100 }).start()
    manual.advance(0)
    manual.advance(25)
    expect(value.__getValue()).toBeGreaterThan(0)
    expect(value.__getValue()).toBeLessThan(0.25)
    manual.advance(25)
    expect(value.__getValue()).toBeCloseTo(0.5, 6)
    manual.advance(25)
    manual.advance(25)
    expect(value.__getValue()).toBe(1)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!)
    }
  })

  it("waits out the delay without touching the value", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const listener = vi.fn()
    value.addListener(listener)
    api
      .timing(value, {
        toValue: 1,
        duration: 100,
        delay: 50,
        easing: Easing.linear,
      })
      .start()
    manual.advance(0)
    manual.advance(25)
    expect(listener).not.toHaveBeenCalled()
    expect(value.__getValue()).toBe(0)
    manual.advance(75)
    expect(value.__getValue()).toBeCloseTo(0.5, 12)
    manual.advance(50)
    expect(value.__getValue()).toBe(1)
  })

  it("jumps to toValue on the first frame when duration is 0", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    api.timing(value, { toValue: 5, duration: 0 }).start(end)
    expect(end).not.toHaveBeenCalled()
    manual.advance(16)
    expect(value.__getValue()).toBe(5)
    expect(end).toHaveBeenCalledWith({ finished: true })
  })

  it("notifies listeners on every animation frame", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const seen: number[] = []
    value.addListener(({ value: v }) => {
      seen.push(v)
    })
    api
      .timing(value, { toValue: 1, duration: 60, easing: Easing.linear })
      .start()
    manual.advance(0)
    manual.advance(20)
    manual.advance(20)
    manual.advance(20)
    expect(seen).toHaveLength(4)
    expect(seen[0]).toBe(0)
    expect(seen[1]!).toBeCloseTo(1 / 3, 12)
    expect(seen[2]!).toBeCloseTo(2 / 3, 12)
    expect(seen[3]).toBe(1)
  })

  it("unsubscribes from the scheduler after completion — no idle ticks", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const listener = vi.fn()
    value.addListener(listener)
    api
      .timing(value, { toValue: 1, duration: 50, easing: Easing.linear })
      .start()
    expect(manual.activeCount()).toBe(1)
    manual.advance(0)
    manual.advance(50)
    expect(manual.activeCount()).toBe(0)
    const calls = listener.mock.calls.length
    manual.advance(100)
    manual.advance(100)
    expect(manual.activeCount()).toBe(0)
    expect(listener).toHaveBeenCalledTimes(calls)
    expect(value.__getValue()).toBe(1)
  })

  it("stop() ends the run with finished: false and keeps the value", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    const animation = api.timing(value, {
      toValue: 1,
      duration: 100,
      easing: Easing.linear,
    })
    animation.start(end)
    manual.advance(0)
    manual.advance(40)
    animation.stop()
    expect(end).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(value.__getValue()).toBeCloseTo(0.4, 12)
    expect(manual.activeCount()).toBe(0)
    // stop() is idempotent: no second callback.
    animation.stop()
    expect(end).toHaveBeenCalledTimes(1)
  })

  it("restarts after stop() from the current position", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const animation = api.timing(value, {
      toValue: 1,
      duration: 100,
      easing: Easing.linear,
    })
    animation.start()
    manual.advance(0)
    manual.advance(50)
    animation.stop()
    const end = vi.fn()
    animation.start(end)
    manual.advance(0)
    expect(value.__getValue()).toBeCloseTo(0.5, 12)
    manual.advance(50)
    expect(value.__getValue()).toBeCloseTo(0.75, 12)
    manual.advance(50)
    expect(value.__getValue()).toBe(1)
    expect(end).toHaveBeenCalledWith({ finished: true })
  })

  it("a new animation on the same value preempts the previous one", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const firstEnd = vi.fn()
    const secondEnd = vi.fn()
    api
      .timing(value, { toValue: 1, duration: 100, easing: Easing.linear })
      .start(firstEnd)
    manual.advance(0)
    manual.advance(50)
    api
      .timing(value, { toValue: 0, duration: 50, easing: Easing.linear })
      .start(secondEnd)
    expect(firstEnd).toHaveBeenCalledWith({ finished: false })
    // Only the second animation is ticking.
    expect(manual.activeCount()).toBe(1)
    manual.advance(0)
    manual.advance(25)
    expect(value.__getValue()).toBeCloseTo(0.25, 12)
    manual.advance(25)
    expect(value.__getValue()).toBe(0)
    expect(secondEnd).toHaveBeenCalledWith({ finished: true })
  })

  it("start() while running restarts the animation (finished: false)", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const firstEnd = vi.fn()
    const animation = api.timing(value, {
      toValue: 1,
      duration: 100,
      easing: Easing.linear,
    })
    animation.start(firstEnd)
    manual.advance(0)
    manual.advance(50)
    const secondEnd = vi.fn()
    animation.start(secondEnd)
    expect(firstEnd).toHaveBeenCalledWith({ finished: false })
    expect(manual.activeCount()).toBe(1)
    manual.advance(0)
    manual.advance(100)
    expect(secondEnd).toHaveBeenCalledWith({ finished: true })
    expect(value.__getValue()).toBe(1)
  })

  it("accepts useNativeDriver and warns once per session", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { manual, api } = setup()
    const value = new api.Value(0)
    api
      .timing(value, { toValue: 1, duration: 10, useNativeDriver: true })
      .start()
    api
      .timing(value, { toValue: 2, duration: 10, useNativeDriver: true })
      .start()
    expect(warn).toHaveBeenCalledTimes(1)
    manual.advance(0)
    manual.advance(10)
    expect(value.__getValue()).toBe(2)
  })
})
