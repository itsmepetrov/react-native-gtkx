import { describe, expect, it } from "vitest"
import {
  parsePreserveAspectRatio,
  parseViewBox,
  resolveViewBoxTransform,
  type AlignX,
  type AlignY,
} from "../../../src/svg/view-box"

describe("parseViewBox", () => {
  it("parses comma-separated form", () => {
    expect(parseViewBox("0 0 100 50")).toEqual({
      minX: 0,
      minY: 0,
      width: 100,
      height: 50,
    })
  })

  it("parses a non-zero origin", () => {
    expect(parseViewBox("10,20,100,50")).toEqual({
      minX: 10,
      minY: 20,
      width: 100,
      height: 50,
    })
  })

  it("rejects malformed or non-positive-size input", () => {
    expect(parseViewBox(undefined)).toBeNull()
    expect(parseViewBox("")).toBeNull()
    expect(parseViewBox("0 0 100")).toBeNull()
    expect(parseViewBox("0 0 -1 50")).toBeNull()
    expect(parseViewBox("a b c d")).toBeNull()
  })
})

describe("parsePreserveAspectRatio", () => {
  it("defaults to xMidYMid meet", () => {
    expect(parsePreserveAspectRatio(undefined)).toEqual({
      align: { x: "mid", y: "mid" },
      meetOrSlice: "meet",
    })
  })

  it("parses none", () => {
    expect(parsePreserveAspectRatio("none")).toEqual({
      align: "none",
      meetOrSlice: "meet",
    })
  })

  it("parses align + slice", () => {
    expect(parsePreserveAspectRatio("xMinYMax slice")).toEqual({
      align: { x: "min", y: "max" },
      meetOrSlice: "slice",
    })
  })

  it("falls back to the default on garbage", () => {
    expect(parsePreserveAspectRatio("whatever")).toEqual({
      align: { x: "mid", y: "mid" },
      meetOrSlice: "meet",
    })
  })
})

describe("resolveViewBoxTransform", () => {
  it("identity when there is no viewBox", () => {
    expect(resolveViewBoxTransform(null, 200, 100)).toEqual({
      scaleX: 1,
      scaleY: 1,
      translateX: 0,
      translateY: 0,
    })
  })

  it("none stretches independently per axis", () => {
    const t = resolveViewBoxTransform(
      { minX: 0, minY: 0, width: 100, height: 50 },
      200,
      200,
      { align: "none", meetOrSlice: "meet" },
    )
    expect(t).toEqual({ scaleX: 2, scaleY: 4, translateX: 0, translateY: 0 })
  })

  // 3x3 grid of the align keywords, always the same 100x50 viewBox stretched
  // (meet) into a 200x200 viewport: uniform scale is min(2, 4) = 2, so the
  // scaled content is 200x100 — 100px of slack on the Y axis to distribute.
  const ALIGN_X: AlignX[] = ["min", "mid", "max"]
  const ALIGN_Y: AlignY[] = ["min", "mid", "max"]
  const expectedOffsetY: Record<AlignY, number> = { min: 0, mid: 50, max: 100 }

  for (const x of ALIGN_X) {
    for (const y of ALIGN_Y) {
      it(`meet, x${x}Y${y}`, () => {
        const t = resolveViewBoxTransform(
          { minX: 0, minY: 0, width: 100, height: 50 },
          200,
          200,
          { align: { x, y }, meetOrSlice: "meet" },
        )
        expect(t.scaleX).toBe(2)
        expect(t.scaleY).toBe(2)
        // X axis has no slack (2 * 100 === 200 exactly) regardless of align.
        expect(t.translateX).toBe(0)
        expect(t.translateY).toBe(expectedOffsetY[y])
      })
    }
  }

  it("slice fills the viewport and overflows the viewBox", () => {
    const t = resolveViewBoxTransform(
      { minX: 0, minY: 0, width: 100, height: 50 },
      200,
      200,
      { align: { x: "mid", y: "mid" }, meetOrSlice: "slice" },
    )
    // uniform scale is max(2, 4) = 4: content becomes 400x200, X overflows.
    expect(t.scaleX).toBe(4)
    expect(t.scaleY).toBe(4)
    expect(t.translateX).toBe((200 - 400) / 2)
    expect(t.translateY).toBe(0)
  })

  it("honors a non-zero viewBox origin", () => {
    const t = resolveViewBoxTransform(
      { minX: 10, minY: 20, width: 100, height: 100 },
      100,
      100,
      { align: { x: "min", y: "min" }, meetOrSlice: "meet" },
    )
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
    expect(t.translateX).toBe(-10)
    expect(t.translateY).toBe(-20)
  })
})
