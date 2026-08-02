# Research: reopening animated size, and what the refusal actually rests on

Date: 2026-08-02. Run: VM (Ubuntu 26.04 aarch64, GTK 4.22.4), headless sway via
the `gtk` vitest project and a private compositor for the spike — the same
machine and harness as [transforms.md](transforms.md),
[animated-colors.md](animated-colors.md) and
[absolute-insets.md](absolute-insets.md), so the numbers here sit next to those
files' without conversion. Upstream numbers are read from
`react-native-reanimated@4.5.3`'s shipped source.

**Status: shipped.** §1–§7 are the recon this file was written as. §8 is what
was built from it and what the built thing costs, which is not the same table
— the recon timed the mechanism, §8 times the whole write an app produces.
§9 is the correction: the wall a real consumer hit next was blamed on §8's
override and was not in §8 at all, and the probe that found it is the reason
the blame moved.

## Verdict

**Three of the four things the refusal in
[animated-colors.md §4](animated-colors.md#4-layout-properties-the-measured-refusal)
said were wrong, and the fourth is smaller than it looked.**

- **The window-resize hazard does not exist for an app.** The window root
  reports a zero size request by design (`Root`'s `followAllocation`), so a
  `queueResize` from any depth cannot move the toplevel: measured unchanged at
  `min=88 nat=200` with a child driven to 3000 px wide. It is real for exactly
  one root — an `IntrinsicRoot` that is the window's OWN child, i.e. an RN
  island in a GTK chrome slot, where the request went 120 → 640. §4.
- **"GTK re-measures every ancestor" costs nothing measurable.** Forcing the
  whole toplevel measure cascade after the write adds 0 µs to it at every tree
  size. §3.
- **`scaleX` is not a substitute for `width` and the warning should stop
  implying it is.** Measured: a scale grows about the view's CENTRE (the box
  moved from x 500 to x 420 where a width change kept it at 500) and scales the
  CONTENT with the box (the label kept its 3-line 45 px layout and was drawn
  stretched, where the width change re-wrapped it to one line of 15 px). §6.
- **What is left is cost, and it is real**: a naive `width` write is
  **71 / 129 / 509 µs** at 5 / 60 / 300 children and grows with the container,
  against a transform's 0.6 µs.

**And a carve-out exists, bigger than 2b's.** Pinning the animated node's own
Yoga size, laying out **that node's subtree** and writing the results into the
rect store costs **6.6–16.5 µs for a leaf and 23–28 µs for a node with wrapped
text — flat in the size of the container** (77× cheaper than the naive write at
300 children), reaches real GTK geometry, is picked where it is drawn, moves no
sibling, and holds 60 Hz against an idle control. The spike that establishes
that is `spike/animated-size/`, and every one of its ten checks reads GTK back
rather than the store it writes to.

**The subtree hypothesis as posed — re-run Yoga on the CONTAINER — is correct
and does not pay.** It reproduces a full pass exactly in 84 of 84
configurations and costs the same or more, because a full pass is _already_
scoped: Yoga's cache makes an idle `calculateLayout` 0.63 µs, and the
irreducible work is the container's own O(N) flex solve. The win only appears
one level down, rooted at the animated node. §2.

## 1. What upstream actually does, from its source

Established from `react-native-reanimated@4.5.3`, which ships `src/`,
`Common/cpp/`, `apple/` and `android/`.

**There is no allowlist and no refusal.** Reanimated 2/3's
`NATIVE_THREAD_PROPS_WHITELIST` is gone; `ConfigHelper.ts:12-22` keeps
`addWhitelistedNativeProps` as a documented no-op. Its replacement,
`common/style/config.ts`, lists every layout property as `true` — `flex` (L24),
`height` (L42), `width` (L43), `margin` (L50), `padding` (L68), `top` (L86),
`left` (L87) — the same value `opacity` has. Nothing warns.

**And they do run a layout pass per frame.** `_updateProps` →
`AnimatedPropsRegistry::update` → `ShadowTree::commit` with
`mountSynchronously = true` (`ReanimatedModuleProxy.cpp:1071-1091`), and RN
core's `ShadowTree::commit` calls `newRootShadowNode->layoutIfNeeded(...)`
(`ShadowTree.cpp:404-410`). The tree is cloned to the root on the way
(`ShadowTreeCloner.cpp:41-80`). So "expensive" was our conclusion and they
shipped the expensive version — the premise of this task is correct.

**But they partition the props exactly the way we do, they just have a slower
second tier instead of a refusal.** `ReanimatedModuleProxy.cpp:87-128` holds a
`synchronousPropNames` set — `opacity`, `transform`, `backgroundColor`,
`borderRadius`, `zIndex`, `shadowColor`, `tintColor` and the rest of the paint
properties — that may go straight to the view. No layout property is in it.
`Fabric/updates/PropsLayoutFilter.h:26-40` defines `isLayoutProp` over
`WIDTH, HEIGHT, FLEX, MARGIN, PADDING, POSITION, …`, and
`UpdatesRegistry.cpp:109-120` splits an update in two and **defers the layout
half to the next full flush**. Android does the same dance around its draw pass
(`NodesManager.kt:129-138`). So upstream's own structure says layout is the
expensive tier; it simply never writes that down — a grep for
`expensive|costly|jank|reflow|layout pass` over `src/`, `Common/` and the
README finds nothing relevant.

**Their web path has no gating at all.** `SHOULD_BE_USE_WEB` skips the props
builder entirely (`updateProps/updateProps.ts:39-52`) and
`js-reanimated/index.ts:146` assigns `component.style[key] = domStyle[key]`.
`width` becomes `element.style.width`, and the browser's own layout engine
absorbs it.

**Their frame-rate size animation does NOT go through layout.**
`LayoutAnimation` — the entering/exiting/`LinearTransition` family — is a
separate mechanism that never calls `updateProps`. It animates
`originX/originY/width/height` (`LinearTransition.ts:45-56`) and applies them by
overwriting `LayoutMetrics` in the mounting layer
(`LayoutAnimationsProxy_Legacy.cpp:469-472`,
`LayoutAnimationsUtils.h:109-116`), installed as the surface's
`MountingOverrideDelegate`. That is a size driven at 60 Hz with **no Yoga pass
and no commit** — which is, structurally, the same move §2 makes here.

## 2. The subtree hypothesis, probed twice

The question was: if a node's size change cannot change its container's size,
can Yoga be re-run on the subtree and the children allocated directly?

### The rule the answer needs

A node's size on an axis is **independent of its own children** when it is
fixed by its own style or by its container rather than derived from its
content: a definite `width`/`height` (point or percentage), a `flexGrow` on the
parent's main axis, `stretch` on the parent's cross axis (RN's default), or an
absolute position with both edges of the axis set. Climb to the nearest
ancestor for which that holds on both axes, and a change below it cannot move
anything above it.

The subtree pass then pins that node to its committed size for the duration of
the pass, lays it out with the OWNER's content box as available space — which
is what percentages inside it, its own padding included, resolve against — and
restores the style afterwards, so the shadow tree is exactly as React left it.

### Rooted at the container: correct, and it does not pay

Checked against the engine rather than against a table: build the tree twice,
mutate one child, run a full flush on one and the pinned subtree pass on the
other, and compare every rect. **84 of 84 configurations matched** — 14
container shapes (definite, `flex: 1`, percentage size, percentage padding,
content-sized, padding+border, row, `space-between`, wrapping, absolute with
four edges, `maxWidth`, `aspectRatio`) × 6 mutations (`width`, `height`,
`flex`, `padding`, `auto`→definite, `margin`) × 2 nesting depths. Where the
rule refuses (a content-sized container) it climbs, and the climb is what makes
the answer right.

Two things had to be got right or it silently diverged, and both were found by
measuring: passing the container's own size as available space resolves its
**percentage padding** against the wrong base (5 % of 400 instead of 5 % of
800), and pinning is what makes `auto` and `flex` containers resolve at all.

And then it does not pay:

| children | naive: `setStyle` + full flush | pinned pass on the CONTAINER |
| -------- | ------------------------------ | ---------------------------- |
| 5        | 64.3 µs                        | 34.1 µs                      |
| 60       | 134.6 µs                       | 207.3 µs                     |
| 300      | 491.1 µs                       | 1052.1 µs                    |

Because a root pass is already scoped. `calculateLayout` from the root with
**nothing dirty** is 0.63 µs at 300 children — Yoga's per-node cache means an
untouched subtree is not re-solved. What the pass actually costs is the dirty
container's own flex solve over all its children, and re-rooting the pass at
that same container changes nothing about that.

### Rooted at the animated NODE: flat, and that is the carve-out

The work a size change genuinely requires is: the node's own subtree
re-laid-out at the new size, and one queued allocation. Its container, its
siblings and its ancestors are not involved at all — that is what the rule in
§2 establishes.

Same check, against the engine: pin the node to the driven width, lay out the
node, compare its subtree against a full pass and assert nothing outside it
moved. **15 of 15** across five content shapes (a leaf, a stretched child, a
measure-backed text-shaped child, a row of three flex children, definite
children) × three widths.

## 3. Cost, end to end

Per-frame write, no paint, so this is comparable with
[animated-colors.md §3](animated-colors.md#3-the-implemented-path-per-frame)
and [absolute-insets.md §4](absolute-insets.md#4-cost). The animated node is a
100×60 box; "text" gives it a wrapped `Text` child, which is the expensive
content shape because Yoga has to call the measure function.

| children in the container | driven width, leaf | driven width, text child | naive `width` | naive `height` (main axis) | transform |
| ------------------------- | ------------------ | ------------------------ | ------------- | -------------------------- | --------- |
| 5                         | 16.5 µs            | 28.0 µs                  | 71.2 µs       | 58.8 µs                    | 1.5 µs    |
| 60                        | 9.1 µs             | 24.2 µs                  | 129.3 µs      | 183.3 µs                   | 0.8 µs    |
| 300                       | **6.6 µs**         | **23.3 µs**              | **508.6 µs**  | **750.3 µs**               | 0.6 µs    |

The shape of those columns is the whole argument, and it is the one
[animated-colors.md §4](animated-colors.md#4-layout-properties-the-measured-refusal)
named as the thing that would change the decision: _"If the Yoga column became
flat in tree size … the O(1) argument disappears and the remaining cost is
comparable with a colour."_ It is flat, and 23 µs is twice a colour's 11.2 µs.

Where the naive write's 509 µs goes, at 300 children:

| step                                                         | cost     |
| ------------------------------------------------------------ | -------- |
| `setStyle` alone — `applyLayoutStyle` writes ~40 Yoga fields | 17.1 µs  |
| `calculateLayout` from the root                              | ~137 µs  |
| the engine's incremental commit walk                         | ~320 µs  |
| whole `flushSync`                                            | 476.4 µs |
| for scale: `calculateLayout` with nothing dirty              | 0.63 µs  |

Two things worth saying out loud. The **commit walk is the biggest single
line**, not Yoga — Yoga raises `hasNewLayout` on every child the container
re-solved, so the walk visits all 300 even though 299 rects are identical. And
`setStyle` costs 17 µs before Yoga is even asked, because it re-applies the
whole layout style; a size animation would obviously write one field.

### The GTK half, which turns out not to be a half

The refusal's second sentence was that `queueResize` makes GTK re-measure every
ancestor. It does, and it is free:

| children | naive write alone | naive write + the WHOLE toplevel measure cascade forced |
| -------- | ----------------- | ------------------------------------------------------- |
| 5        | 64.3 µs           | 50.0 µs                                                 |
| 60       | 134.6 µs          | 129.9 µs                                                |
| 300      | 491.1 µs          | 498.8 µs                                                |

Within noise of each other at every size — the forced cascade adds nothing.
The reason is structural: the RN root's `measure` hook returns a constant
(`Root`, `followAllocation`), so the expensive part of a GTK size negotiation
has nothing to compute.

## 4. Does the window really resize?

The claim being checked is animated-colors.md's: _"`queueResize` propagates to
the toplevel, so an animated `width` can resize the window it is in."_

| root                                                | window size request before | after                           |
| --------------------------------------------------- | -------------------------- | ------------------------------- |
| window root (`Root followAllocation`), child → 3000 | min 88, nat 200            | **min 88, nat 200** — unchanged |
| an `IntrinsicRoot` nested inside that root, → 500   | min 88, nat 200            | **min 88, nat 200** — unchanged |
| an `IntrinsicRoot` as the window's OWN child, → 640 | min 120, nat 120           | **min 640, nat 640** — it grew  |

So the hazard is real for exactly one configuration: an RN island mounted
directly in GTK chrome (a `HeaderBar` slot, a sidebar row) through
`IntrinsicRoot`, which reports its Yoga content size to GTK by contract. For an
app — window → `Root` → everything — a size write cannot reach the toplevel at
all, because the root reports zero and adopts whatever the window allocates.

The correction matters because the window-resize sentence is the only
_correctness_ argument in the original refusal; everything else is cost. It has
to be restated as "and in an `IntrinsicRoot` it also changes the window's size
request", not as a general hazard.

## 5. The spike: real geometry, real frame clock

`spike/animated-size/` drives the width of a box from 100 to 260 over 120
frames inside a real window on a private headless compositor, through the rect
store and `queueAllocate` alone, with the pinned pass of §2. Every assertion
reads GTK back — `computeBounds()` against the stage, `gtk_widget_pick()`,
`gtk_widget_measure()` on the toplevel — because reading our own store back
would pass even if nothing reached a widget.

| check                                     | result                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| the width reached real geometry           | bar 100 → **260**                                           |
| it grew from the leading edge             | origin (0, 0) unchanged                                     |
| the sibling below moved                   | no — (0, 60, 100, 6) → (0, 60, 100, 6)                      |
| the container changed size                | no — (0, 0, 400, 700) unchanged                             |
| the node's own content was re-laid-out    | label (0,0,100,45) → **(0,0,260,15)** — re-wrapped          |
| the frame clock kept up                   | driven median 16.31 ms vs idle 16.45 ms, p95 18.39 vs 18.84 |
| a point past the OLD edge hits the widget | `pick(140, 30)` = `bar`                                     |
| a point past the NEW edge still does not  | `pick(300, 30)` = `column`                                  |
| the window's size request moved           | no — min 0, nat 200 unchanged                               |

The re-wrap line is the one that matters most, and it is the one that failed
first. Writing the rect alone — `setStoredRect` plus `queueAllocate`, 0.9 µs
and beautifully flat — makes the BOX the right size and leaves everything
inside it on its old layout: the label stayed 100 px wide and 3 lines tall
inside a 260 px box. That is the honest limit of an O(1) rect write, and it is
why the mechanism is a pinned pass over the node's subtree rather than a single
store write.

Hit-testing needed no work for the same reason
[absolute-insets.md §1](absolute-insets.md#1-the-probe-does-a-translated-widget-receive-input-where-it-is-drawn)
found: the path re-allocates rather than painting elsewhere, so
`gtk_widget_pick` descends into the real rect.

## 6. What `scaleX` differs in, measured

The warning currently names `scaleX` as the replacement for `width` and
`scaleY` for `height`. Both boxes below start 100×60 at x = 500 with the same
wrapped label; one is given `scaleX: 2.6`, the other `width: 260`.

| what                     | base               | `scaleX: 2.6`          | `width: 260`           |
| ------------------------ | ------------------ | ---------------------- | ---------------------- |
| the box, in stage coords | (500, 40, 100, 60) | **(420, 40, 260, 60)** | (500, 40, 260, 60)     |
| the label inside it      | (500, 40, 100, 45) | **(420, 40, 260, 45)** | (500, 40, 260, **15**) |

Two differences, and neither is cosmetic.

- **A scale grows about the view's CENTRE**, so the box moves: x 500 → 420. A
  width change grows from the leading edge and x stays at 500. Anything
  positioned next to it is now overlapped on the wrong side.
- **A scale scales the CONTENT with the box** instead of re-laying it out. The
  label kept its three-line, 45 px-tall layout and was drawn 2.6× wide —
  stretched glyphs. The width change re-wrapped it to one line, 15 px tall.

So `scaleX` is an approximation for content that can take being stretched — a
plain coloured box, an image — and it is not a substitute for a width change.
The warning now says that rather than implying an equivalence, and `measure()`
still reports the unscaled box either way, exactly as
[transforms.md](transforms.md) recorded.

## 7. What this leaves the refusal as

The refusal stands, on cost, for the general case — a naive layout write is
71–509 µs and O(the container, not the value), against 0.6 µs for a transform —
and it should say only that. The two sentences it should stop saying are that
GTK's ancestor re-measure is part of the cost (it is free) and that the window
can resize (it cannot, outside an `IntrinsicRoot`).

The carve-out worth building is the one §2 and §5 measure, and its precondition
is a rule the engine can evaluate:

> A size change on a node is confined to that node when the node's size on
> that axis is set by its own style (not derived from its content), and its
> container's size on that axis does not depend on its children. Then the
> animated size is written into the rect store, the node's own subtree is
> re-laid-out pinned to it, and one `queueAllocate` on the parent puts it on
> screen — 6.6 µs for a leaf, 23 µs with wrapped text, flat in the size of the
> tree.

(That rule needed one more clause than this recon knew about — the node's
OTHER axis, which for a content-sized box changes when the driven one does.
§8.)

Where that rule does not hold — a content-sized container, a main-axis change
whose siblings shift, an `aspectRatio` or a `max*` constraint on the node, an
`alignItems` that is not `flex-start`/`stretch` — the general refusal is
unchanged. The boundary was measured, not reasoned: for `alignItems: center`
the node's x moves; for a main-axis `height` in a column every following
sibling shifts; for `maxWidth: 120` the driven value is clamped; for
`aspectRatio: 2` the other axis follows.

## 8. What shipped, and what it costs

`width`/`height` in `useAnimatedStyle` now run the mechanism of §2 through the
platform's own path. `src/style/animated-size.ts` decides whether the change
is confined to the node; `src/layout/driven-size.ts` is the pinned pass;
`src/components/driven-size.ts` writes the result into the rect store and
queues one allocation. `spike/animated-size/` was re-pointed at that path, so
its ten checks are now about what ships rather than about a hypothesis, and
they all still pass — including the two that matter most, that the label
inside the box **re-wrapped** (0,0,100,45) → (0,0,260,15) and that the
window's size request did not move (min 0, nat 200, unchanged).

### The cost of the whole write

Per frame, as an app produces it: a shared-value assignment, the mapper, the
style node, the pinned subtree pass, the rect-store override and one
`queueAllocate`. No paint, so this sits next to
[animated-colors.md §3](animated-colors.md#3-the-implemented-path-per-frame)
and [absolute-insets.md §4](absolute-insets.md#4-cost) without conversion.
20 000 iterations, median of three runs, measured by `spike/animated-size/`.

| children in the container | driven `width`, leaf | driven `width`, wrapped text | naive `width` | transform |
| ------------------------- | -------------------- | ---------------------------- | ------------- | --------- |
| 5                         | 7.1 µs               | 22.1 µs                      | 52.1 µs       | 1.6 µs    |
| 60                        | 6.9 µs               | 21.8 µs                      | 133.1 µs      | 1.5 µs    |
| 300                       | **7.1 µs**           | **21.7 µs**                  | **496.4 µs**  | 1.5 µs    |

Flat, as §3 predicted, and within noise of the recon's 6.6 / 23.3 µs — the
whole-write overhead over the bare mechanism is under a microsecond. At 300
children it is **70× cheaper** than the naive write and about twice a colour.

### Two things the recon got wrong, found by building it

- **A driven value written straight through is not always the size Yoga
  gives.** Yoga floors a box at its own padding and border, so a node with
  `padding: "10%"` driven to 60 is 80 px wide in a real pass — and the spike,
  which wrote the value straight into the rect, would have allocated 60. The
  shipped path asks Yoga what the size became instead of re-deriving it, which
  reproduces its arithmetic rather than approximating it. Found by the engine
  probe (`tests/unit/style/animated-size.test.ts`), not by reading.
- **The precondition needed a sixth clause: the node's OTHER axis.** §7's rule
  named the driven axis and the container. It did not say that a box whose
  `height` comes from its content gets TALLER as it gets narrower — the text
  re-wraps — so every following sibling moves and the change is not confined
  to the node at all. The spike never hit it because its bar had an explicit
  height. The rule refuses it now and the probe shows the divergence.

### The rule, and how it is tested

`tests/unit/style/animated-size.test.ts` builds each of 32 configurations
twice, drives one with `setStyle` plus a full engine flush and the other with
the shipped subtree pass, and compares **every rect in the tree**. Wherever the
rule says yes the two must agree exactly; wherever it refuses, the refusal has
to be earned by something the test can see — different geometry, a box that
stops following the animated value, or (for an `IntrinsicRoot`) a root size
request that would not follow. A rule that drifted from the engine is the bug
this design was most likely to ship, so it is checked against the engine rather
than against a table.

The refusals, and what each is earned by:

| configuration                                   | what goes wrong                                      |
| ----------------------------------------------- | ---------------------------------------------------- |
| `height` in a column, `width` in a row          | every following sibling shifts                       |
| `alignItems`/`alignSelf` `center` or `flex-end` | the node's own origin moves as it grows              |
| a wrapping container                            | the node's LINE re-sizes and the lines after it move |
| a container sized by its children               | the container grows with the node                    |
| the node's other axis sized by its content      | the box gets taller as it gets narrower              |
| `min*`/`max*` on the driven axis                | the geometry is right and stops moving               |
| `aspectRatio`                                   | the other axis follows                               |
| out of flow with no `left`/`top`                | it grows leftward, or from its static position       |
| under an `IntrinsicRoot`                        | the root's own size request would not follow         |

The last one is the only one whose damage is invisible in a rect table:
measured directly, a real style write moved the root's reported content width
and the driven path left it exactly where it was.

### The override, and the mutation that shows it is doing something

The driven geometry is a `DrivenBox` next to `StoredOffset` in the rect store,
composed by the allocate hook, not a write over the committed rect. Breaking
that — putting the spike's `setStoredRect` back — fails exactly one test,
"keeps the driven size through an unrelated engine flush", and fails it on the
label inside the box: (0,0,260,15) → **(0,0,100,45)** after a window resize
mid-animation. The mechanism is `layout/node.ts`'s `hasMeasure`: a
measure-backed leaf is re-committed by every walk that reaches it whether its
rect changed or not, and a `walkAll` flush (a viewport change) reaches all of
them. The node's own box survives a rect overwrite; its content does not.

The override is partial on purpose — the animated node overrides only the axis
being driven, its descendants override the whole rect. So the node's origin and
its other axis keep following the engine, and a window resize mid-animation
moves it exactly as it moves everything else.

## Not implemented, and why

- **The main-axis case.** A `height` in a column shifts every following
  sibling, which is arithmetic rather than layout: measured at 1.4 / 7.0 / 28.9
  µs at 5 / 60 / 300 rows by hand, against the naive write's 58.8 / 183.3 /
  750.3. Cheaper, but O(the siblings) rather than flat, and it has to get
  `justifyContent`, `gap` and wrapping right to be worth anything. Left out of
  the carve-out on purpose: the flat column is the one that earns the mechanism.
- **`min*`/`max*` on the driven axis.** Reading the size back out of Yoga means
  a clamp is now reproduced exactly rather than diverging — the geometry is
  right. It is still refused, because "right" here means the box stops
  following the animation, and a silent no-op is the thing this platform warns
  about rather than ships.
- **A percentage `width`.** No point base to lay a subtree out at, and a mapper
  that switches from a number to a percentage changes the leaf signature, which
  rebuilds the style and puts the property back on the refusal path.
  Deliberate, and the same call [absolute-insets.md](absolute-insets.md) made
  for percentage insets.
- **`Animated.Text` with an animated width.** It works when the `Text` has a
  definite height, and is refused otherwise for the sixth clause above: a
  label's height is its content. Nothing special about `Text` — the generic
  wrapper reaches the widget's layout node the same way `Animated.View` does.
- **Making the naive path cheaper.** Two obvious wins fell out of §3 and belong
  to whoever needs them: the commit walk visits every child the container
  re-solved even when 299 of 300 rects are identical, and `setStyle` re-applies
  ~40 Yoga fields to change one. Neither is an animation feature.

## 9. The wall after the carve-out, and where it actually was

Date: 2026-08-03, same machine and harness. The consumer this section is about
is `@gorhom/bottom-sheet` 5.2.14, unedited from npm, driven by a real Wayland
pointer in `spike/core-exports/`.

After [PR #100](../api.md) gave `ScrollView` RN's own `{flexGrow: 1,
flexShrink: 1}` base style, the sheet's list still did not scroll and the probe
said why: the list was allocated **792 px, exactly its own content height**
(18 rows × 44), so its parent was content-sized rather than sheet-sized. gorhom
bounds that list with an animated `height` from `useAnimatedStyle` on
`BottomSheetContent`, and the diagnosis on the file was that §8's driven size
lives as a rect-store override which Yoga never sees — so the container paints
at the right size while its child, for layout, has no bound.

**That diagnosis was wrong, and the probe is what showed it.** Instrumenting
the style layer in a real run of the sheet:

```
[leavesOf] height: typeof=object value={"kind":"spring","toValue":543.4452371609451,…}
```

The height never became a **number**. `useAnimatedStyle` did not run animations
returned from the updater at all: outside `initialUpdaterRun` a `with*` builder
returns a marked descriptor (§`animation.ts`), the style layer's leaf test is
`typeof value === "number"`, and an object is not one — so the property was
neither driven, nor written into the static style, nor warned about. It sat in
the style object as `{kind: "spring", toValue: 543.4, …}`. The driven-size path
was never reached: in a full probe run, `splitAnimated` created **zero** size
slots and `drivenSizeRefusal` was asked **zero** times.

So the wall was one layer earlier than layout, and it was not the carve-out's
cost decision at all. `useAnimatedStyle(() => ({ height: withTiming(320) }))`
is how every page of Reanimated's documentation writes an animation, and on
this platform it did nothing — silently, which is the failure mode this repo
ranks worst.

### The three candidates, and what each measured

**(3) — can the value arrive through React at all? Yes, and it already
does.** This was the cheapest to check and it is the answer. `splitAnimated`
already writes a driven size back into the static style as a plain number on
every render (§8, "THE REBASE"), so the ordinary React path carries it into
Yoga — it just never had a number to carry. Collapsing each descriptor to its
target as a throwaway probe, changing nothing else, took `spike/core-exports`
from **3 FAILED to 0 FAILED** on the first run: the sheet's list went from
`allocated height=792` to `468` (543 px of mask minus 75 px of padding), its
`onScroll` from 0 calls to 158, and both halves of gorhom's scroll lock —
held at the top when collapsed, released when extended — passed.

**(1) — the dependent-child rule: not needed, and it would not have
fired.** With the descriptors resolved, the rule is finally asked about
gorhom's node, and it refuses:

> the container's `height` is derived from its children, so the node growing
> would grow the container and move everything around it

which is correct: gorhom's sheet is `{position: "absolute", top: 0, left: 0,
right: 0, flexDirection: "column-reverse"}` with no height, so its height
genuinely does come from its children. A "has a size-dependent child" test
would have changed nothing here — the refusal is about the node's CONTAINER,
not about its children — and buying this case with a per-frame Yoga pass would
have cost the 52–496 µs of §3 to reproduce, at 60 Hz, something one render
already produces. The cheap path is untouched: §8's table, §8's rule and
`tests/unit/style/animated-size.test.ts`'s 32 configurations are unchanged by
this section.

**(2) — a loud refusal: already shipped, and the missing half was the second
sentence.** The platform does warn, by name and with the reason, and it ends
every layout warning with _"the new value is applied on the next React
render."_ For a value that only ever moves inside a `useAnimatedStyle` there
IS no next render, so that sentence was a promise nothing kept. It is kept now.

### What shipped

`src/reanimated-compat/updater-animations.ts` runs one animation per animated
key on the platform's own `Animated.Value` and its one frame scheduler —
the same `buildAnimation` a shared value uses, so `withTiming`, `withSpring`,
`withDelay`, `withSequence`, `withRepeat`, `withDecay` and `withClamp` arrive
already implemented. Two rules, both upstream's:

- a key appearing for the FIRST time is seeded at the target rather than
  animated to it (nothing to animate from — the same collapse
  `initialUpdaterRun` performs);
- a later run producing an EQUIVALENT descriptor does not restart it, compared
  by target and shape rather than by object identity. This one is not
  cosmetic: gorhom's mapper re-runs on every frame of the sheet's own
  transition and rebuilds the spring each time, and restarting on each rebuild
  left the height crawling — measured, it reached 66 px of a 543 px target and
  stopped.

And the settle. When an animation on a property this platform will not drive
at frame rate reaches its target, the style is published through React once:
`AnimatedStyle.renew()` gives the style object a new identity and one render
follows. The identity is load-bearing rather than tidy —
`BottomSheetDraggableView` is `memo`'d, so a re-render of the component that
owns the `useAnimatedStyle` stopped at that boundary with every prop identical,
and the mask stayed at the animation's first frame (`allocated height=0`) while
the animation itself ran on to 543 px. Measured in one full probe run:

| what                                                         | count |
| ------------------------------------------------------------ | ----- |
| animation frames published on the two refused properties     | 176   |
| animations that reached their target (`finished`)            | 4     |
| React renders produced for them                              | **4** |
| Yoga passes a per-frame layout write would have cost instead | 176   |

At the naive write's 52 µs for a five-child container that is 208 µs instead of
9.2 ms, and the ratio grows with the container: at 300 children it is 2 ms
instead of 87 ms. A cancelled animation deliberately does not count as a
settle — reporting one would publish through React on every frame the target
moves, which is exactly the cost the refusal exists to avoid.

Nothing on the driven path changed. A frame of an animated `opacity`,
`transform`, colour, inset or confined size costs what §8's table says; the
only new per-frame work is one shallow object copy and one map lookup per
animated key, and an updater result with no animation in it is published by
identity and not copied at all.

### Where this differs from upstream, said out loud

A restart picks the animation up at the value it is currently at, with the
velocity the new descriptor asks for. Upstream's `prepareAnimation` also
carries the PREVIOUS animation's velocity across. For a target that moves once
the two are the same animation; for a target that moves every frame ours is
slightly more damped. It converges to the same place — the probe's 176 frames
end at 543.445 px, which is the value gorhom asked for.

### What the probe says now

`spike/core-exports`: **0 FAILED**. The sheet's list receives scroll events
(158 in a collapsed run), the lock holds it at the top while the sheet is
collapsed (`row-one y 559 → 559` with the events arriving, so the lock is
tested rather than vacuous) and releases when it is extended (`y 240 → -84`
under the same injected wheel), the negative-control zone the pointer never
visited stayed silent, and the draggable-list and plain-scroller controls are
unchanged.
