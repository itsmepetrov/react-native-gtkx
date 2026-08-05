// Pins upstream's recursive AnimatableValue rules — read out of
// react-native-reanimated 4.5.3's `src/animation/util.ts` (`decorateAnimation`)
// — BEFORE any of `withTiming`/`withSpring`/the shared-value or updater
// wiring is touched. See animatable-value.ts's header for the transcription.
import { describe, expect, it, vi } from "vitest"
import { Easing, springStep } from "../../../src/animated/index"
import {
  animatableValueSignature,
  AnimatedShapeValue,
  assertAnimatableValue,
  createShapeValueAnimation,
  isAnimatableValue,
  maxAnimatableLeafDelta,
  rebuildAnimatableValue,
  sameAnimatableValue,
  timingShapeMakeSteps,
  zipAnimatableLeaves,
} from "../../../src/reanimated-compat/animatable-value"
import { createManualScheduler } from "../animated/manual-scheduler"

describe("isAnimatableValue", () => {
  it("accepts finite numbers", () => {
    expect(isAnimatableValue(0)).toBe(true)
    expect(isAnimatableValue(-12.5)).toBe(true)
  })

  it("rejects non-finite numbers", () => {
    expect(isAnimatableValue(Number.NaN)).toBe(false)
    expect(isAnimatableValue(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it("accepts a plain object of numeric leaves", () => {
    expect(isAnimatableValue({ x: 10, y: 20 })).toBe(true)
  })

  it("accepts nested objects — upstream's objectOnStart re-decorates its clones' onStart, so a nested object genuinely recurses", () => {
    expect(isAnimatableValue({ position: { x: 1, y: 2 }, scale: 3 })).toBe(true)
  })

  it("accepts a flat array of numbers", () => {
    expect(isAnimatableValue([1, 2, 3])).toBe(true)
  })

  it("rejects an array containing anything but numbers — upstream's array clones keep the BASE onStart, never the decorated one, so an array element is always a plain number", () => {
    expect(isAnimatableValue([1, "2", 3])).toBe(false)
    expect(isAnimatableValue([{ x: 1 }])).toBe(false)
  })

  it("rejects a colour string — colours keep the existing interpolateColor path, not this one", () => {
    expect(isAnimatableValue("#ff0000")).toBe(false)
  })

  it("rejects an object with a non-numeric leaf", () => {
    expect(isAnimatableValue({ x: 10, label: "left" })).toBe(false)
  })

  it("rejects null, booleans and functions", () => {
    expect(isAnimatableValue(null)).toBe(false)
    expect(isAnimatableValue(true)).toBe(false)
    expect(isAnimatableValue(() => 1)).toBe(false)
  })
})

describe("assertAnimatableValue", () => {
  it("returns the value BY REFERENCE, unchanged — upstream's defineAnimation returns `starting` itself under IN_STYLE_UPDATER, never a clone", () => {
    const target = { x: 10, y: 20 }
    expect(assertAnimatableValue(target, "withTiming")).toBe(target)
  })

  it("throws a descriptive error naming the api for an invalid leaf", () => {
    expect(() => assertAnimatableValue({ x: "10" }, "withTiming")).toThrow(
      /withTiming/,
    )
  })

  it("throws for a bare colour string, same as the existing number-only gate did", () => {
    expect(() => assertAnimatableValue("#ff0000", "withSpring")).toThrow(
      /withSpring/,
    )
  })
})

describe("zipAnimatableLeaves + rebuildAnimatableValue", () => {
  it("round-trips a flat object", () => {
    const { shape, leaves } = zipAnimatableLeaves(
      "withTiming",
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    )
    expect(leaves).toHaveLength(2)
    const rebuilt = rebuildAnimatableValue(
      shape,
      leaves.map((leaf) => leaf.to),
    )
    expect(rebuilt).toEqual({ x: 10, y: 20 })
  })

  it("round-trips a nested object", () => {
    const { shape, leaves } = zipAnimatableLeaves(
      "withTiming",
      { position: { x: 0, y: 0 }, scale: 1 },
      { position: { x: 5, y: 5 }, scale: 2 },
    )
    expect(leaves).toHaveLength(3)
    const rebuilt = rebuildAnimatableValue(
      shape,
      leaves.map((leaf) => leaf.to),
    )
    expect(rebuilt).toEqual({ position: { x: 5, y: 5 }, scale: 2 })
  })

  it("round-trips a flat array", () => {
    const { shape, leaves } = zipAnimatableLeaves(
      "withTiming",
      [0, 0, 0],
      [1, 2, 3],
    )
    const rebuilt = rebuildAnimatableValue(
      shape,
      leaves.map((leaf) => leaf.to),
    )
    expect(rebuilt).toEqual([1, 2, 3])
  })

  it("throws, naming the path, when the target is missing a key the origin has", () => {
    expect(() =>
      zipAnimatableLeaves("withTiming", { x: 0, y: 0 }, { x: 10 } as never),
    ).toThrow(/withTiming/)
  })

  it("throws when the target has a key the origin does not", () => {
    expect(() =>
      zipAnimatableLeaves("withTiming", { x: 0 }, { x: 10, y: 20 } as never),
    ).toThrow(/y/)
  })

  it("throws when an array's length changes", () => {
    expect(() =>
      zipAnimatableLeaves("withTiming", [0, 0], [1, 2, 3] as never),
    ).toThrow()
  })

  it("throws when a leaf that was a number becomes an object", () => {
    expect(() =>
      zipAnimatableLeaves("withTiming", { x: 0 }, { x: { y: 1 } } as never),
    ).toThrow()
  })

  it("names the exact leaf path in a nested mismatch", () => {
    expect(() =>
      zipAnimatableLeaves("withSpring", { position: { x: 0, y: 0 } }, {
        position: { x: 0 },
      } as never),
    ).toThrow(/position/)
  })
})

describe("animatableValueSignature", () => {
  it("is independent of key insertion order", () => {
    expect(animatableValueSignature({ x: 1, y: 2 })).toBe(
      animatableValueSignature({ y: 2, x: 1 }),
    )
  })

  it("differs for a genuinely different target", () => {
    expect(animatableValueSignature({ x: 1, y: 2 })).not.toBe(
      animatableValueSignature({ x: 1, y: 3 }),
    )
  })

  it("differs between an object and a differently-shaped one", () => {
    expect(animatableValueSignature({ x: 1 })).not.toBe(
      animatableValueSignature({ x: 1, y: 2 }),
    )
  })
})

describe("sameAnimatableValue", () => {
  it("is structural, not reference, equality", () => {
    expect(sameAnimatableValue({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true)
  })

  it("is false for a differing leaf", () => {
    expect(sameAnimatableValue({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(false)
  })

  it("is false, not thrown, for a shape it cannot line up", () => {
    expect(sameAnimatableValue({ x: 1 }, { x: 1, y: 2 })).toBe(false)
  })
})

describe("maxAnimatableLeafDelta", () => {
  it("is the largest single-leaf change, not the sum", () => {
    expect(maxAnimatableLeafDelta({ x: 0, y: 0 }, { x: 1, y: 9 })).toBe(9)
  })

  it("is 0 for equal values", () => {
    expect(maxAnimatableLeafDelta({ x: 5 }, { x: 5 })).toBe(0)
  })
})

describe("timingShapeMakeSteps", () => {
  it("interpolates every leaf with the SAME progress fraction, off one elapsed clock", () => {
    const makeSteps = timingShapeMakeSteps(
      { x: 100, y: 200 },
      100,
      Easing.linear,
    )
    const step = makeSteps({ x: 0, y: 0 })
    expect(step(50)).toEqual({ position: { x: 50, y: 100 }, done: false })
  })

  it("finishes both leaves together, at the target exactly", () => {
    const makeSteps = timingShapeMakeSteps(
      { x: 100, y: 200 },
      100,
      Easing.linear,
    )
    const step = makeSteps({ x: 0, y: 0 })
    expect(step(100)).toEqual({ position: { x: 100, y: 200 }, done: true })
  })
})

describe("spring leaves finish independently, and the whole animation waits for the slowest one", () => {
  it("is NOT done while one leaf has settled and another has not", () => {
    // A big displacement (0 -> 1000) takes far longer to cross the same rest
    // thresholds than a tiny one (0 -> 1) — same stiffness/damping/mass, so
    // this is purely upstream's per-leaf independence, not a config trick.
    const config = {
      stiffness: 100,
      damping: 20,
      mass: 1,
      overshootClamping: false,
      restDisplacementThreshold: 0.01,
      restSpeedThreshold: 0.01,
      initialVelocity: 0,
    }
    const stepFast = springStep({ ...config, toValue: 1 })(0)
    const stepSlow = springStep({ ...config, toValue: 1000 })(0)
    // Find a t where the small displacement has settled and the large one
    // plainly has not (it needs to travel 1000 units under the same physics).
    let t = 0
    while (!stepFast(t).done && t < 5000) {
      t += 16
    }
    expect(stepFast(t).done).toBe(true)
    expect(stepSlow(t).done).toBe(false)
  })
})

describe("AnimatedShapeValue + createShapeValueAnimation", () => {
  const setup = () => createManualScheduler()

  it("publishes the whole merged object, once per real frame — not once per leaf", () => {
    const m = setup()
    const value = new AnimatedShapeValue({ x: 0, y: 0 })
    const seen: unknown[] = []
    value.addListener(({ value: v }) => seen.push(v))
    const makeSteps = timingShapeMakeSteps(
      { x: 100, y: 200 },
      100,
      Easing.linear,
    )
    createShapeValueAnimation(m.scheduler, value, makeSteps).start()
    m.advance(0)
    m.advance(50)
    // ONE publish for this tick, carrying BOTH leaves' new values together —
    // never x updated with y stale.
    expect(seen[seen.length - 1]).toEqual({ x: 50, y: 100 })
    expect(seen).toHaveLength(2) // advance(0) establishes t=0, advance(50) is the only real step
  })

  it("registers exactly one scheduler subscription for the whole object, not one per leaf", () => {
    const m = setup()
    const value = new AnimatedShapeValue({ x: 0, y: 0, z: 0 })
    const makeSteps = timingShapeMakeSteps(
      { x: 1, y: 2, z: 3 },
      100,
      Easing.linear,
    )
    createShapeValueAnimation(m.scheduler, value, makeSteps).start()
    expect(m.activeCount()).toBe(1)
  })

  it("fires the callback exactly once, with finished: true, when every leaf has settled", () => {
    const m = setup()
    const value = new AnimatedShapeValue({ x: 0, y: 0 })
    const end = vi.fn()
    const makeSteps = timingShapeMakeSteps(
      { x: 100, y: 200 },
      100,
      Easing.linear,
    )
    createShapeValueAnimation(m.scheduler, value, makeSteps).start(end)
    m.advance(0)
    m.advance(50)
    expect(end).not.toHaveBeenCalled()
    m.advance(50)
    expect(end).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledWith({ finished: true })
    expect(value.__getValue()).toEqual({ x: 100, y: 200 })
  })

  it("stop() reports finished: false and halts further ticks", () => {
    const m = setup()
    const value = new AnimatedShapeValue({ x: 0, y: 0 })
    const end = vi.fn()
    const makeSteps = timingShapeMakeSteps(
      { x: 100, y: 200 },
      100,
      Easing.linear,
    )
    const animation = createShapeValueAnimation(m.scheduler, value, makeSteps)
    animation.start(end)
    m.advance(0)
    animation.stop()
    expect(end).toHaveBeenCalledWith({ finished: false })
    expect(m.activeCount()).toBe(0)
  })

  it("a second start() preempts the first, reporting finished: false to it", () => {
    const m = setup()
    const value = new AnimatedShapeValue({ x: 0, y: 0 })
    const firstEnd = vi.fn()
    const secondEnd = vi.fn()
    const makeSteps = timingShapeMakeSteps(
      { x: 100, y: 200 },
      100,
      Easing.linear,
    )
    const animation = createShapeValueAnimation(m.scheduler, value, makeSteps)
    animation.start(firstEnd)
    m.advance(0)
    animation.start(secondEnd)
    expect(firstEnd).toHaveBeenCalledWith({ finished: false })
    expect(secondEnd).not.toHaveBeenCalled()
  })

  it("setValue snaps the driver and notifies listeners, without needing a running animation", () => {
    const value = new AnimatedShapeValue({ x: 0, y: 0 })
    const seen: unknown[] = []
    value.addListener(({ value: v }) => seen.push(v))
    value.setValue({ x: 9, y: 9 })
    expect(seen).toEqual([{ x: 9, y: 9 }])
    expect(value.__getValue()).toEqual({ x: 9, y: 9 })
  })
})
