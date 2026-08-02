// Classifies a flattened style into layout props (consumed by the Yoga
// engine) and visual props (compiled into GTK CSS). Pure module.

import type {
  FlatStyle,
  LayoutStyle,
  SplitStyle,
  VisualStyle,
} from "../contracts"
import { warnOnce } from "./dev-warning"

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

// Note: `textDecorationLine` and `textAlign` are visual by contract but never
// reach CSS — Pango carries both, and the Text component applies them.
// Note: `transform` is visual by contract — it is applied as the
// GskTransform of the child's allocation, not through CSS, and is passed
// through here untouched.
const VISUAL_KEYS: Record<keyof VisualStyle, true> = {
  backgroundColor: true,
  boxShadow: true,
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
  outlineColor: true,
  outlineOffset: true,
  outlineStyle: true,
  outlineWidth: true,
  textAlign: true,
  textDecorationLine: true,
  transform: true,
}

// Behavioral props: supported, but by neither half of this pipeline. Since
// RN 0.71 `pointerEvents` may be written in a style and not only as a prop,
// and View reads it straight off the flattened style (components/view.tsx)
// to drive GTK picking — it never reaches Yoga and it has no CSS
// equivalent. So the splitter must CONSUME it silently: warning here told a
// user that working code was being ignored, on the very line where
// tests/gtk/components/pointer-events.gtk.test.tsx proves it is not.
//
// Exhaustive the same way the two buckets above are, but over what FlatStyle
// adds ON TOP of LayoutStyle and VisualStyle — that Omit makes the three
// records a partition of the contract, so a future fourth kind of style prop
// cannot be added to FlatStyle without failing compilation right here. That
// is exactly the drift this list suffered: `pointerEvents` was added to the
// contract and to View, and nothing forced anyone to classify it.
const BEHAVIORAL_KEYS: Record<
  keyof Omit<FlatStyle, keyof LayoutStyle | keyof VisualStyle>,
  true
> = {
  pointerEvents: true,
  // `zIndex` joined it for the same reason: it is neither a Yoga input nor a
  // CSS declaration, it is the container widget's paint and pick order
  // (gtkx/bridge/view-box.ts), and useLayoutChild pushes it there from the
  // flattened style.
  zIndex: true,
}

/**
 * Splits a flattened style into { layout, visual }. Behavioral props
 * (pointerEvents) belong to neither bucket and are consumed silently — the
 * component that owns the behavior reads them from the flattened style.
 * Unknown properties are ignored with a one-time dev warning per key;
 * undefined values are dropped.
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
    } else if (!Object.hasOwn(BEHAVIORAL_KEYS, key)) {
      warnOnce(
        `unknown-style-prop:${key}`,
        `[react-native-gtkx] Unknown style property "${key}" is not supported and will be ignored`,
      )
    }
  }
  return { layout, visual }
}
