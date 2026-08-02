// The claim slice 3 rests on: where `drivenSizeRefusal` says yes, re-laying
// out the ANIMATED NODE's own subtree at the driven size reproduces a full
// layout pass EXACTLY — every rect in the tree, not just the node's own.
//
// This file does not assert that against a table someone typed out. For every
// configuration below it builds the same tree twice, drives one with a naive
// `setStyle` plus a full engine flush and the other with the shipped path
// (`layoutSubtreeAtSize` plus the rect the store would be given), and compares
// every node's rect. Then:
//
//   SOUNDNESS — wherever the rule says the size can be driven, the two agree.
//     This is the one that must hold for every configuration, because a rule
//     that drifted away from the engine is the failure this whole design is
//     most likely to ship: geometry that looks right until something reads it
//     back.
//   EARNED REFUSAL — for each configuration 007 measured as failing, the rule
//     says no AND the two genuinely disagree. A refusal nobody can see failing
//     is superstition.
//
// docs/research/animated-size.md §2 and §7.
import { expect, it, test } from "vitest"
import { layoutSubtreeAtSize } from "../../../src/layout/driven-size"
import { LayoutEngine } from "../../../src/layout/engine"
import type { LayoutNode } from "../../../src/layout/node"
import {
  canDriveSize,
  drivenSizeRefusal,
  SIZE_PROPERTIES,
  type SizeProperty,
} from "../../../src/style/animated-size"
import type { LayoutStyle, Rect } from "../../../src/contracts"

const VIEWPORT = { width: 800, height: 900 }

// --- the tree, declared once and built twice --------------------------------

type Spec = {
  style: LayoutStyle
  children?: Spec[]
  /** Gives the node a wrapping measure function, as `Text` has. */
  text?: number
  /** Exactly one node per tree carries this. */
  animated?: boolean
}

// A deliberately crude line-breaker: `text: n` is n px of glyphs on one line,
// wrapped into as many 15 px lines as the available width forces. Crude is the
// point — what matters is that the height depends on the width, which is the
// property that makes a subtree pass observable at all.
const wrappingMeasure =
  (content: number) =>
  (width: number, widthMode: string): { width: number; height: number } => {
    if (widthMode === "undefined" || !Number.isFinite(width) || width <= 0) {
      return { width: content, height: 15 }
    }
    const used = Math.min(content, width)
    return { width: used, height: Math.max(1, Math.ceil(content / used)) * 15 }
  }

type Built = {
  engine: LayoutEngine
  /** Every node by its path from the root, e.g. "0.1.2". */
  byPath: Map<string, LayoutNode>
  animated: LayoutNode
  animatedPath: string
}

const build = (spec: Spec, contentSized = false): Built => {
  const engine = new LayoutEngine(VIEWPORT, { contentSized })
  const byPath = new Map<string, LayoutNode>()
  let animated: LayoutNode | null = null
  let animatedPath = ""

  const add = (current: Spec, parent: LayoutNode, path: string): void => {
    const node = engine.createNode()
    node.setStyle(current.style)
    if (current.text !== undefined) {
      node.setMeasureFn(
        wrappingMeasure(current.text) as Parameters<
          LayoutNode["setMeasureFn"]
        >[0],
      )
    }
    parent.insertChild(node, parent.children.length)
    byPath.set(path, node)
    if (current.animated) {
      animated = node
      animatedPath = path
    }
    current.children?.forEach((child, index) => {
      add(child, node, path === "" ? String(index) : `${path}.${index}`)
    })
  }

  add(spec, engine.root, "0")
  engine.flushSync()
  if (!animated) {
    throw new Error("no animated node in the spec")
  }
  return { engine, byPath, animated, animatedPath }
}

const rectOf = (node: LayoutNode): Rect => ({
  x: node.yoga.getComputedLeft(),
  y: node.yoga.getComputedTop(),
  width: node.yoga.getComputedWidth(),
  height: node.yoga.getComputedHeight(),
})

const snapshot = (built: Built): Map<string, Rect> => {
  const rects = new Map<string, Rect>()
  for (const [path, node] of built.byPath) {
    rects.set(path, rectOf(node))
  }
  return rects
}

