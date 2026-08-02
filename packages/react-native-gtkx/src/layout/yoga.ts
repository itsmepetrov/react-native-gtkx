import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Overflow,
  PositionType,
  Unit,
  Wrap,
  type Node as YogaNode,
} from "yoga-layout"
import type {
  FlexAlignType,
  LayoutStyle,
  MeasureConstraintMode,
} from "../contracts"

// The enums are re-exported rather than imported from `yoga-layout` directly
// elsewhere: this module is the one door onto the layout library, the same way
// `gtkx/bridge` is the one door onto @gtkx.
export {
  Align,
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  MeasureMode,
  PositionType,
  Unit,
  Wrap,
  Yoga,
}
// `yoga-layout` does not export the record its dimension getters return, so
// it is named here rather than re-derived at every call site.
export type YogaValue = ReturnType<YogaNode["getWidth"]>

export type { YogaNode }

export const FLEX_DIRECTION: Record<
  NonNullable<LayoutStyle["flexDirection"]>,
  FlexDirection
> = {
  row: FlexDirection.Row,
  "row-reverse": FlexDirection.RowReverse,
  column: FlexDirection.Column,
  "column-reverse": FlexDirection.ColumnReverse,
}

export const JUSTIFY: Record<
  NonNullable<LayoutStyle["justifyContent"]>,
  Justify
> = {
  "flex-start": Justify.FlexStart,
  "flex-end": Justify.FlexEnd,
  center: Justify.Center,
  "space-between": Justify.SpaceBetween,
  "space-around": Justify.SpaceAround,
  "space-evenly": Justify.SpaceEvenly,
}

export const ALIGN: Record<
  "auto" | FlexAlignType | "space-between" | "space-around",
  Align
> = {
  auto: Align.Auto,
  "flex-start": Align.FlexStart,
  "flex-end": Align.FlexEnd,
  center: Align.Center,
  stretch: Align.Stretch,
  baseline: Align.Baseline,
  "space-between": Align.SpaceBetween,
  "space-around": Align.SpaceAround,
}

export const WRAP: Record<NonNullable<LayoutStyle["flexWrap"]>, Wrap> = {
  nowrap: Wrap.NoWrap,
  wrap: Wrap.Wrap,
  "wrap-reverse": Wrap.WrapReverse,
}

export const POSITION: Record<
  NonNullable<LayoutStyle["position"]>,
  PositionType
> = {
  absolute: PositionType.Absolute,
  relative: PositionType.Relative,
  static: PositionType.Static,
}

export const OVERFLOW: Record<
  NonNullable<LayoutStyle["overflow"]>,
  Overflow
> = {
  visible: Overflow.Visible,
  hidden: Overflow.Hidden,
  scroll: Overflow.Scroll,
}

export const DISPLAY: Record<NonNullable<LayoutStyle["display"]>, Display> = {
  none: Display.None,
  flex: Display.Flex,
}

export const MEASURE_MODE: Record<MeasureMode, MeasureConstraintMode> = {
  [MeasureMode.Undefined]: "undefined",
  [MeasureMode.Exactly]: "exactly",
  [MeasureMode.AtMost]: "at-most",
}

export const createYogaNode = (): YogaNode => Yoga.Node.create()
