import { describe, expect, it, vi } from "vitest"
import { createAnimated, Easing } from "../../src/animated/index.js"
import { createManualScheduler } from "./manual-scheduler.js"

const setup = () => {
  const manual = createManualScheduler()
  return { manual, api: createAnimated(manual.scheduler) }
}

describe("Animated.sequence", () => {
  it("runs animations one after another and finishes true", () => {
    const { manual, api } = setup()
    const first = new api.Value(0)
    const second = new api.Value(0)
    const end = vi.fn()
    api
      .sequence([
        api.timing(first, { toValue: 1, duration: 50, easing: Easing.linear }),
        api.timing(second, { toValue: 1, duration: 50, easing: Easing.linear }),
      ])
      .start(end)
    // Only the first animation ticks initially.
    expect(manual.activeCount()).toBe(1)
    manual.advance(0)
    manual.advance(50)
    expect(first.__getValue()).toBe(1)
    expect(second.__getValue()).toBe(0)
    expect(end).not.toHaveBeenCalled()
    // The second animation arms on the next frame after the first completes.
    manual.advance(0)
    manual.advance(25)
    expect(second.__getValue()).toBeCloseTo(0.5, 12)
    manual.advance(25)
    expect(second.__getValue()).toBe(1)
    expect(end).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(manual.activeCount()).toBe(0)
  })

  it("supports delays between steps", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    api
      .sequence([
        api.delay(100),
        api.timing(value, { toValue: 1, duration: 50, easing: Easing.linear }),
      ])
      .start(end)
    manual.advance(0)
    manual.advance(50)
    expect(value.__getValue()).toBe(0)
    manual.advance(50)
    manual.advance(0)
    manual.advance(50)
    expect(value.__getValue()).toBe(1)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(manual.activeCount()).toBe(0)
  })

  it("aborts with finished: false when the running child is preempted", () => {
    const { manual, api } = setup()
    const first = new api.Value(0)
    const second = new api.Value(0)
    const end = vi.fn()
    api
      .sequence([
        api.timing(first, { toValue: 1, duration: 50, easing: Easing.linear }),
        api.timing(second, { toValue: 1, duration: 50, easing: Easing.linear }),
      ])
      .start(end)
    manual.advance(0)
    manual.advance(25)
    // External animation steals the value the running child drives.
    api.timing(first, { toValue: 0, duration: 10 }).start()
    expect(end).toHaveBeenCalledWith({ finished: false })
    manual.advance(0)
    manual.advance(10)
    manual.advance(100)
    // The sequence never advanced to the second child.
    expect(second.__getValue()).toBe(0)
    expect(manual.activeCount()).toBe(0)
  })

  it("stop() halts the current child with finished: false", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    const animation = api.sequence([
      api.timing(value, { toValue: 1, duration: 50, easing: Easing.linear }),
    ])
    animation.start(end)
    manual.advance(0)
    manual.advance(25)
    animation.stop()
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(value.__getValue()).toBeCloseTo(0.5, 12)
    expect(manual.activeCount()).toBe(0)
  })

  it("an empty sequence completes immediately", () => {
    const { api } = setup()
    const end = vi.fn()
    api.sequence([]).start(end)
    expect(end).toHaveBeenCalledWith({ finished: true })
  })
})

describe("Animated.parallel", () => {
  it("finishes true after the longest child completes", () => {
    const { manual, api } = setup()
    const first = new api.Value(0)
    const second = new api.Value(0)
    const end = vi.fn()
    api
      .parallel([
        api.timing(first, { toValue: 1, duration: 50, easing: Easing.linear }),
        api.timing(second, {
          toValue: 2,
          duration: 100,
          easing: Easing.linear,
        }),
      ])
      .start(end)
    // Both children tick at once.
    expect(manual.activeCount()).toBe(2)
    manual.advance(0)
    manual.advance(50)
    expect(first.__getValue()).toBe(1)
    expect(second.__getValue()).toBeCloseTo(1, 12)
    expect(end).not.toHaveBeenCalled()
    manual.advance(50)
    expect(second.__getValue()).toBe(2)
    expect(end).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(manual.activeCount()).toBe(0)
  })

  it("stop() halts every child with finished: false", () => {
    const { manual, api } = setup()
    const first = new api.Value(0)
    const second = new api.Value(0)
    const end = vi.fn()
    const animation = api.parallel([
      api.timing(first, { toValue: 1, duration: 100, easing: Easing.linear }),
      api.timing(second, { toValue: 1, duration: 100, easing: Easing.linear }),
    ])
    animation.start(end)
    manual.advance(0)
    manual.advance(30)
    animation.stop()
    expect(end).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(manual.activeCount()).toBe(0)
  })

  it("stops the siblings when one child is preempted (stopTogether)", () => {
    const { manual, api } = setup()
    const first = new api.Value(0)
    const second = new api.Value(0)
    const end = vi.fn()
    api
      .parallel([
        api.timing(first, { toValue: 1, duration: 100, easing: Easing.linear }),
        api.timing(second, {
          toValue: 1,
          duration: 100,
          easing: Easing.linear,
        }),
      ])
      .start(end)
    manual.advance(0)
    manual.advance(30)
    api.timing(first, { toValue: 0, duration: 10 }).start()
    expect(end).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledWith({ finished: false })
    // The sibling froze where it was: only the external animation ticks.
    expect(second.__getValue()).toBeCloseTo(0.3, 12)
    expect(manual.activeCount()).toBe(1)
    manual.advance(0)
    manual.advance(10)
    expect(second.__getValue()).toBeCloseTo(0.3, 12)
    expect(manual.activeCount()).toBe(0)
  })

  it("lets the siblings finish with stopTogether: false", () => {
    const { manual, api } = setup()
    const first = new api.Value(0)
    const second = new api.Value(0)
    const end = vi.fn()
    api
      .parallel(
        [
          api.timing(first, {
            toValue: 1,
            duration: 100,
            easing: Easing.linear,
          }),
          api.timing(second, {
            toValue: 1,
            duration: 100,
            easing: Easing.linear,
          }),
        ],
        { stopTogether: false },
      )
      .start(end)
    manual.advance(0)
    manual.advance(30)
    api.timing(first, { toValue: 0, duration: 10 }).start()
    expect(end).not.toHaveBeenCalled()
    manual.advance(0)
    manual.advance(10)
    manual.advance(60)
    expect(second.__getValue()).toBe(1)
    // One child was interrupted, so the whole parallel is unfinished.
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(manual.activeCount()).toBe(0)
  })

  it("an empty parallel completes immediately", () => {
    const { api } = setup()
    const end = vi.fn()
    api.parallel([]).start(end)
    expect(end).toHaveBeenCalledWith({ finished: true })
  })
})

