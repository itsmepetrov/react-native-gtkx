# Pressable

**Backed by:** `View` + click/motion event controllers

Supported props:

- `onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn` /
  `onHoverOut`, `onFocus` / `onBlur`, `focusable`, `disabled`.
- A function-form `style` / `children` receiving `{ pressed, hovered,
focused }` (react-native-web's own state shape).
- Keyboard-operable: `focusable` defaults to `true` whenever `onPress` is set
  (react-native-web's rule), which puts the view in the GTK focus chain —
  Tab and the arrow keys reach it, and Enter/Space fire `onPress` as they do
  on web and Android.
- The `PressEvent` payload matches RN's shape (`locationX/Y` target-relative,
  `pageX/Y` window-relative, `identifier`, `target`, `force`, a monotonic
  `timestamp`, single-element `touches`/`changedTouches`).
- `hitSlop` and `pressRetentionOffset` each take a number or a per-edge
  object; the press rect defaults to RN's own `{ top: 20, left: 20, right:
20, bottom: 30 }` around the hit rect, and releasing outside it cancels
  rather than presses.

Differs from react-native:

- `hitSlop` cannot escape a clipping ancestor — a `ScrollView` viewport or
  any view with `overflow: "hidden"` — because GTK stops hit-testing at the
  clip; RN documents the identical limit on Android for the same reason.
- Hover fires from touch input as well as from a mouse (react-native-web
  filters that out; here a crossing event carries no device to filter on) —
  GTK also sends a matching leave when a touch sequence ends, so the stuck
  phantom hover the filter guards against does not arise; GTK's own `:hover`
  behaves the same way.

`Pressable` (and the `Touchable*` components built on it, below) spread
`PanResponder`'s `panHandlers` and participate in the same gesture responder
system `View` implements — see [View](view.md) for the shared negotiation,
termination and `hitSlop` rules, and [Gestures](../../gestures.md) for the
full model. `PanResponder` itself, and the `Animated` API these components
commonly drive, are documented in [APIs](../apis.md).
