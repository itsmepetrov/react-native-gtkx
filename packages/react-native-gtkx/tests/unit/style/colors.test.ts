import { describe, expect, it } from "vitest"
import { parseColor, PlatformColor } from "../../../src/style/index"

describe("parseColor: named colors", () => {
  it("resolves CSS named colors to rgb()", () => {
    expect(parseColor("red")).toBe("rgb(255, 0, 0)")
    expect(parseColor("dodgerblue")).toBe("rgb(30, 144, 255)")
    expect(parseColor("rebeccapurple")).toBe("rgb(102, 51, 153)")
    expect(parseColor("white")).toBe("rgb(255, 255, 255)")
  })

  it("is case-insensitive and trims whitespace", () => {
    expect(parseColor("Red")).toBe("rgb(255, 0, 0)")
    expect(parseColor("  SteelBlue  ")).toBe("rgb(70, 130, 180)")
  })

  it("maps transparent to fully transparent black", () => {
    expect(parseColor("transparent")).toBe("rgba(0, 0, 0, 0)")
  })
})

describe("parseColor: hex", () => {
  it("parses #rgb", () => {
    expect(parseColor("#f00")).toBe("rgb(255, 0, 0)")
    expect(parseColor("#08f")).toBe("rgb(0, 136, 255)")
  })

  it("parses #rgba", () => {
    expect(parseColor("#f008")).toBe("rgba(255, 0, 0, 0.533)")
    expect(parseColor("#000f")).toBe("rgb(0, 0, 0)")
  })

  it("parses #rrggbb", () => {
    expect(parseColor("#1c71d8")).toBe("rgb(28, 113, 216)")
    expect(parseColor("#FFFFFF")).toBe("rgb(255, 255, 255)")
  })

  it("parses #rrggbbaa", () => {
    expect(parseColor("#ff000080")).toBe("rgba(255, 0, 0, 0.502)")
    expect(parseColor("#1c71d8ff")).toBe("rgb(28, 113, 216)")
    expect(parseColor("#00000000")).toBe("rgba(0, 0, 0, 0)")
  })
})

describe("parseColor: rgb()/rgba()", () => {
  it("parses comma syntax", () => {
    expect(parseColor("rgb(255, 0, 0)")).toBe("rgb(255, 0, 0)")
    expect(parseColor("rgba(0, 128, 255, 0.5)")).toBe("rgba(0, 128, 255, 0.5)")
  })

  it("parses modern space syntax with / alpha", () => {
    expect(parseColor("rgb(255 0 0 / 0.5)")).toBe("rgba(255, 0, 0, 0.5)")
    expect(parseColor("rgb(0 0 0)")).toBe("rgb(0, 0, 0)")
  })

  it("accepts rgb with 4 args and rgba with 3", () => {
    expect(parseColor("rgb(1, 2, 3, 0.25)")).toBe("rgba(1, 2, 3, 0.25)")
    expect(parseColor("rgba(1, 2, 3)")).toBe("rgb(1, 2, 3)")
  })

  it("parses percentage channels and alpha", () => {
    expect(parseColor("rgb(100%, 0%, 50%)")).toBe("rgb(255, 0, 128)")
    expect(parseColor("rgba(0, 0, 0, 50%)")).toBe("rgba(0, 0, 0, 0.5)")
  })

  it("clamps out-of-range values", () => {
    expect(parseColor("rgb(300, -20, 0)")).toBe("rgb(255, 0, 0)")
    expect(parseColor("rgba(0, 0, 0, 1.5)")).toBe("rgb(0, 0, 0)")
  })
})

describe("parseColor: hsl()/hsla()", () => {
  it("parses hsl", () => {
    expect(parseColor("hsl(120, 100%, 50%)")).toBe("rgb(0, 255, 0)")
    expect(parseColor("hsl(0, 0%, 50%)")).toBe("rgb(128, 128, 128)")
  })

  it("parses hsla with alpha", () => {
    expect(parseColor("hsla(240, 100%, 50%, 0.25)")).toBe(
      "rgba(0, 0, 255, 0.25)",
    )
  })

  it("normalizes hue: negative values and deg suffix", () => {
    expect(parseColor("hsl(-120, 100%, 50%)")).toBe("rgb(0, 0, 255)")
    expect(parseColor("hsl(480deg, 100%, 50%)")).toBe("rgb(0, 255, 0)")
  })

  it("requires percentages for saturation and lightness", () => {
    expect(parseColor("hsl(120, 1, 0.5)")).toBeNull()
  })
})

describe("parseColor: GTK passthrough values", () => {
  it("passes CSS variable references through untouched", () => {
    expect(parseColor("var(--accent-bg-color)")).toBe("var(--accent-bg-color)")
    expect(parseColor("var(--accent-bg-color, var(--window-bg-color))")).toBe(
      "var(--accent-bg-color, var(--window-bg-color))",
    )
  })

  it("passes legacy GTK named colors through untouched", () => {
    expect(parseColor("@accent_bg_color")).toBe("@accent_bg_color")
    expect(parseColor("@blue_3")).toBe("@blue_3")
  })
})

describe("parseColor: invalid input", () => {
  it("returns null for garbage", () => {
    expect(parseColor("")).toBeNull()
    expect(parseColor("   ")).toBeNull()
    expect(parseColor("not-a-color")).toBeNull()
    expect(parseColor("#12")).toBeNull()
    expect(parseColor("#12345")).toBeNull()
    expect(parseColor("#gggggg")).toBeNull()
    expect(parseColor("rgb(255, 0)")).toBeNull()
    expect(parseColor("rgb(a, b, c)")).toBeNull()
    expect(parseColor("rgb(1, 2, 3, 4, 5)")).toBeNull()
    expect(parseColor("hsl(120, 50%)")).toBeNull()
    expect(parseColor("var(nope)")).toBeNull()
  })
})

describe("PlatformColor", () => {
  it("maps a name onto an Adwaita CSS variable", () => {
    expect(PlatformColor("accent-bg-color")).toBe("var(--accent-bg-color)")
  })

  it("keeps an explicit -- prefix", () => {
    expect(PlatformColor("--window-bg-color")).toBe("var(--window-bg-color)")
  })

  it("chains extra names as var() fallbacks in order", () => {
    expect(PlatformColor("accent-bg-color", "window-bg-color")).toBe(
      "var(--accent-bg-color, var(--window-bg-color))",
    )
  })

  it("treats @names as terminal legacy GTK colors", () => {
    expect(PlatformColor("accent-bg-color", "@accent_bg_color")).toBe(
      "var(--accent-bg-color, @accent_bg_color)",
    )
    expect(PlatformColor("@accent_bg_color")).toBe("@accent_bg_color")
    // Names after a terminal @name are unreachable and dropped.
    expect(PlatformColor("a", "@legacy", "b")).toBe("var(--a, @legacy)")
  })

  it("round-trips through parseColor", () => {
    const color = PlatformColor("accent-bg-color", "window-bg-color")
    expect(parseColor(color)).toBe(color)
  })

  it("throws without any names", () => {
    expect(() => PlatformColor()).toThrow(/at least one/)
    expect(() => PlatformColor("  ")).toThrow(/at least one/)
  })
})
