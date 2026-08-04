# A drop zone that strobed, and the frame nobody asked to wait for

Reported from the gallery's **Upstream drop zones** section: hold a chip over
"To do" and the zone's highlight does not stay on. It flashes on and off for
as long as the pointer keeps moving, as if the zone were told "something is
over me" and "nothing is over me" alternately.

The first suspicion was #95, which had landed hours earlier and made `zIndex`
order **picking** as well as paint. It is a good suspicion — the dragged chip
now wins the pick over the zone beneath it, so the pointer really does change
what it lands on mid-drag. It is also wrong, and the measurement that settles
it is in §2.

## 1. What the zone is actually reacting to

Nothing in `react-native-reanimated-dnd` asks GTK who is under the pointer. A
`Droppable` registers a **rectangle** with the `DropProvider` and the dragged
item's own arithmetic decides the rest: `useDraggable`'s pan `onUpdate`
schedules `updateHoverState`, which walks the registered slots and sets
`activeHoverSlotId` to the first one the item's rect intersects.

So the zone lights up when it is **in the registry and intersecting**, and
goes dark when it is either out of the registry or not intersecting. Both
halves matter, and it turned out to be the first one.

## 2. #95 is not it

The gallery section, driven by a real injected Wayland pointer
(`scripts/shot-example-drag.ts`'s rig), dragging "Design" onto "To do" over
2.4 s and then holding for 3 s. Counted: every `onActiveChange` the two zones
reported, including the two `false`s they report on mount and the one on
release — so **3 is a clean drag** and anything above it is churn.

| `zIndex: 1` on the chip row | transitions |
| --------------------------- | ----------- |
| present (i.e. #95 live)     | 5, 7, 23    |
| removed (i.e. pre-#95)      | 25, 5, 35   |

Both conditions churn, neither churns more, and the spread inside each
condition is larger than the gap between them. Whatever this is, it is not
z-order. Two further controls agree:

- **the mirror does not churn.** The same drag against
  `react-native-gtkx/dnd`, whose zones are `GtkDropTarget`s and therefore
  _are_ driven by `gtk_widget_pick()`, reports exactly one enter and one
  leave — with `zIndex` on the chip row and without it. If #95's `contains()`
  veto were producing enter/leave churn, this is the implementation it would
  show up in first, and it is silent.
- **the churn scales with the POINTER, not with the paint.** Same drag, same
  build, only the interval between injected motion events changed:

  | motion interval | transitions |
  | --------------- | ----------- |
  | 40 ms           | 3           |
  | 10 ms           | 7           |
  | 4 ms            | 9           |

  A real mouse reports every 8 ms or less, which is why the user saw a strobe
  and a 40 ms script did not.

## 3. What it is

Logging the registry itself — `register`/`unregister` in upstream's
`DropContext`, and the slot count each `updateHoverState` saw — prints the
whole mechanism in twenty lines. Timestamps in ms:

```
8321  hover slots=2
8326  UNregister 1 ; UNregister 2      <- the commit that turned the zone ON
8326  zone-todo active=true
8342  hover slots=0                    <- next motion. registry is empty
8346  register 1 ; register 2          <- 20 ms after the unregister
8347  UNregister 1 ; UNregister 2      <- the commit that turned it OFF
8347  zone-todo active=false
8354  hover slots=0
8365  register 1 ; register 2
8374  hover slots=2
8378  UNregister 1 ; UNregister 2
8378  zone-todo active=true
...
8438  hover slots=2                    <- settles only once a check happens
                                          to land while the slots are back
```

Two things combine.

**Upstream empties its own registry on every hover change.** `DropProvider`
builds its context value with `useMemo`, and `activeHoverSlotId` is one of the
dependencies — so every hover change mints a fresh `register`/`unregister`
pair. `useDroppable` holds

```js
useEffect(() => () => unregister(id), [id, unregister])
```

whose only job is to clean up on unmount. A changed `unregister` identity
re-runs it, and React runs the **destroy** pass before the create pass, so
every zone is deleted from the registry the moment any zone lights up. It is
re-registered by a different effect in the same commit — but that one goes the
long way round, through a measurement.

**This platform made the long way round longer than one pointer event.** The
re-registration is `scheduleOnUI(measure)` and then `scheduleOnRN(register)`.
`scheduleOnRN` was a microtask; `scheduleOnUI` was a microtask **plus a
frame**. So the round trip cost ~20 ms while the next pan update — which is a
plain microtask off a `GtkGestureDrag::drag-update`, and GTK delivers those
per GdkEvent rather than per frame — arrived in 16. The check landed inside
the window where the registry was empty, found nothing, set the hover to
`null`, and that state change emptied the registry again. Self-sustaining, for
as long as the pointer kept producing events.

## 4. The fix, and why it is ours to make

`scheduleOnUI` no longer waits for a frame. It defers by a **task**
(`reanimated-compat/threads.ts`), which keeps every property the contract
actually asks for:

- asynchronous, so nothing re-enters its caller — the reason these are not
  direct calls on a single-threaded platform in the first place;
- batched, so everything queued in one tick still runs in one go, in order;
- still **later** than `scheduleOnRN`'s microtask, so the relative order of a
  UI-ward and an RN-ward hop issued in the same tick is unchanged;
- and not a microtask, which could starve GTK's main loop — a worklet that
  re-arms itself is a legitimate shape and would take paint and input with it.

The frame was copied from `react-native-worklets/src/threads.ts`, the
non-native build this platform mirrors elsewhere on purpose. It is the wrong
thing to copy **here** specifically: `requestAnimationFrame` is the web
standing in for a UI runtime it has not got, and React Native — which is the
contract this project holds itself to — posts to a real UI thread that picks
the job up when it is scheduled, not on the next frame. Nothing in RN makes a
UI hop cost a frame; the web's does because the web has nowhere else to put
it. The same app on `react-native-web` would strobe the same way.

Measured after, same rig, same coordinates:

| build                        | transitions |
| ---------------------------- | ----------- |
| before (`microtask` + frame) | 5, 7, 23    |
| after (task)                 | 3, 3, 3     |

Three runs, no churn, and the drop still lands.

## 5. The grid that would not reorder, which is a different animal

Reported at the same time, and worth recording here because the first guess was
that it was the same bug: in the gallery's `SortableGrid` next door, dragging
tile 2
down onto tile 5 never reorders. It is not the same bug, it is not `zIndex`,
and it is not this platform.

**It is not a coordinate-space error, which was the leading hypothesis.**
`useGridSortable` never calls `measure()`. Its pan keeps only DELTAS —
`event.absoluteX - initialFingerAbsoluteX` — added to the item's own content
position, so any constant offset between coordinate frames cancels exactly.
Logged from the running app, the very first frame of a drag on the middle tile
of the top row reports `x=82 y=3` — the tile's true content coordinates —
with the grid sitting 700px down a 900px window. There is no offset to find.

**The threshold is upstream's, and it is a whole cell.**
`getGridCellFromCoordinates` floors the dragged item's TOP-LEFT corner:
`row = Math.floor(y / (itemHeight + rowGap))`. With the gallery's 74px tiles
and 8px gaps that is `Math.floor(y / 82)`, so moving to a HIGHER index needs
the item to travel a full 82px — the tile has to come to rest exactly on top
of its target — while moving to a LOWER index needs one pixel. Measured, all
four directions, with a 200ms hold before the drag:

| drag                    | travel | reorders |
| ----------------------- | ------ | -------- |
| tile 2 → tile 1 (left)  | −82    | yes      |
| tile 2 → tile 3 (right) | +82    | yes      |
| tile 2 → tile 5 (down)  | +82    | yes      |
| tile 5 → tile 2 (up)    | −82    | yes      |
| tile 2 down, 70px only  | +70    | no       |

So there is **no horizontal/vertical asymmetry** — there is a
toward-index-0/away-from-index-0 one, and PR #94 happened to verify the
forgiving direction (`tile-3: 2 → 1`). A drag that stops even a pixel short of
covering the target cell does nothing, which is exactly "it does not make
room".

**The second half is `activateAfterLongPress`, and it bites a mouse.** All of
upstream's sortables arm `Gesture.Pan().activateAfterLongPress(200)`. Both of
gesture-handler's own implementations then FAIL the pan outright if the
pointer travels past the touch slop before that timer
(`src/web/handlers/PanGestureHandler.ts`'s `shouldFail`,
`PanGestureHandler.kt:133`) — the press was a drag, not a hold. Measured here:
with a 300ms dwell before moving, every direction drags; with none, nothing
happens at all, in any direction. That is upstream behaving as designed on a
device that long-presses, meeting a desktop that does not.

One real divergence turned up while checking that against upstream's source
and is fixed here: upstream's default for the option is the number `0` and
both implementations guard on `activateAfterLongPress > 0`, so passing `0`
means "no hold". This platform tested `!== undefined`, which armed a
zero-delay timer and left the failure test live until it fired — so
`activationDelay={0}`, the natural thing for a desktop app to pass upstream's
`SortableGrid`, produced a grid that could not be dragged at all.
`gesture-handler-compat/pan.ts` now guards on `> 0` like upstream.

It does not fix the report, because the whole-cell threshold above is
arithmetic in a package we do not own. Worth the same upstream issue as §5:
`getGridCellFromCoordinates` should test the dragged item's CENTRE.

## 5b. The plain `Sortable` list has the identical dead zone, one axis

A later report of the same feel ("the row under a drag does not always step
aside") on the gallery's Upstream sortables list turned out to be the same
mechanism as §5, one axis instead of two — see
[dnd-collision-feel.md](dnd-collision-feel.md) for the full investigation.
`useSortable`'s `setPosition` floors the dragged row's own top edge onto
`Math.floor(positionY / itemHeight)`, the same top-left-corner convention
`getGridCellFromCoordinates` uses: crossing towards a HIGHER index needs the
row to travel the whole `itemHeight` (ROW_HEIGHT = 56 on the gallery's own
`Sortable`, ~56px); crossing towards a LOWER one needs about one pixel. Read
from source and predicted at the gallery's own dimensions, not
independently re-measured live against the real package with a fresh
pointer rig — an attempt to do so hit an unrelated `@gtkx/testing`
rendering gap (`tests/gtk/dnd/_measure-real.gtk.rig.tsx`, kept `.skip`).
Same verdict as the grid: upstream's own arithmetic, not this platform's
compat surfaces — `useSortable` never calls `measure()` either, and tracks
only the delta between two `event.absoluteY` reads.

## 6. What was left alone

- **`scheduleOnRN` is still a microtask.** It is upstream's, on every build,
  and it is the fast side of the round trip — making it later would only
  reintroduce the gap from the other end.
- **The frame driver is untouched.** `glibScheduler` still drives animations;
  it was only ever the UI hop that borrowed it.
- **Upstream's bug is still upstream's bug.** Emptying a registry to clean up
  an unmount that is not happening is wrong on every platform — this fix stops
  it being visible, it does not stop it happening. Worth an issue against
  `react-native-reanimated-dnd`: the provider's `register`/`unregister` should
  be `useCallback`s over a ref rather than inline members of a `useMemo` keyed
  on the hover state.
