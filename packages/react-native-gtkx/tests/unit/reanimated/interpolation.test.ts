// `interpolate`, `clamp` and `Easing` — the pure-JS half of Reanimated, and
// the half where "portable from upstream" has to mean it behaves the same.
import { expect, test } from "vitest"
import { Easing } from "../../../src/reanimated-compat/easing"
import {
  clamp,
  Extrapolation,
  interpolate,
} from "../../../src/reanimated-compat/interpolation"

test("interpolates within the range and across segments", () => {
  expect(interpolate(0.5, [0, 1], [0, 100])).toBe(50)
  expect(interpolate(0, [0, 1, 2], [0, 10, 100])).toBe(0)
  expect(interpolate(1.5, [0, 1, 2], [0, 10, 100])).toBe(55)
  expect(interpolate(2, [0, 1, 2], [0, 10, 100])).toBe(100)
})

test("extends past both edges by default", () => {
  expect(interpolate(2, [0, 1], [0, 100])).toBe(200)
  expect(interpolate(-1, [0, 1], [0, 100])).toBe(-100)
})

test("clamp and identity extrapolation, per edge", () => {
  expect(interpolate(2, [0, 1], [0, 100], Extrapolation.CLAMP)).toBe(100)
  expect(interpolate(-1, [0, 1], [0, 100], "clamp")).toBe(0)
  expect(interpolate(5, [0, 1], [0, 100], Extrapolation.IDENTITY)).toBe(5)

  // The per-edge form is the reason this is not the platform's own
  // interpolator, which takes one setting for both sides.
  const perEdge = {
    extrapolateLeft: Extrapolation.CLAMP,
    extrapolateRight: Extrapolation.EXTEND,
  }
  expect(interpolate(-1, [0, 1], [0, 100], perEdge)).toBe(0)
  expect(interpolate(2, [0, 1], [0, 100], perEdge)).toBe(200)
})

test("handles a descending output range", () => {
  expect(interpolate(0.5, [0, 1], [100, 0])).toBe(50)
  expect(interpolate(2, [0, 1], [100, 0], "clamp")).toBe(0)
  expect(interpolate(-1, [0, 1], [100, 0], "clamp")).toBe(100)
})

test("rejects malformed ranges and unknown extrapolation", () => {
  expect(() => interpolate(0, [0], [0])).toThrow(/at least two values/)
  expect(() =>
    interpolate(0, [0, 1], [0, 1], "sideways" as unknown as "clamp"),
  ).toThrow(/unsupported extrapolation/)
})

test("clamp constrains to the range", () => {
  expect(clamp(5, 0, 10)).toBe(5)
  expect(clamp(-5, 0, 10)).toBe(0)
  expect(clamp(50, 0, 10)).toBe(10)
})

test("Easing.bezier returns a factory, not a function", () => {
  // The divergence from RN's Easing that makes re-exporting the platform's
  // impossible: `easing: Easing.bezier(...)` is a config object upstream.
  const bezier = Easing.bezier(0.25, 0.1, 0.25, 1)
  expect(typeof bezier).toBe("object")
  expect(typeof bezier.factory).toBe("function")
  expect(bezier.factory()(0)).toBe(0)
  expect(bezier.factory()(1)).toBe(1)

  // And the RN-shaped escape hatch upstream also ships.
  expect(typeof Easing.bezierFn(0.25, 0.1, 0.25, 1)).toBe("function")
})

test("Easing carries the curves RN's subset does not", () => {
  for (const easing of [
    Easing.sin,
    Easing.circle,
    Easing.bounce,
    Easing.quad,
    Easing.cubic,
    Easing.poly(4),
    Easing.elastic(1),
    Easing.back(1.7),
  ]) {
    expect(easing(0)).toBeCloseTo(0, 5)
    expect(easing(1)).toBeCloseTo(1, 5)
  }

  // `exp` is the exception, and deliberately so: upstream's is
  // `2 ** (10 * (t - 1))`, which starts at 2^-10 rather than 0. Rounding it
  // to a "nicer" curve would be a divergence nobody asked for.
  expect(Easing.exp(0)).toBeCloseTo(0.0009765625, 9)
  expect(Easing.exp(1)).toBeCloseTo(1, 5)
})

test("Easing.steps quantises", () => {
  const up = Easing.steps(4)
  expect(up(0.1)).toBeCloseTo(0.25, 5)
  const down = Easing.steps(4, false)
  expect(down(0.1)).toBeCloseTo(0, 5)
  expect(down(0.6)).toBeCloseTo(0.5, 5)
})

test("in/out/inOut compose as modifiers", () => {
  expect(Easing.in(Easing.quad)(0.5)).toBeCloseTo(0.25, 5)
  expect(Easing.out(Easing.quad)(0.5)).toBeCloseTo(0.75, 5)
  expect(Easing.inOut(Easing.quad)(0.25)).toBeCloseTo(0.125, 5)
  expect(Easing.inOut(Easing.quad)(0.75)).toBeCloseTo(0.875, 5)
})
