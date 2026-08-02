# Drag and drop: what an app that already has it should have to change

Research behind the drag-and-drop decision, 2026-08-01.

**Decision: mirror `react-native-reanimated-dnd`'s API in a new
`react-native-gtkx/dnd` subpath, implemented on `GtkDragSource` /
`GtkDropTarget`, and alias `react-native-reanimated-dnd` onto it in the
Metro and Vite presets — so an app that already uses that library changes
nothing in its source at all.**

> **Superseded on the one point below, 2026-08-02.** "Running the real library
> is not possible" was true of the surface that existed when this was written,
> and every wall it names has since shipped. The library was then installed
> unaliased and run:
> [upstream-libraries.md](upstream-libraries.md) — `Draggable`, `Droppable`,
> `DropProvider` and `Sortable` all work, dragged by a real pointer. The
> DECISION still stands, for the reason this document gives further down
> (GDK's drag icon, the theme's cursors, cross-application drops) rather than
> for impossibility. Everything else here is unchanged and still measured.

Running the real library is not possible, and the reason is not a judgement
call: it imports `react-native-reanimated`, `react-native-gesture-handler`
and `react-native-worklets` at module scope in nine of its files, and its
public type surface is written in `SharedValue<T>`. The evidence is below,
along with which of its props this platform can honour, which it cannot,
and why "cannot" is in several cases "the platform already does the thing
the prop exists to ask for".

## Why this was the question

Before this, drag-and-drop reached an app three unrelated ways:

1. raw `GtkDragSource` / `GtkDropTarget` from `react-native-gtkx/gtk`
   (`examples/tasks-app`),
