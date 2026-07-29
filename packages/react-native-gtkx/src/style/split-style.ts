// Classifies a flattened style into layout props (consumed by the Yoga
// engine, task 004) and visual props (compiled into GTK CSS). Pure module.

import type {
  FlatStyle,
  LayoutStyle,
  SplitStyle,
  VisualStyle,
} from "../contracts.js"
import { warnOnce } from "./dev-warning.js"

// Exhaustive over the frozen contract: adding a key to LayoutStyle in
// contracts.ts fails compilation here until the key is classified.
const LAYOUT_KEYS: Record<keyof LayoutStyle, true> = {
  alignContent: true,
  alignItems: true,
  alignSelf: true,
  aspectRatio: true,
  bottom: true,
  columnGap: true,
  direction: true,
  display: true,
  flex: true,
  flexBasis: true,
  flexDirection: true,
  flexGrow: true,
  flexShrink: true,
  flexWrap: true,
  gap: true,
  height: true,
  justifyContent: true,
  left: true,
  margin: true,
  marginBottom: true,
  marginHorizontal: true,
  marginLeft: true,
  marginRight: true,
  marginTop: true,
  marginVertical: true,
  maxHeight: true,
  maxWidth: true,
  minHeight: true,
  minWidth: true,
  overflow: true,
  padding: true,
  paddingBottom: true,
  paddingHorizontal: true,
  paddingLeft: true,
  paddingRight: true,
  paddingTop: true,
  paddingVertical: true,
  position: true,
  right: true,
  rowGap: true,
  top: true,
  width: true,
}

// Note: `transform` is visual by contract — it is applied by the layout
// engine through Fixed.Child matrices, not through CSS, and is passed
// through here untouched.
const VISUAL_KEYS: Record<keyof VisualStyle, true> = {
  backgroundColor: true,
  borderBottomColor: true,
  borderBottomLeftRadius: true,
  borderBottomRightRadius: true,
  borderBottomWidth: true,
  borderColor: true,
  borderLeftColor: true,
  borderLeftWidth: true,
  borderRadius: true,
  borderRightColor: true,
  borderRightWidth: true,
  borderStyle: true,
  borderTopColor: true,
  borderTopLeftRadius: true,
  borderTopRightRadius: true,
  borderTopWidth: true,
  borderWidth: true,
  color: true,
  fontFamily: true,
  fontSize: true,
  fontStyle: true,
  fontWeight: true,
  letterSpacing: true,
  lineHeight: true,
  opacity: true,
  textAlign: true,
  transform: true,
}

/**
 * Splits a flattened style into { layout, visual }. Unknown properties are
 * ignored with a one-time dev warning per key; undefined values are dropped.
 */
export const splitStyle = (flat: FlatStyle): SplitStyle => {
  const layout: LayoutStyle = {}
  const visual: VisualStyle = {}
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined) {
      continue
    }
    if (Object.hasOwn(LAYOUT_KEYS, key)) {
      ;(layout as Record<string, unknown>)[key] = value
    } else if (Object.hasOwn(VISUAL_KEYS, key)) {
      ;(visual as Record<string, unknown>)[key] = value
    } else {
      warnOnce(
        `unknown-style-prop:${key}`,
        `[react-native-gtkx] Unknown style property "${key}" is not supported and will be ignored`,
      )
    }
  }
  return { layout, visual }
}
