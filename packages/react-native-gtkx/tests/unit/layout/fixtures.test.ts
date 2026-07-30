import { describe, expect, it } from "vitest"
import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  Overflow,
  PositionType,
  Wrap,
  type Node as RawNode,
} from "yoga-layout"
import { LayoutEngine, type LayoutNode } from "../../../src/layout/index"
import type { LayoutStyle, MeasureFn } from "../../../src/contracts"

const VIEWPORT = { width: 800, height: 600 }

type FixtureNode = {
  style?: LayoutStyle
  measure?: MeasureFn
  children?: FixtureNode[]
}

type Fixture = {
  name: string
  tree: FixtureNode
}

// Reference implementation: raw Yoga calls, intentionally independent from
// src/layout/apply-style.ts so the engine is checked against ground truth.
const REF_FLEX_DIRECTION = {
  row: FlexDirection.Row,
  "row-reverse": FlexDirection.RowReverse,
  column: FlexDirection.Column,
  "column-reverse": FlexDirection.ColumnReverse,
} as const

const REF_JUSTIFY = {
  "flex-start": Justify.FlexStart,
  "flex-end": Justify.FlexEnd,
  center: Justify.Center,
  "space-between": Justify.SpaceBetween,
  "space-around": Justify.SpaceAround,
  "space-evenly": Justify.SpaceEvenly,
} as const

const REF_ALIGN = {
  auto: Align.Auto,
  "flex-start": Align.FlexStart,
  "flex-end": Align.FlexEnd,
  center: Align.Center,
  stretch: Align.Stretch,
  baseline: Align.Baseline,
  "space-between": Align.SpaceBetween,
  "space-around": Align.SpaceAround,
} as const

const refDim = (
  value: number | string | undefined,
  point: (v: number) => void,
  percent: (v: number) => void,
  auto?: () => void,
): void => {
  if (value === undefined) {
    return
  }
  if (value === "auto") {
    auto?.()
    return
  }
  if (typeof value === "string") {
    percent(Number.parseFloat(value))
    return
  }
  point(value)
}

const refEdges = (
  style: LayoutStyle,
  apply: (edge: Edge, value: number | string) => void,
  prefix: "margin" | "padding",
): void => {
  const map: Array<[keyof LayoutStyle, Edge]> = [
    [prefix, Edge.All],
    [`${prefix}Horizontal`, Edge.Horizontal],
    [`${prefix}Vertical`, Edge.Vertical],
    [`${prefix}Top`, Edge.Top],
    [`${prefix}Bottom`, Edge.Bottom],
    [`${prefix}Left`, Edge.Left],
    [`${prefix}Right`, Edge.Right],
  ]
  for (const [prop, edge] of map) {
    const value = style[prop] as number | string | undefined
    if (value !== undefined) {
      apply(edge, value)
    }
  }
}