/** What a naive write does: the style, then a whole engine pass. */
const fullPass = (
  spec: Spec,
  property: SizeProperty,
  value: number,
  contentSized = false,
): Map<string, Rect> => {
  const built = build(spec, contentSized)
  const style = built.animated.style ?? {}
  built.animated.setStyle({ ...style, [property]: value })
  built.engine.flushSync()
  const rects = snapshot(built)
  built.engine.dispose()
  return rects
}

/**
 * What the SHIPPED path does, modelled exactly: the base layout everywhere,
 * the pinned subtree pass inside the animated node, and — for the animated
 * node itself — the committed origin and other axis with only the driven
 * dimension replaced (components/driven-size.ts).
 */
const subtreePass = (
  spec: Spec,
  property: SizeProperty,
  value: number,
  contentSized = false,
): Map<string, Rect> => {
  const built = build(spec, contentSized)
  const rects = snapshot(built)
  const committed = rects.get(built.animatedPath)!

  layoutSubtreeAtSize(built.animated, { [property]: value })

  const driven = rectOf(built.animated)
  rects.set(built.animatedPath, {
    x: committed.x,
    y: committed.y,
    width: property === "width" ? driven.width : committed.width,
    height: property === "height" ? driven.height : committed.height,
  })
  const writeSubtree = (node: LayoutNode, path: string): void => {
    node.children.forEach((child, index) => {
      const childPath = `${path}.${index}`
      rects.set(childPath, rectOf(child))
      writeSubtree(child, childPath)
    })
  }
  writeSubtree(built.animated, built.animatedPath)
  built.engine.dispose()
  return rects
}

/** What the animated node's driven axis actually ends up as. */
const drivenSizeOf = (
  spec: Spec,
  property: SizeProperty,
  value: number,
): number => {
  const built = build(spec)
  layoutSubtreeAtSize(built.animated, { [property]: value })
  const rect = rectOf(built.animated)
  built.engine.dispose()
  return property === "width" ? rect.width : rect.height
}

const ruleSays = (
  spec: Spec,
  property: SizeProperty,
  contentSized = false,
): string | null => {
  const built = build(spec, contentSized)
  const reason = drivenSizeRefusal(
    { node: built.animated, rootIsContentSized: contentSized },
    property,
  )
  built.engine.dispose()
  return reason
}

const differences = (a: Map<string, Rect>, b: Map<string, Rect>): string[] => {
  const out: string[] = []
  for (const [path, left] of a) {
    const right = b.get(path)!
    if (
      left.x !== right.x ||
      left.y !== right.y ||
      left.width !== right.width ||
      left.height !== right.height
    ) {
      out.push(
        `${path}: full (${left.x},${left.y},${left.width},${left.height}) ` +
          `vs subtree (${right.x},${right.y},${right.width},${right.height})`,
      )
    }
  }
  return out
}

// --- the configurations -----------------------------------------------------

/** Filler siblings, so a main-axis change has something to push. */
const siblings = (count: number): Spec[] =>
  Array.from({ length: count }, () => ({ style: { width: 90, height: 12 } }))

type Case = {
  name: string
  spec: Spec
  property: SizeProperty
  /** Whether the layout root reports its content size (an `IntrinsicRoot`). */
  contentSized?: boolean
  /**
   * Set where the rule must refuse, and where the damage that earns the
   * refusal shows up:
   *
   *   "rects"        — the subtree pass and a full pass produce different
   *                    geometry, which is the ordinary failure;
   *   "clamped"      — they produce the SAME geometry, and that geometry stops
   *                    following the animated value. Reading the driven size
   *                    back out of Yoga means a `maxWidth` is honoured exactly
   *                    as a real pass honours it — the box is simply not
   *                    animating any more, which is the silent no-op this
   *                    repository refuses to ship;
   *   "root-request" — the rects agree and the size the ROOT asks GTK for does
   *                    not, which no rect table can show.
   */
  refused?: "rects" | "clamped" | "root-request"
}

const inColumn = (
  container: LayoutStyle,
  node: Spec,
  extra: Spec[] = siblings(4),
): Spec => ({
  style: { width: VIEWPORT.width, height: VIEWPORT.height },
  children: [{ style: container, children: [node, ...extra] }],
})

const LEAF: Spec = { style: { width: 100, height: 60 }, animated: true }

const WITH_TEXT: Spec = {
  style: { width: 100, height: 60 },
  animated: true,
  children: [{ style: {}, text: 300 }],
}

