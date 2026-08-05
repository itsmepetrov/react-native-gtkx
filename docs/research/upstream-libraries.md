# Running the real upstream libraries, unaliased

Two experiments, 2026-08-02, both against the published npm tarballs rather
than against a reading of them: `react-native-reanimated-dnd@2.0.0` and
`react-native-drawer-layout@4.2.9`, installed into
the gallery's three "Upstream …" sections and built by the ordinary
`gtkx build` /
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

Three screens, one per library and, for the drag-and-drop one, one per idea:
drop zones, sortables, and the drawer. Every screenshot below was taken by
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
  **The reorder threshold it computes has a dead zone** — flooring the
  dragged row's own top-left corner onto a slot boundary, so crossing
  towards a lower index takes about a pixel and crossing towards a higher
  one takes the whole row height. Read from source and checked against this
  compat's own coordinate reporting (no distortion found, same conclusion
  the grid case's real-pointer measurement already reached): upstream's own
  arithmetic, present on a real phone too, not a bug this platform's
  `gesture-handler-compat`/`reanimated-compat` introduces. See
  [dnd-collision-feel.md](dnd-collision-feel.md).

### The two things that still differ

~~**`Sortable` needs `useFlatList={false}`.**~~ **Closed, and it was ours.**
With upstream's default the list rendered short and this note read it as a
`FlatList` limitation — "a windowed list over zero-height absolutely
positioned cells is a case `FlatList` here has never had to handle". That was
wrong twice over: RN renders exactly that shape correctly (its window search
treats the first cell's start as inclusive, which is what resolves offset 0 to
index 0 when every frame is zero-length), and upstream documents `useFlatList`
purely as a performance switch with no caveat attached. The bug was
`indexAt` in `src/components/virtualized-list.tsx`, the symptom in a real app
was a BLANK list rather than a short one, and the prop is gone from the
example. See [dnd-differential.md](dnd-differential.md).

> **Fixed since, and shown fixed in this same example:**
> [z-index.md](z-index.md). The paragraph below records the measurement.

