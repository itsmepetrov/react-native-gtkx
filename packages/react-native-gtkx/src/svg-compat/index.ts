// react-native-svg compatibility subpath (by the same pattern as
// react-native-gtkx/navigation): re-exports our SVG component set in the
// shape portable code expects — `Svg` as both the default and a named
// export, everything else named — once an app aliases the bare
// react-native-svg package name to this subpath. See the alias the metro/
// vite presets add automatically (packages/react-native-gtkx/src/metro/
// index.ts, src/vite/index.ts), or a manual bundler alias for apps using
// neither. The upstream package itself is never a dependency of this one;
// nothing here imports it — this module only mirrors its export shape.
//
// Deliberate gaps against react-native-svg's full surface (see docs/api.md
// "Svg" for the complete list and the reasoning): no SvgXml/SvgUri (SVG
// files already load through Image, a different mechanism), no Text/
// TSpan/TextPath, no Mask/ClipPath/Filter/Marker/Symbol/Use/Pattern.
export {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Svg,
  Svg as default,
  type AnimatableNumber,
  type CircleProps,
  type DefsProps,
  type EllipseProps,
  type GProps,
  type LinearGradientProps,
  type LineProps,
  type PathProps,
  type PolygonProps,
  type PolylineProps,
  type RadialGradientProps,
  type RectProps,
  type StopProps,
  type SvgFillRule,
  type SvgLineCap,
  type SvgLineJoin,
  type SvgProps,
} from "../components/svg/index"