const CASES: Case[] = [
  // --- the carve-out ------------------------------------------------------
  {
    name: "a leaf in a definite column",
    spec: inColumn({ width: 400, height: 700 }, LEAF),
    property: "width",
  },
  {
    name: "a node with wrapped text in a definite column",
    spec: inColumn({ width: 400, height: 700 }, WITH_TEXT),
    property: "width",
  },
  {
    name: "a stretched child inside the animated node",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: 100, height: 60 },
        animated: true,
        children: [{ style: { height: 20 } }],
      },
    ),
    property: "width",
  },
  {
    name: "a row of three flex children inside the animated node",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: 100, height: 60, flexDirection: "row" },
        animated: true,
        children: [
          { style: { flex: 1 } },
          { style: { flex: 2 } },
          { style: { flex: 1 } },
        ],
      },
    ),
    property: "width",
  },
  {
    name: "percentage padding INSIDE the animated node",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: 100, height: 60, padding: "10%" },
        animated: true,
        children: [{ style: { height: 10 } }],
      },
    ),
    property: "width",
  },
  {
    name: "percentage padding on the CONTAINER",
    spec: inColumn({ width: 400, height: 700, paddingHorizontal: "5%" }, LEAF),
    property: "width",
  },
  {
    name: "a percentage width on the animated node",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: "50%", height: 60 },
        animated: true,
        children: [{ style: {}, text: 300 }],
      },
    ),
    property: "width",
  },
  {
    name: "a `flex: 1` container",
    spec: {
      style: { width: VIEWPORT.width, height: VIEWPORT.height },
      children: [{ style: { flex: 1 }, children: [LEAF, ...siblings(4)] }],
    },
    property: "width",
  },
  {
    name: "a percentage-sized container",
    spec: inColumn({ width: "50%", height: "40%" }, LEAF),
    property: "width",
  },
  {
    name: "a container stretched on its parent's cross axis",
    spec: {
      style: { width: VIEWPORT.width, height: VIEWPORT.height },
      children: [{ style: { height: 700 }, children: [LEAF, ...siblings(4)] }],
    },
    property: "width",
  },
  {
    name: "an absolutely positioned container with four edges",
    spec: inColumn(
      { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
      LEAF,
    ),
    property: "width",
  },
  {
    name: "a container that pads and borders",
    spec: inColumn(
      { width: 400, height: 700, padding: 20, borderWidth: 4 } as LayoutStyle,
      LEAF,
    ),
    property: "width",
  },
  {
    name: "`height` on a ROW container, which is its cross axis",
    spec: inColumn({ width: 400, height: 700, flexDirection: "row" }, LEAF),
    property: "height",
  },
  {
    name: "`alignItems: flex-start` on the container",
    spec: inColumn({ width: 400, height: 700, alignItems: "flex-start" }, LEAF),
    property: "width",
  },
  {
    name: "`justifyContent: space-between` on the container (a MAIN-axis rule)",
    spec: inColumn(
      { width: 400, height: 700, justifyContent: "space-between" },
      LEAF,
    ),
    property: "width",
  },
  {
    name: "an out-of-flow node anchored by its left edge",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: {
          position: "absolute",
          left: 10,
          top: 10,
          width: 100,
          height: 60,
        },
        animated: true,
        children: [{ style: {}, text: 300 }],
      },
    ),
    property: "width",
  },
  {
    name: "an out-of-flow node anchored on both edges, with a width",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: {
          position: "absolute",
          left: 10,
          right: 10,
          top: 10,
          width: 100,
          height: 60,
        },
        animated: true,
      },
    ),
    property: "width",
  },
  {
    name: "a node nested three containers deep",
    spec: {
      style: { width: VIEWPORT.width, height: VIEWPORT.height },
      children: [
        {
          style: { flex: 1 },
          children: [
            {
              style: { height: 400, padding: 8 },
              children: [LEAF, ...siblings(3)],
            },
          ],
        },
      ],
    },
    property: "width",
  },

  // --- what 007 measured as failing, and what the rule must refuse --------
  {
    name: "`height` in a COLUMN — every following sibling shifts",
    spec: inColumn({ width: 400, height: 700 }, LEAF),
    property: "height",
    refused: "rects",
  },
  {
    name: "`width` in a ROW — every following sibling shifts",
    spec: inColumn({ width: 400, height: 700, flexDirection: "row" }, LEAF),
    property: "width",
    refused: "rects",
  },
  {
    name: "`alignItems: center` — the node's own x moves as it grows",
    spec: inColumn({ width: 400, height: 700, alignItems: "center" }, LEAF),
    property: "width",
    refused: "rects",
  },
  {
    name: "`alignItems: flex-end` — the node's own x moves as it grows",
    spec: inColumn({ width: 400, height: 700, alignItems: "flex-end" }, LEAF),
    property: "width",
    refused: "rects",
  },
  {
    name: "`alignSelf: center` on the node itself",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: 100, height: 60, alignSelf: "center" },
        animated: true,
      },
    ),
    property: "width",
    refused: "rects",
  },
  {
    name: "`maxWidth` clamps the driven value",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: 100, height: 60, maxWidth: 120 },
        animated: true,
      },
    ),
    property: "width",
    refused: "clamped",
  },
  {
    name: "`minWidth` clamps the driven value",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: 100, height: 60, minWidth: 200 },
        animated: true,
      },
    ),
    property: "width",
    refused: "clamped",
  },
  {
    name: "`aspectRatio` makes the other axis follow",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: 100, aspectRatio: 2 },
        animated: true,
      },
    ),
    property: "width",
    refused: "rects",
  },
  {
    // `alignSelf: flex-start` is what makes it content-sized: without it the
    // stage stretches the container to the full viewport and its width has
    // nothing to do with its children — which is itself worth knowing, and is
    // the "a container stretched on its parent's cross axis" case above.
    name: "a content-sized container grows with the node",
    spec: inColumn({ height: 700, alignSelf: "flex-start" }, LEAF, []),
    property: "width",
    refused: "rects",
  },
  {
    name: "a WRAPPING container moves the following lines",
    spec: inColumn(
      { width: 400, height: 700, flexWrap: "wrap", flexDirection: "row" },
      { style: { width: 100, height: 60 }, animated: true },
      Array.from({ length: 8 }, () => ({ style: { width: 100, height: 60 } })),
    ),
    property: "height",
    refused: "rects",
  },
  {
    name: "the node's OTHER axis comes from its content — the text re-wraps and the box grows",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: { width: 100 },
        animated: true,
        children: [{ style: {}, text: 300 }],
      },
    ),
    property: "width",
    refused: "rects",
  },
  {
    name: "an out-of-flow node anchored by its RIGHT edge grows leftward",
    spec: inColumn(
      { width: 400, height: 700 },
      {
        style: {
          position: "absolute",
          right: 10,
          top: 10,
          width: 100,
          height: 60,
        },
        animated: true,
      },
    ),
    property: "width",
    refused: "rects",
  },
  {
    name: "under an `IntrinsicRoot` the container is content-sized all the way up",
    spec: {
      style: { padding: 8 },
      children: [{ style: { height: 700 }, children: [LEAF] }],
    },
    property: "width",
    contentSized: true,
    // Not in the rects, and that is exactly the trap: an `IntrinsicRoot`
    // reports its Yoga content size to GTK, so the divergence is in the size
    // the WINDOW asks for. The driven path never writes into Yoga, so the
    // island would keep its old request and the node would draw outside it —
    // see the dedicated test below.
    refused: "root-request",
  },
]

