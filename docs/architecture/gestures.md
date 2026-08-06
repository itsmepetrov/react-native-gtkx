# Gestures

React Native's own gesture model runs here: the Gesture Responder System,
`PanResponder`, `View`'s touch props, and `Pressable`. It's reimplemented in
JavaScript on top of GTK4 event controllers, so the source written against
it is ordinary `react-native` — the same file runs unchanged on iOS and
Android.

`react-native-reanimated` works here too, as `react-native-gtkx/reanimated` —
a reimplementation of its semantics on this one runtime, aliased onto the
package name. So does `react-native-gesture-handler`, as
`react-native-gtkx/gesture-handler`, which implements
`GestureHandlerRootView`, `GestureDetector`, `Gesture.Pan()`, `Tap()`,
`LongPress()` and `Native()` (and `usePanGesture()`, the spelling upstream is
migrating to), the `Race`/`Simultaneous`/`Exclusive` composers, and the
cross-gesture relations, over the responder system this page describes. The
recognizers that remain — `Pinch`, `Rotation`, `Fling`, `Hover`, `Manual`,
`ForceTouch` — throw by name; see [Porting an app](#porting-an-app) below.
See the [Reference](../reference) for the full per-recognizer tables.

Every measurement behind the decisions on this page lives in
`docs/research/gestures.md` — repo-only working notes, not published here.

## Three layers, in the order to reach for them

**1. `Pressable`** — taps, long presses, hover and keyboard activation. It
isn't built on the responder system, it takes no negotiation, and it's what
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

`hitSlop` widens the target without changing layout; `pressRetentionOffset`
sets how far the pointer may drift after pressing and still activate on
release (RN's default rect, `{top: 20, left: 20, right: 20, bottom: 30}`, is
already generous). A release outside that rect cancels — dragging off a
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

Responder and touch props go on `View` and `Animated.View`; spreading
`panHandlers` onto anything else compiles and does nothing, which is worth
knowing because the idiomatic drag target is `Animated.View`.

`PanResponder` here is react-native's own file, vendored unmodified, running
against a reproduction of RN's `touchHistory` store — so `dx`/`dy`/`vx`/`vy`
and the clustered-touch maths are upstream's, not a reimplementation.

**3. GTK event controllers** — anything GTK does that React Native has no
word for: drag-and-drop with real drag icons and content negotiation, zoom
and rotate gestures, keyboard shortcut controllers. This is a Linux-only
escape hatch, and the import says so:

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

See [Window, navigation, and settings](integration) for `Controllers` in
full. For drag-and-drop of any shape, including a reorderable list,
`react-native-gtkx/dnd` (see the [Reference](../reference)) already wraps
this.

## How the negotiation works

One interaction lock for the whole process, as in RN. On a press, the
`*ShouldSetResponderCapture` handlers run from the root down and the
`*ShouldSetResponder` handlers from the target up; the first to return
`true` wins. While the pointer is down, the lock can move **upwards** — an
ancestor that returns `true` from `onMoveShouldSetResponder` takes it,
provided the current holder doesn't refuse with
`onResponderTerminationRequest`. A descendant can never take it from an
ancestor.

The negotiation path stops at the layout root. A React Native tree here can
be an island inside a native GTK widget tree, so native widgets above or
between views simply take no part.

### Claiming on press versus on move

Claiming on press (`onStartShouldSetPanResponder`) tells GTK the interaction
is yours before anything else can compete for it. Claiming on movement is
the more common shape, and slightly weaker: inside a scrolling list on a
touchscreen, the scroller can take the first few pixels before your
threshold is reached. Claim on press when the view is unambiguously a drag
handle.

## Where this differs from React Native

**Terminations mostly cannot be refused.** In React Native and
react-native-web, `onResponderTerminationRequest` is consulted for a context
menu, an ancestor scroll, and a selection change. Here it's consulted in
exactly two situations — a transfer to an ancestor, and an enclosing
`ScrollView` scrolling. Everything else (a second mouse button, a native
widget or a `GtkDragSource` taking the sequence, text selection) reaches JS
only _after_ GTK has already taken the interaction away, and GTK's claim
can't be given back — those arrive as `onResponderTerminate` with no
question asked. Window blur also terminates unconditionally, which is RN's
behavior too.

**One pointer.** A mouse is one fabricated touch; `touches` never has more
than one entry, and multi-finger `gestureState` is single-touch. Pinch and
rotate aren't available through the portable API — use `GtkGestureZoom` /
`GtkGestureRotate` through `Controllers` for them on Linux.

**ScrollView arbitration is touch-only.** All four gestures
`GtkScrolledWindow` runs internally are touch-only, so under a mouse a child
pan never competes with scrolling at all. On touch, a view that takes the
responder suspends the enclosing scroller for the rest of the interaction
(RN's `setIsJSResponder`). Scrolling with a **wheel** during a gesture isn't
suppressed — it terminates the responder instead, react-native-web's rule
for an ancestor scroll.

**Hover fires from touch.** react-native-web filters hover events coming
from a finger; GTK crossing events carry no device to filter on, GTK sends a
matching leave when a touch ends so no phantom hover sticks, and GTK's own
`:hover` behaves the same way. Filtering here would make `Pressable` the odd
widget out in its own window.

**`hitSlop` stops at a clip.** GTK stops picking at a clipping ancestor, so
slop can't escape a `ScrollView` viewport, or any view whose style says
`overflow: "hidden"` — the same limit RN documents on Android.

**No `Animated.event`.** Write the value directly
(`pan.setValue({x: gesture.dx, y: gesture.dy})`), which is what it would do
anyway.

## Porting an app

Both `react-native-reanimated` and `react-native-gesture-handler` are
aliased onto reimplementations by both bundler presets, so their imports
resolve and their `Pan` code runs unedited. What's implemented of RNGH is
`GestureHandlerRootView`, `GestureDetector`, `State`, `Pan`, `Tap`,
`LongPress` and `Native` in both spellings (`Gesture.Pan()` and
`usePanGesture()`, and so on), the `Race`/`Simultaneous`/`Exclusive`
composers and the cross-gesture relations (`simultaneousWithExternalGesture`,
`requireExternalGestureToFail`, `blocksExternalGesture` — arbitrated in a
second, JS-only registry over the responder lock, because the lock has one
holder by design and simultaneity is a set), plus the components it
re-exports from `react-native` — `ScrollView`, `FlatList`, `TextInput`,
`Switch`, `Pressable` and the three `Touchable`s.

What isn't implemented throws where it's used, naming itself, rather than
silently doing nothing:

- **`Pinch` and `Rotation`** — GTK feeds touchpad gestures properly, and
  nothing in this project's test rig can produce one, so they wait for a
  machine that can;
- **`Fling`, `Hover`, `Manual`, `ForceTouch`**, the legacy `*GestureHandler`
  components, and the button family (`RectButton` and friends — RNGH's own
  native button views, not RN components with a handler attached).

`react-native-draggable-flatlist` 4.0.3 and `@gorhom/bottom-sheet` 5.2.14
both run, and neither was stopped by this surface in the end: what they
needed was four `react-native` core exports (`findNodeHandle`, `LogBox`,
`Keyboard`, `VirtualizedList`) and Reanimated's `useAnimatedScrollHandler`,
all of which ship. This is verified by building both and driving them with a
real pointer, not by reading their imports — the probe app is
`spike/core-exports`; the Reference has the per-library detail.

What to do instead, where something is still missing:

- a **drag** — `PanResponder` plus `Animated.ValueXY`, as above. Portable,
  and what most RNGH usage in the wild amounts to;
- **drag and drop between zones, or a sortable list** —
  `react-native-gtkx/dnd` mirrors `react-native-reanimated-dnd`'s API on
  GTK's own drag-and-drop, and both presets alias that package name onto it;
- **swipeable rows** — by hand today: `PanResponder` for the gesture, plus
  either `Animated` or `react-native-gtkx/reanimated` for the motion. A
  **bottom sheet** no longer needs the hand-rolled version:
  `@gorhom/bottom-sheet` runs (see above), and `AdwBottomSheet` is the
  native one a Linux-first app reaches for instead.

`examples/gallery`'s Gestures section is a working reference written
entirely in portable `react-native`, with no platform-layer import in it at
all.

## Related

- [Overview](overview) — the widget and subpath structure `Controllers`
  and `GtkDragSource` sit inside.
- [Window, navigation, and settings](integration) — `Controllers` in full.
