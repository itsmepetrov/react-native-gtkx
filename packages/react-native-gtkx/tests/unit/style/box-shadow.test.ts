// boxShadow is what makes Adwaita's own `.card` / `.boxed-list` frame
// reachable from a React Native style — the frame is a box-shadow, not a
// border (see docs/research/react-native-first-showcase.md). These pin the
// two places it can go wrong: RN's grammar (which lengths are legal, what an
// omitted colour means) and GTK's, which is CSS's.
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  boxShadowToCss,
  PlatformColor,
  resetDevWarnings,
  visualStyleToCss,
} from "../../../src/style/index"
import type { BoxShadowValue } from "../../../src/contracts"

beforeEach(() => {
  resetDevWarnings()
  vi.restoreAllMocks()
})

describe("boxShadowToCss", () => {
  it("renders the structured form, numbers as px", () => {
    expect(
      boxShadowToCss([
        { offsetX: 0, offsetY: 1, blurRadius: 3, color: "rgba(0,0,6,0.07)" },
      ]),
    ).toBe("0px 1px 3px rgba(0, 0, 6, 0.07)")
  })

  it("renders spread after blur", () => {
    expect(
      boxShadowToCss([
        {
          offsetX: 0,
          offsetY: 0,
          blurRadius: 0,
          spreadDistance: 1,
          color: "#000",
        },
      ]),
    ).toBe("0px 0px 0px 1px rgb(0, 0, 0)")
  })

  it("supplies a zero blur when a spread is given without one, so the value stays positional", () => {
    expect(
      boxShadowToCss([{ offsetX: 0, offsetY: 0, spreadDistance: 2 }]),
    ).toBe("0px 0px 0px 2px rgb(0, 0, 0)")
  })

  // RN's own documented deviation from CSS: an omitted colour is black, not
  // the inherited currentColor. Emitting it explicitly is the only way GTK
  // (which follows CSS) lands on RN's behaviour.
  it("defaults the colour to black rather than leaving CSS to inherit it", () => {
    expect(boxShadowToCss([{ offsetX: 1, offsetY: 2 }])).toBe(
      "1px 2px rgb(0, 0, 0)",
    )
  })

  it("renders inset first, as CSS wants it", () => {
    expect(
      boxShadowToCss([
        { offsetX: 0, offsetY: 0, spreadDistance: 1, inset: true },
      ]),
    ).toBe("inset 0px 0px 0px 1px rgb(0, 0, 0)")
  })

  it("joins multiple shadows with commas, keeping order (first paints on top)", () => {
    expect(
      boxShadowToCss([
        { offsetX: 0, offsetY: 0, spreadDistance: 1, color: "red" },
        { offsetX: 0, offsetY: 2, blurRadius: 6, color: "blue" },
      ]),
    ).toBe("0px 0px 0px 1px rgb(255, 0, 0), 0px 2px 6px rgb(0, 0, 255)")
  })

  it("parses the string form rather than forwarding it", () => {
    expect(boxShadowToCss("0 1px 3px 1px rgba(0, 0, 6, 0.07)")).toBe(
      "0px 1px 3px 1px rgba(0, 0, 6, 0.07)",
    )
  })

  it("parses a comma-separated string without splitting inside rgba()", () => {
    expect(
      boxShadowToCss("0 0 0 1px #eee, 0 2px 6px 2px rgba(0, 0, 6, 0.03)"),
    ).toBe(
      "0px 0px 0px 1px rgb(238, 238, 238), 0px 2px 6px 2px rgba(0, 0, 6, 0.03)",
    )
  })

  it("takes inset from the string form", () => {
    expect(boxShadowToCss("inset 0 0 0 1px black")).toBe(
      "inset 0px 0px 0px 1px rgb(0, 0, 0)",
    )
  })

  // The whole reason the string is parsed instead of forwarded: a
  // PlatformColor is only a GTK variable after colors.ts has seen it.
  it("normalizes a PlatformColor in the shadow colour", () => {
    expect(
      boxShadowToCss([
        {
          offsetX: 0,
          offsetY: 0,
          spreadDistance: 1,
          color: PlatformColor("card-shade-color"),
        },
      ]),
    ).toBe("0px 0px 0px 1px var(--card-shade-color)")
  })

  describe("rejects what RN rejects", () => {
    const warn = () => vi.spyOn(console, "warn").mockImplementation(() => {})

    it("a length in a unit RN's own parser does not accept", () => {
      warn()
      expect(boxShadowToCss("0 1em 3px black")).toBeNull()
    })

    it("a negative blur", () => {
      warn()
      expect(
        boxShadowToCss([{ offsetX: 0, offsetY: 0, blurRadius: -4 }]),
      ).toBeNull()
    })

    it("fewer than two lengths", () => {
      warn()
      expect(boxShadowToCss("4px red")).toBeNull()
    })

    it("more than four lengths", () => {
      warn()
      expect(boxShadowToCss("1px 2px 3px 4px 5px red")).toBeNull()
    })

    it("two colours in one shadow", () => {
      warn()
      expect(boxShadowToCss("0 0 red blue")).toBeNull()
    })

    it("an unparseable colour", () => {
      warn()
      expect(boxShadowToCss("0 0 notacolor")).toBeNull()
    })

    it("warns once per offending value", () => {
      const spy = warn()
      boxShadowToCss("0 1em 3px black")
      boxShadowToCss("0 1em 3px black")
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })
})

describe("visualStyleToCss with boxShadow and outline", () => {
  it("emits the Adwaita .boxed-list frame from an RN style", () => {
    // Exactly what libadwaita 1.9 puts on `list.boxed-list` / `.card`.
    const boxShadow: BoxShadowValue[] = [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadDistance: 1,
        color: "rgba(0,0,6,0.03)",
      },
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 3,
        spreadDistance: 1,
        color: "rgba(0,0,6,0.07)",
      },
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 6,
        spreadDistance: 2,
        color: "rgba(0,0,6,0.03)",
      },
    ]
    expect(visualStyleToCss({ borderRadius: 12, boxShadow })).toBe(
      [
        "box-shadow: 0px 0px 0px 1px rgba(0, 0, 6, 0.03), 0px 1px 3px 1px rgba(0, 0, 6, 0.07), 0px 2px 6px 2px rgba(0, 0, 6, 0.03);",
        "border-radius: 12px;",
      ].join("\n"),
    )
  })

  it("drops an invalid boxShadow without dropping the rest of the style", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(
      visualStyleToCss({ backgroundColor: "white", boxShadow: "nope" }),
    ).toBe("background-color: rgb(255, 255, 255);")
  })

  it("turns an outline on with solid, the way it does for borders", () => {
    expect(
      visualStyleToCss({
        outlineWidth: 2,
        outlineColor: "#3584e4",
        outlineOffset: -1,
      }),
    ).toBe(
      [
        "outline-style: solid;",
        "outline-width: 2px;",
        "outline-color: rgb(53, 132, 228);",
        "outline-offset: -1px;",
      ].join("\n"),
    )
  })

  it("lets an explicit outlineStyle win over auto-solid", () => {
    expect(visualStyleToCss({ outlineWidth: 1, outlineStyle: "dashed" })).toBe(
      ["outline-style: dashed;", "outline-width: 1px;"].join("\n"),
    )
  })
})
