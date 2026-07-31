import { describe, expect, it } from "vitest"
import {
  resolveGradientPoint,
  resolveGradientRadius,
} from "../../../src/svg/gradient-geometry"

const bounds = { x: 10, y: 20, width: 80, height: 40 }

describe("resolveGradientPoint", () => {
  it("objectBoundingBox maps 0..1 fractions onto the shape's bounds", () => {
    expect(resolveGradientPoint(bounds, 0, 0, "objectBoundingBox")).toEqual({
      x: 10,
      y: 20,
    })
    expect(resolveGradientPoint(bounds, 1, 1, "objectBoundingBox")).toEqual({
      x: 90,
      y: 60,
    })
    expect(resolveGradientPoint(bounds, 0.5, 0.5, "objectBoundingBox")).toEqual(
      {
        x: 50,
        y: 40,
      },
    )
  })

  it("userSpaceOnUse passes coordinates straight through, ignoring bounds", () => {
    expect(resolveGradientPoint(bounds, 5, 6, "userSpaceOnUse")).toEqual({
      x: 5,
      y: 6,
    })
  })
})

describe("resolveGradientRadius", () => {
  it("objectBoundingBox stretches r into an ellipse matching the aspect ratio", () => {
    expect(resolveGradientRadius(bounds, 0.5, "objectBoundingBox")).toEqual({
      hradius: 40,
      vradius: 20,
    })
  })

  it("userSpaceOnUse uses r directly for both axes", () => {
    expect(resolveGradientRadius(bounds, 15, "userSpaceOnUse")).toEqual({
      hradius: 15,
      vradius: 15,
    })
  })
})
