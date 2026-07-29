// GTK4 CSS has no text-align property, so textAlign never reaches the CSS
// generator: the Text component (006) maps it onto GtkLabel properties with
// this pure helper (no bridge imports).
//
// - xalign positions the whole text block inside the label allocation;
// - justification aligns wrapped lines relative to each other (values match
//   Gtk.Justification: left/right/center/fill).

import type { VisualStyle } from "../contracts"

export type TextAlign = NonNullable<VisualStyle["textAlign"]>

export type LabelAlignProps = {
  xalign: number
  justification: "left" | "right" | "center" | "fill"
}

export const textAlignToLabelProps = (
  textAlign: TextAlign | undefined,
): LabelAlignProps => {
  switch (textAlign) {
    case "right":
      return { xalign: 1, justification: "right" }
    case "center":
      return { xalign: 0.5, justification: "center" }
    case "justify":
      return { xalign: 0, justification: "fill" }
    case "auto":
    case "left":
    case undefined:
      return { xalign: 0, justification: "left" }
  }
}