const refApply = (node: RawNode, style: LayoutStyle = {}): void => {
  // RN base defaults.
  node.setFlexDirection(FlexDirection.Column)
  node.setAlignContent(Align.FlexStart)
  node.setFlexShrink(0)

  if (style.flexDirection) {
    node.setFlexDirection(REF_FLEX_DIRECTION[style.flexDirection])
  }
  if (style.justifyContent) {
    node.setJustifyContent(REF_JUSTIFY[style.justifyContent])
  }
  if (style.alignItems) {
    node.setAlignItems(REF_ALIGN[style.alignItems])
  }
  if (style.alignSelf) {
    node.setAlignSelf(REF_ALIGN[style.alignSelf])
  }
  if (style.alignContent) {
    node.setAlignContent(REF_ALIGN[style.alignContent])
  }
  if (style.flexWrap) {
    node.setFlexWrap(
      {
        nowrap: Wrap.NoWrap,
        wrap: Wrap.Wrap,
        "wrap-reverse": Wrap.WrapReverse,
      }[style.flexWrap],
    )
  }
  if (style.position) {
    node.setPositionType(
      {
        absolute: PositionType.Absolute,
        relative: PositionType.Relative,
        static: PositionType.Static,
      }[style.position],
    )
  }
  if (style.overflow) {
    node.setOverflow(
      {
        visible: Overflow.Visible,
        hidden: Overflow.Hidden,
        scroll: Overflow.Scroll,
      }[style.overflow],
    )
  }
  if (style.display) {
    node.setDisplay({ none: Display.None, flex: Display.Flex }[style.display])
  }
  if (style.flex !== undefined) {
    node.setFlex(style.flex)
  }
  if (style.flexGrow !== undefined) {
    node.setFlexGrow(style.flexGrow)
  }
  if (style.flexShrink !== undefined) {
    node.setFlexShrink(style.flexShrink)
  }
  refDim(
    style.flexBasis,
    (v) => node.setFlexBasis(v),
    (v) => node.setFlexBasisPercent(v),
    () => node.setFlexBasisAuto(),
  )
  refDim(
    style.width,
    (v) => node.setWidth(v),
    (v) => node.setWidthPercent(v),
    () => node.setWidthAuto(),
  )
  refDim(
    style.height,
    (v) => node.setHeight(v),
    (v) => node.setHeightPercent(v),
    () => node.setHeightAuto(),
  )
  refDim(
    style.minWidth,
    (v) => node.setMinWidth(v),
    (v) => node.setMinWidthPercent(v),
  )
  refDim(
    style.minHeight,
    (v) => node.setMinHeight(v),
    (v) => node.setMinHeightPercent(v),
  )
  refDim(
    style.maxWidth,
    (v) => node.setMaxWidth(v),
    (v) => node.setMaxWidthPercent(v),
  )
  refDim(
    style.maxHeight,
    (v) => node.setMaxHeight(v),
    (v) => node.setMaxHeightPercent(v),
  )
  refEdges(
    style,
    (edge, value) => {
      if (value === "auto") {
        node.setMarginAuto(edge)
      } else if (typeof value === "string") {
        node.setMarginPercent(edge, Number.parseFloat(value))
      } else {
        node.setMargin(edge, value)
      }
    },
    "margin",
  )
  refEdges(
    style,
    (edge, value) => {
      if (typeof value === "string") {
        node.setPaddingPercent(edge, Number.parseFloat(value))
      } else if (typeof value === "number") {
        node.setPadding(edge, value)
      }
    },
    "padding",
  )
  const positions: Array<[keyof LayoutStyle, Edge]> = [
    ["top", Edge.Top],
    ["bottom", Edge.Bottom],
    ["left", Edge.Left],
    ["right", Edge.Right],
  ]
  for (const [prop, edge] of positions) {
    refDim(
      style[prop] as number | string | undefined,
      (v) => node.setPosition(edge, v),
      (v) => node.setPositionPercent(edge, v),
    )
  }
  if (style.gap !== undefined) {
    node.setGap(Gutter.All, style.gap)
  }
  if (style.rowGap !== undefined) {
    node.setGap(Gutter.Row, style.rowGap)
  }
  if (style.columnGap !== undefined) {
    node.setGap(Gutter.Column, style.columnGap)
  }
  if (style.aspectRatio !== undefined) {
    const value =
      typeof style.aspectRatio === "number"
        ? style.aspectRatio
        : (() => {
            const parts = style.aspectRatio.split("/")
            return parts.length === 2
              ? Number.parseFloat(parts[0]!) / Number.parseFloat(parts[1]!)
              : Number.parseFloat(style.aspectRatio)
          })()
    node.setAspectRatio(value)
  }
}

type RefRect = { x: number; y: number; width: number; height: number }

const buildRef = (fixture: FixtureNode): { node: RawNode; all: RawNode[] } => {
  const all: RawNode[] = []
  const build = (spec: FixtureNode): RawNode => {
    const node = Yoga.Node.create()
    refApply(node, spec.style)
    if (spec.measure) {
      const measure = spec.measure
      node.setMeasureFunc((w, wm, h, hm) =>
        measure(
          w,
          (["undefined", "exactly", "at-most"] as const)[wm]!,
          h,
          (["undefined", "exactly", "at-most"] as const)[hm]!,
        ),
      )
    }
    all.push(node)
    spec.children?.forEach((child, index) => {
      node.insertChild(build(child), index)
    })
    return node
  }
  return { node: build(fixture), all }
}

const buildEngine = (
  engine: LayoutEngine,
  fixture: FixtureNode,
): LayoutNode[] => {
  const all: LayoutNode[] = []
  const build = (spec: FixtureNode, parent: LayoutNode | null): LayoutNode => {
    const node = parent === null ? engine.root : engine.createNode()
    if (spec.style) {
      node.setStyle(spec.style)
    }
    if (spec.measure) {
      node.setMeasureFn(spec.measure)
    }
    all.push(node)
    spec.children?.forEach((child, index) => {
      const built = build(child, node)
      node.insertChild(built, index)
    })
    return node
  }
  build(fixture, null)
  return all
}

const textLikeMeasure: MeasureFn = (width, widthMode) => {
  const naturalWidth = 300
  const usedWidth =
    widthMode === "undefined" ? naturalWidth : Math.min(naturalWidth, width)
  const lines = Math.ceil(naturalWidth / Math.max(1, usedWidth))
  return { width: usedWidth, height: lines * 20 }
}

