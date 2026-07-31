import { describe, expect, it } from "vitest"
import {
  circleToPathData,
  ellipseToPathData,
  lineToPathData,
  parsePoints,
  polygonToPathData,
  polylineToPathData,
  rectToPathData,
} from "../../../src/svg/geometry"

describe("parsePoints", () => {
  it("parses comma-separated pairs", () => {
    expect(parsePoints("0,0 10,5 20,0")).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ])
  })

  it("parses whitespace-separated pairs (no commas)", () => {
    expect(parsePoints("0 0 10 5 20 0")).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ])
  })

  it("drops a trailing odd number", () => {
    expect(parsePoints("0,0 10,5 99")).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ])
  })

  it("returns an empty array for garbage", () => {
    expect(parsePoints("")).toEqual([])
    expect(parsePoints("not,numbers")).toEqual([])
  })
})

describe("rectToPathData", () => {
  it("plain rect (no radius)", () => {
    expect(rectToPathData({ x: 1, y: 2, width: 10, height: 20 })).toBe(
      "M 1 2 H 11 V 22 H 1 Z",
    )
  })

  it("zero or negative size produces no path", () => {
    expect(rectToPathData({ x: 0, y: 0, width: 0, height: 10 })).toBe("")
    expect(rectToPathData({ x: 0, y: 0, width: 10, height: -1 })).toBe("")
  })

  it("rounded rect uses rx for both axes when ry is absent", () => {
    const d = rectToPathData({ x: 0, y: 0, width: 100, height: 50, rx: 10 })
    expect(d).toContain("A 10 10 0 0 1")
  })

  it("clamps radii to half the box", () => {
    const d = rectToPathData({
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      rx: 999,
      ry: 999,
    })
    // half of height (10) is the binding clamp for ry; rx clamps to half width (10)
    expect(d).toContain("A 10 5 0 0 1")
  })
})

describe("circle/ellipse path data", () => {
  it("circle is a two-arc closed contour", () => {
    expect(circleToPathData(50, 50, 40)).toBe(
      "M 10 50 A 40 40 0 1 0 90 50 A 40 40 0 1 0 10 50 Z",
    )
  })

  it("ellipse uses independent radii", () => {
    expect(ellipseToPathData(0, 0, 30, 10)).toBe(
      "M -30 0 A 30 10 0 1 0 30 0 A 30 10 0 1 0 -30 0 Z",
    )
  })

  it("non-positive radius produces no path", () => {
    expect(circleToPathData(0, 0, 0)).toBe("")
    expect(ellipseToPathData(0, 0, 0, 10)).toBe("")
  })
})

describe("line/polygon/polyline path data", () => {
  it("line is an open two-point path", () => {
    expect(lineToPathData(0, 0, 10, 10)).toBe("M 0 0 L 10 10")
  })

  it("polygon closes the contour", () => {
    expect(polygonToPathData("0,0 10,0 5,10")).toBe("M 0 0 L 10 0 L 5 10 Z")
  })

  it("polyline stays open", () => {
    expect(polylineToPathData("0,0 10,0 5,10")).toBe("M 0 0 L 10 0 L 5 10")
  })

  it("accepts a pre-parsed point array too", () => {
    expect(
      polygonToPathData([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe("M 0 0 L 1 1 Z")
  })

  it("empty points produce no path", () => {
    expect(polygonToPathData("")).toBe("")
    expect(polylineToPathData("")).toBe("")
  })
})