**The dragged view is painted behind the drop zone.** GTK4 has no z-order
property: a container paints its children in sibling order. Upstream's
`useSortable` and `useDraggable` both set `zIndex` in their animated style to
lift the dragged item, and `zIndex` is inert here (it warns, by name). This is
the known `zIndex` gap
([api.md](../api.md#react-native-reanimated-react-native-gtkxreanimated)), met
by a real library for the first time — and
[dnd-differential.md](dnd-differential.md) narrows it: across eighteen screens
it only shows when the dragged view is an EARLIER sibling than what it passes
over, which in practice means sorting a list rather than dropping on a zone.

**`SortableGrid` and the horizontal `Sortable` run**, which the earlier
research had no way to ask. Both reorder under a real pointer in
the gallery's Upstream sortables section, and both are surfaces the mirror
deliberately
does not implement.

Everything else in the earlier research's "honest gaps" list still holds:
`positions.value` and friends are real `{ value }` boxes and can be read, and
autoscroll near a container edge is not implemented.

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
- ~~**`zIndex` during a drag** is the one gap that makes the real library look
  worse than it is.~~ Answered: paint order and layout order were separated in
  the container widget rather than by reordering siblings, and picking follows
  the paint. [z-index.md](z-index.md), and the chip in this example now rides
  over the zone under a real pointer.

## A third experiment, 2026-08-05: `react-native-sortables` does not run

Motivation: npm's dnd field, same day — draggable-flatlist 425k/wk (runs
here already), reorderable-list 100k, **react-native-sortables 94k and the
fastest-growing**, reanimated-dnd 45k (runs here, above). Sortables is the
most modern of the set — grids, an `insert`/`swap` strategy toggle, and
`reorderTriggerOrigin: "center"` as its own default, the same centre
resolution this platform's own dnd mirror chose for itself in PR #122 — and
it advertises no native module. That claim checks out: no `android`/`ios`/
codegen directory in the published tarball, `files` in `package.json` lists
only `src`, `dist`, `LICENSE`, `README.md`, `CHANGELOG.md`, and the only
native-module-shaped code is the _optional_ haptics integration, which looks
up an existing Turbo Module by name rather than shipping one.

**Verdict: it builds and it mounts, after two real fixes — and then a third,
structural gap stops it before a pointer ever reaches it.** Unlike the first
two experiments, this is not "it runs" reversing an older reading; it is a
clean "no", arrived at by fixing every wall that was fixable at the example
level and finding the next one is not.

### The recon: what it reaches for, against what this platform implements

Every value symbol `react-native-sortables@1.10.0`'s source imports at module
scope from the three aliased packages, counted once each:

| Package                            | Value symbols reached                                                                                                                                                                                                                                             | Not implemented here                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `react-native` (7)                 | `Dimensions`, `NativeModules`, `Platform`, `StyleSheet`, `Text`, `TurboModuleRegistry`, `View`                                                                                                                                                                    | `NativeModules`, `TurboModuleRegistry` — both confined to the optional haptics adapters                                    |
| `react-native-reanimated` (15)     | `Animated` (default), `Extrapolation`, `LayoutAnimationConfig`, `interpolate`, `isSharedValue`, `isWorkletFunction`, `makeMutable`, `measure`, `runOnJS`, `runOnUI`, `useAnimatedReaction`, `useAnimatedRef`, `useAnimatedStyle`, `useDerivedValue`, `withTiming` | none missing — but see below: `withTiming` is exported with a narrower runtime contract                                    |
| `react-native-gesture-handler` (9) | `Gesture`, `GestureDetector`, `GestureHandlerRootView`, `GestureStateManager`, `useExclusiveGestures`, `useLongPressGesture`, `useManualGesture`, `useSimultaneousGestures`, `useTapGesture`                                                                      | `GestureStateManager` — deliberately refused (see docs/api.md); the rest are implemented, including all five v3 hook names |
| `react-native-worklets`            | none                                                                                                                                                                                                                                                              | —                                                                                                                          |

31 distinct value symbols reached, 3 gaps — a smaller surface than either
`react-native-drawer-layout` or `@gorhom/bottom-sheet` needed added, and it
still does not run. Two of the three gaps (below) were fixable from the
example; the wall that actually stops it is not one of these three at all —
`withTiming` IS exported, and the crash is in what it does when called.

### Wall 1 (fixed here): the optional haptics backend crashes the BUILD

`integrations/haptics/adapters/index.js` (a no-op) sits next to
`index.native.js`, which eagerly imports three real-device haptics backends
(`react-native-pulsar`, `expo-haptics`, `react-native-haptic-feedback`) and
reads `NativeModules`/`TurboModuleRegistry` off `react-native` at module
scope. This platform's own platform-extension rule (`.linux` → `.native` →
base) is Metro's rule, applied correctly — there is no `.linux` file, so
`.native` wins — but this platform exports neither symbol, so the build
fails immediately:

```
[MISSING_EXPORT] "TurboModuleRegistry" is not exported by "react-native-gtkx".
    at react-native-sortables/dist/module/integrations/haptics/adapters/pulsar.js:12:10

[MISSING_EXPORT] "NativeModules" is not exported by "react-native-gtkx".
    at react-native-sortables/dist/module/integrations/haptics/adapters/react-native-haptic-feedback.js:17:10

[REQUIRE_TLA] This require call is not allowed because the transitive dependency
"node_modules/yoga-layout/dist/src/index.js" contains a top-level await
    at node_modules/react-native-haptic-feedback/lib/commonjs/codegenSpec/NativeHapticFeedback.js:7:20
```

The third error is its own small surprise: `react-native-haptic-feedback` is
an `optionalDependencies` entry, and npm installs it anyway (nothing about
its own `package.json` restricts it to a platform this one is not), so its
`require("react-native")` really is reachable, and collides with
`yoga-layout`'s top-level await elsewhere in the same graph. All three
disappear together once the `.native` file is out of the bundle, because none
of the three real backends is reachable from anywhere else — confirmed by
building with the fix removed, not assumed. `examples/gallery/vite.config.ts`
carries the fix, `sortablesHapticsAreANoop`: a `resolveId` hook that resolves
the concrete no-op file directly, because asking `this.resolve` for the same
base name (the way the neighboring drawer-layout fix does) just re-enters
this preset's own platform substitution and lands back on `.native`.

### Wall 2 (fixed here, temporarily, to see past it): no global `requestAnimationFrame`

Past wall 1, the app crashed the whole process at mount:

```
ReferenceError: requestAnimationFrame is not defined
    at setAnimatedTimeout (react-native-sortables/dist/module/integrations/reanimated/utils/animatedTimeout.js:41:3)
    at MeasurementsProvider.js:169:51
```

