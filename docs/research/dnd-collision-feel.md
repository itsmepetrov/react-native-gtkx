# A neighbour that would not yield, on the Upstream sortables screens

Reported from hands-on dragging in the gallery's **Upstream sortables**
section — the REAL `react-native-reanimated-dnd@2.0.0`, running on this
platform's compat surfaces (`reanimated-compat`, `gesture-handler-compat`,
`worklets-compat`), not this repo's own mirror (`react-native-gtkx/dnd`):

1. **List**: dragging a row, the one under it does not always step aside —
   you have to drag unnaturally far below/above before the swap happens.
2. **Grid**: a tile carried right on top of another sometimes does not
   displace it at all until you find one specific offset.

**This repo's own mirror does not have this problem** — the user confirmed
the gallery's "Drag and drop" section (`react-native-gtkx/dnd`) feels fine,
narrowing the investigation to the Upstream screens specifically. Nothing in
`packages/react-native-gtkx/src/dnd` changed as a result of this task: the
mirror's collision mechanism (GDK hit-testing the raw pointer against a
neighbour's full rect — grab-point dependent, unlike upstream's own
reasoning below) is measured and recorded as-is in
`tests/gtk/dnd/collision-thresholds.gtk.test.tsx`, kept as evidence for
whoever next touches that mechanism, not acted on here.

## The question: our compat surfaces, or upstream's own arithmetic?

Two hypotheses, and the whole point of this investigation is telling them
apart with numbers rather than a guess:

- **(a) Distorted input.** `useSortable`/`useGridSortable` read
  `event.absoluteX`/`absoluteY` from the Pan gesture our
  `gesture-handler-compat` produces. If that compat surface fed them
  something a real phone's `PanGestureHandler` would not — a scaled,
  stale, or coordinate-space-shifted position — the reorder threshold
  upstream computes from it would be distorted by an amount OURS to fix.
- **(b) Upstream's own math.** `useSortable`'s `setPosition` and
  `useGridSortable`'s `getGridCellFromCoordinates` both floor the dragged
  item's own rect onto a slot boundary. If the inputs are accurate, the
  asymmetric dead zone this produces is upstream's own documented
  behaviour, present on a real phone too — ours to document, not fix.

## (a): read from source and checked against this repo's own prior measurement

`useSortable.js`/`useGridSortable.js` (the exact published source in
`node_modules/react-native-reanimated-dnd/lib`) never call `measure()` or
`measureInWindow()` anywhere in the reorder path — the one place this
platform's layout timing or `computePointInWindow` conversions could have
introduced a distortion `Draggable`/`useDraggable` are exposed to
(`safeMeasure`) is simply absent from `Sortable`/`SortableGrid`. Both hooks
track only DELTAS: `initialFingerAbsoluteY.value = event.absoluteY` once, on
`onStart`, and every subsequent `onUpdate` computes
`event.absoluteY - initialFingerAbsoluteY.value`. A delta of two reads from
the SAME source cancels any CONSTANT offset between coordinate frames
exactly — the only way (a) could still apply is if our compat's
`absoluteX`/`absoluteY` are not a stable, accurately-scaled 1:1 read of the
pointer's window position throughout a drag (e.g. a fractional-scale
mismatch, or updates arriving less often than the real hardware would, at a
rate coarse enough to change which slot a `Math.floor` lands on).

**This was already investigated empirically for the grid case, before this
task, with a real pointer in a real running app** —
`docs/research/dnd-hover-flicker.md` §5: "`useGridSortable` never calls
`measure()`... any constant offset between coordinate frames cancels
exactly. Logged from the running app, the very first frame of a drag on the
middle tile of the top row reports `x=82 y=3` — the tile's true content
coordinates... There is no offset to find." That is a direct, real-pointer
answer to hypothesis (a) for the grid: negative.

Read from source (`gesture-handler-compat/press-event.ts`,
`recognizer.ts`), `absoluteX`/`absoluteY` are RN's own `pageX`/`pageY`:
`computePointInWindow(widget, locationX, locationY)`, a direct GDK
`compute_point` from whichever widget the drag gesture's controller reports
against, into window coordinates — the same logical-pixel space GTK itself
lays out in throughout, with no separate DPI conversion this platform
performs on the way. No scaling or sampling-rate anomaly specific to Pan
turned up reading that path either. Structurally, the list case
(`useSortable`) is the identical shape one file over (`positionY.value =
initialItemContentY.value + (event.absoluteY - initialFingerAbsoluteY.value)`),
so the same conclusion applies: **(a) is not supported.**

