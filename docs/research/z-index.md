# Research: `zIndex`, in a toolkit that has no z-order

Date: 2026-08-02. Run: VM (Ubuntu 26.04 aarch64, GTK 4.22.4), headless sway via
the `gtk` vitest project — the same machine and harness as
[animated-colors.md](animated-colors.md) and
[absolute-insets.md](absolute-insets.md), so the numbers here sit next to
theirs without conversion. Software rendering, so absolute paint costs are
pessimistic; every comparison below is between paths measured against each
other on the same machine.

## Verdict

**`zIndex` works, for paint and for picking.** A container allocates its
children in Yoga's order and **snapshots them in `zIndex` order**, and a widget
that a higher-painting sibling covers answers "not me" to `gtk_widget_pick()`,
so input lands where the pixels are.

It replaces the third instance of the pattern this project keeps refusing: a
style the platform accepted and silently ignored. It was measured inert twice
before this — [absolute-insets.md §6](absolute-insets.md) and
[upstream-libraries.md](upstream-libraries.md), where the real
`react-native-reanimated-dnd` met it.

**It is not free.** A JS `snapshot` vfunc costs **0.9 µs per child** against
GTK's own **0.19 µs**, and that is paid by every `View` whether or not
anything is raised, because GObject has one vtable per class and gtkx offers no
way to chain up to the parent implementation. §4 has the numbers, what was
done to shrink the gap (2.9 µs → 0.9 µs per child), and why nothing further is
reachable from here.

## 1. What GTK gives you, and what it does not

Paint order in GTK4 is child order: `gtk_widget_real_snapshot` walks
`first_child → last_child` calling `gtk_widget_snapshot_child`. There is no
z-order property, and reordering the widgets is the one thing this platform
cannot do casually — `syncChildOrder` (`components/use-layout-child.ts`) exists
precisely to put the shadow tree back into WIDGET order after React moves a
child, so restacking for paint would silently restack the layout.

Paint order and layout order do not have to be the same, though, and this
platform owns the widget: `RnGtkxViewBox` (`gtkx/bridge/view-box.ts`) is
already a `registerClass`ed `GtkBox` subclass with an overridden `contains()`.
Adding a `snapshot()` override to it is what Android does for the same reason
(`ViewGroup.getChildDrawingOrder`).

**Probed before anything was built on it**, on the real toolkit: a container
with a first child raised to `zIndex: 10` produced this render tree, from
`gsk_render_node_write_to_file()` —

```
transform { transform: translate(100, 100); child: container { … } }   ← the LATER sibling
transform { transform: translate(50, 50);   child: color { … } }       ← the raised FIRST child
```

— i.e. the order really did invert in the tree GSK gets, not merely in a
property we set. The distinction is the whole reason the assertions in
`tests/gtk/style/z-index.gtk.test.tsx` read the dump: a widget-property check
would have passed while nothing reached the paint, which is exactly how the
`overflow` bug hid.

## 2. The half that is easy to miss: picking

`gtk_widget_pick()` descends in REVERSE child order, so sorting the paint alone
leaves a raised view drawn on top and still unclickable — worse than the bug
being fixed.

There is no `pick` vfunc to override. GTK 4.22's `GtkWidgetClass` ends its
public vtable at `contains` (checked in `/usr/include/gtk-4.0/gtk/gtkwidget.h`
and against gtkx's generated `registerWrapperClass(Widget, …)`, which lists
`snapshot` at byte offset 320 and `contains` at 328 and stops). `gtk_widget_pick`
is a plain function:

```c
for (child = last_child; child; child = prev_sibling)
  { picked = gtk_widget_pick (child, …); if (picked) return picked; }
if (!GTK_WIDGET_GET_CLASS (widget)->contains (widget, x, y)) return NULL;
return widget;
```

Which leaves exactly one per-point hook — `contains()`, the vfunc this file
already overrides. So a widget answers `false` where a sibling of it (or of one
of its ancestors) that paints ABOVE it would answer. "Would answer" is asked as
`sibling.pick(...)`, which brings the rest of RN's rules with it for free: a
raised overlay with `pointerEvents: "none"` paints on top and occludes nothing.

