# Running the real upstream libraries, unaliased

Two experiments, 2026-08-02, both against the published npm tarballs rather
than against a reading of them: `react-native-reanimated-dnd@2.0.0` and
`react-native-drawer-layout@4.2.9`, installed into
the gallery's "Upstream libraries" section and built by the ordinary `gtkx build` /
`gtkx dev` toolchain.

**Verdict on the first: `react-native-reanimated-dnd` runs.** Not "imports",
not "renders" — `Draggable`, `Droppable`, `DropProvider` and `Sortable` all
behave, driven by a real pointer in a real window. That reverses the
measurement in [drag-and-drop.md](drag-and-drop.md), which is worth stating
plainly rather than quietly: the reasoning there was correct for the surface
that existed when it was written, and every single thing it named as missing
has since shipped.

**Verdict on the second: `react-native-drawer-layout` runs, and did not
before this.** The earlier "it runs" was proven by a test transcribed from its
`Drawer.native.tsx`, and a transcription cannot catch what this found: on the
resolution rules of any out-of-tree platform the package silently selects a
gesture shim whose `Gesture` is `undefined`, so the drawer rendered, animated
from its `open` prop, and could not be dragged at all.

## Why the first experiment was worth running at all

[drag-and-drop.md](drag-and-drop.md) measured five specific walls, and each
one has a landing behind it now:

| What that document measured                                                             | Where it is now                                    |
| --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| a worklet runtime, the mapper, `useAnimatedReaction`                                    | shipped (`src/reanimated-compat`)                  |
| `measure()` from a worklet                                                              | shipped, callable from anywhere                    |
| `scheduleOnRN` / `scheduleOnUI` under the `react-native-worklets` name                  | shipped (`src/worklets-compat`)                    |
| `position: absolute` + a per-frame `top`, which the sort algorithm rests on             | shipped ([absolute-insets.md](absolute-insets.md)) |
| `GestureDetector`, `Pan`, `State`, relations, RNGH's `ScrollView`/`FlatList` re-exports | shipped (`src/gesture-handler-compat`)             |

So the honest test was to stop reading and run it. The experiment is a
one-line change in an app: `resolve.alias` maps the package name back onto
its real entry point, which wins over the preset's rewrite because vite runs
`resolve.alias` before every `enforce: "pre"` plugin. Everything the library
imports — `react-native`, `react-native-reanimated`,
`react-native-worklets`, `react-native-gesture-handler` — still goes through
the preset onto this platform's compat surfaces. The real library, this
platform's runtime underneath it.

## What it took: five walls, in the order the app hit them

Each of these was a wall, not a wrinkle: the app did not start until it was
fixed.

