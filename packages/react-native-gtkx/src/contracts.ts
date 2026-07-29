// Shared contracts between the layout engine (task 004), the style system
// (task 005), the API modules (task 007) and components (task 006).
// FROZEN during parallel development: changes go through the orchestrator only.

// --- style ------------------------------------------------------------------

export type DimensionValue = number | `${number}%` | "auto"

export type FlexAlignType =
  "flex-start" | "flex-end" | "center" | "stretch" | "baseline"

// Layout-affecting props: classified by the style system (005), consumed by
// the layout engine (004) which maps them onto Yoga node setters.
export type LayoutStyle = Partial<{
  alignContent:
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "space-between"
    | "space-around"
  alignItems: FlexAlignType
  alignSelf: "auto" | FlexAlignType
  aspectRatio: number | string
  bottom: DimensionValue
  columnGap: number
  direction: "inherit" | "ltr" | "rtl"
  display: "none" | "flex"
  flex: number
  flexBasis: DimensionValue
  flexDirection: "row" | "row-reverse" | "column" | "column-reverse"
  flexGrow: number
  flexShrink: number
  flexWrap: "wrap" | "nowrap" | "wrap-reverse"
  gap: number
  height: DimensionValue
  justifyContent:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly"
  left: DimensionValue
  margin: DimensionValue
  marginBottom: DimensionValue
  marginHorizontal: DimensionValue
  marginLeft: DimensionValue
  marginRight: DimensionValue
  marginTop: DimensionValue
  marginVertical: DimensionValue
  maxHeight: DimensionValue
  maxWidth: DimensionValue
  minHeight: DimensionValue
  minWidth: DimensionValue
  overflow: "visible" | "hidden" | "scroll"
  padding: DimensionValue
  paddingBottom: DimensionValue
  paddingHorizontal: DimensionValue
  paddingLeft: DimensionValue
  paddingRight: DimensionValue
  paddingTop: DimensionValue
  paddingVertical: DimensionValue
  position: "absolute" | "relative" | "static"
  right: DimensionValue
  rowGap: number
  top: DimensionValue
  width: DimensionValue
}>

export type TransformPart =
  | { translateX: number }
  | { translateY: number }
  | { scale: number }
  | { scaleX: number }
  | { scaleY: number }
  | { rotate: `${number}deg` | `${number}rad` }

// Visual props: classified by the style system (005), compiled into GTK CSS
// classes via the bridge `css` helper. Text-specific props apply to <Text>.
export type VisualStyle = Partial<{
  backgroundColor: string
  borderBottomColor: string
  borderBottomLeftRadius: number
  borderBottomRightRadius: number
  borderBottomWidth: number
  borderColor: string
  borderLeftColor: string
  borderLeftWidth: number
  borderRadius: number
  borderRightColor: string
  borderRightWidth: number
  borderStyle: "solid" | "dotted" | "dashed"
  borderTopColor: string
  borderTopLeftRadius: number
  borderTopRightRadius: number
  borderTopWidth: number
  borderWidth: number
  color: string
  fontFamily: string
  fontSize: number
  fontStyle: "normal" | "italic"
  fontWeight:
    | "normal"
    | "bold"
    | "100"
    | "200"
    | "300"
    | "400"
    | "500"
    | "600"
    | "700"
    | "800"
    | "900"
  letterSpacing: number
  lineHeight: number
  opacity: number
  // NOT emitted to CSS (no such GTK CSS property): the Text component (006)
  // applies it via label props using the pure style/text-align helper.
  textAlign: "auto" | "left" | "right" | "center" | "justify"
  // NOT emitted to CSS: applied by the engine through the layout manager
  // layout-child transforms (Animated fast path).
  transform: TransformPart[]
}>

export type FlatStyle = LayoutStyle & VisualStyle

// Style prop as components accept it: single object, array (with falsy holes).
export type StyleProp<T = FlatStyle> =
  T | null | undefined | false | ReadonlyArray<StyleProp<T>>

// Result of classifying a flattened style (produced by 005):
export type SplitStyle = {
  layout: LayoutStyle
  visual: VisualStyle
}

// --- layout engine ----------------------------------------------------------

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type MeasureConstraintMode = "undefined" | "exactly" | "at-most"

export type MeasureSize = { width: number; height: number }

// Measure callback for leaf nodes (text, images): implemented by components
// using bridge probes; called by the engine during Yoga layout passes.
export type MeasureFn = (
  width: number,
  widthMode: MeasureConstraintMode,
  height: number,
  heightMode: MeasureConstraintMode,
) => MeasureSize

// Handle the engine gives every mounted component (004 implements, 006 consumes).
export interface LayoutNodeApi {
  setStyle(style: LayoutStyle): void
  setMeasureFn(measure: MeasureFn | null): void
  markDirty(): void
  getRect(): Rect | null
  setOnLayout(callback: ((rect: Rect) => void) | null): void
}

// --- subscriptions (007) ----------------------------------------------------

export type SubscriptionHandle = { remove(): void }