Real React Native supplies `requestAnimationFrame`/`cancelAnimationFrame` as
globals from its own bootstrap; grepping this platform's Metro, vite and
runner code turns up neither, on either path — this platform's OWN
`runOnUI`/`scheduleOnUI` deliberately does not wait on one (see
`reanimated-compat/threads.ts`: a real UI hop posts to a real thread without
waiting for a frame, and `requestAnimationFrame` is what a runtime WITHOUT one
— the web — uses to stand in for it). That is the right call for this
platform's OWN scheduling, and it is a separate question from whether the
GLOBAL should exist for library code that reaches for it directly, the way
`react-native-sortables` does here.

This platform already has the machinery a real one could be built on:
`components/frame-scheduler.ts`'s `glibScheduler` is a genuine ~60fps frame
driver — `GLib.timeoutAdd` off the real monotonic clock, the one clock
`Animated` and the Reanimated compat surface already share — wrapped by
`animated/frame-loop.ts`'s `createFrameLoop`. A platform-level
`requestAnimationFrame` would be a thin global wrapper over that scheduler,
not a new mechanism. That is a platform change, and this task's scope is the
gallery: a temporary, app-local `setTimeout`-paced polyfill was written only
to see past this wall and find the next one, exactly as a probe, and was
**removed again** once the next wall turned out to be unconditional — shipping
a permanent global-behaviour change in one example, for a library that still
cannot run, would be worse than the gap it papers over.

**Update — implemented, 2026-08-05.** Exactly the platform change predicted
above: `requestAnimationFrame`/`cancelAnimationFrame` are now real globals,
installed from the package entry (`src/index.ts`, the one module both the
Metro and vite toolchains load before any app code runs) and built on
`glibScheduler` — no second frame source. Semantics: an id back, a
monotonic high-resolution timestamp in, a callback requested mid-batch lands
on the NEXT frame, cancel is silent, one callback throwing is reported and
does not stop its siblings. See docs/api.md's `requestAnimationFrame`/
`cancelAnimationFrame` row. Re-running this section's own probe confirms
wall 2 is gone: `react-native-sortables` gets past the `ReferenceError` and
mounts up to wall 3 below, unchanged and still unfixed.

### Wall 3 (not fixable here): `withTiming` on a `{x, y}` Vector

With both of the above patched, the app still crashes at mount, before any
pointer input is possible:

```
Error: react-native-reanimated: withTiming() on this platform animates finite
numbers only, got [object Object]. Colors and layout properties cannot be
driven imperatively here yet — see docs/api.md.
    at assertAnimatable (reanimated-compat/animation.ts:96)
    at withTiming (reanimated-compat/animation.ts:109)
    at react-native-sortables/dist/module/providers/shared/hooks/useItemLayout.js:210
      (position.value = withTiming(layoutPos))
```

`useItemLayout` is the library's per-item reflow: every sortable item's
screen position is one `{x, y}` Vector held in a single shared value, and the
library re-targets it with one `withTiming(layoutPos)` call whenever the
layout changes — which is the library's _whole_ animation model for moving
items out of a dragged item's way, not an edge case. Upstream's real
Reanimated (native or its own non-native/web build) animates an
object-shaped shared value by walking its numeric leaves; this platform's
`withTiming`/`withSpring` deliberately animate finite numbers only
(`docs/api.md`, "Animated values" — colours go through `interpolateColor`
instead, and there is no vector equivalent). This is documented, intentional
platform behaviour, not a bug being tripped over.

