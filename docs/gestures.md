# Gestures

React Native's own gesture model runs here: the Gesture Responder System,
`PanResponder`, `View`'s touch props and `Pressable`. It is reimplemented in
JavaScript on top of GTK4 event controllers, so the source you write is
ordinary `react-native` and the same file runs on iOS and Android.

`react-native-reanimated` **does** work here — as
[`react-native-gtkx/reanimated`](api.md#react-native-reanimated-react-native-gtkxreanimated),
a reimplementation of its semantics on one runtime, aliased onto the package
name. `react-native-gesture-handler` does not: its package name is aliased to
a shim so that a ported app's root `GestureHandlerRootView` needs no edit, but
that is the only symbol it implements. RNGH is now the platform's largest
single portability gap on its own, and libraries needing `GestureDetector`
stay blocked on it — see [Porting an app](#porting-an-app) below.

Why the responder system rather than RNGH, and every measurement behind the
decisions on this page:
[docs/research/gestures.md](research/gestures.md).

## Three layers, in the order to reach for them

**1. `Pressable`** — taps, long presses, hover and keyboard activation. It is
not built on the responder system, it takes no negotiation, and it is what
almost every interaction actually needs.

```tsx
<Pressable
  onPress={open}
  onLongPress={showMenu}
  hitSlop={8}
  style={({ pressed, hovered, focused }) => [
    styles.row,
    hovered && styles.rowHovered,
    pressed && styles.rowPressed,
    focused && styles.rowFocused,
  ]}
>
  <Text>Open</Text>
</Pressable>
```

`hitSlop` widens the target without changing the layout; `pressRetentionOffset`
sets how far the pointer may drift after pressing and still activate on
release (RN's default rect, `{top: 20, left: 20, right: 20, bottom: 30}`, is
already generous). A release outside that rect is a cancel — dragging off a
control to change your mind works the way it does everywhere else.

**2. The responder system and `PanResponder`** — drags, pans, swipes, and
anything that needs to decide _which_ view owns an interaction.

```tsx
const pan = useRef(new Animated.ValueXY()).current
const responder = useRef(
  PanResponder.create({
    // Claim on press, or wait for movement — the choice matters, see
    // "Claiming on press versus on move" below.
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 8,
    onPanResponderMove: (_event, gesture) => {
      pan.setValue({ x: gesture.dx, y: gesture.dy })
    },
    onPanResponderRelease: () => {
      // The continuing-drag idiom: fold where it ended into the offset so
      // the next gesture's dx starts from zero instead of snapping back.
      pan.extractOffset()
      pan.setValue({ x: 0, y: 0 })
    },
  }),
).current

return (
  <Animated.View
    {...responder.panHandlers}
    style={{ transform: pan.getTranslateTransform() }}
  />
)
```

Responder and touch props go on `View` and `Animated.View`. Spreading
`panHandlers` onto anything else compiles and does nothing, which is worth
knowing because the idiomatic drag target is `Animated.View`.

`PanResponder` here is react-native's own file, vendored unmodified, running
against a reproduction of RN's `touchHistory` store — so `dx`/`dy`/`vx`/`vy`
and the clustered-touch maths are upstream's, not a reimplementation.

**3. GTK event controllers** — anything GTK does that React Native has no
word for. Drag-and-drop with real drag icons and content negotiation, zoom
and rotate gestures, keyboard shortcut controllers. This is a Linux-only
escape hatch and the import says so:

```tsx
import { Controllers, GtkDragSource } from "react-native-gtkx/gtk"

;<Pressable onPress={open}>
  <Controllers>
    <GtkDragSource
      actions={Gdk.DragAction.MOVE}
      onPrepare={prepare}
    />
  </Controllers>
  <Text>{task.title}</Text>
</Pressable>
```

See [the platform layer](platform-layer.md). For drag-and-drop of any
shape, including a reorderable list,
[`react-native-gtkx/dnd`](api.md#drag-and-drop-react-native-gtkxdnd) already
wraps this.

## How the negotiation works

One interaction lock for the whole process, as in RN. On a press, the
`*ShouldSetResponderCapture` handlers run from the root down and the
`*ShouldSetResponder` handlers from the target up; the first to return `true`
wins. While the pointer is down the lock can move **upwards** — an ancestor
that returns `true` from `onMoveShouldSetResponder` takes it, provided the
current holder does not refuse with `onResponderTerminationRequest`. A
descendant can never take it from an ancestor.

The negotiation path stops at the layout root. A React Native tree here can
be an island inside a native GTK widget tree, so native widgets above or
between views simply take no part.

### Claiming on press versus on move

Claiming on press (`onStartShouldSetPanResponder`) tells GTK the interaction
is yours before anything else can compete for it. Claiming on movement is the
more common shape and is slightly weaker: inside a scrolling list on a
touchscreen, the scroller can take the first few pixels before your threshold
is reached. Claim on press when the view is unambiguously a drag handle.

## Where this differs from React Native

The full reasoning for each is in
[docs/research/gestures.md](research/gestures.md); the short version:

**Terminations mostly cannot be refused.** In React Native and
react-native-web, `onResponderTerminationRequest` is consulted for a context
menu, an ancestor scroll and a selection change. Here it is consulted in
exactly two situations — a transfer to an ancestor, and an enclosing
`ScrollView` scrolling. Everything else (a second mouse button, a native
widget or a `GtkDragSource` taking the sequence, text selection) reaches JS
only _after_ GTK has already taken the interaction away, and GTK's claim
cannot be given back. Those arrive as `onResponderTerminate` with no question
asked. Window blur also terminates unconditionally, which is RN's behaviour
too.

**One pointer.** A mouse is one fabricated touch; `touches` never has more
than one entry, and multi-finger `gestureState` is single-touch. Pinch and
rotate are not available through the portable API — use `GtkGestureZoom` /
`GtkGestureRotate` through `Controllers` if you need them on Linux.

**ScrollView arbitration is touch-only.** All four gestures
`GtkScrolledWindow` runs internally are touch-only, so under a mouse a child
pan never competes with scrolling at all. On touch, a view that takes the
responder suspends the enclosing scroller for the rest of the interaction
(RN's `setIsJSResponder`). Scrolling with a **wheel** during a gesture is not
suppressed — it terminates the responder instead, which is react-native-web's
rule for an ancestor scroll.

**Hover fires from touch.** react-native-web filters hover events that come
from a finger; GTK crossing events carry no device to filter on, GTK sends a
matching leave when a touch ends so no phantom hover sticks, and GTK's own
`:hover` behaves the same way. Filtering here would make `Pressable` the odd
widget out in its own window.

**`hitSlop` stops at a clip.** GTK stops picking at a clipping ancestor, so
slop cannot escape a `ScrollView` viewport — the same limit RN documents on
Android.

**No `Animated.event`.** Write the value directly
(`pan.setValue({x: gesture.dx, y: gesture.dy})`), which is what it would do.

## Porting an app

`react-native-gesture-handler` is not implemented.
`react-native-reanimated` now is — as
[`react-native-gtkx/reanimated`](api.md#react-native-reanimated-react-native-gtkxreanimated),
a reimplementation of its semantics on one runtime, aliased onto the package
name by both presets. That removes the _import_-time failure Reanimated used
to cause, but it does not by itself unblock the libraries that were blocked
by it: `react-native-draggable-flatlist`, `@gorhom/bottom-sheet` and
`@react-navigation/drawer` all need `GestureDetector` as well, and that is
still RNGH's.

`react-native-gesture-handler`'s package name _is_ aliased, onto
[`react-native-gtkx/gesture-handler`](api.md#react-native-gesture-handler-react-native-gtkxgesture-handler):
`GestureHandlerRootView` is implemented faithfully, because it is the one
RNGH symbol that shows up in apps using none of the rest of it, and every
other export throws where it is used rather than silently doing nothing.

What to do instead:

- a **drag** — `PanResponder` plus `Animated.ValueXY`, as above. Portable,
  and it is what most RNGH usage in the wild amounts to;
- **drag and drop between zones, or a sortable list** —
  [`react-native-gtkx/dnd`](api.md#drag-and-drop-react-native-gtkxdnd)
  mirrors `react-native-reanimated-dnd`'s API on GTK's own drag-and-drop,
  and both presets alias that package name onto it;
- **swipeable rows / bottom sheets** — by hand today: `PanResponder` for the
  gesture, plus either `Animated` or
  [`react-native-gtkx/reanimated`](api.md#react-native-reanimated-react-native-gtkxreanimated)
  for the motion.

`examples/gallery`'s Gestures section is a working reference written entirely
in portable `react-native`, with no platform-layer import in it at all.