describe("Animated.delay", () => {
  it("finishes after the given time has elapsed", () => {
    const { manual, api } = setup()
    const end = vi.fn()
    api.delay(100).start(end)
    manual.advance(0)
    manual.advance(99)
    expect(end).not.toHaveBeenCalled()
    manual.advance(1)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(manual.activeCount()).toBe(0)
  })

  it("delay(0) completes on the first frame", () => {
    const { manual, api } = setup()
    const end = vi.fn()
    api.delay(0).start(end)
    manual.advance(16)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(manual.activeCount()).toBe(0)
  })

  it("can be stopped with finished: false", () => {
    const { manual, api } = setup()
    const end = vi.fn()
    const animation = api.delay(100)
    animation.start(end)
    manual.advance(0)
    manual.advance(50)
    animation.stop()
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(manual.activeCount()).toBe(0)
  })
})

describe("Animated.loop", () => {
  it("repeats the animation the configured number of times", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    let completions = 0
    value.addListener(({ value: v }) => {
      if (v === 1) {
        completions++
      }
    })
    const end = vi.fn()
    api
      .loop(
        api.timing(value, { toValue: 1, duration: 40, easing: Easing.linear }),
        { iterations: 3 },
      )
      .start(end)
    for (let i = 0; i < 20; i++) {
      manual.advance(20)
    }
    expect(completions).toBe(3)
    expect(end).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(manual.activeCount()).toBe(0)
  })

  it("resets the value to its starting point between iterations", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const seen: number[] = []
    value.addListener(({ value: v }) => {
      seen.push(v)
    })
    api
      .loop(
        api.timing(value, { toValue: 1, duration: 40, easing: Easing.linear }),
        { iterations: 2 },
      )
      .start()
    for (let i = 0; i < 10; i++) {
      manual.advance(20)
    }
    // Each completion (1) is followed by a snap back to 0 before the rerun.
    const firstCompletion = seen.indexOf(1)
    expect(firstCompletion).toBeGreaterThan(-1)
    expect(seen[firstCompletion + 1]).toBe(0)
    expect(seen.filter((v) => v === 1)).toHaveLength(2)
  })

  it("loops forever until stopped", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    const animation = api.loop(
      api.timing(value, { toValue: 1, duration: 32, easing: Easing.linear }),
    )
    animation.start(end)
    for (let i = 0; i < 50; i++) {
      manual.advance(16)
    }
    expect(end).not.toHaveBeenCalled()
    expect(manual.activeCount()).toBe(1)
    animation.stop()
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(manual.activeCount()).toBe(0)
    manual.advance(100)
    expect(manual.activeCount()).toBe(0)
  })

  it("iterations: 0 completes immediately without frames", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    api
      .loop(api.timing(value, { toValue: 1, duration: 40 }), { iterations: 0 })
      .start(end)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(value.__getValue()).toBe(0)
    expect(manual.activeCount()).toBe(0)
  })

  it("propagates finished: false when the child is preempted", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    const end = vi.fn()
    api
      .loop(
        api.timing(value, { toValue: 1, duration: 40, easing: Easing.linear }),
      )
      .start(end)
    manual.advance(0)
    manual.advance(20)
    api.timing(value, { toValue: 0, duration: 10 }).start()
    expect(end).toHaveBeenCalledWith({ finished: false })
  })

  it("loops composed animations (sequence inside loop)", () => {
    const { manual, api } = setup()
    const value = new api.Value(0)
    let completions = 0
    value.addListener(({ value: v }) => {
      if (v === 1) {
        completions++
      }
    })
    const end = vi.fn()
    api
      .loop(
        api.sequence([
          api.timing(value, {
            toValue: 1,
            duration: 20,
            easing: Easing.linear,
          }),
          api.delay(20),
        ]),
        { iterations: 2 },
      )
      .start(end)
    for (let i = 0; i < 20; i++) {
      manual.advance(10)
    }
    expect(completions).toBe(2)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(manual.activeCount()).toBe(0)
  })
})
