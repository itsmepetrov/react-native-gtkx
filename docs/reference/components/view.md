# View

**Profile:** GTK · **Backed by:** `GtkBox` (a custom paintable box)

The container. Implements React Native's layout, paint, clipping and
hit-testing rules on a single GTK widget.

Supported props:

- `style`, `onLayout`, `testID`, children.
- `pointerEvents` — `auto` / `none` / `box-none` / `box-only`, mapped onto
  GTK picking (a can-target flag plus a `contains()` override). Also honored
  from `style.pointerEvents`, with the prop taking precedence.
- `focusable` plus `onFocus` / `onBlur` — off by default, as in RN.
- A ref exposing `measure` / `measureInWindow` / `measureLayout`
  (`ViewHandle`, RN's own argument order — window coordinates come from
  `gtk_widget_compute_point`, so they read correctly inside a scrolled
  viewport).
- The full responder and touch prop set —
  `onStartShouldSetResponder(Capture)`, `onMoveShouldSetResponder(Capture)`,
  `onResponderGrant/Start/Move/End/Release/Terminate`,
  `onTouchStart/Move/End/Cancel` plus `Capture`; `PanResponder`'s
  `panHandlers` spread here too. See [Gestures](../../gestures.md).

Differs from react-native:

- Input is single-pointer: a mouse is one fabricated touch, and `touches`
  never exceeds one.
- Responder negotiation is RN's model in full — capture-then-bubble,
  mid-gesture transfer through `onResponderTerminationRequest` /
  `onResponderReject`, one lock per process — but the negotiation path stops
  at the layout root, so native GTK widgets between or above views take no
  part in it.
- GTK settles most terminations before JS is consulted: a context menu, a
  native widget or `GtkDragSource` taking the sequence, and text selection
  all arrive as an already-cancelled gesture and terminate **without**
  consulting `onResponderTerminationRequest` — GTK's claim is irrevocable.
  Window blur terminates unconditionally (as on react-native-web). An
  enclosing `ScrollView` scrolling under the gesture is the one termination
  the responder may still refuse.
- `overflow: "hidden"` (and `"scroll"`, which clips identically) clips both
  the paint and the picking of children — including transformed ones and
  children an animation drives outside the box. `borderRadius` shapes that
  clip. A container never clips its own background, border, shadow or
  outline — only its children's.
