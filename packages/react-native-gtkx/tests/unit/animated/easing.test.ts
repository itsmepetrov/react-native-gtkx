import { describe, expect, it } from "vitest"
import { Easing } from "../../../src/animated/index"

describe("Easing", () => {
  it("linear is the identity", () => {
    expect(Easing.linear(0)).toBe(0)
    expect(Easing.linear(0.37)).toBe(0.37)
    expect(Easing.linear(1)).toBe(1)
  })

  it("quad and cubic are powers of t", () => {
    expect(Easing.quad(0.5)).toBeCloseTo(0.25, 12)
    expect(Easing.cubic(0.5)).toBeCloseTo(0.125, 12)
  })

  it("in() returns the base easing unchanged", () => {
    expect(Easing.in(Easing.quad)(0.3)).toBe(Easing.quad(0.3))
  })

  it("out() mirrors the base easing", () => {
    expect(Easing.out(Easing.quad)(0.25)).toBeCloseTo(1 - 0.75 * 0.75, 12)
    expect(Easing.out(Easing.quad)(0)).toBe(0)
    expect(Easing.out(Easing.quad)(1)).toBe(1)
  })

  it("inOut() is symmetric around the midpoint", () => {
    const f = Easing.inOut(Easing.cubic)
    expect(f(0)).toBe(0)
    expect(f(0.5)).toBeCloseTo(0.5, 12)
    expect(f(1)).toBe(1)
    for (const t of [0.1, 0.25, 0.4]) {
      expect(f(t) + f(1 - t)).toBeCloseTo(1, 12)
    }
  })

  it("ease starts slower than linear", () => {
    expect(Easing.ease(0)).toBe(0)
    expect(Easing.ease(1)).toBe(1)
    expect(Easing.ease(0.25)).toBeLessThan(0.25)
  })

  it("bezier solves known curves", () => {
    // Control points on the diagonal collapse to linear.
    const linearish = Easing.bezier(0.25, 0.25, 0.75, 0.75)
    expect(linearish(0.3)).toBeCloseTo(0.3, 6)
    // A symmetric ease-in-out passes through (0.5, 0.5).
    const symmetric = Easing.bezier(0.42, 0, 0.58, 1)
    expect(symmetric(0.5)).toBeCloseTo(0.5, 3)
    expect(symmetric(0)).toBe(0)
    expect(symmetric(1)).toBe(1)
  })

  it("bezier output increases monotonically for monotone curves", () => {
    const f = Easing.bezier(0.42, 0, 1, 1)
    let previous = 0
    for (let i = 1; i <= 20; i++) {
      const current = f(i / 20)
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  it("bezier clamps t outside [0, 1]", () => {
    const f = Easing.bezier(0.42, 0, 1, 1)
    expect(f(-1)).toBe(0)
    expect(f(2)).toBe(1)
  })

  it("bezier rejects x control points outside [0, 1]", () => {
    expect(() => Easing.bezier(-0.1, 0, 1, 1)).toThrow()
    expect(() => Easing.bezier(0, 0, 1.5, 1)).toThrow()
  })
})