It fires on the very FIRST layout pass of any `Sortable.Grid`/`Sortable.Flex`
— every item's position starts undefined and is always “different” from its
computed target the first time — so this is not a configuration this
platform's users could dodge: `shouldAnimateLayout` is an internal shared
value with no corresponding public prop, and `animateLayoutOnReorderOnly`
only changes WHEN it re-fires during a drag, never whether it fires on
mount. There is no prop on `SortableGridProps`/`SortableFlexProps` that skips
this path. A fourth wall was found waiting behind it and never reached:
`GestureStateManager` (wall count above) is deliberately refused here — its
static `.activate`/`.deactivate`/`.fail`, which the library's own
gesture-handler v3 adapter needs to re-arm a manual gesture asynchronously,
throw by name (`docs/api.md`: "the global tag→handler registry... its
absence is deliberate"). Upstream's own README says as much from the other
side — v3's hook adapter "requires the New Architecture" — so this was never
going to be free even if wall 3 were fixed.

### What is kept, and why

`examples/gallery/package.json` keeps `react-native-sortables@1.10.0` at the
version measured. `vite.config.ts` keeps `sortablesHapticsAreANoop` and the
`ssr.noExternal` entry — wall 1's fix is real and harmless whether or not
anything imports the package, and removing it would mean re-discovering the
same three build errors from scratch on a future revisit. There is no
gallery section: a sidebar entry that reliably crashes the whole process the
moment it is opened is not a demo, and the temporary `requestAnimationFrame`
polyfill that let wall 2 be seen past was removed with it, for the reason in
that section above.

A future revisit needed two platform-level changes; the first is done (see
the Update under wall 2 above — the global is real now, not a probe). What is
left is the one that actually matters: either vector-shaped
`withTiming`/`withSpring` or an equivalent per-item reflow primitive (wall 3) — wall 2 alone was never going to unblock this on its own.

## Revisit, 2026-08-05: wall 3 falls

`withTiming`/`withSpring` now animate upstream's real `AnimatableValue` —
numbers, and plain objects/arrays whose leaves are numbers, walked
recursively the way `decorateAnimation` does upstream — not just finite
numbers (`docs/api.md`, "Animated values"; the reading is transcribed in
`reanimated-compat/animatable-value.ts`'s header). `useItemLayout`'s
`position.value = withTiming(layoutPos)` is exactly the shape that widening
targets, so wall 3 was worth re-running against.

**Verdict: wall 3 falls.** A private headless sway, `gtkx build`'s own
output (`node dist/bundle.js`, not the Metro `run-linux` path this example
does not use), a temporary `SortableGrid` of six tiles standing in for a
gallery section (never committed, reverted after the run — same discipline
the original recon used for its own temporary `requestAnimationFrame`
polyfill), and the SAME temporary polyfill again: wall 2
(`requestAnimationFrame`) is fixed in a parallel, unmerged branch
(`feat/global-raf`) at the time of this revisit, so the app-local stub stood
in for it a second time rather than waiting on that branch or committing a
platform-level global from this one. The grid mounted, laid out all six
tiles in three columns with the configured gaps, and rendered a marker text
placed above it — no `assertAnimatableValue` throw, no crash, on the exact
first-layout-pass path the original wall 3 error trace named
(`useItemLayout.js:210`).

**Wall 4 (`GestureStateManager`) is not re-verified by this revisit.** The
previous write-up's reasoning for it stands untouched — upstream's own
README says the v3 gesture-handler hook adapter it needs "requires the New
Architecture", so it was never going to be free even with wall 3 gone — but
this pass only re-ran the MOUNT, the same scope the task that prompted it
asked for; no drag was attempted, so wall 4 is documented rather than hit.

**Cost, now that a per-item Vector is a real capability and not a crash**:
an `{x, y}` `withTiming` frame costs about 2× a single number's own
frame — 0.24 µs against 0.12 µs, VM-measured median of 15 rounds ×
100,000 frames, `spike/bench-vector-animated-values.ts` — well inside the
budget a per-item reflow across a whole grid needs, and nowhere near the
per-property write costs `docs/api.md`'s boundary table carries (a driven
`transform` is 1.5 µs on its own).

Kept from the original recon, unchanged by this revisit: the dependency at
the measured version, the vite wiring, and the decision not to add a gallery
section — wall 4 is still there, so a sidebar entry would still need a
disclaimer explaining why dragging it does nothing.

## Wall 4, confirmed: `GestureStateManager` is reached from a real drag, 2026-08-05

The task that follows this revisit (a gallery screen for the real package)
opened by asking the question the revisit above explicitly left open: does a
real drag actually reach `GestureStateManager`, or was that reasoning from
upstream's README (v3's hook adapter "requires the New Architecture")
optimistic? Read from source first, the way the original recon read every
other wall.

**The mechanism, traced end to end:**

`react-native-sortables`' `integrations/gesture-handler/index.js` picks its
gesture-handler adapter once at module load — `v3` when
`GestureHandler.useManualGesture` is a function, `v2` otherwise. This
platform implements `useManualGesture` (docs/api.md, the ten recognizers
table), so every `Sortable`/`SortableGrid` on this platform runs the v3
adapter, never the v2 one. `adapters/v3.ts`'s `useDragGesture` wraps a single
`useManualGesture(...)` call; `useItemPanGesture.ts` wires its
`onTouchesDown` to `DragProvider.handleTouchStart`, which — once
`sortEnabled`, `usesAbsoluteLayout` and "no other item already active" all
hold, the ordinary case for any real drag — arms a `setAnimatedTimeout` for
`dragActivationDelay` (200ms default, `constants/props.ts`) and then calls
the adapter's `activate()`, which only sets a `pendingActivation` flag. The
next `onTouchesMove` — i.e. the very next pointer movement after that
200ms, which any real drag has — reads `pendingActivation.value`, finds it
true, and calls `GestureStateManager.activate(event.handlerTag)` directly.
Nothing upstream stands between an ordinary press-hold-move and that call;
it is the library's only path to starting a drag under gesture-handler v3.

