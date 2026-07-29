// Style pipeline (task 005): StyleSheet → flatten → splitStyle →
// visualStyleToCss → memoized class registry.
//
// Everything exported here is pure (no bridge imports) and unit-testable on
// any OS. The production registry that talks to the gtkx `css` helper lives
// in ./registry.gtkx.ts and is imported directly by components (006).

export { parseColor, PlatformColor } from "./colors.js"
export { resetDevWarnings } from "./dev-warning.js"
export { createCssRegistry, type CssFn, type CssRegistry } from "./registry.js"
export { splitStyle } from "./split-style.js"
export {
  absoluteFill,
  absoluteFillObject,
  compose,
  create,
  flatten,
  hairlineWidth,
  StyleSheet,
} from "./style-sheet.js"
export {
  textAlignToLabelProps,
  type LabelAlignProps,
  type TextAlign,
} from "./text-align.js"
export { visualStyleToCss } from "./visual-css.js"
