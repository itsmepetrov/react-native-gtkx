// textDecorationLine takes text-align's path, not CSS's: GTK4 has no widget
// `text-decoration`, so the style system decides what is wanted and the Text
// component applies it as Pango attributes.
import { describe, expect, it } from "vitest"
import {
  splitStyle,
  textDecorationToAttrs,
  visualStyleToCss,
} from "../../../src/style/index"

describe("textDecorationToAttrs", () => {
  it("asks for nothing when unset or none", () => {
    expect(textDecorationToAttrs(undefined)).toEqual({
      underline: false,
      strikethrough: false,
    })
    expect(textDecorationToAttrs("none")).toEqual({
      underline: false,
      strikethrough: false,
    })
  })

  it("maps each single value onto its own Pango attribute", () => {
    expect(textDecorationToAttrs("underline")).toEqual({
      underline: true,
      strikethrough: false,
    })
    expect(textDecorationToAttrs("line-through")).toEqual({
      underline: false,
      strikethrough: true,
    })
  })

  it("maps RN's combined value onto both", () => {
    expect(textDecorationToAttrs("underline line-through")).toEqual({
      underline: true,
      strikethrough: true,
    })
  })
})

describe("classification", () => {
  it("is a visual prop that produces no CSS", () => {
    const { layout, visual } = splitStyle({
      textDecorationLine: "line-through",
    })
    expect(layout).toEqual({})
    expect(visual).toEqual({ textDecorationLine: "line-through" })
    expect(visualStyleToCss(visual)).toBe("")
  })
})
