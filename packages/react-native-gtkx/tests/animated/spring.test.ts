import { describe, expect, it, vi } from "vitest"
import type { EndResult } from "../../src/animated/index"
import { createAnimated, Easing } from "../../src/animated/index"
import type { ManualScheduler } from "./manual-scheduler"
import { createManualScheduler } from "./manual-scheduler"

const setup = () => {
  const manual = createManualScheduler()
  return { manual, api: createAnimated(manual.scheduler) }
}

const FRAME_MS = 16
const MAX_FRAMES = 4000

const runUntilDone = (
  manual: ManualScheduler,
  results: EndResult[],
): number => {
  let frames = 0
  while (results.length === 0 && frames < MAX_FRAMES) {
    manual.advance(FRAME_MS)
    frames++
  }
  return frames
}

describe("Animated.spring", () => {
  it("converges to toValue and completes with finished: true", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const results: EndResult[] = []
    api.spring(value, { toValue: 1 }).start((result) => {
      results.push(result)
    })
    const frames = runUntilDone(manual, results)
    expect(frames).toBeLessThan(MAX_FRAMES)
    expect(results).toEqual([{ finished: true }])
    // The final value snaps exactly to the target.
    expect(value.__getValue()).toBe(1)
    expect(manual.activeCount()).toBe(0)
  })

  it("overshoots the target with the default underdamped config", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    let peak = 0
    value.addListener(({ value: v }) => {
      peak = Math.max(peak, v)
    })
    const results: EndResult[] = []
    api.spring(value, { toValue: 1 }).start((result) => {
      results.push(result)
    })
    runUntilDone(manual, results)
    expect(peak).toBeGreaterThan(1.01)
  })

  it("never exceeds the target with overshootClamping", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    let peak = 0
    value.addListener(({ value: v }) => {
      peak = Math.max(peak, v)
    })
    const results: EndResult[] = []
    api
      .spring(value, { toValue: 1, overshootClamping: true })
      .start((result) => {
        results.push(result)
      })
    runUntilDone(manual, results)
    expect(results).toEqual([{ finished: true }])
    expect(peak).toBeLessThanOrEqual(1)
    expect(value.__getValue()).toBe(1)
    expect(manual.activeCount()).toBe(0)
  })

  it("converges when animating downwards", () => {
    const { manual, api } = setup()
    const value = new api.Value(5)
    const results: EndResult[] = []
    api
      .spring(value, { toValue: 1, stiffness: 120, damping: 14 })
      .start((result) => {
        results.push(result)
      })
    runUntilDone(manual, results)
    expect(results).toEqual([{ finished: true }])
    expect(value.__getValue()).toBe(1)
  })

  it("is deterministic for a given frame cadence", () => {
    const sample = (): number[] => {
      const { manual, api } = setup()
      const value = new api.Value(0)
      const seen: number[] = []
      value.addListener(({ value: v }) => {
        seen.push(v)
      })
      api.spring(value, { toValue: 1 }).start()
      for (let i = 0; i < 30; i++) {
        manual.advance(FRAME_MS)
      }
      return seen
    }
    expect(sample()).toEqual(sample())
  })

  it("stop() mid-flight reports finished: false and freezes the value", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    const animation = api.spring(value, { toValue: 1 })
    animation.start(end)
    for (let i = 0; i < 10; i++) {
      manual.advance(FRAME_MS)
    }
    const midFlight = value.__getValue()
    expect(midFlight).toBeGreaterThan(0)
    animation.stop()
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(value.__getValue()).toBe(midFlight)
    expect(manual.activeCount()).toBe(0)
  })

  it("is preempted by a newer animation on the same value", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const springEnd = vi.fn()
    api.spring(value, { toValue: 1 }).start(springEnd)
    for (let i = 0; i < 5; i++) {
      manual.advance(FRAME_MS)
    }
    const timingEnd = vi.fn()
    api
      .timing(value, { toValue: 0, duration: 32, easing: Easing.linear })
      .start(timingEnd)
    expect(springEnd).toHaveBeenCalledWith({ finished: false })
    expect(manual.activeCount()).toBe(1)
    manual.advance(FRAME_MS)
    manual.advance(FRAME_MS)
    manual.advance(FRAME_MS)
    expect(value.__getValue()).toBe(0)
    expect(timingEnd).toHaveBeenCalledWith({ finished: true })
    expect(manual.activeCount()).toBe(0)
  })

  it("respects the delay before moving", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    api.spring(value, { toValue: 1, delay: 100 }).start()
    manual.advance(0)
    manual.advance(50)
    expect(value.__getValue()).toBe(0)
    manual.advance(100)
    expect(value.__getValue()).toBeGreaterThan(0)
  })

  it("finishes immediately when already at rest on the target", () => {
    const { manual, api } = setup()
    const value = new api.Value(1)
    const end = vi.fn()
    api.spring(value, { toValue: 1 }).start(end)
    manual.advance(FRAME_MS)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(value.__getValue()).toBe(1)
    expect(manual.activeCount()).toBe(0)
  })

  it("rejects non-positive physics parameters", () => {
    const { api } = setup()
    const value = new api.Value(0)
    expect(() => api.spring(value, { toValue: 1, stiffness: 0 })).toThrow()
    expect(() => api.spring(value, { toValue: 1, damping: -1 })).toThrow()
    expect(() => api.spring(value, { toValue: 1, mass: 0 })).toThrow()
  })
})