2. `Controllers` (#52), which attaches those to the widget of a React
   Native component,
3. `List`'s `onReorder` plus `ListRow`'s `reorderId` in
   `react-native-gtkx/common` (#47, #52).

Three shapes, no name, and nothing an RN developer would recognise or go
looking for. (3) in particular is a `List`-shaped hole: it reorders rows of
one specific Adwaita component and expresses nothing else — not a drop
zone, not a free drag, not a second list.

## Which library to mirror

Two candidates own this space in React Native.

**`react-native-draggable-flatlist`** is the older answer and only does one
thing (reorder a list). `docs/research/gestures.md` already recorded it as
blocked: hard peer dependency on Reanimated, imported at module scope.

**`react-native-reanimated-dnd`** (2.0.0, MIT) is the broader one:
draggables, drop zones, sortable lists, sortable grids, a drag context. It
is the library whose surface an app would have to abandon, so it is the one
worth mirroring. Where the two overlap — reorder a list by dragging — a
mirror of the former is a special case of a mirror of the latter, so
following `react-native-reanimated-dnd` costs nothing and covers more.

Neither can run. Following the broader one is therefore free.

## It cannot run here: the measurements

Taken against the **unminified upstream source** at
`github.com/entropyconquers/react-native-reanimated-dnd` v2.0.0 — 8,059 LOC
across `components/`, `context/`, `hooks/`, `types/`, `utils/` — because the
interesting question is not "does it list Reanimated as a peer" but "is
Reanimated load-bearing or decorative". Some libraries use it only for
animated feedback and degrade cleanly; the answer here is that this one does
not, and the evidence is specific.

**Its peer dependencies are the three things this platform does not
implement.**

```json
"peerDependencies": {
  "react": ">=18.0.0",
  "react-native": ">=0.80.0",
  "react-native-gesture-handler": ">=2.28.0",
  "react-native-reanimated": ">=4.2.0",
  "react-native-worklets": ">=0.7.0"
}
```

Not optional, not soft. Static, module-scope imports in twelve files:
`react-native-reanimated` in `hooks/useDraggable.ts`, `useDroppable.ts`,
`useSortable.ts`, `useSortableList.ts`, `useHorizontalSortable*.ts`,
`useGridSortable*.ts`, `safeMeasure.ts` and every `components/*.tsx`;
`react-native-gesture-handler` in `useDraggable.ts`, `useSortable.ts`,
`useGridSortable.ts`, `useHorizontalSortable.ts`, `Draggable.tsx`,
`Sortable.tsx`, `SortableItem.tsx`, `SortableGrid*.tsx`;
`react-native-worklets` in five hooks. There is no
`try { require(...) } catch` anywhere, unlike RNGH's own
`reanimatedWrapper.ts`. The failure is at **import**, not at runtime — the
same thing `docs/research/gestures.md` measured for the whole RNGH-based
ecosystem.

The worklets import list was re-counted against the **published** 2.0.0
tarball when that package was aliased (`react-native-gtkx/worklets`), because
that is the code a consumer's bundler actually resolves: it is exactly two
symbols, `scheduleOnRN` and `scheduleOnUI`, across `useDraggable.js`,
`useDroppable.js`, `useSortable.js`, `useHorizontalSortable.js` and
`useGridSortable.js` — five files, not four. Nothing else in the package
touches that module, and no type is imported from it.

**Reanimated is the state medium and the layout, not the animation.** This
is the measurement that actually decides it. Symbol counts across the
package: `useSharedValue` 71, `SharedValue` 136, `useAnimatedReaction` 26,
`useAnimatedRef` 14, `measure` 60, `useAnimatedStyle` 8,
`scheduleOnRN`/`scheduleOnUI` 50, `GestureDetector` 28. Only `withSpring`
(15) and `withTiming` (22) are decorative — everything else is structural,
in three specific ways:

- **The sort algorithm is a worklet.** `hooks/useSortable.ts:263-300` — a
  `useAnimatedReaction` on `positionY.value` computes the discrete target
  index (`findPositionForY` / `setPosition`, both `"worklet"`-annotated) and
  writes `positions.value`. `onMove` is only a _notification_ pushed back to
  JS through `scheduleOnRN` (`:246-260`). Remove the worklets and nothing
  reorders.
- **The list has no flow layout at all.** `hooks/useSortable.ts:489-503`:
  `useAnimatedStyle` returns `{ position: "absolute", left: 0, right: 0,
top: top.value, zIndex: … }`. Every row is absolutely positioned at a
  shared-value offset — which is why `itemHeight` is mandatory upstream, and
  why without `useAnimatedStyle` every row would render at `top: 0`.
- **Geometry is measured on the UI thread.** `hooks/safeMeasure.ts` is
  `"worklet"`-annotated and calls Reanimated's `measure(ref)`, which exists
  only inside a worklet. It supplies the draggable's origin and every drop
  slot's rectangle.

50 `"worklet"` directives across 8 files, all of them in the 3,158 LOC of
`hooks/` and `utils/` that _is_ the library. The `components/` are thin:
`components/Draggable.tsx:75-77` is literally
`<GestureDetector gesture={…}><Animated.View style={style}>{children}</…>`.

**And no, our vendored `PanResponder` does not rescue a subset.**
`PanResponder` could stand in for `Gesture.Pan().activateAfterLongPress(200)`
semantically — a JS timer plus `onMoveShouldSetPanResponder` is what
`Pressable` already does. It is the wrong call shape
(`<GestureDetector gesture={…}>` versus spread `panHandlers`), but that is
fixable; what is not is everything left over:

| Missing                                     | Why `PanResponder` does not help                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| a worklet runtime (`react-native-worklets`) | a second JS runtime over JSI; gtkx has one runtime and no JSI                                                                         |
| Reanimated's mapper / dependency tracking   | `useAnimatedReaction` and `useAnimatedStyle` must re-run when a `SharedValue` is _written_; plain `{value}` boxes do not notify       |
| Reanimated's `Animated.View`                | must accept an `AnimatedStyle` whose members are `SharedValue`s; ours is RN's, driven by `Animated.Value`, transform and opacity only |
| UI-thread `measure()`                       | ours is JS-side and callback-shaped                                                                                                   |
| RNGH `GestureDetector`                      | out of scope by the gestures decision (`GestureHandlerRootView` alone is shimmed — see below)                                         |

Building the middle three _is_ porting Reanimated — the milestone
`docs/research/gestures.md` ruled out. Category two, then: the whole
pipeline is in worklets, there is no degraded mode, and no subset runs.

**Reanimated 4 raises the bar further.** It requires the New Architecture
and `react-native-worklets/plugin` as the last Babel plugin — a second
runtime with its own JSI bindings, not a library. This platform renders
through `@gtkx/react` on `react-reconciler`; there is no Fabric, no JSI
worklet runtime, and nothing to bind one to.

**Part of its public API is `SharedValue`-typed, so even a perfect
behavioural mirror cannot reproduce its types.** `UseSortableOptions`,
`SortableItemProps` and `SortableRenderItemProps` all name
`positions: SharedValue<{ [id: string]: number }>`, plus `lowerBound`,
`autoScrollDirection` and `itemHeights`. Those types come from Reanimated
itself.

This is less fatal than it looks, and the reason matters for the design.
The library's own documented call pattern never touches them:

```tsx
const renderItem = useCallback((props: SortableRenderItemProps<Task>) => {
  const { item, id, ...rest } = props
  return (
    <SortableItem
      key={id}
      id={id}
      data={item}
      {...rest}
    >
      …
    </SortableItem>
  )
}, [])
```

`positions` and friends are **opaque plumbing that an app forwards, never
reads**. So a mirror keeps the property names and the forwarding contract,
and gives them types of its own. Source that follows the documented pattern
compiles unchanged; source that reaches into `positions.value` does not,
and that is a documented gap rather than a silent one.

## Verdict, and the fallback the user named

Running the library is off the table on evidence, not preference. So:
**mirror the API.** Same component names, same hook names, same prop names,
same callback shapes, same enums, same utility functions — so porting is
not a rewrite.

And because the names are identical, the port can be smaller than an import
change. The Metro and Vite presets already rewrite `react-native-svg` onto
`react-native-gtkx/svg`; adding `react-native-reanimated-dnd` →
`react-native-gtkx/dnd` is the same three lines. **An app that uses
`react-native-reanimated-dnd` today adds a Linux build by changing nothing
in its source.** The real package is never resolved on Linux, so its
Reanimated imports never run.

The alias is what makes the mirror worth having. Without it the app edits
every import; with it the app edits none, and its iOS and Android builds go
on using the real library with its real worklets.

**The one edit that used to survive is gone too.** Upstream's own quick
start wraps the app in `<GestureHandlerRootView style={{ flex: 1 }}>` from
`react-native-gesture-handler`, so a ported app still had one line to change
in its shell. The first pass rejected aliasing that package on the grounds
that a partial RNGH shim would make every _other_ RNGH import fail silently
rather than loudly — and that concern was right, but it argues for a
particular shim rather than for none.

`react-native-gtkx/gesture-handler` is that shim. It implements
`GestureHandlerRootView` faithfully (upstream's `style ?? {flex: 1}`, so an
explicit style replaces the default rather than merging — verified across all
three of RNGH 3.1.0's implementations), and makes **every other export
throw** where it is used, naming itself and pointing at the replacement. The
loudness is preserved exactly; only the one symbol an app legitimately needs
is answered.

Nor is that root a stub. Upstream's does two things: it renders a `flex: 1`
box, and it marks the subtree as gesture-arbitrating. The first is
reproduced; the second is genuinely already this platform's job, because RN's
own responder system is implemented here (#41) and its lock is global. So
**a ported app now changes nothing in its source at all.**

## The implementation underneath is GTK's own drag-and-drop

`GtkDragSource` / `GtkDropTarget`, through the `Controllers` component from
`react-native-gtkx/gtk` (#52). Not a JS reimplementation on the responder
system, even though slice 2 of the gestures epic now makes one possible
(`PanResponder`, `measure()`, `Animated.ValueXY` all exist as of #41/#50).

GDK gives four things a JS drag cannot:

- a **real drag icon** the compositor moves — a `Gtk.WidgetPaintable` of the
  dragged row, at the grab hotspot, drawn above every window;
- the **correct cursors** for copy / move / no-drop, from the user's theme;
- **hit testing GDK already does**, against the real widget tree, including
  widgets React Native did not create;
- **cross-widget and cross-application drops**, through content negotiation.

The last one is the one no amount of JS buys. A `Droppable` in this
implementation can accept a filename dragged from Files.

The cost is that GDK owns the drag visual, and that is exactly where the
mirrored API loses props. That trade is stated in full below rather than
hidden.

## What the mirror can and cannot honour

Measured against `react-native-reanimated-dnd@2.0.0`'s type definitions,
prop by prop. Three verdicts: **honoured** (same observable behaviour),
**accepted and ignored** (the prop type-checks and the platform already
achieves what it asks for, or cannot express it), **unsupported**.

### `DropProvider`

| Prop / member                              | Verdict              | Note                                                                                                                                                                                                                                                       |
| ------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `children`                                 | honoured             |                                                                                                                                                                                                                                                            |
| `onDragStart` / `onDragEnd` / `onDragging` | honoured             | `drag-begin` / `drag-end` on the source; `onDragging` from a `GtkDropControllerMotion` on the provider's own view (below)                                                                                                                                  |
| `onDroppedItemsUpdate`                     | honoured             | the provider keeps the map                                                                                                                                                                                                                                 |
| `onLayoutUpdateComplete`                   | accepted and ignored | there is no layout pass to complete: GDK hit-tests live                                                                                                                                                                                                    |
| `ref.getDroppedItems()`                    | honoured             |                                                                                                                                                                                                                                                            |
| `ref.requestPositionUpdate()`              | accepted and ignored | a no-op **because GDK re-hit-tests on every motion**. The prop exists in the original to refresh cached slot rectangles after a scroll or a layout change; there are no cached rectangles here. Calling it is harmless and, on this platform, unnecessary. |

### `Draggable` / `useDraggable`

| Prop                        | Verdict              | Note                                                                                                                                                      |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`                      | honoured             | carried through the provider's registry keyed by `draggableId`; the GDK payload is that id as a string                                                    |
| `draggableId`               | honoured             | auto-generated when absent, as upstream                                                                                                                   |
| `dragDisabled`              | honoured             | no `GtkDragSource` is attached at all                                                                                                                     |
| `onDragStart` / `onDragEnd` | honoured             |                                                                                                                                                           |
| `onDragging`                | honoured             | `{ x, y, tx, ty, itemData }` — see "onDragging is recoverable"                                                                                            |
| `onStateChange` / `state`   | honoured             | `IDLE` → `DRAGGING` → `DROPPED`, from `drag-begin` / `drag-end` / whether a target accepted                                                               |
| `Draggable.Handle`          | honoured             | the drag source attaches to the **handle's** widget instead of the item's — a closer mapping than upstream's, where the handle only gates a pan           |
| `collisionAlgorithm`        | accepted and ignored | GDK decides, by pointer position against the real widget tree. `"center"` is the closest of the three, since the drag icon is carried at the grab hotspot |
| `preDragDelay`              | accepted and ignored | its stated purpose is distinguishing a tap from a drag; GDK already does that with `gtk-dnd-drag-threshold` before it starts a drag at all                |
| `dragAxis`                  | unsupported          | the compositor moves the drag icon; nothing here can constrain it                                                                                         |
| `dragBoundsRef`             | unsupported          | same reason                                                                                                                                               |
| `animationFunction`         | unsupported          | there is no return animation, because the view never left                                                                                                 |

### `Droppable` / `useDroppable`

| Prop             | Verdict     | Note                                                                                                                         |
| ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `onDrop`         | honoured    | `GtkDropTarget::drop`                                                                                                        |
| `dropDisabled`   | honoured    | no `GtkDropTarget` attached                                                                                                  |
| `onActiveChange` | honoured    | `::enter` / `::leave`                                                                                                        |
| `activeStyle`    | honoured    | applied while a drag is over it                                                                                              |
| `droppableId`    | honoured    |                                                                                                                              |
| `capacity`       | honoured    | `::accept` refuses when full, so GDK shows the no-drop cursor — better feedback than upstream, which silently skips the slot |
| `dropAlignment`  | unsupported | positions the dragged view inside the slot after the drop; the view never moved                                              |
| `dropOffset`     | unsupported | same reason                                                                                                                  |

### `Sortable` / `SortableItem` / `useSortable` / `useSortableList`

| Member                                                          | Verdict                              | Note                                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`, `renderItem`, `itemKeyExtractor`                        | honoured                             |                                                                                                                                                                               |
| `onMove(id, from, to)`                                          | honoured                             |                                                                                                                                                                               |
| `onDragStart(id, position)`                                     | honoured                             |                                                                                                                                                                               |
| `onDrop(id, position, allPositions)`                            | honoured                             |                                                                                                                                                                               |
| `onDragging(id, overItemId, y)`                                 | honoured                             | from each item's own drop target                                                                                                                                              |
| internal order ownership                                        | honoured                             | the component owns the order, exactly as upstream's "do NOT update external state in `onMove`" contract requires                                                              |
| `SortableItem.Handle`                                           | honoured                             |                                                                                                                                                                               |
| `positions`, `lowerBound`, `autoScrollDirection`, `itemHeights` | **shape-compatible, different type** | opaque values the app forwards; `SharedValue` cannot exist here                                                                                                               |
| `itemHeight`, `estimatedItemHeight`, `enableDynamicHeights`     | accepted and ignored                 | rows are laid out by Yoga at their natural height, so a height hint has nothing to correct                                                                                    |
| `useFlatList`                                                   | accepted and ignored                 | the mirror has no windowing to switch off. The prop is load-bearing against the REAL library, and works there on its default now — [dnd-differential.md](dnd-differential.md) |
| autoscroll during a drag                                        | unsupported for now                  | GTK's own kinetic autoscroll does not run for a DND motion; a `GtkDropControllerMotion` near the edge could drive `ScrollView`, and that is a follow-up, not a shipped claim  |
| `direction: "horizontal"`, `SortableGrid`                       | **not implemented**                  | deferred, see below                                                                                                                                                           |

### Deliberately not implemented

`SortableGrid`, `SortableGridItem`, `useGridSortable*`, `useHorizontalSortable*`
and the grid utilities in `utils/gridCalculations`. They are a large surface
(148 lines of grid types alone) serving a layout that GNOME apps rarely use,
and none of the mechanism they need is different from the vertical list —
so they are a later increment, not a research question. Importing them
fails at build time with a clear "not implemented on Linux" rather than
silently doing nothing.

The deferral's premise has since been checked rather than assumed: both
surfaces of the REAL package reorder under a real pointer on this platform
(the gallery's Upstream sortables section), so nothing the mirror would need
is missing
from the runtime — see [dnd-differential.md](dnd-differential.md).

## `onDragging` is recoverable, and that was not obvious

The natural assumption is that GTK cannot report a drag in progress:
`GtkDragSource` emits `drag-begin` and `drag-end` and nothing between them,
because after the drag starts the source is no longer involved — the
compositor is.

But `GtkDropControllerMotion` is a controller whose whole purpose is
tracking pointer motion **during a drag**, over any widget, and it is
present in gtkx's generated JSX surface with `onEnter(x, y)`,
`onMotion(x, y)` and `onLeave`. Put one on the `DropProvider`'s own view and
the provider sees the drag cross its entire area.

That is enough to reconstruct upstream's payload exactly:

- `x`, `y` — the dragged item's origin, from `measureLayout` against the
  provider's view (slice 1 of the gestures epic, #37);
- `tx`, `ty` — how far the pointer has moved since `drag-begin`, which is
  the translation the view _would_ have had.

So the one callback that looked lost to the platform choice is the one the
platform hands back. It is worth recording as the counter-example to the
table above: "GTK owns the drag" removes the props that describe _where the
view goes_, not the props that describe _what is happening_.

## What the gallery found, the first time this met a real screen

One defect, and it is the kind only a real window produces.

**Sortable rows rendered as handles with no text.** This platform's
`ScrollView` sets `alignItems: "flex-start"` on its content container
(`components/scroll-view.tsx`), so a row shrank to its intrinsic width and
the `flex: 1` text column inside it collapsed to zero. Upstream never meets
this because its rows are `position: absolute; left: 0; right: 0` — full
width by construction, not by alignment. `Sortable` now defaults its
`contentContainerStyle` to `alignItems: "stretch"`, which an app can still
override.

Worth separating the fix from the finding: RN's own `ScrollView` content
container is a plain `View`, whose default `alignItems` is `stretch`, so
`flex-start` here looks like a parity difference in `ScrollView` rather than
a choice. Changing a shared default under every existing example is not this
epic's business, so it is recorded rather than acted on.

**Update — it was acted on.** Porting upstream's own example app
(`examples/reanimated-dnd`) hit the same default in seventeen screens at
once, none of them sortable: every `ScrollView` in it laid its content out
at intrinsic width, so every screen rendered as a narrow column jammed
against the left edge. At that point "a ported app changes nothing in its
source" was simply false, and the default was the thing that was wrong.
`components/scroll-view.tsx` now defaults the content container to
`alignItems: "stretch"`, as RN does; `Sortable`'s own override is gone with
it. The full suite is unchanged by the switch (117 files, 956 passing + 1
expected fail), and the gallery and `examples/tasks-nav` were re-shot on the
same rig to confirm nothing moved.

## What happened to `List`'s `onReorder` (updated)

The first pass kept it, as a nine-line wrapper over `Sortable`'s machinery
rather than a second implementation of it, on the grounds that it takes
**ids** rather than indices and therefore does a different job.

**It is gone.** The job is real, the second entry point was not worth it:
having two ways to start a drag — one of them shaped like nothing an RN
developer had ever seen — is precisely the "nobody will understand this"
complaint that started this epic. An id-keyed reorder is a `Droppable`
around a `Draggable` per row inside one `DropProvider`, which is more lines
and one fewer concept.

`examples/tasks-nav` does exactly that now
(`src/components/task-row.tsx`), and its comment states the trade honestly
rather than claiming a win: about a dozen lines where there were two, in
exchange for the only drag-and-drop API in the platform being the one apps
already know.

`List`/`ListRow`/`ListSeparator` themselves left
`react-native-gtkx/common` at the same time and for a separate reason — see
[platform-layer.md](../platform-layer.md#listlistrowlistseparator-were-here-and-are-not-any-more).

## Honest gaps for a ported app

- ~~An app that imports `react-native-reanimated` **directly** (its own
  `useSharedValue`, its own `useAnimatedStyle`) still does not build. The
  alias replaces the DnD library, not Reanimated.~~ **Closed.** Reanimated's
  semantics are implemented and its package name aliased —
  [research/reanimated.md](reanimated.md) and
  [api.md](../api.md#react-native-reanimated-react-native-gtkxreanimated).
  The gap that remains is which style properties can be driven per frame —
  and the row shape quoted above (`position: absolute`, `left: 0`, `right: 0`,
  `top: <shared value>`) is now one of the ones that can be:
  [absolute-insets.md](absolute-insets.md), and so is the `zIndex` beside it:
  [z-index.md](z-index.md).
- Any RNGH import beyond `GestureHandlerRootView` throws when it runs. That
  is deliberate — see the shim above — but it does mean an app that mixes
  real RNGH gestures into its drag-and-drop screens has work to do that no
  alias can absorb.
- `positions.value` and friends can be **read** (they are real `{ value }`
  boxes here — see `SharedValueLike`), but writing one animates nothing.
- **Rows are in flow layout, not absolutely positioned.** Upstream's row
  position comes from `useAnimatedStyle`, so its list is exactly
  `itemsCount × itemHeight` tall; ours is whatever Yoga computes from the
  rows' natural heights. The same list to look at; different if the app
  measured the container.
- `dragAxis`, `dragBoundsRef`, `animationFunction`, `dropAlignment` and
  `dropOffset` type-check and do nothing, and `docs/api.md` says so. They
  are kept in the type rather than removed so that a shared file compiles
  for all three platforms — removing them would turn a Linux limitation
  into an iOS and Android compile error.
- Sortable autoscroll near a container edge is not implemented.
- The grid and horizontal sortable surfaces are not implemented **in the
  mirror**. The real package supplies both here, measured under a real
  pointer — [dnd-differential.md](dnd-differential.md).