const VALUES = [60, 160, 260]

test.each(CASES)(
  "$name ($property): the rule agrees with the engine",
  ({ spec, property, contentSized = false, refused }) => {
    const reason = ruleSays(spec, property, contentSized)
    const disagreements: string[][] = []
    for (const value of VALUES) {
      const full = fullPass(spec, property, value, contentSized)
      const subtree = subtreePass(spec, property, value, contentSized)
      disagreements.push(differences(full, subtree))
    }

    if (reason === null) {
      // SOUNDNESS. The subtree pass reproduced a full one, at every driven
      // value, on every rect in the tree.
      expect(disagreements.flat()).toEqual([])
      return
    }

    // The rule refused, and the refusal has to be earned by something a test
    // can see — a refusal nobody can watch failing is superstition.
    expect(reason).toBeTruthy()
    if (refused === "rects") {
      expect(disagreements.flat().length).toBeGreaterThan(0)
    }
    if (refused === "clamped") {
      // The geometry is not wrong — it has stopped moving. Distinct driven
      // values that land on the same box, which is an animation the user can
      // watch not happening.
      const sizes = VALUES.map((value) => drivenSizeOf(spec, property, value))
      expect(new Set(sizes).size).toBeLessThan(VALUES.length)
      expect(disagreements.flat()).toEqual([])
    }
  },
)

