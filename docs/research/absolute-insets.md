# Research: the one layout property that is not a Yoga pass

Date: 2026-08-01. Run: VM (Ubuntu 26.04 aarch64, GTK 4.22.4), headless sway
via the `gtk` vitest project — the same machine and harness as
[transforms.md](transforms.md) and [animated-colors.md](animated-colors.md),
so the numbers below sit next to those files' without conversion.

## Verdict

**`top`/`left`/`right`/`bottom` animate at frame rate on a node whose own
`position` is `"absolute"`**, as a translation from the position the committed
layout gave it: **1.99 µs for the whole write** against **1.81 µs** for the
same write spelled as an explicit `translateY`, and **flat in the size of the
list** (1.92 µs at 60 rows, 1.96 µs at 300). The Yoga pass it replaces is
**32.8 / 115.3 / 478.0 µs** at the same three sizes.

**This does not reopen [animated-colors.md §4](animated-colors.md#4-layout-properties-the-measured-refusal).**
`width`, `flex`, `margin` and `padding` change what the SIBLINGS get, so
animating one genuinely needs a layout solve. An out-of-flow node's inset
changes nothing but where it is drawn, and "draw it somewhere else" is what
the transform path already does. The carve-out is that difference and nothing
wider: it is scoped to the node's OWN resolved `position`, and it is refused
even there in the configurations where the equivalence measurably fails.

## Why this narrow case earns the work

`react-native-reanimated-dnd`'s `hooks/useSortable.ts:489-503` returns, per
frame:

```
{ position: "absolute", left: 0, right: 0, top: top.value, zIndex: … }
```

[drag-and-drop.md](drag-and-drop.md) recorded the consequence: _"The list has
no flow layout at all… every row is absolutely positioned at a shared-value
offset."_ With layout properties refused across the board, the real upstream
package could never run here — its rows would move only on React commits. The
same shape is in `react-native-draggable-flatlist` and in most sortable
implementations, and the web's own guidance is the same advice in reverse
(animate `transform`, not `top`).

## 1. The probe: does a translated widget receive input where it is drawn?

This was the question the work was not allowed to start without. Our transform
path is `setStoredTransform` + `queueAllocate`, which **re-allocates** rather
than painting elsewhere — so it should — but a translation that looks right
until it is hit-tested is worse than the honest refusal already shipped.

Driven with a **real Wayland pointer** through
`zwlr_virtual_pointer_manager_v1` (`tests/gtk/support/virtual-pointer.ts`), on
a fullscreened window, against a `Pressable` inside the moving view. A Wayland
pointer is addressed by position rather than by focus, so an untouched zone
and a negative control are both part of the measurement rather than
decoration.

| step                                              | `pick()` | real press → `onPress` |
| ------------------------------------------------- | -------- | ---------------------- |
| baseline, box drawn at y 100–180, press (160,140) | `target` | **1**                  |
| after `translateY(300)`, press (160,140) — OLD    | `stage`  | **0**                  |
| after `translateY(300)`, press (160,440) — NEW    | `target` | **1**                  |
| untouched zone (700,500) during all of the above  | `quiet`  | **0**                  |
| untouched zone, pressed for real                  | `quiet`  | **1**                  |

`computeBounds()` reported the moved widget at exactly y = 400. So input
follows the widget, the old position goes genuinely dead rather than staying
live, and the zone that recorded nothing was live the whole time — the silence
means something.

Composed with a rotation, which leaves the plain-offset path for the
`GskTransform` one, the answer is the same and for the reason
[transforms.md §3](transforms.md#3-hit-testing-follows-the-transform--no-caveat-needed)
already measured: bounds became (120, 380, 80, 120), `pick` followed the
rotated shape — (160,500) hits although it is outside the flat box, (110,440)
misses although it is inside it — and a real press at (160,490) fired.

**The equivalence holds.** Both halves of the path (a re-allocated rect, and a
`GskTransform` when a user transform is composed in) are picked where they are
drawn.

## 2. What `position: "absolute"` means to this tree

Yoga's `PositionType.Absolute`, with the insets applied through
`setPosition(Edge, …)` (`src/layout/apply-style.ts`). The committed rect is
written to the rect store by `useLayoutChild`'s commit callback and read by
the parent container's `allocate()` hook, which places every child at
`rect.x + offset.dx, rect.y + offset.dy` — so the base the offset is measured
from is already in the store, already per-widget, and already the thing GTK
allocates against. Nothing new had to be stored.

Measured: moving an absolutely positioned child left its in-flow sibling's
rect bit-identical. That is the property the whole carve-out rests on.

## 3. The equivalence is not universal, and where it fails was measured

Same engine, same viewport (400×300), one absolutely positioned child, the
named inset raised by 40:

| configuration                                 | rect moved by | size changed by | translation?             |
| --------------------------------------------- | ------------- | --------------- | ------------------------ |
| `top` only                                    | (0, +40)      | —               | yes                      |
| `left` only                                   | (+40, 0)      | —               | yes                      |
| `right` only                                  | (−40, 0)      | —               | yes, INVERTED            |
| `bottom` only                                 | (0, −40)      | —               | yes, INVERTED            |
| `left`+`right`, no `width`                    | (+40, 0)      | **width −40**   | **no — a resize**        |
| `top`+`bottom`, no `height`                   | (0, +40)      | **height −40**  | **no — a resize**        |
| `left`+`right`, `width: 80`, left             | (+40, 0)      | —               | yes                      |
| `left`+`right`, `width: 80`, right            | **(0, 0)**    | —               | **no — Yoga ignores it** |
| `top`+`bottom`, `height: 40`, bottom          | **(0, 0)**    | —               | **no — Yoga ignores it** |
| `left: 0, right: 0`, `top` (the sortable row) | (0, +40)      | —               | yes                      |

So the rule is: **an inset is a translation when its axis is anchored by one
edge.** With both edges set the axis has two anchors, and Yoga either
stretches between them (no explicit size) or honours the start edge and drops
the end one (explicit size). Neither is a translation, and translating anyway
would invent motion a real layout pass would not produce.

`right` and `bottom` measure inward from the far edge, so a larger value moves
the node towards the origin: the derived translate carries `sign = -1`. The
engine lays out `Direction.LTR` unconditionally, so `left` is always the start
edge and there is no RTL case folded in here.

**Which style the rule is asked about matters.** `style={[styles.row,
useAnimatedStyle(() => ({ top: y.value }))]}` is how most people write this,
so `position` and the opposite edge are usually in a sibling entry the
updater's object never mentions. The authority is therefore the view layer,
which flattens first; `useAnimatedStyle` refuses only what it can decide on
its own (an updater that itself says `position: "relative"`, or that sets both
edges of the animated axis) and otherwise makes the leaf and lets the view
layer answer. Nothing becomes silent — only which of the two channels warns.

The rule lives in one place, `src/style/absolute-insets.ts`, and
`tests/unit/style/absolute-insets.test.ts` asserts it against the engine
rather than against a table: for every row above it runs the real
`LayoutEngine` twice and checks that what the rule promises is what Yoga did.
A rule that drifted from the engine is exactly the bug this design is most
likely to ship.

## 4. Cost

Whole write — a shared-value assignment through the mapper, the style node,
the derived translate, `setStoredTransform` and `queueAllocate`. No paint, so
this is comparable with animated-colors.md's table. 200 000 iterations, median
of three runs.

| write                                             | cost        |
| ------------------------------------------------- | ----------- |
| `useAnimatedStyle` → absolute `top`               | **1.99 µs** |
| the same, spelled `transform: [{ translateY }]`   | 1.81 µs     |
| absolute `top` in a 60-row list                   | 1.92 µs     |
| absolute `top` in a 300-row list                  | 1.96 µs     |
| for scale: `useAnimatedStyle` → `backgroundColor` | 11.2 µs     |
| for scale: `queueAllocate` alone                  | 0.58 µs     |

**The carve-out costs +0.18 µs, about 10 %, over writing the transform by
hand** — one subtraction and one multiply by ±1, per animated value per frame.
Everything else on the line is the path a transform already took.

Against the Yoga pass it replaces, measured on the same tree with the same
absolute rows (`setStyle` plus an engine flush and its commit walk):

| rows in the list | Yoga pass + commit | driven inset | ratio |
| ---------------- | ------------------ | ------------ | ----- |
| 5                | 32.8 µs            | 1.99 µs      | 16×   |
| 60               | 115.3 µs           | 1.92 µs      | 60×   |
| 300              | 478.0 µs           | 1.96 µs      | 244×  |

The shape of those two columns is the whole argument. The layout column is
**O(the tree)** even for an absolute node, because `calculateLayout` and the
commit walk are; the transform column is flat, which is the property an
animation primitive must have. A 300-row sortable list spends 0.01 % of a
16.7 ms frame moving a row, against 2.9 % in Yoga alone.

These numbers are lower than
[animated-colors.md §4](animated-colors.md#4-layout-properties-the-measured-refusal)'s
63.9 / 127.6 / 496.3 µs at 5 / 60 / 300 for a good reason and it is worth
saying out loud: that table measured a `width`, which re-lays-out the
following siblings, and these rows are absolute, which do not. The absolute
case is the CHEAPEST layout write there is — and it is still 16–244× the
transform, and still grows.

## 5. The semantic difference, which is documented rather than hidden

The node's Yoga `top` does not change. Only its allocated and painted position
does. `measure()` therefore reports:

| field             | reports                                       |
| ----------------- | --------------------------------------------- |
| `x`, `y`          | the committed LAYOUT position — untranslated  |
| `width`, `height` | the committed size — unchanged                |
| `pageX`, `pageY`  | where the node is actually drawn — translated |

Measured: a row driven to `top: 150` reported `y` unchanged and `pageY`
+150.00. `measureInWindow` and `measureLayout` go through the same GTK
`compute_point` path as `pageX`/`pageY`, so both follow the translation too.

This is not a new inconsistency: it is exactly what an explicit `translateY`
has always reported here (`animated-style.gtk.test.tsx` asserts the same split
for a transform), and it follows RN's own model, where `measure()` reports the
layout rect and transforms are visual only. It is written down in
[api.md](../api.md) because an app that reads geometry back is entitled to
know which of the two numbers moved.

## 6. `zIndex`, which is in that style object every frame

Established rather than assumed. Today a `zIndex` in any style — animated or
not — produces `[react-native-gtkx] Unknown style property "zIndex" is not
supported and will be ignored` from the style splitter, once per session, and
an animated one additionally hit the generic "cannot write to a mounted widget
without a React render" message. That second sentence was wrong, and it is now
replaced by one about GTK.

**An animated `zIndex` needs nothing, because a static one does nothing
either.** GTK4 has no z-order property: a container paints its children in
sibling order, so the last sibling is on top. Measured on two overlapping
absolutely positioned rows with the first lifted over the second, `pick()` at
the overlap returned the SECOND one — the later sibling, regardless of the
`zIndex` on the first.

Restacking would mean reordering the widgets themselves, and that is the one
thing this platform cannot do casually: `syncChildOrder`
(`components/use-layout-child.ts`) exists precisely to put the shadow tree
back into widget order after React moves a child, so reordering widgets for
paint would silently reorder the LAYOUT. That is a trade worth refusing rather
than making invisibly, and the warning now says so.

For a sortable list the practical consequence is that a row dragged over the
row below it is painted under it, unless the app orders the elements the way
it wants them painted. That is a real gap and it is recorded in
[api.md](../api.md) as one.

## Not implemented, and why

- **`start`/`end` insets.** RN's writing-direction-relative aliases are not in
  this platform's `LayoutStyle` at all, so they never reach Yoga — animated or
  static. Adding them is a layout-contract change, not an animation one.
- **Percentage insets.** `top: "50%"` has no fixed offset from a point base,
  so it is not made a driveable leaf; a mapper that switches from a number to
  a percentage changes the leaf signature, which rebuilds the style and puts
  the property back on the ordinary refusal path. Deliberate: the alternative
  is resolving a percentage against a container size that the animation is not
  watching.
- **`zIndex`.** Above.
- **Everything else in animated-colors.md §4.** `width`, `height`, `flex`,
  `margin*`, `padding*`, `gap`, `aspectRatio`, `flexBasis`, `min*`/`max*`:
  unchanged, refused by name, for the reason measured there.
