# Modal

**Backed by:** a modal `GtkWindow` (a portal)

Supported props: `visible`, `onRequestClose` (Escape or the window's close
button), `title`, `width`/`height`; independently resizable, with relayout.

Differs from react-native:

- This is a real, separate desktop window rather than an overlay drawn above
  the current one.
- `transparent` and `animationType` are accepted and have no effect.

A `Modal` opens its own top-level window — reach for it whenever a screen
needs a dialog, a picker, or any content that should float above the main
window's chrome. `Alert`, the one other built-in dialog surface, is
documented in [APIs](../apis.md#alert).
