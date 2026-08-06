# Text

**Profile:** GTK · **Backed by:** `GtkLabel` (Pango)

Supported props: wrapping, `numberOfLines` (end ellipsis), `textAlign`,
font styles, `onLayout`, `testID`, and a ref exposing the geometry methods
(`TextHandle` — a label needs no wrapping `View` to be measurable).

Differs from react-native:

- Nested `Text` elements are concatenated without per-span styling.
- Text is always ellipsizable — it shrinks in a narrow window rather than
  overflowing.