**The hole in that, and how it is closed.** `contains()` is consulted only
after a widget's children have been tried, so a covered `View` can decline but
a bare `GtkLabel` inside it cannot — and `<Text>` is a bare GtkLabel, targetable
by default. Measured: with the paint sorted and the veto in place, a press over
the drop zone's own label still went to the zone.

`Text` and `Image` have no press prop on this platform — nothing is ever
attached to those widgets — so they are declared **paint-only leaves**, and
while a container has a raised child the paint-only leaves under it are made
untargetable. The pick then lands on their nearest `View`, which is the widget
the press would have propagated to anyway and which does answer the occlusion
question. Restored the moment nothing is raised there, because it is not free
of consequence: `pointerEvents: "box-none"` on a View whose only child is a
`Text` would otherwise fall through to whatever is behind it.

**What is left, and it is documented rather than hidden**
([api.md](../api.md)): an interactive native leaf inside a covered sibling —
`TextInput`, `Switch`, a `ScrollView` viewport, a raw GTK widget in a slot —
still takes the press, because it must stay targetable and GTK has no per-point
subtree veto.

## 3. RN's semantics, checked rather than assumed

Checked against RN's own source and behaviour, not from memory. All four are
pinned by tests in `tests/gtk/style/z-index.gtk.test.tsx`.

| Rule                                    | RN                                                                                                                | Here     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| Applies whatever `position` is          | RN applies it unconditionally; CSS needs a non-`static` `position` for `z-index` to take effect                   | the same |
| Equal values keep document order        | a stable ordering; an unstable one would let equal siblings swap between frames                                   | the same |
| `undefined` is `0`, negatives are legal | a negative value paints below siblings that say nothing                                                           | the same |
| Per sibling group only                  | orders siblings; no stacking context that escapes the parent, and a child cannot paint above its parent's sibling | the same |

The CSS difference is the one most likely to be imported by accident, so
nothing in the implementation consults `position`. Stability is not left to the
engine either: `Array.prototype.sort` has been required to be stable since
ES2019, and the comparator carries an explicit index tiebreak so that the
property is stated rather than assumed. A test with five equal-`zIndex`
siblings asserts document order over repeated snapshots — a single sample
cannot tell a stable sort from a lucky one.

The last row is the rule that decides what an app has to write, and it is the
one most likely to be read as a bug. In the gallery's `upstream-drop-zones`
section the
chips live in one row and the drop zones in another, so the thing that has to
rise is the chip ROW, not the chip: exactly the one line the same app needs on
iOS and Android, and exactly what `zIndex` doing nothing used to hide.

It also decides what `zIndex` **cannot** fix, which
[dnd-differential.md](dnd-differential.md) photographed on the Music Queue
screen. `VirtualizedList` wraps every cell in a `View` — RN's own structure,
`CellRenderer` — so `useSortable`'s `zIndex` lands on the row INSIDE a cell and
the cells are the sibling group. Measured here with the sort disabled and
re-enabled on that exact frame: **not one pixel differs**. A windowed sortable
list's dragged row still cannot rise above the neighbouring cell, on this
platform and on RN alike, and the fix for that is a list-structure question
rather than a z-order one.

## 4. What it costs

Measured on a container snapshot, with only the CONTAINER invalidated so its
children keep their cached render nodes — which is the frame a drag actually
produces. The paint floor is an `Animated.View` deck: it renders a plain
`GtkBox`, so its snapshot is `gtk_widget_real_snapshot`, GTK's own C child
loop, with the same children and the same `RnGtkxLayout` as the `View` deck
beside it.

µs per container snapshot, median of five interleaved rounds of 400:

