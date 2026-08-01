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

test("a size is told what a scale differs in; an inset is not, because nothing differs", () => {
  // The advice for `width` used to be "animate scaleX instead", full stop,
  // which sends people to a different behaviour under the same name: a scale
  // grows about the view's CENTRE and stretches the CONTENT rather than
  // re-laying it out (docs/research/animated-size.md §6). An inset really does
  // have an exact transform, so its message must NOT carry the caveat.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({ width: 40, marginTop: 4 })

  animated.apply({ width: 60, marginTop: 9 })

  const messages = warn.mock.calls.map((call) => String(call[0]))
  const width = messages.find((message) => message.includes("`width`"))!
  expect(width).toContain("NOT the same thing")
  expect(width).toContain("CENTRE")
  expect(width).toMatch(/stretch/i)
  expect(width).not.toContain("reproduces the move exactly")

  resetUndriveableWarnings()
  const inset = createAnimatedStyle({ position: "relative", top: 4 })
  warn.mockClear()
  inset.apply({ position: "relative", top: 40 })
  const topMessage = warn.mock.calls
    .map((call) => String(call[0]))
    .find((message) => message.includes("`top`"))!
  expect(topMessage).toContain("translateY")
  expect(topMessage).toContain("reproduces the move exactly")
  expect(topMessage).not.toContain("CENTRE")
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

// --- slice 2b: absolute insets -------------------------------------------

test("an inset on an absolutely positioned node becomes a driven leaf", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({
    position: "absolute",
    left: 0,
    right: 0,
    height: 60,
    top: 0,
  })

  expect(nodeValue(animated.style.top)).toBe(0)
  expect(
    animated.apply({
      position: "absolute",
      left: 0,
      right: 0,
      height: 60,
      top: 240,
    }),
  ).toBe(true)
  expect(nodeValue(animated.style.top)).toBe(240)
  // The whole point: no warning, and no rebuild.
  expect(warn).not.toHaveBeenCalled()
})

test("all four insets are driven, each on its own axis", () => {
  const box = { position: "absolute", width: 80, height: 40 }
  for (const property of ["top", "bottom", "left", "right"]) {
    const animated = createAnimatedStyle({ ...box, [property]: 5 })
    expect(nodeValue(animated.style[property])).toBe(5)
  }
})

test("an inset on a node the updater says is NOT absolute keeps slice 2's refusal", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({ position: "relative", top: 0 })

  // Not a node: the mapper's value is a plain number that React applies.
  expect(animated.style.top).toBe(0)
  animated.apply({ position: "relative", top: 40 })

  expect(warn).toHaveBeenCalledTimes(1)
  const message = String(warn.mock.calls[0]?.[0])
  expect(message).toContain("LAYOUT property")
  expect(message).toContain("translateY")
  // …and it now also names the one configuration that IS driven.
  expect(message).toContain('"absolute"')
})

test("an updater that says nothing about position defers to the view layer", () => {
  // `style={[styles.row, useAnimatedStyle(() => ({ top: y.value }))]}` is how
  // most people write this, and `position` is then in a sibling entry this
  // module never sees. Refusing here would refuse the common spelling of the
  // feature; the view layer re-asks against the flattened style and is the
  // one that warns when the answer is no.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({ top: 0 })

  expect(nodeValue(animated.style.top)).toBe(0)
  expect(animated.apply({ top: 40 })).toBe(true)
  expect(nodeValue(animated.style.top)).toBe(40)
  expect(warn).not.toHaveBeenCalled()
})

test("an absolute node stretched between two edges is refused in its own words", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  // No `height`, so Yoga derives it from top and bottom: animating `top`
  // resizes the node, which no translation reproduces.
  const animated = createAnimatedStyle({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 80,
  })
  expect(animated.style.top).toBe(0)

  animated.apply({ position: "absolute", top: 40, bottom: 0, width: 80 })

  expect(warn).toHaveBeenCalledTimes(1)
  const message = String(warn.mock.calls[0]?.[0])
  expect(message).toContain("IS absolutely")
  expect(message).toContain("RESIZES")
  expect(message).toContain("translateY")
})

test("the end edge is refused when the start edge already anchors the axis", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({
    position: "absolute",
    left: 10,
    right: 10,
    width: 80,
    height: 40,
  })
  // `left` is driven; `right` is not, because Yoga ignores it entirely here.
  expect(nodeValue(animated.style.left)).toBe(10)
  expect(animated.style.right).toBe(10)

  animated.apply({
    position: "absolute",
    left: 10,
    right: 50,
    width: 80,
    height: 40,
  })

  expect(warn).toHaveBeenCalledTimes(1)
  expect(String(warn.mock.calls[0]?.[0])).toContain("ignores `right`")
})

test("a percentage inset is not driven, and switching to one rebuilds", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({
    position: "absolute",
    top: 10,
    width: 80,
    height: 40,
  })
  expect(nodeValue(animated.style.top)).toBe(10)

  // A percentage has no fixed offset from a point base. The leaf set changes,
  // so the style rebuilds — and on the rebuild `top` is an ordinary refused
  // layout property again.
  expect(
    animated.apply({
      position: "absolute",
      top: "50%",
      width: 80,
      height: 40,
    }),
  ).toBe(false)
  expect(warn).not.toHaveBeenCalled()
})

test("zIndex is refused in words about GTK, not about React renders", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({ position: "absolute", zIndex: 1 })

  animated.apply({ position: "absolute", zIndex: 10 })

  expect(warn).toHaveBeenCalledTimes(1)
  const message = String(warn.mock.calls[0]?.[0])
  expect(message).toContain("sibling order")
  expect(message).not.toContain("next React render")
})

test("the upstream useSortable style shape drives exactly one leaf", () => {
  // hooks/useSortable.ts:489-503 returns this object every frame.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedStyle({
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 0,
    height: 60,
  })

  expect([...animated.nodes.keys()]).toEqual(["top"])
  // A frame of a real drag: only `top` moved.
  expect(
    animated.apply({
      position: "absolute",
      left: 0,
      right: 0,
      top: 180,
      zIndex: 0,
      height: 60,
    }),
  ).toBe(true)
  expect(nodeValue(animated.style.top)).toBe(180)
  expect(warn).not.toHaveBeenCalled()
})