it("refuses under an `IntrinsicRoot` because the ROOT's size request would not follow", () => {
  // The one root shape where the original refusal's correctness argument was
  // real (docs/research/animated-size.md §4). The rect table cannot show it:
  // an `IntrinsicRoot` reports its Yoga CONTENT SIZE to GTK, so what diverges
  // is the size the widget asks its parent for.
  const spec: Spec = {
    style: { padding: 8 },
    children: [{ style: { height: 700 }, children: [LEAF] }],
  }
  const written = build(spec, true)
  const before = written.engine.measureContent("horizontal", -1)
  written.animated.setStyle({ width: 260, height: 60 })
  written.engine.flushSync()
  const afterWrite = written.engine.measureContent("horizontal", -1)
  written.engine.dispose()

  const driven = build(spec, true)
  layoutSubtreeAtSize(driven.animated, { width: 260 })
  const afterDrive = driven.engine.measureContent("horizontal", -1)
  driven.engine.dispose()

  // A real write grows the island, and with it the toplevel's request.
  expect(afterWrite).toBeGreaterThan(before)
  // The driven path never touches Yoga, so it CANNOT: the island would keep
  // its old request and the node would draw outside the rectangle GTK gave
  // it. Which is why the rule refuses here rather than shipping a size that
  // is right in the store and wrong on screen.
  expect(afterDrive).toBe(before)
  expect(ruleSays(spec, "width", true)).toContain("IntrinsicRoot")
})

it("refuses every configuration the recon measured as failing, by name", () => {
  // The same list as above, read the other way round: this is the assertion
  // that the boundary did not quietly widen.
  for (const testCase of CASES.filter((entry) => entry.refused)) {
    expect(
      ruleSays(
        testCase.spec,
        testCase.property,
        testCase.contentSized ?? false,
      ),
    ).toBeTruthy()
  }
})

it("drives both axes of an out-of-flow node anchored at its top left", () => {
  const spec: Spec = inColumn(
    { width: 400, height: 700 },
    {
      style: {
        position: "absolute",
        left: 10,
        top: 10,
        width: 100,
        height: 60,
      },
      animated: true,
    },
  )
  for (const property of SIZE_PROPERTIES) {
    expect(ruleSays(spec, property)).toBeNull()
  }
})

it("refuses a node with no container at all", () => {
  const engine = new LayoutEngine(VIEWPORT)
  expect(
    drivenSizeRefusal(
      { node: engine.root, rootIsContentSized: false },
      "width",
    ),
  ).toBeTruthy()
  engine.dispose()
})

it("stops the climb at a container whose own size is content-derived", () => {
  // Three levels: a definite grandparent, a content-sized parent, a stretched
  // container. The stretch hands the question upward and the content-sized
  // level is where it has to stop — a rule that only looked one level up
  // would say yes here and be wrong.
  const spec: Spec = {
    style: { width: VIEWPORT.width, height: VIEWPORT.height },
    children: [
      {
        style: { flexDirection: "row" },
        children: [
          { style: { height: 300 }, children: [LEAF, ...siblings(2)] },
        ],
      },
    ],
  }
  expect(ruleSays(spec, "width")).toContain("derived from its children")
  const full = fullPass(spec, "width", 260)
  const subtree = subtreePass(spec, "width", 260)
  expect(differences(full, subtree).length).toBeGreaterThan(0)
})

it("names a different reason for each way of failing", () => {
  const reasons = new Set(
    CASES.filter((entry) => entry.refused).map((entry) =>
      ruleSays(entry.spec, entry.property, entry.contentSized ?? false),
    ),
  )
  // Eight distinct sentences for eleven refusing configurations: the ones that
  // share a sentence share a cause (both `alignItems` values, both clamps).
  expect(reasons.size).toBeGreaterThanOrEqual(7)
  for (const reason of reasons) {
    expect(reason).not.toBe("")
  }
})

it("`canDriveSize` is the same answer as an empty refusal", () => {
  for (const testCase of CASES) {
    const built = build(testCase.spec, testCase.contentSized ?? false)
    const context = {
      node: built.animated,
      rootIsContentSized: testCase.contentSized ?? false,
    }
    expect(canDriveSize(context, testCase.property)).toBe(
      drivenSizeRefusal(context, testCase.property) === null,
    )
    built.engine.dispose()
  }
})
