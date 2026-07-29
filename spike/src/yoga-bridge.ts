import * as Gtk from "@gtkx/gi/gtk"
import Yoga, {
  Align,
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  PositionType,
  type Node as YogaNode,
} from "yoga-layout"

export type SpecStyle = Partial<{
  flexDirection: "row" | "column"
  flex: number
  width: number
  height: number
  padding: number
  margin: number
  gap: number
  justifyContent: "flex-start" | "center" | "flex-end" | "space-between"
  alignItems: "flex-start" | "center" | "flex-end" | "stretch"
  position: "absolute"
  top: number
  left: number
}>

export type Spec = {
  key: string
  style?: SpecStyle
  text?: string
  bg?: string
  children?: Spec[]
}

export type LaidNode = {
  spec: Spec
  rect: { x: number; y: number; w: number; h: number }
  children: LaidNode[]
}

const JUSTIFY = {
  "flex-start": Justify.FlexStart,
  center: Justify.Center,
  "flex-end": Justify.FlexEnd,
  "space-between": Justify.SpaceBetween,
} as const

const ALIGN = {
  "flex-start": Align.FlexStart,
  center: Align.Center,
  "flex-end": Align.FlexEnd,
  stretch: Align.Stretch,
} as const

const applyStyle = (node: YogaNode, style: SpecStyle = {}): void => {
  node.setFlexDirection(
    style.flexDirection === "row" ? FlexDirection.Row : FlexDirection.Column,
  )
  if (style.flex !== undefined) {
    node.setFlex(style.flex)
  }
  if (style.width !== undefined) {
    node.setWidth(style.width)
  }
  if (style.height !== undefined) {
    node.setHeight(style.height)
  }
  if (style.padding !== undefined) {
    node.setPadding(Edge.All, style.padding)
  }
  if (style.margin !== undefined) {
    node.setMargin(Edge.All, style.margin)
  }
  if (style.gap !== undefined) {
    node.setGap(Gutter.All, style.gap)
  }
  if (style.justifyContent !== undefined) {
    node.setJustifyContent(JUSTIFY[style.justifyContent])
  }
  if (style.alignItems !== undefined) {
    node.setAlignItems(ALIGN[style.alignItems])
  }
  if (style.position === "absolute") {
    node.setPositionType(PositionType.Absolute)
  }
  if (style.top !== undefined) {
    node.setPosition(Edge.Top, style.top)
  }
  if (style.left !== undefined) {
    node.setPosition(Edge.Left, style.left)
  }
}

// Offscreen GtkLabel used as the Pango-backed measure function for Yoga text nodes.
// This is exactly what react-native-gtkx's layout engine will do for <Text>.
const makeTextMeasure = (text: string) => {
  const probe = new Gtk.Label()
  probe.setWrap(true)
  probe.setText(text)

  return (width: number): { width: number; height: number } => {
    const forWidth =
      Number.isFinite(width) && width > 0 ? Math.floor(width) : -1
    const naturalWidth = probe.measure(Gtk.Orientation.HORIZONTAL, -1)[1]
    const usedWidth =
      forWidth > 0 ? Math.min(naturalWidth, forWidth) : naturalWidth
    const height = probe.measure(Gtk.Orientation.VERTICAL, usedWidth)[1]
    return { width: usedWidth, height }
  }
}

export type BuiltTree = {
  root: YogaNode
  nodes: Map<string, YogaNode>
  free: () => void
}

export const buildYogaTree = (spec: Spec): BuiltTree => {
  const nodes = new Map<string, YogaNode>()

  const build = (s: Spec): YogaNode => {
    const node = Yoga.Node.create()
    applyStyle(node, s.style)
    if (s.text !== undefined) {
      const measure = makeTextMeasure(s.text)
      node.setMeasureFunc((w) => measure(w))
    }
    ;(s.children ?? []).forEach((child, i) => {
      node.insertChild(build(child), i)
    })
    nodes.set(s.key, node)
    return node
  }

  const root = build(spec)
  return { root, nodes, free: () => root.freeRecursive() }
}

export const computeLayout = (
  tree: BuiltTree,
  spec: Spec,
  width: number,
  height: number,
): LaidNode => {
  tree.root.calculateLayout(width, height, Direction.LTR)

  const collect = (s: Spec): LaidNode => {
    const node = tree.nodes.get(s.key)
    if (!node) {
      throw new Error(`no yoga node for ${s.key}`)
    }
    return {
      spec: s,
      rect: {
        x: node.getComputedLeft(),
        y: node.getComputedTop(),
        w: node.getComputedWidth(),
        h: node.getComputedHeight(),
      },
      children: (s.children ?? []).map(collect),
    }
  }

  return collect(spec)
}
