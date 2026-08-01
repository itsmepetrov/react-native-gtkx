import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDevWarnings, splitStyle } from "../../../src/style/index"
import type {
  BehavioralStyle,
  FlatStyle,
  LayoutStyle,
  VisualStyle,
} from "../../../src/contracts"

// Every key of the frozen LayoutStyle contract.
const fullLayout: Required<LayoutStyle> = {
  alignContent: "space-between",
  alignItems: "center",
  alignSelf: "auto",
  aspectRatio: 1.5,
  bottom: 4,
  columnGap: 2,
  direction: "ltr",
  display: "flex",
  flex: 1,
  flexBasis: "auto",
  flexDirection: "row",
  flexGrow: 1,
  flexShrink: 0,
  flexWrap: "wrap",
  gap: 8,
  height: 100,
  justifyContent: "space-evenly",
  left: 0,
  margin: 4,
  marginBottom: 1,
  marginHorizontal: 2,
  marginLeft: 3,
  marginRight: 4,
  marginTop: 5,
  marginVertical: 6,
  maxHeight: 200,
  maxWidth: "50%",
  minHeight: 10,
  minWidth: 20,
  overflow: "hidden",
  padding: 2,
  paddingBottom: 1,
  paddingHorizontal: 2,
  paddingLeft: 3,
  paddingRight: 4,
  paddingTop: 5,
  paddingVertical: 6,
  position: "absolute",
  right: 7,
  rowGap: 3,
  top: 9,
  width: "100%",
}

// Every key of the frozen VisualStyle contract.
const fullVisual: Required<VisualStyle> = {
  backgroundColor: "red",
  boxShadow: "0 1px 3px black",
  outlineColor: "blue",
  outlineOffset: -1,
  outlineStyle: "solid",
  outlineWidth: 2,
  borderBottomColor: "green",
  borderBottomLeftRadius: 1,
  borderBottomRightRadius: 2,
  borderBottomWidth: 2,
  borderColor: "black",
  borderLeftColor: "blue",
  borderLeftWidth: 3,
  borderRadius: 4,
  borderRightColor: "yellow",
  borderRightWidth: 4,
  borderStyle: "dashed",
  borderTopColor: "purple",
  borderTopLeftRadius: 3,
  borderTopRightRadius: 5,
  borderTopWidth: 5,
  borderWidth: 1,
  color: "white",
  fontFamily: "Cantarell",
  fontSize: 14,
  fontStyle: "italic",
  fontWeight: "600",
  letterSpacing: 0.5,
  lineHeight: 20,
  opacity: 0.5,
  textAlign: "center",
  transform: [{ translateX: 5 }, { rotate: "45deg" }],
}

// Every key of the frozen BehavioralStyle contract: supported, but consumed
// by the component rather than by either half of the style pipeline.
const fullBehavioral: Required<BehavioralStyle> = {
  pointerEvents: "box-none",
}

beforeEach(() => {
  resetDevWarnings()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("splitStyle", () => {
  it("routes every LayoutStyle key of the contract into layout", () => {
    const { layout, visual } = splitStyle(fullLayout)
    expect(layout).toEqual(fullLayout)
    expect(visual).toEqual({})
  })

  it("routes every VisualStyle key of the contract into visual", () => {
    const { layout, visual } = splitStyle(fullVisual)
    expect(visual).toEqual(fullVisual)
    expect(layout).toEqual({})
  })

  // tests/gtk/components/pointer-events.gtk.test.tsx asserts that
  // style.pointerEvents really drives GTK picking; for a while this splitter
  // printed "Unknown style property" on the very same line. Supported on one
  // path, unknown on another — the two must agree.
  it("consumes every BehavioralStyle key silently, routing it nowhere", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { layout, visual } = splitStyle(fullBehavioral)
    expect(layout).toEqual({})
    expect(visual).toEqual({})
    expect(warn).not.toHaveBeenCalled()
  })

  it("keeps behavioral keys out of the buckets in a mixed style", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { layout, visual } = splitStyle({
      width: 10,
      backgroundColor: "red",
      pointerEvents: "none",
    })
    expect(layout).toEqual({ width: 10 })
    expect(visual).toEqual({ backgroundColor: "red" })
    expect(warn).not.toHaveBeenCalled()
  })

  // The three buckets are a partition of FlatStyle by construction (see
  // BEHAVIORAL_KEYS' Omit in split-style.ts); this asserts it at runtime too,
  // so a contract key that reaches neither bucket is caught by a failing test
  // and not only by a type error someone can widen away.
  it("classifies every key of the full contract without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const full: Required<FlatStyle> = {
      ...fullLayout,
      ...fullVisual,
      ...fullBehavioral,
    }
    const { layout, visual } = splitStyle(full)
    const classified = new Set([
      ...Object.keys(layout),
      ...Object.keys(visual),
      ...Object.keys(fullBehavioral),
    ])
    expect(
      [...Object.keys(full)].filter((key) => !classified.has(key)),
    ).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it("splits a mixed style without losing keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { layout, visual } = splitStyle({ ...fullLayout, ...fullVisual })
    expect(layout).toEqual(fullLayout)
    expect(visual).toEqual(fullVisual)
    expect(Object.keys(layout).length + Object.keys(visual).length).toBe(
      Object.keys(fullLayout).length + Object.keys(fullVisual).length,
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it("passes transform through into visual by reference, untouched", () => {
    const transform = [{ scale: 2 }] as const
    const { visual } = splitStyle({ transform: [...transform] })
    expect(visual.transform).toEqual([{ scale: 2 }])
  })

  it("drops undefined values without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { layout, visual } = splitStyle({
      width: undefined,
      backgroundColor: undefined,
    })
    expect(layout).toEqual({})
    expect(visual).toEqual({})
    expect(warn).not.toHaveBeenCalled()
  })

  it("warns once per unknown key and ignores it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    // `textTransform` rather than the `boxShadow` this used to use: boxShadow
    // is a supported visual prop now (Adwaita's own card/list frame IS a
    // box-shadow), so it stopped being an example of an unknown key.
    const style = { width: 10, textTransform: "uppercase" } as FlatStyle

    const first = splitStyle(style)
    expect(first.layout).toEqual({ width: 10 })
    expect(first.visual).toEqual({})
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('"textTransform"')

    // Same unknown key again — still a single warning.
    splitStyle(style)
    expect(warn).toHaveBeenCalledTimes(1)

    // A different unknown key warns separately.
    splitStyle({ elevation: 4 } as FlatStyle)
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[1]?.[0]).toContain('"elevation"')
  })
})
