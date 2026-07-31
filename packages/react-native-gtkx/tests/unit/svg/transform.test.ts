import { describe, expect, it } from "vitest"
import { parseSvgTransform } from "../../../src/svg/transform"

describe("parseSvgTransform", () => {
  it("returns nothing for an absent/empty value", () => {
    expect(parseSvgTransform(undefined)).toEqual([])
    expect(parseSvgTransform("")).toEqual([])
  })

  it("parses translate with one or two args", () => {
    expect(parseSvgTransform("translate(10)")).toEqual([
      { type: "translate", x: 10, y: 0 },
    ])
    expect(parseSvgTransform("translate(10, 20)")).toEqual([
      { type: "translate", x: 10, y: 20 },
    ])
  })

  it("parses scale, defaulting y to x", () => {
    expect(parseSvgTransform("scale(2)")).toEqual([
      { type: "scale", x: 2, y: 2 },
    ])
    expect(parseSvgTransform("scale(2,3)")).toEqual([
      { type: "scale", x: 2, y: 3 },
    ])
  })

  it("parses a bare rotate", () => {
    expect(parseSvgTransform("rotate(45)")).toEqual([
      { type: "rotate", angleDeg: 45 },
    ])
  })

  it("expands rotate(angle, cx, cy) into translate/rotate/translate", () => {
    expect(parseSvgTransform("rotate(90, 5, 10)")).toEqual([
      { type: "translate", x: 5, y: 10 },
      { type: "rotate", angleDeg: 90 },
      { type: "translate", x: -5, y: -10 },
    ])
  })

  it("parses matrix with exactly 6 args", () => {
    expect(parseSvgTransform("matrix(1,0,0,1,5,6)")).toEqual([
      { type: "matrix", a: 1, b: 0, c: 0, d: 1, e: 5, f: 6 },
    ])
  })

  it("chains multiple transforms left to right", () => {
    expect(parseSvgTransform("translate(10,20) rotate(45) scale(2)")).toEqual([
      { type: "translate", x: 10, y: 20 },
      { type: "rotate", angleDeg: 45 },
      { type: "scale", x: 2, y: 2 },
    ])
  })

  it("ignores skewX/skewY (deliberate cut)", () => {
    expect(parseSvgTransform("skewX(10)")).toEqual([])
    expect(parseSvgTransform("skewY(10) translate(1,1)")).toEqual([
      { type: "translate", x: 1, y: 1 },
    ])
  })

  it("drops malformed calls without throwing", () => {
    expect(parseSvgTransform("translate()")).toEqual([])
    expect(parseSvgTransform("matrix(1,2,3)")).toEqual([])
    expect(parseSvgTransform("rotate(1,2)")).toEqual([])
    expect(parseSvgTransform("bogus(1,2,3)")).toEqual([])
    expect(() => parseSvgTransform("!!! not a transform at all")).not.toThrow()
  })
})
