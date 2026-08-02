# One source, two drag-and-drop implementations, screen by screen

`examples/reanimated-dnd` is upstream's own example app for
`react-native-reanimated-dnd@2.0.0` (nineteen screens, ~8,700 lines, MIT).
[#90](upstream-libraries.md) then showed that the real published package runs
on this platform unaliased. So the same source can be built twice — once
against the mirror (`react-native-gtkx/dnd`, GTK's own
`GtkDragSource`/`GtkDropTarget`) and once against the real library — and the
difference between the two builds is a measurement rather than an argument.

```sh
npm run dev                  -w reanimated-dnd-example   # the mirror
DND_IMPL=real npm run dev    -w reanimated-dnd-example   # the real package
```

**One source, two configs, no fork.** `vite.config.ts` reads `DND_IMPL` and
passes `aliases: { "react-native-reanimated-dnd": false }` to the preset
([#91](../../packages/react-native-gtkx/src/aliases/index.ts)) for the second
build; `gtkx.config.ts` reads it too, for the application id, because two
GApplications sharing one id are one GApplication. Nothing under `src/`
knows which build it is in. A second copy of the app would have diverged
within a week and then proved nothing.

Every row below was driven by `scripts/shot-example-drag.ts` — a real pointer
on a private headless compositor, one drag per screen, at 900×780.

## The table

**Eighteen of the nineteen screens are pixel-identical at rest, and every drop
that lands on the mirror lands on the real library with the same toast.**
(Dynamic Heights is the one exception; Alignment & Offset differs only by a
few units in the scrollbar column, below any visible threshold.) The
differences are all in the same place: what happens to the view _while_ it is
dragged and _where it ends up_.

| #   | Screen              | Mirror                                      | Real library                                | Difference                                                                                                                                                      |
| --- | ------------------- | ------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Home                | renders, navigates to all 18                | identical                                   | none (0 px)                                                                                                                                                     |
| 2   | Music Queue         | reorders; `onDragging` live in the header   | reorders; `onDragging` live in the header   | **mid-drag the dragged row is invisible on the real build** — painted behind its siblings (`zIndex`, below)                                                     |
| 3   | Horizontal Tags     | "not implemented" notice                    | "not implemented" notice                    | none — but only because the PORT removed the calls. The real library's horizontal sortable **does** work here (below)                                           |
| 4   | Grid Sortable       | "not implemented" notice                    | "not implemented" notice                    | same; `SortableGrid` **does** work here (below)                                                                                                                 |
| 5   | Dynamic Heights     | rows at their natural Yoga height           | rows at `itemHeight`-derived offsets        | row 2 sits ~8 px higher on the real build. Flow layout vs absolute positioning — the documented divergence, visible                                             |
| 6   | Basic Drag & Drop   | `Nice! / Dropped on Zone Alpha`             | `Nice! / Dropped on Zone Alpha`             | the card returns to its row on the mirror; the real library leaves it where it landed                                                                           |
| 7   | Drag Handles        | `Nice! / Dropped on the target zone`        | `Nice! / Dropped on the target zone`        | clearest `dropAlignment` frame in the app: after the drop the mirror's card is back in its row, the real one is in the zone                                     |
| 8   | Custom Animations   | `Dropped! / Returned with spring animation` | `Dropped! / Returned with spring animation` | the port's banner says "nothing animates because there is no return journey" — true for the mirror; on the real build the card leaves its slot, so there is one |
| 9   | Active Drop Styles  | `Pulse! / Landed on the Pulse Zone`         | `Pulse! / Landed on the Pulse Zone`         | none observed                                                                                                                                                   |
| 10  | Alignment & Offset  | `Placed! / Aligned to center with offset`   | `Placed! / Aligned to center with offset`   | same banner problem as #8 — `dropAlignment`/`dropOffset` are inert on the mirror and honoured by the real library                                               |
| 11  | Bounded Dragging    | `Nice! / Dropped inside the boundary`       | `Nice! / Dropped inside the boundary`       | `dragBoundsRef`: the real card is clamped inside the blue box, the mirror's drag icon leaves it                                                                 |
| 12  | X-Axis Lock         | `Left! / Dropped on the left zone`          | `Left! / Dropped on the left zone`          | **`dragAxis`, photographed**: on a diagonal drag the real card moves left only; the mirror's icon follows the pointer diagonally                                |
| 13  | Y-Axis Lock         | `Bottom! / Dropped on the bottom zone`      | `Bottom! / Dropped on the bottom zone`      | same, on the other axis                                                                                                                                         |
| 14  | Bounded Y-Axis      | `Nice! / Dropped on the target`             | `Nice! / Dropped on the target`             | the corridor is narrow, so this is the sharpest bounds frame: the real card stays in it, the mirror's icon is 130 px clear of it                                |
| 15  | Capacity Limits     | `Placed! / Added to the single-item zone`   | `Placed! / Added to the single-item zone`   | none observed                                                                                                                                                   |
| 16  | Dropped Items Map   | `Placed! / Moved to Zone 1`                 | `Placed! / Moved to Zone 1`                 | none observed                                                                                                                                                   |
| 17  | Collision Detection | `Hit! / Landed on Contain Zone`             | `Hit! / Landed on Contain Zone`             | none observed — `contain` resolves the same on both                                                                                                             |
| 18  | Drag State          | `Dropped! / State changed to DRAGGING`      | `Dropped! / State changed to DRAGGING`      | none observed                                                                                                                                                   |
| 19  | Custom Draggable    | `Nice! / Dropped on the target zone`        | **nothing happens at all**                  | the one hard failure, and it is the PORT's, not the library's — see below                                                                                       |

## The one screen that fails, and why it is ours

`Custom Draggable` is the only screen in the app that consumes `useDraggable`
rather than `<Draggable>`, and it is the only screen the real build cannot
run. Nothing moves, nothing drops, nothing warns.

The port rewrote `components/CustomDraggable.tsx` around the mirror's hook
shape: upstream destructures `gesture` and wraps the view in a
`GestureDetector`, and the port destructures **`dragControllers`** and renders
it as a child, because on this platform a drag is a property of the widget
rather than of a recogniser wrapped around it. Under the real library
`useDraggable` returns no `dragControllers`, so the port renders `undefined`
and the card is inert.

That is worth stating precisely, because it is the opposite of a
disappointment: **every line of the app that is upstream's own works on both
implementations.** The single file that had to be adapted to the mirror is the
single file that does not survive being pointed back at the original. A
component can hide a platform difference; a hook whose whole contract is "you
render the view yourself" cannot.

## The five inert props, photographed

`docs/api.md` lists `dragAxis`, `dragBoundsRef`, `animationFunction`,
`dropAlignment` and `dropOffset` as accepted and ignored, because they all
describe _where the dragged view goes_ and on the mirror the view never goes
anywhere — GDK carries a `Gtk.WidgetPaintable` of it instead. Screens 11–14
are what that looks like rather than what it reads like:

- **X-Axis Lock**, diagonal drag from the centre toward the top-left. The real
  build's card is at the same `y` it started at, moved only in `x`. The mirror
  shows **two** cards: the original still in place, and the drag icon up and
  to the left, off-axis, wherever the pointer is.
- **Bounded Y-Axis**, drag toward the bottom-right corner of the window. The
  real card is clamped inside the narrow blue corridor (x 360–539). The
  mirror's drag icon sits at x 669–789 — its near edge 130 px clear of the
  boundary it is supposed to be held inside.

Both drops still land, on both builds, with the same toast. The trade is
exactly the one [upstream-libraries.md](upstream-libraries.md) described, and
it is now a picture.

The same frames settle what the port's two `NotImplementedNotice` banners are
worth. "The view never moved — GDK carried a picture of it instead" is an
accurate description of the mirror and a false one of the real build, where
the Custom Animations card is photographed **out of its slot and inside the
Animation Test Zone** mid-drag. The banners are not wrong; they are
build-specific, and this is the only part of the shared source that says
something only one of the two builds makes true. Left as they are rather than
made conditional: the app that ships is the mirror one, and a banner that
changes its mind with an env var is worse than a footnote here.

## `zIndex` during a drag: reproduced, and narrower than it looked

On the Music Queue screen the real library's dragged row **disappears**
mid-drag — a 3 px sliver between its neighbours is all that shows — while the
mirror's is plainly visible. That is the known `zIndex` gap: GTK4 has no
z-order property, a container paints its children in sibling order, and
upstream's `useSortable` lifts the dragged item with `zIndex`, which is inert
here.

What the eighteen screens add to #90's note is the **scope**: it only bites
when the dragged view is an _earlier_ sibling than what it passes over. Every
drop-zone screen in this app puts its zones above its draggables in the
markup, so the dragged card is a later sibling and paints on top — none of
screens 6–18 shows the symptom. It is a sortable-list problem, not a
drag-and-drop problem, and reordering a list is exactly where it hurts most.

## `useFlatList` was ours, and it is fixed

[#90](upstream-libraries.md) recorded that `Sortable` needed
`useFlatList={false}` here, and read it as a `FlatList` limitation. It was not:
it was a bug in `src/components/virtualized-list.tsx`, and the app it hurt was
worse off than that note said — **the whole Music Queue screen came up blank**,
not one row short.

Settled from upstream's own materials and RN's own source rather than by
reasoning about what ought to happen:

- **Upstream documents `useFlatList` as a performance switch and nothing
  else.** Its JSDoc reads "FlatList provides better performance for large
  lists with virtualization, while ScrollView renders all items at once.
  `@default true`". Their docs' own troubleshooting page _recommends_
  `useFlatList={true}` for large datasets; their gotchas guide, which runs to
  fourteen numbered entries, does not mention it. There is no documented
  caveat, so `useFlatList={false}` was never a divergence they had sanctioned
  — it was a workaround for us.
- **RN renders this shape correctly.** Upstream's `Sortable` passes no
  `getItemLayout`, and its rows are `position: absolute` with a per-frame
  animated `top`, so every `FlatList` cell measures zero. In RN 0.86's
  `VirtualizeUtils.js`, `elementsThatOverlapOffsets` treats the **first**
  cell's start as inclusive and every later cell's as exclusive
  (`(mid === 0 && currentOffset < scaledOffsetStart) || (mid !== 0 &&
currentOffset <= scaledOffsetStart)`). That asymmetry is what makes offset 0
  resolve to index 0 when every frame is `{offset: 0, length: 0}`, and the
  `== null` fallbacks below it then hand `last` a full batch. All rows render.
- **Ours walked past them.** `indexAt` searched for the first cell whose end is
  past the target — and a zero-length cell sitting _at_ the target never is —
  so it landed on the end of the run.

The fix is RN's rule, three lines, in `indexAt`. It was verified by removing
it again and rebuilding: without the guard the Music Queue screen is empty,
with it every row renders, with upstream's **default** `useFlatList` and no
prop set anywhere in the app. The gallery's Upstream sortables section
has dropped its `useFlatList={false}` accordingly, and
`tests/gtk/components/virtualized-list.gtk.test.tsx` covers the shape.

This one reaches much further than drag-and-drop: any list that positions its
own rows measured zero-height cells here, and every large list in the RN
ecosystem is a `FlatList`.

## The two deferred surfaces: both run

`SortableGrid` and `SortableDirection.Horizontal` are
[deliberately not implemented](drag-and-drop.md#deliberately-not-implemented)
in the mirror, and the port replaced both screens with a notice — so the two
builds of this app agree on them for a reason that has nothing to do with the
real library. The question they leave open is answered in
the gallery's Upstream sortables section, where the real package runs and
the calls can be made:

- **`SortableGrid` reorders.** Six tiles in a 3×2 grid; dragging the first
  onto the third rearranges them and reports `onMove` (`tile-3: 2 → 1`).
- **The horizontal `Sortable` reorders.** Four tags in a strip; dragging the
  first past the second swaps them and reports `onMove` (`tag-2: 1 → 0`).

So the deferral was correct in its reasoning — nothing their mechanism needs
differs from the vertical list, and the platform now supplies all of it — and
an app that wants those two surfaces today has a working answer: turn the
alias off for that one package.

## Reproducing the pair

```sh
npm run build:mirror -w reanimated-dnd-example    # → examples/reanimated-dnd/dist-mirror
npm run build:real   -w reanimated-dnd-example    # → examples/reanimated-dnd/dist-real
```

Side by side in the VM, under distinct units (the application ids differ, so
they are two windows rather than one):

```sh
cd ~/dev/react-native-gtkx/examples/reanimated-dnd
systemd-run --user --unit=dnd-mirror --setenv=WAYLAND_DISPLAY=wayland-0 \
  --working-directory=$PWD node dist-mirror/bundle.js
systemd-run --user --unit=dnd-real --setenv=WAYLAND_DISPLAY=wayland-0 \
  --working-directory=$PWD node dist-real/bundle.js
```

And one screen, driven by a real pointer, either way:

```sh
node scripts/shot-example-drag.ts examples/reanimated-dnd /tmp/out \
  --resolution=900x780 \
  --steps="wait:3500;click:450,503;wait:1500;drag:338,597>450,320@mid;shot:dropped"
DND_IMPL=real node scripts/shot-example-drag.ts examples/reanimated-dnd /tmp/out-real …
```

`--steps` grew a `scroll:X,Y,DETENTS` verb for this, because eleven of the
eighteen screens are below the fold on the home list and a Wayland pointer is
addressed by position.
