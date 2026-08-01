// The declaration body a per-widget CSS provider is loaded with, plus the
// contract that keeps the two style paths apart: the imperative one takes
// colours and nothing else, and the memoised one is untouched by it.
import { afterEach, expect, test, vi } from "vitest"
import {
  createCssRegistry,
  DRIVEABLE_COLOR_PROPERTIES,
  driveableColorsToCss,
  isDriveableColorProperty,
  resetDevWarnings,
} from "../../../src/style/index"

afterEach(() => {
  resetDevWarnings()
  vi.restoreAllMocks()
})

test("renders driven colours through the same generator as static styles", () => {
  expect(driveableColorsToCss({ backgroundColor: "#ff0000" })).toBe(
    "background-color: rgb(255, 0, 0);",
  )
  expect(
    driveableColorsToCss({ color: "white", backgroundColor: "transparent" }),
  ).toBe("background-color: rgba(0, 0, 0, 0);\ncolor: rgb(255, 255, 255);")
})

test("every colour property the view layer may drive is renderable", () => {
  for (const property of DRIVEABLE_COLOR_PROPERTIES) {
    expect(driveableColorsToCss({ [property]: "#010203" })).toContain(
      "rgb(1, 2, 3)",
    )
    expect(isDriveableColorProperty(property)).toBe(true)
  }
})

test("ignores everything that is not a driveable colour", () => {
  // A layout or non-colour property reaching here would mean the view layer
  // routed something to the wrong door; the provider must not carry it.
  expect(
    driveableColorsToCss({
      width: 40,
      borderStyle: "solid",
      opacity: 0.5,
      transform: [{ translateX: 1 }],
    }),
  ).toBe("")
  expect(isDriveableColorProperty("width")).toBe(false)
  expect(isDriveableColorProperty("opacity")).toBe(false)
})

test("a non-string value is skipped rather than emitted into the document", () => {
  // GTK rejects a whole stylesheet on a parse error, so one bad declaration
  // from a leaf that stopped being a colour would take the others with it.
  expect(driveableColorsToCss({ backgroundColor: 42, color: "#00ff00" })).toBe(
    "color: rgb(0, 255, 0);",
  )
})

test("an unparseable colour warns and drops its declaration only", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  expect(
    driveableColorsToCss({ backgroundColor: "nope", color: "#00ff00" }),
  ).toBe("color: rgb(0, 255, 0);")
  expect(warn).toHaveBeenCalledTimes(1)
})

test("the memoised registry is untouched by any of this", () => {
  // The regression this whole design exists to avoid: static styles must keep
  // collapsing onto one class, and an animated colour must never enter the
  // registry at all.
  const created: string[] = []
  const registry = createCssRegistry((text) => {
    created.push(text)
    return `c${created.length}`
  })

  const first = registry.getClassName({ backgroundColor: "red", opacity: 0.5 })
  const second = registry.getClassName({ opacity: 0.5, backgroundColor: "red" })
  expect(second).toBe(first)
  expect(created).toHaveLength(1)

  // 600 frames of a driven colour, through the imperative path.
  for (let frame = 0; frame < 600; frame += 1) {
    driveableColorsToCss({ backgroundColor: `rgb(${frame % 256}, 0, 0)` })
  }
  expect(created).toHaveLength(1)
})
