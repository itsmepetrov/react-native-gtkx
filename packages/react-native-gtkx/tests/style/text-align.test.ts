import { describe, expect, it } from "vitest"
import { textAlignToLabelProps } from "../../src/style/index.js"

describe("textAlignToLabelProps", () => {
  it("maps auto and left onto xalign 0 / left", () => {
    expect(textAlignToLabelProps("auto")).toEqual({
      xalign: 0,
      justification: "left",
    })
    expect(textAlignToLabelProps("left")).toEqual({
      xalign: 0,
      justification: "left",
    })
  })

  it("maps right onto xalign 1 / right", () => {
    expect(textAlignToLabelProps("right")).toEqual({
      xalign: 1,
      justification: "right",
    })
  })

  it("maps center onto xalign 0.5 / center", () => {
    expect(textAlignToLabelProps("center")).toEqual({
      xalign: 0.5,
      justification: "center",
    })
  })

  it("maps justify onto xalign 0 / fill", () => {
    expect(textAlignToLabelProps("justify")).toEqual({
      xalign: 0,
      justification: "fill",
    })
  })

  it("defaults to left when textAlign is not set", () => {
    expect(textAlignToLabelProps(undefined)).toEqual({
      xalign: 0,
      justification: "left",
    })
  })
})