| children | paint floor (GTK's C loop) | fast path (nothing raised) | sorted | if the order were sorted per frame |
| -------- | -------------------------- | -------------------------- | ------ | ---------------------------------- |
| 5        | 8.9                        | 16.3                       | 15.4   | 31.0                               |
| 60       | 25.0                       | 68.8                       | 70.7   | 247.0                              |
| 300      | 84.8                       | 325.0                      | 316.0  | 1464.5                             |

Per child, from the 5 → 300 slope: floor **0.26 µs**, fast path **1.05 µs**,
sorted **1.02 µs**, per-frame sort **4.86 µs**.

Three things are worth reading off that table.

- **Sorting costs nothing, because it is not done per frame.** The cached
  ordering is recomputed on change — a `zIndex` write, or a commit that touched
  the container's children — and `useSortable` changes its VALUE about twice
  per drag while putting it in the style object every frame. The last column is
  what the naive version would have cost: **4.6× at 300 children**.
- **The fast path is guarded by one integer.** A process-wide count of raised
  widgets; while it is zero, `snapshot()` and `contains()` do exactly what they
  did before any of this existed — no allocation, no sort, no comparison per
  child.
- **The fast path is still not free, and the reason is the vfunc itself.** It
  was **2.89 µs per child** at first, because walking the sibling chain from JS
  mints a fresh native wrapper per `getNextSibling()`. The container's
  `allocate()` hook already walks exactly that chain, so it now hands the array
  to the paint pass: **2.89 → 1.05 µs**. What remains is one
  `snapshotChild()` FFI hop per child, 0.9 µs against GTK's 0.19 µs, and it is
  not reachable from here — GObject has one vtable per class, so the override
  cannot be per-instance, and gtkx exposes no way to call the parent class's
  implementation (`registerClass` installs vfuncs and keeps no handle on what
  it replaced). **An upstream chain-up would remove this entirely**; noted in
  [upstream-gtkx.md](../upstream-gtkx.md).

For scale: this is the same shape and the same order of cost the container's
`allocate` pass already pays per child on every animated frame, and it only
falls on containers on the damage path.

The child array is safe to cache because a child cannot appear, disappear or
move without queueing a resize on its container, and GTK runs the layout phase
before the paint phase — so an allocate always lands between a change and the
snapshot that would see it. A container whose allocate never ran has no entry
and the vfunc walks live.

## 5. Proof, and the mutation check

`tests/gtk/style/z-index.gtk.test.tsx`, 15 tests. Paint from GSK's own
serialization; picking through `gtk_widget_pick()` AND through a real Wayland
pointer (`tests/gtk/support/virtual-pointer.ts`) on the shape a drag-and-drop
library produces — a raised card over a drop zone with a label in it — with an
untouched zone asserted silent and then pressed for real, and a negative
control on the far side of the card.

One thing the pointer test had to learn: **GTK resolves which widget the
pointer is over on crossing and motion events, not on the button press**, so a
press at a coordinate the pointer is already at is delivered against the target
the last motion computed. Every press in that test therefore arrives from
somewhere else, which is also the only thing a real hand can do.

Each half of the implementation was removed in turn, and the failures are
exactly the ones that should be:

| mutation                                         | tests that fail | which                                                       |
| ------------------------------------------------ | --------------- | ----------------------------------------------------------- |
| the sort removed (paint stays in document order) | 11 of 15        | every paint assertion, and every picking one with it        |
| the paint sorted, the `contains()` veto removed  | 6 of 15         | exactly the picking ones; every paint assertion stays green |
| paint-only leaves left targetable                | 3 of 15         | exactly the three with a `Text` under a raised sibling      |
| the sort made unstable (equal values reversed)   | 5 of 15         | the stability test, and the ordering assertions with it     |

## 6. Shown in the running app

The gallery's `upstream-*` sections — the real
`react-native-reanimated-dnd@2.0.0` and `react-native-drawer-layout@4.2.9`
from npm, unaliased — driven by a real
pointer in a headless session (`scripts/shot-example-drag.ts`). This is the
screen the bug was reported on, before #93 folded it in from
`examples/upstream-libraries`.

- **Before:** a chip dragged onto a drop zone **vanishes**. The zone lights its
  `activeStyle`, so the drag itself was always working — the chip is simply
  painted behind it.
- **After:** the chip rides on top of the zone the whole way, and the drop
  lands. It needed the one line RN itself needs (`zIndex` on the chip row
  rather than on the chip, per §3's last row); nothing else changed.

That closes the last item on
[upstream-libraries.md](upstream-libraries.md)'s honest-gaps list: "`zIndex`
during a drag is the one gap that makes the real library look worse than it
is." The narrower part of it that a z-order fix does not reach — a windowed
`Sortable`'s rows, which are inside cell wrappers — is in §3."