Three of them were hit INDEPENDENTLY, on the same day, by the probe app in
`spike/core-exports` (#88) — `Keyboard`, `__DEV__` and
`useAnimatedScrollHandler` — from a completely different pair of libraries
(`react-native-draggable-flatlist` and `@gorhom/bottom-sheet`). That
convergence is worth more than either result: two unrelated real libraries
walked into the same three holes, which is what "the surface is measured
against real code" is supposed to produce and what reading import lists never
did. The two below that #88 did not reach are this experiment's own, and both
are in `Animated.View`.

### 1. `Keyboard` was not exported (bundle error) — also found by #88

`react-native-drawer-layout`'s `Drawer.native.js` imports it at module scope
for `keyboardDismissMode`. There is no software keyboard on a desktop, so
there is nothing to dismiss — but the import is unconditional and the bundler
stopped at `"Keyboard" is not exported`. `@gorhom/bottom-sheet` needed it for
the same reason, and #88's `src/apis/keyboard.ts` is what ships.

### 2. The vite preset's alias lost to vite's SSR externalization

`gtkx dev` runs vite with `ssr.external: true`, which hands bare dependencies
straight to Node — **before any `resolveId` hook runs**. The preset already
listed `react-native`, `react-native-reanimated` and `react-native-worklets`
in `ssr.noExternal` for exactly that reason. `react-native-gesture-handler`
was not on the list, so the moment the real package was in `node_modules`,
Node loaded it and died on an extensionless internal import
(`react-native-gesture-handler/lib/module/globals`).

The fix states the rule rather than adding a fourth name: every package the
alias rewrites must be in `ssr.noExternal`, because an alias that never gets
asked cannot win. `react-native-svg` and `react-native-reanimated-dnd` were
in the same latent state and are covered now.

This only ever bites an app that has the real package installed — which is
precisely the app the aliases exist for: one that also ships iOS and Android.

### 3. `__DEV__` was not defined on the vite path — also found by #88

`__DEV__` is part of the react-native global environment, not part of any
library's API. Metro's prelude defines it on every bundle, so RN libraries
reach for it with no guard: `useSortableList` opens with a bare
`if (__DEV__)` that validates item ids.

Nothing defined it on the vite path. The preset does now, from the build mode
— a platform parity gap, not a library bug. (The Metro path was always fine:
metro's own prelude covers that half.) `@gorhom/bottom-sheet` reads it at
module scope in four components and crashed the same way.

### 4. `Animated.View` dropped `pointerEvents` and `animatedProps` — the silent one

This is the interesting one, and it is the failure mode this repo says it
refuses everywhere else: **it compiled, it ran, and nothing worked**.

`react-native-drawer-layout`'s `Overlay` is a full-screen `Animated.View` with
an animated `opacity` and `pointerEvents` supplied through `animatedProps`.
Our `AnimatedView` destructured `style`, `children`, `onLayout`, `testID` and
`ref`, and swept everything else into the responder props — so both were
dropped on the floor. The overlay was invisible and fully targetable, and it
covered the entire app.

The symptom was baffling until it was bisected: the drawer's own edge swipe
worked perfectly (its `GestureDetector` is an ancestor of the overlay), and
every gesture inside the app was dead — the `Draggable` chips, the sortable
rows, and a bare `Gesture.Pan()` probe added next to them purely to tell
"our `GestureDetector` is broken" apart from "the library is broken". It was
neither.

`Animated.View` takes both props now. Upstream's is literally
`createAnimatedComponent(View)`, so every View prop reaching it is the parity
position, and `animatedProps` last matches that factory's own
`{ ...rest, ...animatedProps }` spread order.

### 5. A non-numeric `useAnimatedProps` value never reached a render

Half the same bug, one layer down, and it only appears the SECOND time you
use the drawer.

`useAnimatedProps` drives numeric props through animated nodes and — for
everything else — warned once and wrote the new value into the props object,
promising it would be "applied on the next React render". For `Overlay` there
is no next render: nothing in that component has React state, and the value
that matters (`pointerEvents`, flipping on `progress > 0.05`) is computed in a
mapper. So the overlay went permanently targetable the first time the drawer
opened, and the app was dead from then on — open the drawer, close it, and
nothing underneath responded again.

`apply()` now reports a non-node change to its caller, which rebuilds and
re-renders. One React render per CHANGE (not per frame — the value has to
actually differ), and the existing warning is what keeps that cost visible.

### The `Sortable` wall behind all of that

Once the app started, `Sortable` still threw: `useSortableList` opens with
`useAnimatedScrollHandler` and drives `scrollTo` from a `useAnimatedReaction`,
and both were refusals. #88 landed the first, from
`react-native-draggable-flatlist` needing the same one; `scrollTo` is added
here, next to it and for the same reason the hook needed no event system —
this IS the thread that owns the widget, so it calls the scrollable's own
imperative `scrollTo`.

Worth recording how that was measured rather than guessed: both were stubbed
in the VM's `dist` for one run, to answer "is this the last wall or the first
of five" before building anything. The whole app rendered, which made the
implementation worth doing.

### And one that is not ours: the platform-file trap

`react-native-drawer-layout` picks its gesture implementation with a platform
file, and ships `GestureHandler.ios.js`, `GestureHandler.android.js` and a
plain `GestureHandler.js` fallback. There is no `.native.js`.

Metro-style resolution for an out-of-tree platform tries `.linux.*` then
`.native.*` and then the base file — so **linux lands on the fallback**, whose
`GestureDetector` renders its children and whose `Gesture` is literally
`undefined`. `Drawer.native.tsx` guards that with `Gesture?.Pan()`, so the
drawer renders, animates from the `open` prop, and cannot be dragged. Nothing
throws, nothing warns.

This is not a linux problem: `.ios` + `.android` with no `.native` is dead for
win32 and macos too. `examples/gallery` carries a ten-line vite
plugin that points that one import at `GestureHandlerNative` (the module both
platform files re-export), scoped to importers inside that package. The
upstream fix is a one-line rename to `GestureHandler.native.js`, and is worth
filing.

## What the running app does, and what it proves

One window. `Drawer` from `react-native-drawer-layout` wraps a
`react-native-reanimated-dnd` screen, and every screenshot below was taken by
`scripts/shot-example-drag.ts` — a real virtual pointer in a private headless
compositor, so nothing outside the path the pointer took can have been
touched.

- **The drawer opens by dragging from the left edge.** The mid-drag frame
  catches it half-open with the overlay part-way dimmed: it is following the
  pointer, not toggling on a prop. Its `Gesture.Pan()` chain
  (`activeOffsetX(±5)`, `failOffsetY(±5)`, `hitSlop({left: 0, width: 32})`,
  `enabled()`) is honoured, including the edge hit-slop — which is what keeps
  the drag from stealing presses meant for the app.
- **`Draggable` → `Droppable` works.** Dragging a chip onto a drop zone lights
  the zone's `activeStyle` mid-drag (so the collision check is running against
  live geometry from `measure()` inside the library's own worklets) and fires
  `onDrop` with the item's data.
- **`Sortable` reorders.** Dragging a row past its neighbour reorders the list
  and reports `onMove(id, from, to)`. That is the whole worklet pipeline the
  earlier research called structural: a `useAnimatedReaction` on `positionY`
  computing a discrete target index, `positions` updated on the UI side, the
  notification pushed back to JS through `scheduleOnRN`, and every row's
  `top` driven per frame through `useAnimatedStyle` on an absolutely
  positioned node.

### The two things that still differ

**`Sortable` needs `useFlatList={false}`.** With upstream's default
(`useFlatList` is `true`) the list renders one row short and leaves a gap
where the first row should be. The rows are `position: absolute` with a
per-frame `top`, so each cell's height in flow is zero, and this platform's
windowing measures cells to decide what to mount. Switching `Sortable` to its
`ScrollView` path renders all four rows correctly and reorders exactly the
same. The library is doing nothing wrong; a windowed list over zero-height
absolutely positioned cells is a case `FlatList` here has never had to
handle. Follow-up rather than a wall — the prop is upstream's own and one
character to set.

**The dragged view is painted behind the drop zone.** GTK4 has no z-order
property: a container paints its children in sibling order. Upstream's
`useSortable` and `useDraggable` both set `zIndex` in their animated style to
lift the dragged item, and `zIndex` is inert here (it warns, by name). So a
chip dragged over a drop zone slides under it instead of over it. The drop
still lands, the `activeStyle` still lights, and the drag reads worse than it
should. This is the known `zIndex` gap
([api.md](../api.md#react-native-reanimated-react-native-gtkxreanimated)), met
by a real library for the first time.

Everything else in the earlier research's "honest gaps" list still holds:
`positions.value` and friends are real `{ value }` boxes and can be read,
autoscroll near a container edge is not implemented, and the grid and
horizontal sortable surfaces were never the question here.

## So should the alias go?

**Not on this evidence, and the reason is not that the library fails.**

The two implementations answer different questions, and the running example
makes the difference concrete rather than theoretical:

- `react-native-gtkx/dnd` is GTK's own drag-and-drop
  (`GtkDragSource`/`GtkDropTarget`). It gets a real drag icon the compositor
  carries above every window, the user's own copy/move/no-drop cursors, hit
  testing GDK already does against the real widget tree, and drops **across
  widgets and across applications** — a `Droppable` that accepts a file
  dragged out of Files. None of that is reachable from JS.
- the real `react-native-reanimated-dnd` moves a view inside the app's own
  tree with worklets. It gets `dragAxis`, `dragBoundsRef`,
  `animationFunction`, `dropAlignment` and `dropOffset` — the five props the
  mirror documents as inert, all of which describe _where the view goes_,
  which is exactly what GDK owns in the other implementation. And it loses
  the drag icon to the `zIndex` gap above.

That is a genuine trade, not a ranking, so it is the user's call rather than
this experiment's. What the experiment changes is that it IS a choice now:
before this, one side of it did not run.

What would make it a shorter conversation:

- **The presets need a documented opt-out.** This example reaches for
  `resolve.alias`, which works and is undocumented. A first-class option
  (`reactNativeGtkx({ … })` on the vite side, `withLinuxPlatform` on the
  Metro side) is a small change, and it is what an app that wants the real
  package would use. Deliberately not added here, because its shape depends
  on the decision above.
- **`zIndex` during a drag** is the one gap that makes the real library look
  worse than it is. Reordering siblings for paint would reorder the layout
  (`components/use-layout-child.ts` keeps the two in one order), so this needs
  a real answer rather than a flag.
