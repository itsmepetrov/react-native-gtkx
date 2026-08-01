// The claim slice 2b rests on: for an absolutely positioned node, changing an
// inset is EXACTLY a translation — so it can run at transform cost instead of
// costing a Yoga pass.
//
// This file does not assert the claim against a table someone typed out. It
// runs the real layout engine twice, once at each inset, and checks that what
// `insetTranslation` promises is what Yoga actually did: the same size, and a
// movement of `sign * delta` on the named axis. A rule that drifted away from
// the engine would be exactly the bug this whole design is most likely to
// ship — a translation that looks right until something reads the geometry
// back.
import { expect, it, test } from "vitest"
import { LayoutEngine } from "../../../src/layout/engine"
import {
  INSET_PROPERTIES,
  insetRefusalReason,
  insetTranslation,
  type InsetProperty,
} from "../../../src/style/absolute-insets"
import type { LayoutStyle, Rect } from "../../../src/contracts"

const VIEWPORT = { width: 400, height: 300 }

const layoutOf = (style: LayoutStyle): Rect => {
  const engine = new LayoutEngine(VIEWPORT)
  const container = engine.createNode()
  container.setStyle({ width: VIEWPORT.width, height: VIEWPORT.height })
  engine.root.insertChild(container, 0)
  const child = engine.createNode()
  child.setStyle(style)
  container.insertChild(child, 0)
  engine.flushSync()
  const rect = child.getRect()
  engine.dispose()
  if (!rect) {
    throw new Error("no committed rect")
  }
  return rect
}

const DELTA = 40

type Case = {
  name: string
  style: LayoutStyle
  property: InsetProperty
  /** What Yoga does to the rect when the inset grows by DELTA. */
  moves: { dx: number; dy: number; dWidth: number; dHeight: number }
}

// Every configuration of an absolutely positioned box that an inset can be
// animated in. The `moves` column is Yoga's measured behaviour, asserted
// below rather than trusted.
const CASES: Case[] = [
  {
    name: "top only",
    style: { position: "absolute", width: 80, height: 40, top: 10 },
    property: "top",
    moves: { dx: 0, dy: DELTA, dWidth: 0, dHeight: 0 },
  },
  {
    name: "left only",
    style: { position: "absolute", width: 80, height: 40, left: 10 },
    property: "left",
    moves: { dx: DELTA, dy: 0, dWidth: 0, dHeight: 0 },
  },
  {
    name: "right only",
    style: { position: "absolute", width: 80, height: 40, right: 10 },
    property: "right",
    moves: { dx: -DELTA, dy: 0, dWidth: 0, dHeight: 0 },
  },
  {
    name: "bottom only",
    style: { position: "absolute", width: 80, height: 40, bottom: 10 },
    property: "bottom",
    moves: { dx: 0, dy: -DELTA, dWidth: 0, dHeight: 0 },
  },
  {
    name: "left+right with no width — animating left RESIZES",
    style: { position: "absolute", height: 40, left: 10, right: 10 },
    property: "left",
    moves: { dx: DELTA, dy: 0, dWidth: -DELTA, dHeight: 0 },
  },
  {
    name: "top+bottom with no height — animating top RESIZES",
    style: { position: "absolute", width: 80, top: 10, bottom: 10 },
    property: "top",
    moves: { dx: 0, dy: DELTA, dWidth: 0, dHeight: -DELTA },
  },
  {
    name: "left+right with a width — the start edge wins",
    style: { position: "absolute", width: 80, height: 40, left: 10, right: 10 },
    property: "left",
    moves: { dx: DELTA, dy: 0, dWidth: 0, dHeight: 0 },
  },
  {
    name: "left+right with a width — the end edge is IGNORED",
    style: { position: "absolute", width: 80, height: 40, left: 10, right: 10 },
    property: "right",
    moves: { dx: 0, dy: 0, dWidth: 0, dHeight: 0 },
  },
  {
    name: "top+bottom with a height — the end edge is IGNORED",
    style: { position: "absolute", width: 80, height: 40, top: 10, bottom: 10 },
    property: "bottom",
    moves: { dx: 0, dy: 0, dWidth: 0, dHeight: 0 },
  },
  {
    name: "the upstream useSortable row",
    style: { position: "absolute", left: 0, right: 0, height: 60, top: 0 },
    property: "top",
    moves: { dx: 0, dy: DELTA, dWidth: 0, dHeight: 0 },
  },
]

