import { beforeEach, describe, expect, it, vi } from "vitest"
import { resetDevWarnings } from "../../../src/style/dev-warning"
import {
  composeTransform,
  IDENTITY_TRANSFORM,
  isIdentityTransform,
  isTranslationOnly,
  parseAngle,
} from "../../../src/style/transform"
import type { TransformPart } from "../../../src/contracts"

beforeEach(() => {
  resetDevWarnings()
})

// Applies the composed matrix to a point, which is the only thing the matrix
// is ever used for — comparing components would just restate the code.
const apply = (
  parts: TransformPart[],
  x: number,
  y: number,
): [number, number] => {
  const m = composeTransform(parts)
  return [
    Math.round((m.xx * x + m.xy * y + m.dx) * 1e6) / 1e6,
    Math.round((m.yx * x + m.yy * y + m.dy) * 1e6) / 1e6,
  ]
}

describe("parseAngle", () => {
  it("reads deg and rad", () => {
    expect(parseAngle("90deg")).toBe(90)
    expect(parseAngle("-45.5deg")).toBe(-45.5)
    expect(parseAngle("0rad")).toBe(0)
    expect(parseAngle("3.141592653589793rad")).toBeCloseTo(180, 9)
  })

  it("accepts a bare number as degrees (Animated with a numeric outputRange)", () => {
    expect(parseAngle(45)).toBe(45)
  })

  it("warns once and drops an unparseable angle", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(parseAngle("45")).toBeNull()
    expect(parseAngle("45")).toBeNull()
    expect(parseAngle("banana")).toBeNull()
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

describe("composeTransform", () => {
  it("is the identity for an empty list", () => {
    expect(composeTransform([])).toEqual(IDENTITY_TRANSFORM)
    expect(isIdentityTransform(composeTransform([]))).toBe(true)
  })

  it("rotates counter-clockwise-negative like RN (positive deg turns x into y)", () => {
    expect(apply([{ rotate: "90deg" }], 1, 0)).toEqual([0, 1])
    expect(apply([{ rotate: "180deg" }], 1, 0)).toEqual([-1, 0])
  })

  it("treats rotateZ as an alias of rotate", () => {
    expect(composeTransform([{ rotateZ: "37deg" }])).toEqual(
      composeTransform([{ rotate: "37deg" }]),
    )
  })

  it("scales uniformly and per axis", () => {
    expect(apply([{ scale: 2 }], 3, 5)).toEqual([6, 10])
    expect(apply([{ scaleX: 2 }], 3, 5)).toEqual([6, 5])
    expect(apply([{ scaleY: 2 }], 3, 5)).toEqual([3, 10])
  })

  it("applies the array left to right, i.e. the LAST entry hits a point first", () => {
    // rotate(90) then translateX(10): the translation happens in the
    // unrotated frame and is rotated with the content -> (0, 10).
    expect(apply([{ rotate: "90deg" }, { translateX: 10 }], 0, 0)).toEqual([
      0, 10,
    ])
    // The reverse order translates in the rotated frame -> (10, 0).
    expect(apply([{ translateX: 10 }, { rotate: "90deg" }], 0, 0)).toEqual([
      10, 0,
    ])
  })

  it("combines scale and translate in order", () => {
    expect(apply([{ scale: 2 }, { translateX: 10 }], 0, 0)).toEqual([20, 0])
    expect(apply([{ translateX: 10 }, { scale: 2 }], 0, 0)).toEqual([10, 0])
  })

  it("skips entries it cannot use instead of failing the whole style", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const parts = [
      { translateX: 5 },
      { skewX: "10deg" },
      { translateY: 7 },
    ] as unknown as TransformPart[]
    expect(apply(parts, 0, 0)).toEqual([5, 7])
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe("isTranslationOnly", () => {
  it("keeps a translate-only list on the positional path", () => {
    expect(
      isTranslationOnly(
        composeTransform([{ translateX: 4 }, { translateY: 9 }]),
      ),
    ).toBe(true)
  })

  it("rejects anything that rotates or scales", () => {
    expect(isTranslationOnly(composeTransform([{ scale: 1.5 }]))).toBe(false)
    expect(isTranslationOnly(composeTransform([{ rotate: "1deg" }]))).toBe(
      false,
    )
    // A full turn is the identity in every component -> still the cheap path.
    expect(isTranslationOnly(composeTransform([{ scaleX: 1 }]))).toBe(true)
  })
})