This task's attempt to re-confirm (a) directly for the LIST case with a
fresh, real-pointer measurement (extending the same rig, against the REAL
package rather than the mirror) hit an unrelated `@gtkx/testing` rendering
gap — mounting the real `Sortable` under `render()` throws from a `View`
several layers inside `Animated.createAnimatedComponent(ScrollView)`, even
wrapped in a `<Root>` that renders this platform's OWN mirror `Sortable`
without incident. Recorded, not chased, in
`tests/gtk/dnd/_measure-real.gtk.test.tsx` (kept, `.skip`), because the
identical real `Sortable`/`SortableGrid` demonstrably DOES run correctly in
a real `gtkx dev`/build — the gallery's own Upstream sortables section is
proof, and is where the §5 grid measurement was actually taken. The
conclusion for LIST rests on source-reading plus the grid case's precedent,
not an independent fresh measurement of the list's own exact px number —
the honest state of the evidence, not the strong form.

## (b): upstream's own arithmetic, with numbers

**Grid — already measured** (`dnd-hover-flicker.md` §5, `docs/api.md`,
prior PR #115): `getGridCellFromCoordinates` floors both axes onto the cell
whose TOP-LEFT corner is at or before the point. With the gallery's 74px
tiles and 8px gaps, `Math.floor(y / 82)`: moving to a HIGHER index needs
the dragged tile to travel the full 82px — arriving exactly on top of the
target — while moving to a LOWER index needs one pixel. Measured in all
four directions: no horizontal/vertical asymmetry, only a
toward/away-from-index-0 one.

**List — read from source, not yet independently re-measured with a live
pointer against the real package (see the gap above), predicted from the
identical mechanism.** `useSortable`'s `onUpdate` sets
`positionY.value = initialItemContentY.value + fingerDyScreen`
(`fingerDyScreen` the raw pointer delta since the drag began — grab-point
independent, because the item's rect translates in lockstep with the
finger regardless of where inside it the drag started), and the actual
reorder is `setPosition`: `Math.floor(positionY / itemHeight)`, clamped and
compared against the current index. Same shape as the grid, one axis: a row
one `itemHeight` away from a boundary crossed towards a HIGHER index needs
the row's own top edge to travel the whole `itemHeight` (arriving exactly
where the neighbour's top edge is); crossing towards a LOWER index needs
one pixel past the current row's own top. On the gallery's own "Upstream
sortables" `Sortable` (`ROW_HEIGHT = 56`), that predicts: **away from index
0 — up to ~56px of travel; toward index 0 — ~1px.** On
`examples/reanimated-dnd`'s ported `SortableExample` (`ITEM_HEIGHT = 70`):
**~70px away, ~1px toward.**

## Verdict

Both reported symptoms are **(b), upstream's own arithmetic** — not this
platform's compat surfaces. The grid case is a repeat of the already-closed
#115 finding, now with the list case's analogous mechanism read from the
same source and predicted at the gallery's own dimensions. Nothing in this
platform's `gesture-handler-compat`/`reanimated-compat` was found to distort
what `Sortable`/`SortableGrid` receive; there is nothing here for this repo
to fix, because the platform is faithfully reproducing a real
`react-native-reanimated-dnd` app's own behaviour on a real phone.

## What is documented, and what is proposed upstream

`docs/api.md`'s `getGridCellFromCoordinates` row already stated the grid
floor as upstream's own behaviour; this task adds the list's analogous
number next to it (Sortable/SortableGrid section) and a pointer here for
the reasoning. `docs/research/upstream-libraries.md` and
`dnd-hover-flicker.md` cross-reference this doc for the list case, so a
reader who found the grid's dead zone there finds the list's too.

A concrete fix upstream is proposed in the task file
(`.claude/epics/component-gaps/dnd-collision-feel.md`) for the user to
decide whether to file: test the dragged item's CENTRE against a slot's
centre band, rather than flooring the top-left corner against the slot
origin, in both `useSortable`'s `setPosition` and `gridCalculations`'s
`getGridCellFromCoordinates` — `dnd-hover-flicker.md` §5 already flagged
this as "worth filing" for the grid; this task extends the same reasoning
to the list function it did not originally cover. This repo does not adopt
it as a silent local deviation: both mechanisms are reproduced faithfully
here, upstream's parity is the contract, and the improvement — if the user
wants it — belongs upstream, where every app using the real package
benefits, not only the one running on this platform's compat surfaces.

## Reproducing this

```sh
# The mirror's own (unchanged) measured thresholds, for the record:
npx vitest run --project gtk tests/gtk/dnd/collision-thresholds.gtk.test.tsx

# The blocked real-package rig, kept for whoever picks the rendering gap up:
npx vitest run --project gtk tests/gtk/dnd/_measure-real.gtk.test.tsx
```
