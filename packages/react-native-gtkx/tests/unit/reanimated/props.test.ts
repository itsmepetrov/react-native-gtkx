// `useAnimatedProps`'s core: which props become nodes, which cannot, and what
// happens when the answer changes between mapper runs. Same contract as the
// style path (tests/unit/reanimated/style.test.ts), addressed by prop name
// rather than by style key.
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  createAnimatedProps,
  resetUndriveablePropWarnings,
} from "../../../src/reanimated-compat/props"
import type { StyleNode } from "../../../src/reanimated-compat/style"

beforeEach(() => {
  resetUndriveablePropWarnings()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const nodeValue = (node: unknown): unknown => (node as StyleNode).__getValue()

test("replaces every numeric prop with a node and leaves the rest alone", () => {
  const animated = createAnimatedProps({
    r: 10,
    strokeWidth: 2,
    fill: "green",
  })

  expect(nodeValue(animated.props.r)).toBe(10)
  expect(nodeValue(animated.props.strokeWidth)).toBe(2)
  // A string reaches the shape through React, not through a node.
  expect(animated.props.fill).toBe("green")
})

test("the nodes are what the SVG shapes duck-type", () => {
  // src/components/svg/animated-support.ts recognises addListener +
  // __getValue, which is the entire reason this hook is nearly free here.
  const animated = createAnimatedProps({ r: 4 })
  const node = animated.props.r as StyleNode
  const seen: unknown[] = []
  const id = node.addListener(({ value }) => seen.push(value))

  expect(animated.apply({ r: 9 })).toBe(true)
  expect(seen).toEqual([9])

  node.removeListener(id)
  animated.apply({ r: 12 })
  expect(seen).toEqual([9])
})

test("later runs push into the same nodes, keeping their identity", () => {
  const animated = createAnimatedProps({ cx: 0 })
  const before = animated.props.cx
  expect(animated.apply({ cx: 50 })).toBe(true)
  expect(animated.props.cx).toBe(before)
  expect(nodeValue(animated.props.cx)).toBe(50)
})

test("a changed shape is refused, so the caller can rebuild", () => {
  const animated = createAnimatedProps({ r: 1 })
  // A prop that stopped being a number cannot keep its node.
  expect(animated.apply({ r: "1" })).toBe(false)
  // …nor can a new numeric prop appear without one.
  expect(animated.apply({ r: 1, strokeWidth: 3 })).toBe(false)
})

test("a rebuild reuses the nodes of the props that survived", () => {
  const first = createAnimatedProps({ r: 5 })
  const rNode = first.props.r

  const second = createAnimatedProps({ r: 8, strokeWidth: 2 }, first.nodes)

  expect(second.props.r).toBe(rNode)
  expect(nodeValue(second.props.r)).toBe(8)
  expect(nodeValue(second.props.strokeWidth)).toBe(2)
})

test("a non-numeric prop that changes warns once, by name", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedProps({ r: 1, fill: "red" })

  animated.apply({ r: 2, fill: "green" })
  animated.apply({ r: 3, fill: "blue" })

  expect(warn).toHaveBeenCalledTimes(1)
  expect(String(warn.mock.calls[0]?.[0])).toContain("fill")
  // Still updated in the object, so the next React render is correct.
  expect(animated.props.fill).toBe("blue")
})

test("an unchanged non-numeric prop is not a warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const animated = createAnimatedProps({ r: 1, fill: "red" })
  animated.apply({ r: 2, fill: "red" })
  expect(warn).not.toHaveBeenCalled()
})
