// The initial run of an updater, which is upstream's `IN_STYLE_UPDATER` and
// is not a detail.
//
// `useDerivedValue(() => withSpring(active ? 1 : 0))` is a documented
// Reanimated pattern and the shape `react-native-draggable-flatlist`'s
// `ScaleDecorator` is built on. It only works because the FIRST evaluation of
// the updater has nothing to animate from, so every builder collapses to the
// value it would have finished at and the shared value is seeded with a
// number. Without that the value is seeded with the animation OBJECT and the
// second evaluation finds a non-numeric current value.
//
// Found by building the library rather than by reading it; the failure was
// "an animation can only be assigned to a shared value holding a number
// (this one holds object)" at the first re-render of a dragged cell.
import { describe, expect, it } from "vitest"
import {
  initialUpdaterRun,
  isAnimationSpec,
  withClamp,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "../../../src/reanimated-compat/animation"

describe("the initial updater run", () => {
  it("collapses withTiming and withSpring to their target", () => {
    expect(initialUpdaterRun(() => withTiming(42))).toBe(42)
    expect(initialUpdaterRun(() => withSpring(7))).toBe(7)
  })

  it("collapses the composites to the animation they wrap", () => {
    // Upstream's `starting` for each of these is the wrapped animation,
    // which the same run has already collapsed to a plain number.
    expect(initialUpdaterRun(() => withDelay(500, withTiming(3)))).toBe(3)
    expect(
      initialUpdaterRun(() => withSequence(withTiming(1), withTiming(9))),
    ).toBe(1)
    expect(initialUpdaterRun(() => withRepeat(withTiming(5), 3))).toBe(5)
    expect(initialUpdaterRun(() => withClamp({ min: 0 }, withSpring(8)))).toBe(
      8,
    )
  })

  it("collapses withDecay to 0 — it has no target to collapse to", () => {
    expect(initialUpdaterRun(() => withDecay({ velocity: 100 }))).toBe(0)
  })

  it("is scoped to the run: outside it the builders still build animations", () => {
    initialUpdaterRun(() => withTiming(1))
    expect(isAnimationSpec(withTiming(1))).toBe(true)
    expect(isAnimationSpec(withSpring(1))).toBe(true)
  })

  it("clears the flag even when the updater throws", () => {
    expect(() =>
      initialUpdaterRun(() => {
        throw new Error("boom")
      }),
    ).toThrow("boom")
    expect(isAnimationSpec(withTiming(1))).toBe(true)
  })

  it("leaves plain values alone", () => {
    expect(initialUpdaterRun(() => 12)).toBe(12)
    expect(initialUpdaterRun(() => ({ width: 3 }))).toEqual({ width: 3 })
  })

  it("collapses an object-targeted withTiming/withSpring to the target OBJECT, by reference — upstream's defineAnimation returns `starting` unchanged, never a clone", () => {
    const target = { x: 10, y: 20 }
    expect(initialUpdaterRun(() => withTiming(target))).toBe(target)
    const springTarget = { x: 1, y: 2 }
    expect(initialUpdaterRun(() => withSpring(springTarget))).toBe(springTarget)
  })

  it("collapses an array-targeted withTiming to the target array, by reference", () => {
    const target = [1, 2, 3]
    expect(initialUpdaterRun(() => withTiming(target))).toBe(target)
  })

  it("collapses the composites over an object target to the object the innermost builder collapsed to", () => {
    expect(
      initialUpdaterRun(() => withDelay(500, withTiming({ x: 3, y: 4 }))),
    ).toEqual({ x: 3, y: 4 })
    expect(
      initialUpdaterRun(() =>
        withSequence(withTiming({ x: 1, y: 1 }), withTiming({ x: 9, y: 9 })),
      ),
    ).toEqual({ x: 1, y: 1 })
    expect(
      initialUpdaterRun(() => withRepeat(withTiming({ x: 5, y: 6 }), 3)),
    ).toEqual({ x: 5, y: 6 })
  })

  it("still throws for an object with a non-numeric leaf, and for a colour string leaf", () => {
    expect(() =>
      initialUpdaterRun(() => withTiming({ x: 10, label: "left" } as never)),
    ).toThrow(/withTiming/)
    expect(() =>
      initialUpdaterRun(() => withTiming({ background: "#ff0000" } as never)),
    ).toThrow(/withTiming/)
  })
})