const box = (style: LayoutStyle, children?: FixtureNode[]): FixtureNode => ({
  style,
  children,
})

const fixtures: Fixture[] = [
  {
    name: "row with two flex:1 children",
    tree: box({ flexDirection: "row" }, [box({ flex: 1 }), box({ flex: 1 })]),
  },
  {
    name: "row justify center",
    tree: box({ flexDirection: "row", justifyContent: "center" }, [
      box({ width: 100, height: 50 }),
      box({ width: 60, height: 50 }),
    ]),
  },
  {
    name: "row justify space-between",
    tree: box({ flexDirection: "row", justifyContent: "space-between" }, [
      box({ width: 100, height: 50 }),
      box({ width: 100, height: 50 }),
      box({ width: 100, height: 50 }),
    ]),
  },
  {
    name: "row justify space-around",
    tree: box({ flexDirection: "row", justifyContent: "space-around" }, [
      box({ width: 100, height: 50 }),
      box({ width: 100, height: 50 }),
    ]),
  },
  {
    name: "row justify space-evenly",
    tree: box({ flexDirection: "row", justifyContent: "space-evenly" }, [
      box({ width: 100, height: 50 }),
      box({ width: 100, height: 50 }),
    ]),
  },
  {
    name: "row justify flex-end",
    tree: box({ flexDirection: "row", justifyContent: "flex-end" }, [
      box({ width: 100, height: 50 }),
    ]),
  },
  {
    name: "column alignItems center",
    tree: box({ alignItems: "center" }, [
      box({ width: 120, height: 40 }),
      box({ width: 200, height: 40 }),
    ]),
  },
  {
    name: "column alignItems flex-end",
    tree: box({ alignItems: "flex-end" }, [box({ width: 120, height: 40 })]),
  },
  {
    name: "default stretch fills cross axis",
    tree: box({}, [box({ height: 40 })]),
  },
  {
    name: "alignSelf overrides alignItems",
    tree: box({ alignItems: "center" }, [
      box({ width: 100, height: 30, alignSelf: "flex-end" }),
      box({ width: 100, height: 30 }),
    ]),
  },
  {
    name: "flexGrow proportions 1:2:3",
    tree: box({ flexDirection: "row" }, [
      box({ flexGrow: 1, height: 20 }),
      box({ flexGrow: 2, height: 20 }),
      box({ flexGrow: 3, height: 20 }),
    ]),
  },
  {
    name: "flexShrink resolves overflow",
    tree: box({ flexDirection: "row" }, [
      box({ width: 600, height: 20, flexShrink: 1 }),
      box({ width: 600, height: 20, flexShrink: 2 }),
    ]),
  },
  {
    name: "flexBasis with grow",
    tree: box({ flexDirection: "row" }, [
      box({ flexBasis: 100, flexGrow: 1, height: 20 }),
      box({ flexBasis: 300, flexGrow: 1, height: 20 }),
    ]),
  },
  {
    name: "flexBasis percent",
    tree: box({ flexDirection: "row" }, [
      box({ flexBasis: "25%", height: 20 }),
      box({ flexBasis: "50%", height: 20 }),
    ]),
  },
  {
    name: "wrap with gap",
    tree: box({ flexDirection: "row", flexWrap: "wrap", gap: 10 }, [
      box({ width: 300, height: 40 }),
      box({ width: 300, height: 40 }),
      box({ width: 300, height: 40 }),
    ]),
  },
  {
    name: "wrap-reverse",
    tree: box({ flexDirection: "row", flexWrap: "wrap-reverse" }, [
      box({ width: 500, height: 40 }),
      box({ width: 500, height: 40 }),
    ]),
  },
  {
    name: "separate rowGap and columnGap",
    tree: box(
      { flexDirection: "row", flexWrap: "wrap", rowGap: 30, columnGap: 5 },
      [
        box({ width: 400, height: 40 }),
        box({ width: 400, height: 40 }),
        box({ width: 400, height: 40 }),
      ],
    ),
  },
  {
    name: "margin all plus side override",
    tree: box({}, [box({ margin: 10, marginLeft: 40, height: 30 })]),
  },
  {
    name: "marginHorizontal and marginVertical",
    tree: box({}, [
      box({ marginHorizontal: 25, marginVertical: 15, height: 30 }),
    ]),
  },
  {
    name: "margin auto centers child",
    tree: box({ flexDirection: "row" }, [
      box({ width: 100, height: 30, margin: "auto" }),
    ]),
  },
  {
    name: "padding all plus side override",
    tree: box({ padding: 20, paddingTop: 50 }, [box({ flex: 1 })]),
  },
  {
    name: "percent width and height",
    tree: box({}, [box({ width: "50%", height: "25%" })]),
  },
  {
    name: "absolute top left",
    tree: box({}, [
      box({ position: "absolute", top: 15, left: 25, width: 80, height: 40 }),
    ]),
  },
  {
    name: "absolute right bottom",
    tree: box({}, [
      box({
        position: "absolute",
        right: 15,
        bottom: 25,
        width: 80,
        height: 40,
      }),
    ]),
  },
  {
    name: "absolute stretched by all edges",
    tree: box({}, [
      box({ position: "absolute", top: 10, left: 10, right: 10, bottom: 10 }),
    ]),
  },
  {
    name: "min max width clamp",
    tree: box({ flexDirection: "row" }, [
      box({ flexGrow: 1, maxWidth: 200, height: 20 }),
      box({ width: 10, minWidth: 120, height: 20 }),
    ]),
  },
  {
    name: "min max height clamp",
    tree: box({}, [
      box({ flexGrow: 1, maxHeight: 100 }),
      box({ height: 10, minHeight: 80 }),
    ]),
  },
  {
    name: "aspectRatio number",
    tree: box({}, [box({ width: 200, aspectRatio: 2 })]),
  },
  {
    name: "aspectRatio string 16/9",
    tree: box({}, [box({ width: 320, aspectRatio: "16/9" })]),
  },
  {
    name: "display none removes from flow",
    tree: box({ flexDirection: "row" }, [
      box({ width: 100, height: 30 }),
      box({ width: 100, height: 30, display: "none" }),
      box({ width: 100, height: 30 }),
    ]),
  },
  {
    name: "row-reverse ordering",
    tree: box({ flexDirection: "row-reverse" }, [
      box({ width: 100, height: 30 }),
      box({ width: 60, height: 30 }),
    ]),
  },
  {
    name: "column-reverse ordering",
    tree: box({ flexDirection: "column-reverse" }, [
      box({ height: 100 }),
      box({ height: 60 }),
    ]),
  },
  {
    name: "nested row inside column",
    tree: box({ padding: 12, gap: 12 }, [
      box(
        { height: 56, flexDirection: "row", justifyContent: "space-between" },
        [box({ width: 90, height: 28 }), box({ width: 90, height: 28 })],
      ),
      box({ flex: 1, flexDirection: "row", gap: 12 }, [
        box({ width: 220 }),
        box({ flex: 1 }, [box({ flex: 1 }), box({ height: 40 })]),
      ]),
    ]),
  },
  {
    name: "overflow hidden does not change layout",
    tree: box({ overflow: "hidden", flexDirection: "row" }, [
      box({ width: 900, height: 30 }),
    ]),
  },
  {
    name: "alignContent space-between with wrap",
    tree: box(
      {
        flexDirection: "row",
        flexWrap: "wrap",
        alignContent: "space-between",
        height: 600,
      },
      [
        box({ width: 500, height: 50 }),
        box({ width: 500, height: 50 }),
        box({ width: 500, height: 50 }),
      ],
    ),
  },
  {
    name: "relative offset top left",
    tree: box({}, [box({ top: 12, left: 18, width: 50, height: 50 })]),
  },
  {
    name: "measured leaf wraps at container width",
    tree: box({ padding: 10 }, [
      box({ width: 120 }, [{ measure: textLikeMeasure }]),
    ]),
  },
  {
    name: "measured leaf unconstrained",
    tree: box({ flexDirection: "row" }, [{ measure: textLikeMeasure }]),
  },
]

const collectRef = (node: RawNode, out: RefRect[]): void => {
  out.push({
    x: node.getComputedLeft(),
    y: node.getComputedTop(),
    width: node.getComputedWidth(),
    height: node.getComputedHeight(),
  })
  for (let i = 0; i < node.getChildCount(); i += 1) {
    collectRef(node.getChild(i), out)
  }
}

describe("layout fixtures match direct Yoga computation", () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const ref = buildRef(fixture.tree)
      ref.node.calculateLayout(VIEWPORT.width, VIEWPORT.height, Direction.LTR)
      const expected: RefRect[] = []
      collectRef(ref.node, expected)
      ref.node.freeRecursive()

      const engine = new LayoutEngine(VIEWPORT)
      const nodes = buildEngine(engine, fixture.tree)
      engine.root.setStyle({
        ...(fixture.tree.style ?? {}),
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      })
      engine.flushSync()

      expect(nodes.length).toBe(expected.length)
      nodes.forEach((node, index) => {
        expect(node.getRect(), `node #${index}`).toEqual(expected[index])
      })
      engine.dispose()
    })
  }
})
