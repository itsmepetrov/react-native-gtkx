// textDecorationLine, classified. Pure module — no bridge imports.
//
// GTK4 CSS has no `text-decoration` for widgets, the same way it has no
// `text-align`: both are Pango's business, not the style sheet's. So this
// follows text-align.ts's shape exactly — the style system decides WHAT is
// wanted, and the Text component applies it through the label's Pango
// attribute list.

import type { TextDecorationLine } from "../contracts"

export type TextDecorations = {
  underline: boolean
  strikethrough: boolean
}

/**
 * Splits RN's `textDecorationLine` into the two Pango attributes that carry
 * it. `"none"` and `undefined` produce neither, which is what lets the caller
 * skip building an attribute list at all.
 *
 * RN's `"underline line-through"` is the combined value; the words are
 * matched individually so the reversed spelling behaves the same, as it does
 * in CSS.
 */
export const textDecorationToAttrs = (
  value: TextDecorationLine | undefined,
): TextDecorations => {
  if (value === undefined || value === "none") {
    return { underline: false, strikethrough: false }
  }
  return {
    underline: value.includes("underline"),
    strikethrough: value.includes("line-through"),
  }
}
