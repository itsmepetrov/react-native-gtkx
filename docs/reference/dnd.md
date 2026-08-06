# Drag and drop (`react-native-gtkx/dnd`)

A mirror of
[`react-native-reanimated-dnd`](https://github.com/entropyconquers/react-native-reanimated-dnd)'s
API, implemented on `GtkDragSource`/`GtkDropTarget` — native GTK
drag-and-drop rather than a gesture animated by JavaScript. Both the
`react-native-gtkx/metro` and `react-native-gtkx/vite` presets alias the bare
`react-native-reanimated-dnd` package name onto this subpath automatically,
exactly as they do `react-native-svg` (see [svg.md](svg.md)), so an app that
already does drag-and-drop keeps its source unchanged:

```tsx
import { Draggable, Droppable, DropProvider } from "react-native-reanimated-dnd"
```

A ported app's one other import, `<GestureHandlerRootView>` — present
because upstream's quick start puts it at the root — is covered too:
`react-native-gesture-handler` is aliased to
[`react-native-gtkx/gesture-handler`](gesture-handler.md), a shim that
implements that root faithfully and makes every other RNGH export throw
where it is used.

## Why a mirror, not the library

`react-native-reanimated-dnd` cannot run on this platform as published.
Reanimated 4, `react-native-worklets` and `react-native-gesture-handler` are
imported at module scope in twelve of its files, its sort algorithm lives
inside a `useAnimatedReaction` worklet, its row layout inside a
`useAnimatedStyle`, and its public types are written in `SharedValue<T>`.
This subpath re-implements the same API surface as plain functions and
components over real GTK widgets instead.

## Opting out of the mirror

Once the gesture-handler and Reanimated-compatible surfaces exist as their
own shims, the real `react-native-reanimated-dnd` package can run on top of
them unmodified. An app can choose that instead of the mirror with a bundler
alias override (`aliases: { "react-native-reanimated-dnd": false }`), which
falls through to upstream's own implementation. See
[reanimated-compat.md](reanimated-compat.md) for what the Reanimated surface
underneath it provides.

## One drag-and-drop API, two shapes

- **Porting an app that already uses `react-native-reanimated-dnd`** —
  nothing changes. Both presets alias the package name; the imports stay as
  they are.
- **Writing a new app** — import from `react-native-gtkx/dnd` directly. Same
  names, same props, so the code reads correctly to anyone who knows the
  library.
- **Reordering by row id rather than by array index** — a `Droppable` around
  a `Draggable` per row, inside one `DropProvider`, is the right shape when a
  store owns the order, filters it and sorts it. `Sortable` owns an array and
  reports positions, which fits when the component itself owns the order.

`List`/`ListRow` are not part of `react-native-gtkx/common`'s export
surface — that would have been Adwaita's list appearance written in React
Native, an app's own concern, with its own id-keyed reorder bundled in. An
app that wants id-keyed reordering combines `Droppable` and `Draggable` per
row instead, as above. See
[platform-layer.md](../platform-layer.md#listlistrowlistseparator-were-here-and-are-not-any-more).

## The exported surface

- **`DropProvider`** — Scopes a set of draggables and droppables. Renders
  a `View` — upstream renders a fragment — because `onDragging` needs a
  widget to attach to. Its `ref` gives `getDroppedItems()` and
  `requestPositionUpdate()`.
- **`Draggable`, `DraggableHandle`, `useDraggable`** — The drag source.
  With a handle, the `GtkDragSource` attaches to the handle's widget only,
  so the rest of the item stays pressable.
- **`Droppable`, `useDroppable`** — The drop target. `capacity` is
  enforced in GDK's `::accept`, so a full zone shows the no-drop cursor.
- **`Sortable`, `SortableItem`, `useSortable`, `useSortableList`,
  `useHorizontalSortable`, `useHorizontalSortableList`** — Drag-to-reorder,
  vertical by default or horizontal (`direction="horizontal"`). The
  component owns the order — upstream's own contract — read the settled
  one from `onDrop`'s `allPositions`.
- **`SortableGrid`, `SortableGridItem`, `useGridSortable`,
  `useGridSortableList`** — The 2-D sibling: cells reorder the same way, in
  a real Yoga `flexWrap` grid rather than upstream's absolutely-positioned
  cells. There is no list-level `onMove`/`onDragStart`/`onDrop`/
  `onDragging` here, matching upstream's own `SortableGridProps` — wire
  those on each `SortableGridItem` instead.
- **`DraggableState`, `ScrollDirection`, `SortableDirection`,
  `HorizontalScrollDirection`, `GridOrientation`, `GridStrategy`,
  `GridScrollDirection`** — The enums, unchanged from upstream.
- **`clamp`, `listToObject`, `objectMove`** — The list-order utilities, as
  plain functions rather than worklets.
- **`calculateGridPosition`, `calculateIndexFromRowColumn`,
  `listToGridObject`, `getGridCellFromCoordinates`, `reorderGridInsert`,
  `reorderGridSwap`, `calculateGridContentDimensions`,
  `findItemIdAtIndex`** — The grid utilities, same reasoning: plain
  functions, not worklets. `getGridCellFromCoordinates` floors onto the
  cell whose top-left corner is at or before the point, exactly matching
  upstream's own behaviour.
- **`SharedValueLike<T>`** — What `SharedValue<T>` degrades to: `{ value:
T }`, without the worklet crossing. Reads and writes work; they just do
  not animate.

Deliberately not re-exported: `setPosition`, `setAutoScroll`,
`setGridPosition`, `setGridAutoScroll`. Upstream exports these as worklet
helpers that mutate a `SharedValue` mid-gesture, driven by a UI-thread
gesture that does not exist here — there is nothing for them to drive. An
app that imports one of these directly was reaching into upstream's
internals; the build failing at that import is the intended outcome.

## Differs from react-native-reanimated-dnd

The dragged view never moves. GDK carries a `Gtk.WidgetPaintable` of it above
every window, with the theme's own cursors and hit-testing against the real
widget tree — including widgets React Native never created. Everything below
follows from that one fact.

### The drag layer

A dragged `Draggable`/`SortableItem` escapes any `overflow: hidden` ancestor
automatically — not a prop, the same way GDK's own drag icon is not one.
GDK's icon already escapes any clip in this process's own tree (it is a
compositor surface, not a descendant of anything here), but that is only a
cue at the cursor this process cannot introspect. While a drag is in flight,
a second, non-interactive `Gtk.Picture` showing a live `Gtk.WidgetPaintable`
of the dragged row is added to a `Gtk.Overlay` wrapped once around each
window's real content, escaping every ancestor's clip the same way any
`Overlay` child does.

The original view dims to reduced opacity for the drag's duration — restored
to whatever it was, not hardcoded — rather than disappearing, the same
pattern `react-native-draggable-flatlist`'s `activeOpacity` and similar
libraries use. Because a `Gtk.WidgetPaintable` is a live view of the widget
it observes, GDK's own drag icon and this overlay copy dim along with the
original — the three are one underlying render.

The dragged widget itself is never reparented into the overlay: a 100×100
card would render at 800×600 under a new parent's own size negotiation, and
an unmount mid-drag would strand the widget outside the tree React still
owns. The overlay copy takes no input (`can-target: false`); neither
hit-testing nor the responder path changes, both still resolve against the
original widget unchanged. See [gestures.md](../gestures.md) for the
responder path itself.

Zero React renders happen per frame: positioning the overlay copy is two
widget property writes (`setMarginStart`/`setMarginTop`) per motion event,
about 1.76 µs median.

### Prop-by-prop

- **`preDragDelay`** — Accepted, ignored. GDK's `gtk-dnd-drag-threshold`
  already separates a tap from a drag.
- **`collisionAlgorithm`** — Accepted, ignored. GDK hit-tests the pointer
  directly; `"center"` is the closest of the three algorithms to that.
- **`requestPositionUpdate()`** — A no-op. Nothing caches a slot
  rectangle, because GDK re-hit-tests every motion event.
- **`onLayoutUpdateComplete`** — Accepted, ignored — there is no layout
  pass to complete.
- **`itemHeight`, `estimatedItemHeight`, `enableDynamicHeights`,
  `useFlatList`, `containerHeight`, `containerWidth`** — Accepted, ignored.
  Yoga lays rows out at their natural height, and the mirror's own
  `ScrollView` measures its own viewport for autoscroll rather than
  trusting a hint.
- **`dragAxis`, `dragBoundsRef`, `animationFunction`** — **Unsupported.**
  All three describe where the dragged view goes, and it never goes
  anywhere here. Kept in the type so a file shared with iOS and Android
  still compiles.
- **`dropAlignment`, `dropOffset`** — **Unsupported**, same reason.
- **`positions`, `lowerBound`/`leftBound`,
  `autoScrollDirection`/`autoScrollHorizontalDirection`, `itemHeights`** —
  Real `{ value }` boxes (`SharedValueLike`), not `SharedValue`.
  Forwarding them with `{...rest}` works, reads work;
  `autoScrollDirection`/`autoScrollHorizontalDirection` are genuinely
  written by the built-in autoscroll (below), the rest do not animate.
- **`SortableDirection.Horizontal`, `useHorizontalSortable`,
  `useHorizontalSortableList`** — Implemented. Reorder-by-crossing does
  not care which axis a list scrolls along — the tracked position reads
  whichever coordinate the axis cares about — so this is
  `Sortable`/`useSortable`'s own machinery with a horizontal `ScrollView`
  and `leftBound`/`autoScrollHorizontalDirection` plumbing, not a second
  implementation. `gap`/`paddingHorizontal` are real Yoga layout on the
  content container, not hints.
- **`SortableGrid`, `SortableGridItem`, `useGridSortable`,
  `useGridSortableList`** — Implemented. The grid is a real Yoga
  `flexWrap` layout — fixed-size cells, a fixed cross-axis dimension
  (`columns`/`rows` × `itemWidth`/`itemHeight`) — rather than upstream's
  absolutely-positioned cells at a `useAnimatedStyle`-computed `top`/
  `left`; the same row/column arithmetic (`calculateGridPosition`) places
  them, a different engine paints it. `getGridCellFromCoordinates` floors
  onto the cell whose top-left corner is at or before a point, exactly
  matching upstream. `SortableGridItem`'s `isBeingRemoved` removal
  animation is accepted and ignored, same reason as `animationFunction`
  above. `scrollEnabled` is accepted and ignored too — this platform's
  `ScrollView` has no prop to disable input the way upstream's does.
- **Autoscroll near a container edge during a drag** — Implemented for
  `Sortable` and `SortableGrid`: a `GtkDropControllerMotion` on the list's
  own viewport reports how close the drag sits to an edge, and a
  `Gtk.Widget` tick callback nudges the real `GtkAdjustment` toward it for
  as long as it stays there — an imperative per-frame write, no React
  render either way. One difference from upstream: the scroll runs at a
  constant speed while the edge band is occupied, rather than easing into
  a 1500ms glide, because there is no timing engine here to ease with. Not
  wired into the standalone
  `useSortableList`/`useHorizontalSortableList`/`useGridSortableList`
  hooks, which build no `ScrollView` of their own to drive.
- **Sortable list height** — Rows are in flow layout, so the list is as
  tall as its rows, not `itemsCount × itemHeight`.

## Reorder feel: how a crossing resolves

`Sortable`/`SortableGrid` track the dragged item's own rect the same way
upstream does — `fromIndex * slotSize` plus the pointer's delta since the
drag began, reusing the same `GtkDropControllerMotion` the edge-autoscroll
above already watches every motion event with.

Differs from react-native-reanimated-dnd: this mirror resolves which slot
the item has landed on by rounding that tracked position rather than
flooring it — the dragged item's centre against a slot's centre, not its
top-left corner against the slot's origin — symmetrically in both
directions. Measured with a real pointer, a 100px row or cell needs about
50–60px of travel either way — away from index 0 or toward it, a centre grab
or an edge grab — before the crossing resolves.

The real, unaliased `react-native-reanimated-dnd` package's own arithmetic
floors the dragged rect onto a slot boundary from its top-left corner
instead: crossing a neighbour toward index 0 takes about one pixel of
travel there, crossing one away from it takes the neighbour's entire size in
that axis. That asymmetry is upstream's own behaviour, reproduced unchanged
when an app opts out of the mirror and runs the real package — not a
compat-surface distortion this platform introduces.

The origin the tracking measures against is the drag's own grab point,
converted to the list's container coordinates — never the first motion
sample after a drag begins, since under fast pointer motion that sample can
already be displaced past GDK's own drag-start threshold, which would
silently undercount every reading taken from it. The change is scoped to
`Sortable`/`SortableGrid`'s own reorder mechanism; `Draggable`/`Droppable`'s
drop-zone hit-testing is untouched and still GDK's own — `collisionAlgorithm`
stays accepted-and-ignored there, as above.

Per-motion-event cost of the tracking arithmetic itself is about 0.003 µs
median (settling from about 0.01 µs on the first JIT round) — pure
arithmetic, no FFI hop — next to the drag layer's own roughly 1.76 µs for
its two real GTK property writes per motion event.
