// Style pipeline (task 005): StyleSheet → flatten → splitStyle →
// visualStyleToCss → memoized class registry.
//
// Everything exported here is pure (no bridge imports) and unit-testable on
// any OS. The production registry that talks to the gtkx `css` helper lives
// in ./registry.gtkx.ts and is imported directly by components (006).

export { parseColor, PlatformColor } from "./colors"
export { resetDevWarnings } from "./dev-warning"
export { createCssRegistry, type CssFn, type CssRegistry } from "./registry"
export { splitStyle } from "./split-style"
export {
  absoluteFill,
  absoluteFillObject,
  compose,
  create,
  flatten,
  hairlineWidth,
  StyleSheet,
} from "./style-sheet"
export {
  textAlignToLabelProps,
  type LabelAlignProps,
  type TextAlign,
} from "./text-align"
export { visualStyleToCss } from "./visual-css"
