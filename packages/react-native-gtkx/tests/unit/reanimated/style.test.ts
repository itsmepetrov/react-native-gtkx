// Turning a mapper's plain style object into node-backed leaves, and the two
// things the spike explicitly did not do: handling a style whose SHAPE
// changes between runs, and making an undriveable property visible instead of
// dropping it.
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  createAnimatedStyle,
  resetUndriveableWarnings,
  type StyleNode,
} from "../../../src/reanimated-compat/style"

beforeEach(() => {
  resetUndriveableWarnings()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const nodeValue = (node: unknown): unknown => (node as StyleNode).__getValue()

test("replaces opacity and every transform leaf with a node", () => {
  const animated = createAnimatedStyle({
    width: 40,
    opacity: 0.5,
    transform: [{ translateX: 10 }, { rotate: "45deg" }],
  })

  expect(nodeValue(animated.style.opacity)).toBe(0.5)
  const parts = animated.style.transform as Record<string, unknown>[]
  expect(nodeValue(parts[0]!.translateX)).toBe(10)
  expect(nodeValue(parts[1]!.rotate)).toBe("45deg")
  // Untouched: this one reaches GTK through React, not through a node.
  expect(animated.style.width).toBe(40)
})

test("the nodes are structurally animated nodes for the view layer", () => {
  // src/components/animated.tsx duck-types addListener + __getValue.
  const animated = createAnimatedStyle({ opacity: 1 })
  const node = animated.style.opacity as StyleNode
  const seen: unknown[] = []
  const id = node.addListener(({ value }) => seen.push(value))
  animated.apply({ opacity: 0.25 })
  expect(seen).toEqual([0.25])
  node.removeListener(id)
  animated.apply({ opacity: 0 })
  expect(seen).toEqual([0.25])
})

test("later runs push into the same nodes, keeping their identity", () => {
  // Identity is what stops Animated.View re-binding: its binding key is built
  // from the node objects.
  const animated = createAnimatedStyle({ transform: [{ translateX: 0 }] })
  const before = (animated.style.transform as Record<string, unknown>[])[0]!
    .translateX

  expect(animated.apply({ transform: [{ translateX: 120 }] })).toBe(true)

  const after = (animated.style.transform as Record<string, unknown>[])[0]!
    .translateX
  expect(after).toBe(before)
  expect(nodeValue(after)).toBe(120)
})

test("a changed shape is refused, so the caller can rebuild", () => {
  const animated = createAnimatedStyle({ transform: [{ translateX: 0 }] })
  expect(animated.apply({ transform: [{ scale: 2 }] })).toBe(false)
  expect(animated.apply({ transform: [{ translateX: 1 }, { scale: 2 }] })).toBe(
    false,
  )
  expect(animated.apply({ opacity: 1, transform: [{ translateX: 1 }] })).toBe(
    false,
  )
})

test("a rebuild reuses the nodes of the leaves that survived", () => {
  const first = createAnimatedStyle({
    opacity: 1,
    transform: [{ translateX: 0 }],
  })
  const opacityNode = first.style.opacity

  const second = createAnimatedStyle(
    { opacity: 0.5, transform: [{ translateX: 0 }, { scale: 2 }] },
    first.nodes,
  )

  expect(second.style.opacity).toBe(opacityNode)
  expect(nodeValue(second.style.opacity)).toBe(0.5)
  // The new leaf is genuinely new.
  const parts = second.style.transform as Record<string, unknown>[]
  expect(nodeValue(parts[1]!.scale)).toBe(2)
})

test("replaces every driveable colour with a node too", () => {
  const animated = createAnimatedStyle({
    backgroundColor: "#ff0000",
    color: "white",
    borderTopColor: "rgba(0, 0, 0, 0.5)",
    borderStyle: "solid",
  })

  expect(nodeValue(animated.style.backgroundColor)).toBe("#ff0000")
  expect(nodeValue(animated.style.color)).toBe("white")
  expect(nodeValue(animated.style.borderTopColor)).toBe("rgba(0, 0, 0, 0.5)")
  // Not a colour, and not driveable: still a plain value for React.
  expect(animated.style.borderStyle).toBe("solid")
})

test("a driven colour costs no warning and no rebuild", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({ backgroundColor: "#ff0000" })
  const node = animated.style.backgroundColor as StyleNode
  const seen: unknown[] = []
  node.addListener(({ value }) => seen.push(value))

  expect(animated.apply({ backgroundColor: "#00ff00" })).toBe(true)
  expect(animated.apply({ backgroundColor: "rgb(0, 0, 255)" })).toBe(true)

  expect(seen).toEqual(["#00ff00", "rgb(0, 0, 255)"])
  // Same node throughout: the view layer never rebinds.
  expect(animated.style.backgroundColor).toBe(node)
  expect(warn).not.toHaveBeenCalled()
})

test("a colour that stops being a string is a shape change, not a silent drop", () => {
  // RN's packed colour integers have no meaning on this platform, so a
  // number here is not a colour — it must not be pushed into a node the
  // view layer would then write into a stylesheet.
  const animated = createAnimatedStyle({ backgroundColor: "#ff0000" })
  expect(animated.apply({ backgroundColor: 4294901760 })).toBe(false)
})

test("a property this platform cannot drive warns once, by name", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({
    borderStyle: "solid",
    opacity: 1,
  })

  animated.apply({ borderStyle: "dashed", opacity: 0.9 })
  animated.apply({ borderStyle: "dotted", opacity: 0.8 })

  expect(warn).toHaveBeenCalledTimes(1)
  expect(String(warn.mock.calls[0]?.[0])).toContain("borderStyle")
  // Still updated in the object, so the next React render is correct.
  expect(animated.style.borderStyle).toBe("dotted")
})

test("a layout property is refused in its own words, naming the transform to use", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({ width: 40, height: 20, flex: 1 })

  animated.apply({ width: 60, height: 30, flex: 2 })

  expect(warn).toHaveBeenCalledTimes(3)
  const messages = warn.mock.calls.map((call) => String(call[0]))
  const width = messages.find((message) => message.includes("`width`"))!
  expect(width).toContain("LAYOUT property")
  expect(width).toContain("scaleX")
  expect(width).toContain("Yoga")
  expect(messages.find((message) => message.includes("`height`"))).toContain(
    "scaleY",
  )
  // No transform stands in for `flex`, so none is suggested — but it is still
  // refused as layout rather than as "cannot be written".
  const flex = messages.find((message) => message.includes("`flex`"))!
  expect(flex).toContain("LAYOUT property")
  expect(flex).not.toContain("scaleX")
})

test("an unchanged undriveable property is not a warning", () => {
  // A constant `width` alongside an animated transform is ordinary code, not
  // a mistake — warning about it would be noise that trains people to ignore
  // the warning that matters.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({
    width: 40,
    transform: [{ translateX: 0 }],
  })
  animated.apply({ width: 40, transform: [{ translateX: 10 }] })
  expect(warn).not.toHaveBeenCalled()
})

test("transform entries that are not simple leaves pass through untouched", () => {
  const matrix = { matrix: [1, 0, 0, 1, 0, 0] }
  const animated = createAnimatedStyle({
    transform: [matrix, { translateY: 5 }],
  })
  const parts = animated.style.transform as unknown[]
  expect(parts[0]).toBe(matrix)
  expect(nodeValue((parts[1] as Record<string, unknown>).translateY)).toBe(5)
})
