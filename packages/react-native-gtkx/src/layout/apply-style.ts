import type { DimensionValue, LayoutStyle } from "../contracts"
import {
  ALIGN,
  DISPLAY,
  Edge,
  FLEX_DIRECTION,
  Gutter,
  JUSTIFY,
  OVERFLOW,
  POSITION,
  WRAP,
  type YogaNode,
} from "./yoga"

type DimensionSetters = {
  point: (value: number) => void
  percent?: (value: number) => void
  auto?: () => void
  reset: () => void
}

const isPercent = (value: DimensionValue): value is `${number}%` =>
  typeof value === "string" && value.endsWith("%")

const applyDimension = (
  value: DimensionValue | undefined,
  setters: DimensionSetters,
): void => {
  if (value === undefined) {
    setters.reset()
    return
  }
  if (value === "auto") {
    setters.auto?.()
    return
  }
  if (isPercent(value)) {
    setters.percent?.(Number.parseFloat(value))
    return
  }
  if (typeof value === "number") {
    setters.point(value)
  }
}

const parseAspectRatio = (
  value: number | string | undefined,
): number | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === "number") {
    return value
  }
  const parts = value.split("/").map((part) => Number.parseFloat(part.trim()))
  if (parts.length === 2 && parts[0] !== undefined && parts[1]) {
    return parts[0] / parts[1]
  }
  const single = Number.parseFloat(value)
  return Number.isNaN(single) ? undefined : single
}

// React Native defaults differ from raw Yoga: column direction, flexShrink 0,
// align-content flex-start, position relative. Applied at node creation and
// re-applied when a style prop is removed on update.
export const applyNodeDefaults = (node: YogaNode): void => {
  node.setFlexDirection(FLEX_DIRECTION.column)
  node.setAlignContent(ALIGN["flex-start"])
  node.setFlexShrink(0)
  node.setPositionType(POSITION.relative)
}

type EdgeDimensionProps = Extract<
  keyof LayoutStyle,
  | `margin${string}`
  | `padding${string}`
  | "margin"
  | "padding"
  | "top"
  | "left"
  | "right"
  | "bottom"
>

const MARGIN_EDGES: ReadonlyArray<[EdgeDimensionProps, Edge]> = [
  ["margin", Edge.All],
  ["marginHorizontal", Edge.Horizontal],
  ["marginVertical", Edge.Vertical],
  ["marginTop", Edge.Top],
  ["marginBottom", Edge.Bottom],
  ["marginLeft", Edge.Left],
  ["marginRight", Edge.Right],
]

const PADDING_EDGES: ReadonlyArray<[EdgeDimensionProps, Edge]> = [
  ["padding", Edge.All],
  ["paddingHorizontal", Edge.Horizontal],
  ["paddingVertical", Edge.Vertical],
  ["paddingTop", Edge.Top],
  ["paddingBottom", Edge.Bottom],
  ["paddingLeft", Edge.Left],
  ["paddingRight", Edge.Right],
]

const POSITION_EDGES: ReadonlyArray<[EdgeDimensionProps, Edge]> = [
  ["top", Edge.Top],
  ["bottom", Edge.Bottom],
  ["left", Edge.Left],
  ["right", Edge.Right],
]

// Applies an RN layout style onto a Yoga node. Handles prop removal by
// resetting to RN defaults, so updates never leak stale values.
export const applyLayoutStyle = (node: YogaNode, style: LayoutStyle): void => {
  node.setFlexDirection(
    FLEX_DIRECTION[style.flexDirection ?? "column"] ?? FLEX_DIRECTION.column,
  )
  node.setJustifyContent(JUSTIFY[style.justifyContent ?? "flex-start"])
  node.setAlignItems(ALIGN[style.alignItems ?? "stretch"] ?? ALIGN.stretch)
  node.setAlignSelf(ALIGN[style.alignSelf ?? "auto"] ?? ALIGN.auto)
  node.setAlignContent(
    ALIGN[style.alignContent ?? "flex-start"] ?? ALIGN["flex-start"],
  )
  node.setFlexWrap(WRAP[style.flexWrap ?? "nowrap"])
  node.setPositionType(POSITION[style.position ?? "relative"])
  node.setOverflow(OVERFLOW[style.overflow ?? "visible"])
  node.setDisplay(DISPLAY[style.display ?? "flex"])

  node.setFlex(style.flex ?? Number.NaN)
  node.setFlexGrow(style.flexGrow ?? Number.NaN)
  node.setFlexShrink(style.flexShrink ?? 0)

  applyDimension(style.flexBasis, {
    point: (v) => node.setFlexBasis(v),
    percent: (v) => node.setFlexBasisPercent(v),
    auto: () => node.setFlexBasisAuto(),
    reset: () => node.setFlexBasisAuto(),
  })
  applyDimension(style.width, {
    point: (v) => node.setWidth(v),
    percent: (v) => node.setWidthPercent(v),
    auto: () => node.setWidthAuto(),
    reset: () => node.setWidthAuto(),
  })
  applyDimension(style.height, {
    point: (v) => node.setHeight(v),
    percent: (v) => node.setHeightPercent(v),
    auto: () => node.setHeightAuto(),
    reset: () => node.setHeightAuto(),
  })
  applyDimension(style.minWidth, {
    point: (v) => node.setMinWidth(v),
    percent: (v) => node.setMinWidthPercent(v),
    reset: () => node.setMinWidth(Number.NaN),
  })
  applyDimension(style.minHeight, {
    point: (v) => node.setMinHeight(v),
    percent: (v) => node.setMinHeightPercent(v),
    reset: () => node.setMinHeight(Number.NaN),
  })
  applyDimension(style.maxWidth, {
    point: (v) => node.setMaxWidth(v),
    percent: (v) => node.setMaxWidthPercent(v),
    reset: () => node.setMaxWidth(Number.NaN),
  })
  applyDimension(style.maxHeight, {
    point: (v) => node.setMaxHeight(v),
    percent: (v) => node.setMaxHeightPercent(v),
    reset: () => node.setMaxHeight(Number.NaN),
  })

  for (const [prop, edge] of MARGIN_EDGES) {
    applyDimension(style[prop], {
      point: (v) => node.setMargin(edge, v),
      percent: (v) => node.setMarginPercent(edge, v),
      auto: () => node.setMarginAuto(edge),
      reset: () => node.setMargin(edge, Number.NaN),
    })
  }
  for (const [prop, edge] of PADDING_EDGES) {
    applyDimension(style[prop], {
      point: (v) => node.setPadding(edge, v),
      percent: (v) => node.setPaddingPercent(edge, v),
      reset: () => node.setPadding(edge, Number.NaN),
    })
  }
  for (const [prop, edge] of POSITION_EDGES) {
    applyDimension(style[prop], {
      point: (v) => node.setPosition(edge, v),
      percent: (v) => node.setPositionPercent(edge, v),
      reset: () => node.setPosition(edge, Number.NaN),
    })
  }

  node.setGap(Gutter.All, style.gap ?? Number.NaN)
  node.setGap(Gutter.Row, style.rowGap ?? Number.NaN)
  node.setGap(Gutter.Column, style.columnGap ?? Number.NaN)

  const aspectRatio = parseAspectRatio(style.aspectRatio)
  node.setAspectRatio(aspectRatio ?? Number.NaN)
}
