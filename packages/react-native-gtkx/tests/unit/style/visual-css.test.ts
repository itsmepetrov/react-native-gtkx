import { beforeEach, describe, expect, it, vi } from "vitest"
import { resetDevWarnings, visualStyleToCss } from "../../../src/style/index"
import type { VisualStyle } from "../../../src/contracts"

beforeEach(() => {
  resetDevWarnings()
  vi.restoreAllMocks()
})

describe("visualStyleToCss", () => {
  it("returns an empty string for an empty style", () => {
    expect(visualStyleToCss({})).toBe("")
  })

  it("renders a background color", () => {
    expect(visualStyleToCss({ backgroundColor: "#1c71d8" })).toBe(
      "background-color: rgb(28, 113, 216);",
    )
  })

  it("renders borders with an explicit solid style for GTK", () => {
    expect(visualStyleToCss({ borderWidth: 2, borderColor: "black" })).toBe(
      [
        "border-style: solid;",
        "border-width: 2px;",
        "border-color: rgb(0, 0, 0);",
      ].join("\n"),
    )
  })

  it("omits border-style for zero-width borders", () => {
    expect(visualStyleToCss({ borderWidth: 0 })).toBe("border-width: 0px;")
  })

  it("turns the border on when any per-side width is positive", () => {
    expect(visualStyleToCss({ borderTopWidth: 2 })).toBe(
      ["border-style: solid;", "border-top-width: 2px;"].join("\n"),
    )
    expect(visualStyleToCss({ borderWidth: 0, borderLeftWidth: 1 })).toBe(
      [
        "border-style: solid;",
        "border-width: 0px;",
        "border-left-width: 1px;",
      ].join("\n"),
    )
  })

  it("lets an explicit borderStyle win over the auto solid", () => {
    expect(visualStyleToCss({ borderStyle: "dashed", borderWidth: 2 })).toBe(
      ["border-style: dashed;", "border-width: 2px;"].join("\n"),
    )
    expect(visualStyleToCss({ borderStyle: "dotted" })).toBe(
      "border-style: dotted;",
    )
  })

  it("emits per-side widths and colors after the shorthands so they win", () => {
    expect(
      visualStyleToCss({
        borderTopWidth: 3,
        borderWidth: 1,
        borderLeftColor: "red",
        borderColor: "black",
      }),
    ).toBe(
      [
        "border-style: solid;",
        "border-width: 1px;",
        "border-top-width: 3px;",
        "border-color: rgb(0, 0, 0);",
        "border-left-color: rgb(255, 0, 0);",
      ].join("\n"),
    )
  })

  it("renders all four per-side widths and colors in top/right/bottom/left order", () => {
    expect(
      visualStyleToCss({
        borderLeftWidth: 4,
        borderBottomWidth: 3,
        borderRightWidth: 2,
        borderTopWidth: 1,
        borderLeftColor: "#444",
        borderBottomColor: "#333",
        borderRightColor: "#222",
        borderTopColor: "#111",
      }),
    ).toBe(
      [
        "border-style: solid;",
        "border-top-width: 1px;",
        "border-right-width: 2px;",
        "border-bottom-width: 3px;",
        "border-left-width: 4px;",
        "border-top-color: rgb(17, 17, 17);",
        "border-right-color: rgb(34, 34, 34);",
        "border-bottom-color: rgb(51, 51, 51);",
        "border-left-color: rgb(68, 68, 68);",
      ].join("\n"),
    )
  })

  it("emits per-corner radii after the shorthand so they override it", () => {
    expect(
      visualStyleToCss({
        borderTopLeftRadius: 2,
        borderRadius: 8,
        borderBottomRightRadius: 0,
      }),
    ).toBe(
      [
        "border-radius: 8px;",
        "border-top-left-radius: 2px;",
        "border-bottom-right-radius: 0px;",
      ].join("\n"),
    )
  })

  it("clamps opacity into [0, 1]", () => {
    expect(visualStyleToCss({ opacity: 0.35 })).toBe("opacity: 0.35;")
    expect(visualStyleToCss({ opacity: 1.5 })).toBe("opacity: 1;")
    expect(visualStyleToCss({ opacity: -1 })).toBe("opacity: 0;")
  })

  it("quotes font families that are not simple identifiers", () => {
    expect(visualStyleToCss({ fontFamily: "Cantarell" })).toBe(
      "font-family: Cantarell;",
    )
    expect(visualStyleToCss({ fontFamily: "Fira Sans" })).toBe(
      'font-family: "Fira Sans";',
    )
  })

  it("renders text properties in px where applicable", () => {
    expect(
      visualStyleToCss({
        color: "white",
        fontSize: 14,
        fontStyle: "italic",
        fontWeight: "600",
        letterSpacing: 0.5,
        lineHeight: 20,
      }),
    ).toBe(
      [
        "color: rgb(255, 255, 255);",
        "font-size: 14px;",
        "font-style: italic;",
        "font-weight: 600;",
        "letter-spacing: 0.5px;",
        "line-height: 20px;",
      ].join("\n"),
    )
  })

  it("never emits transform or text-align (handled outside CSS)", () => {
    expect(
      visualStyleToCss({
        transform: [{ translateX: 10 }, { scale: 2 }],
        textAlign: "center",
      }),
    ).toBe("")
  })

  it("passes PlatformColor-style var() references through", () => {
    expect(
      visualStyleToCss({ backgroundColor: "var(--accent-bg-color)" }),
    ).toBe("background-color: var(--accent-bg-color);")
  })

  it("drops invalid colors with a single dev warning per value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(
      visualStyleToCss({ backgroundColor: "not-a-color", borderRadius: 4 }),
    ).toBe("border-radius: 4px;")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain("not-a-color")
    expect(warn.mock.calls[0]?.[0]).toContain("backgroundColor")

    // Same invalid value again: no second warning.
    visualStyleToCss({ backgroundColor: "not-a-color" })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("renders the full visual contract deterministically (string snapshot)", () => {
    const visual: Required<VisualStyle> = {
      backgroundColor: "#3584e4",
      boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: "#000" }],
      outlineColor: "#3584e4",
      outlineOffset: -1,
      outlineStyle: "solid",
      outlineWidth: 2,
      borderBottomColor: "#33d17a",
      borderBottomLeftRadius: 1,
      borderBottomRightRadius: 2,
      borderBottomWidth: 4,
      borderColor: "rgba(0, 0, 0, 0.5)",
      borderLeftColor: "#f6d32d",
      borderLeftWidth: 5,
      borderRadius: 6,
      borderRightColor: "#e01b24",
      borderRightWidth: 3,
      borderStyle: "dotted",
      borderTopColor: "#9141ac",
      borderTopLeftRadius: 3,
      borderTopRightRadius: 4,
      borderTopWidth: 2,
      borderWidth: 1,
      color: "hsl(0, 0%, 100%)",
      fontFamily: "Fira Sans",
      fontSize: 14,
      fontStyle: "italic",
      fontWeight: "700",
      letterSpacing: 1,
      lineHeight: 21,
      opacity: 0.9,
      textAlign: "center",
      textDecorationLine: "line-through",
      transform: [{ rotate: "45deg" }],
    }
    expect(visualStyleToCss(visual)).toMatchSnapshot()
  })

  it("is deterministic regardless of input key order", () => {
    const a = visualStyleToCss({ borderRadius: 8, backgroundColor: "red" })
    const b = visualStyleToCss({ backgroundColor: "red", borderRadius: 8 })
    expect(a).toBe(b)
  })
})