test.each(CASES)(
  "$name: the rule agrees with what Yoga does",
  ({ style, property, moves }) => {
    const before = layoutOf(style)
    const after = layoutOf({
      ...style,
      [property]: (style[property] as number) + DELTA,
    })

    // First: the table above is Yoga's real behaviour, not a belief about it.
    expect({
      dx: after.x - before.x,
      dy: after.y - before.y,
      dWidth: after.width - before.width,
      dHeight: after.height - before.height,
    }).toEqual(moves)

    const translation = insetTranslation(style, property)
    const pure =
      moves.dWidth === 0 &&
      moves.dHeight === 0 &&
      (moves.dx !== 0 || moves.dy !== 0)

    if (!pure) {
      // Either a resize or no movement at all — no translation reproduces it,
      // and the rule must say so rather than invent one.
      expect(translation).toBeNull()
      expect(insetRefusalReason(style, property)).toBeTruthy()
      return
    }

    expect(translation).not.toBeNull()
    const axis = translation!.transform === "translateX" ? moves.dx : moves.dy
    const other = translation!.transform === "translateX" ? moves.dy : moves.dx
    // The promised translate is the movement Yoga produced, sign included.
    expect(translation!.sign * DELTA).toBe(axis)
    expect(other).toBe(0)
    expect(insetRefusalReason(style, property)).toBeNull()
  },
)

it("refuses every inset on a node that is not absolutely positioned", () => {
  for (const property of INSET_PROPERTIES) {
    expect(
      insetTranslation({ top: 0, left: 0, [property]: 10 }, property),
    ).toBe(null)
    expect(
      insetTranslation({ position: "relative", [property]: 10 }, property),
    ).toBe(null)
    // No reason is offered either: the message for a relative node is slice
    // 2's, unchanged, and this one is only for the absolute near-misses.
    expect(insetRefusalReason({ position: "relative" }, property)).toBeNull()
  }
})

it("treats an `auto` edge as absent, because Yoga does", () => {
  expect(
    insetTranslation(
      { position: "absolute", left: 10, right: "auto", height: 40 },
      "left",
    ),
  ).toEqual({ transform: "translateX", sign: 1 })
})

it("names the axis and the direction for each inset", () => {
  const box = { position: "absolute", width: 80, height: 40 }
  expect(insetTranslation({ ...box, top: 0 }, "top")).toEqual({
    transform: "translateY",
    sign: 1,
  })
  expect(insetTranslation({ ...box, bottom: 0 }, "bottom")).toEqual({
    transform: "translateY",
    sign: -1,
  })
  expect(insetTranslation({ ...box, left: 0 }, "left")).toEqual({
    transform: "translateX",
    sign: 1,
  })
  expect(insetTranslation({ ...box, right: 0 }, "right")).toEqual({
    transform: "translateX",
    sign: -1,
  })
})

it("an absolutely positioned node is out of flow, so moving it moves nothing else", () => {
  // The reason this carve-out does not reopen slice 2: the sibling cost that
  // makes `width` a Yoga pass simply is not there.
  const engine = new LayoutEngine(VIEWPORT)
  const container = engine.createNode()
  container.setStyle({ width: VIEWPORT.width, height: VIEWPORT.height })
  engine.root.insertChild(container, 0)
  const flow = engine.createNode()
  flow.setStyle({ width: 100, height: 20 })
  container.insertChild(flow, 0)
  const floating = engine.createNode()
  floating.setStyle({
    position: "absolute",
    top: 0,
    left: 0,
    width: 50,
    height: 50,
  })
  container.insertChild(floating, 1)
  engine.flushSync()
  const before = { ...flow.getRect()! }

  floating.setStyle({
    position: "absolute",
    top: 200,
    left: 0,
    width: 50,
    height: 50,
  })
  engine.flushSync()

  expect(flow.getRect()).toEqual(before)
  engine.dispose()
})