This platform's own `GestureStateManager` export is
`unsupported("GestureStateManager")` (`gesture-handler-compat/index.tsx`) —
a function wrapped in a `Proxy` whose `get` trap throws for every property
name outside a small introspection allowlist (`unsupported-export.ts`). So
`GestureStateManager.activate` throws on the PROPERTY READ, before the call
even happens. There is no code path around it: the throw is unconditional
once a drag survives its activation delay, which is the ordinary case, not
an edge one.

**The live probe, and why it stayed inconclusive on the crash itself.** A
private headless sway, a real `zwlr_virtual_pointer_manager_v1` pointer
(the same rig `scripts/shot-example-drag.ts` and the GTK tests use), and a
throwaway app — deliberately NOT the gallery: it mounted only a bare
`Sortable.Grid` of six tiles under `GestureHandlerRootView`, with its own
`gtkx.config.ts` declaring `Gtk-4.0` only (no `Adw-1`), the same
Adw-free probe-app shape `spike/plain-gtk` uses, built with `gtkx build` and
run as `node dist/bundle.js`. It was built this way, rather than as a
gallery section, for two reasons found while setting the probe up, both
orthogonal to `react-native-sortables` and neither fixed here:

- `gtkx dev`'s SSR module runner cannot resolve Adw for ANY app right now.
  `gtkx/bridge/adw.js`'s `probeViaDynamicImport` does
  `import(/* @vite-ignore */ "@gtkx/jsx/adw")`, and `@vite-ignore` hands
  that import to Node's raw ESM loader instead of Vite's module graph —
  which has no handler for the `virtual:gtkx-config` specifier
  `@gtkx/react`'s bootstrap touches at module scope, so the import throws
  `ERR_UNSUPPORTED_ESM_URL_SCHEME` and the probe silently reports "no Adw",
  even though the app's `gtkx.config.ts` declares it.
- A `gtkx build` bundle of an Adw-declaring app aborts on launch —
  `gtkx: GLib-ERROR: g_log_set_writer_func() called multiple times` — even
  from a pristine, unmodified `examples/gallery` (`git diff --stat` against
  origin/main empty, rebuilt, still aborts). Consistent with two separate
  init paths — the core door and the Adw door (#121) — each calling GLib's
  one-shot log setup once Adw actually resolves at build time (a build
  bundles away the `virtual:` specifier the dev-mode bug above trips on, so
  the probe likely succeeds for real here, which is what exposes the double
  init).

Both predate this task, reproduce on unmodified `main`, and block launching
the FULL gallery headless by either toolchain path right now — not specific
to sortables, and not this task's to fix; filed separately.

The Adw-free probe app sidestepped both and ran cleanly (six tiles, three
columns, correct gaps, no crash on mount — wall 3 stays fallen). But the
drag itself never registered: a diagnostic build with a `console.error` at
the top of `gesture-handler-compat/recognizer.ts`'s `onTouchesDown` and
`onTouchesMove` — the ONE place every recognizer on this platform, not just
`Gesture.Manual()`, reports a delivered touch — printed nothing across
several pointer sequences (varied hold time, added a settle-in jiggle,
widened the movement past `dragActivationDelay`). The virtual pointer moves
and clicks the compositor sees; nothing downstream of GTK's own gesture
claim in this particular minimal `chrome: "content"`, `Adw`-free probe
window received them. That is a rig gap in this probe, not a statement
about the mounted `GestureDetector` widgets the GTK test suite drives
successfully every day through the same pointer machinery — there was not
time in this task's budget to chase why this ONE probe shape did not
deliver touches before the verdict was due.

**Verdict: wall 4 stands, decided from the mechanism rather than a caught
exception.** The call site is unconditional, the throw is a property read
with no call needed, and the precondition (a drag surviving its own
200ms activation delay) is not an edge case — it is what every real drag
does. `examples/gallery` gains no `react-native-sortables` section from
this task; the two Adw/build-path bugs above are recorded for whoever picks
them up, and the vite wiring plus the dependency stay exactly where PR #124
left them, unchanged again.
