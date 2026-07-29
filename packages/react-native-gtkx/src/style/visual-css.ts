// Compiles a VisualStyle into a GTK4 CSS declaration block (no selector).
// Pure module — the resulting string is registered as a class through an
// injected `css` function (see registry.ts / registry.gtkx.ts).
//
// GTK4 CSS is not web CSS. What this generator relies on:
// - background-color, border-*, border-radius (incl. per-corner), opacity,
//   color, font-*, letter-spacing: supported by GTK4;
// - line-height: supported since GTK 4.6 (we target 4.20+);
// - text-align does NOT exist in GTK CSS — textAlign is applied by the Text
//   component via widget properties (justify/xalign), so it is skipped here;
// - transform is applied by the layout engine via Fixed.Child matrices,
//   never through CSS, and is skipped here as well.

import type { VisualStyle } from "../contracts"
import { parseColor } from "./colors"
import { warnOnce } from "./dev-warning"

const px = (value: number): string => `${value}px`

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const pushColor = (
  declarations: string[],
  cssProperty: string,
  value: string,
  styleProperty: string,
): void => {
  const parsed = parseColor(value)
  if (parsed === null) {
    warnOnce(
      `invalid-color:${styleProperty}:${value}`,
      `[react-native-gtkx] Invalid color ${JSON.stringify(value)} in "${styleProperty}" — declaration dropped`,
    )
    return
  }
  declarations.push(`${cssProperty}: ${parsed};`)
}

const formatFontFamily = (family: string): string => {
  const trimmed = family.trim()
  if (/^(".*"|'.*')$/.test(trimmed)) {
    return trimmed
  }
  return /^[A-Za-z][\w-]*$/.test(trimmed)
    ? trimmed
    : `"${trimmed.replace(/"/g, '\\"')}"`
}

/**
 * Renders a VisualStyle as GTK CSS declarations (one per line, stable
 * order). Returns "" when the style produces no CSS (e.g. transform-only).
 */
export const visualStyleToCss = (visual: VisualStyle): string => {
  const decls: string[] = []

  if (visual.backgroundColor !== undefined) {
    pushColor(
      decls,
      "background-color",
      visual.backgroundColor,
      "backgroundColor",
    )
  }
  if (visual.opacity !== undefined) {
    decls.push(`opacity: ${clamp01(visual.opacity)};`)
  }

  // GTK defaults border-style to none — width alone renders nothing. An
  // explicit borderStyle wins (GTK4 CSS supports solid/dotted/dashed);
  // otherwise any positive border width turns the border on with "solid".
  const hasVisibleBorderWidth = [
    visual.borderWidth,
    visual.borderTopWidth,
    visual.borderRightWidth,
    visual.borderBottomWidth,
    visual.borderLeftWidth,
  ].some((width) => width !== undefined && width > 0)
  if (visual.borderStyle !== undefined) {
    decls.push(`border-style: ${visual.borderStyle};`)
  } else if (hasVisibleBorderWidth) {
    decls.push("border-style: solid;")
  }
  // Shorthands first, then per-side overrides so the sides win.
  if (visual.borderWidth !== undefined) {
    decls.push(`border-width: ${px(visual.borderWidth)};`)
  }
  if (visual.borderTopWidth !== undefined) {
    decls.push(`border-top-width: ${px(visual.borderTopWidth)};`)
  }
  if (visual.borderRightWidth !== undefined) {
    decls.push(`border-right-width: ${px(visual.borderRightWidth)};`)
  }
  if (visual.borderBottomWidth !== undefined) {
    decls.push(`border-bottom-width: ${px(visual.borderBottomWidth)};`)
  }
  if (visual.borderLeftWidth !== undefined) {
    decls.push(`border-left-width: ${px(visual.borderLeftWidth)};`)
  }
  if (visual.borderColor !== undefined) {
    pushColor(decls, "border-color", visual.borderColor, "borderColor")
  }
  if (visual.borderTopColor !== undefined) {
    pushColor(
      decls,
      "border-top-color",
      visual.borderTopColor,
      "borderTopColor",
    )
  }
  if (visual.borderRightColor !== undefined) {
    pushColor(
      decls,
      "border-right-color",
      visual.borderRightColor,
      "borderRightColor",
    )
  }
  if (visual.borderBottomColor !== undefined) {
    pushColor(
      decls,
      "border-bottom-color",
      visual.borderBottomColor,
      "borderBottomColor",
    )
  }
  if (visual.borderLeftColor !== undefined) {
    pushColor(
      decls,
      "border-left-color",
      visual.borderLeftColor,
      "borderLeftColor",
    )
  }
  if (visual.borderRadius !== undefined) {
    decls.push(`border-radius: ${px(visual.borderRadius)};`)
  }
  // Per-corner radii come after the shorthand so they override it.
  if (visual.borderTopLeftRadius !== undefined) {
    decls.push(`border-top-left-radius: ${px(visual.borderTopLeftRadius)};`)
  }
  if (visual.borderTopRightRadius !== undefined) {
    decls.push(`border-top-right-radius: ${px(visual.borderTopRightRadius)};`)
  }
  if (visual.borderBottomRightRadius !== undefined) {
    decls.push(
      `border-bottom-right-radius: ${px(visual.borderBottomRightRadius)};`,
    )
  }
  if (visual.borderBottomLeftRadius !== undefined) {
    decls.push(
      `border-bottom-left-radius: ${px(visual.borderBottomLeftRadius)};`,
    )
  }

  if (visual.color !== undefined) {
    pushColor(decls, "color", visual.color, "color")
  }
  if (visual.fontFamily !== undefined) {
    decls.push(`font-family: ${formatFontFamily(visual.fontFamily)};`)
  }
  if (visual.fontSize !== undefined) {
    decls.push(`font-size: ${px(visual.fontSize)};`)
  }
  if (visual.fontStyle !== undefined) {
    decls.push(`font-style: ${visual.fontStyle};`)
  }
  if (visual.fontWeight !== undefined) {
    decls.push(`font-weight: ${visual.fontWeight};`)
  }
  if (visual.letterSpacing !== undefined) {
    decls.push(`letter-spacing: ${px(visual.letterSpacing)};`)
  }
  if (visual.lineHeight !== undefined) {
    decls.push(`line-height: ${px(visual.lineHeight)};`)
  }

  // visual.textAlign, visual.transform: intentionally not CSS (see header).

  return decls.join("\n")
}
