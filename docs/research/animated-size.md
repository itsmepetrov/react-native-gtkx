# Research: reopening animated size, and what the refusal actually rests on

Date: 2026-08-02. Run: VM (Ubuntu 26.04 aarch64, GTK 4.22.4), headless sway via
the `gtk` vitest project and a private compositor for the spike — the same
machine and harness as [transforms.md](transforms.md),
[animated-colors.md](animated-colors.md) and
[absolute-insets.md](absolute-insets.md), so the numbers here sit next to those
files' without conversion. Upstream numbers are read from
`react-native-reanimated@4.5.3`'s shipped source.

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

Where that rule does not hold — a content-sized container, a main-axis change
whose siblings shift, an `aspectRatio` or a `max*` constraint on the node, an
`alignItems` that is not `flex-start`/`stretch` — the general refusal is
unchanged. The boundary was measured, not reasoned: for `alignItems: center`
the node's x moves; for a main-axis `height` in a column every following
sibling shifts; for `maxWidth: 120` the driven value is clamped; for
`aspectRatio: 2` the other axis follows.

## Not implemented, and why

- **The carve-out itself.** This is a recon. What it hands over is a rule, a
  measured boundary, a cost table and a spike that drives it end to end;
  building it into `useAnimatedStyle` is its own slice, and it needs one design
  decision this file deliberately does not take — see the next point.
- **A size OVERRIDE in the rect store, rather than overwriting the rect.** The
  spike writes the driven size straight into the committed rect, which an
  unrelated engine flush mid-animation would overwrite (for at most one frame,
  since the next frame writes it again). A transform does not have that
  exposure because it lives in a separate `StoredOffset` the allocate hook
  composes on top. The shipping version should do the same for size, which is
  one field on that record and the reason it is worth naming here.
- **The main-axis case.** A `height` in a column shifts every following
  sibling, which is arithmetic rather than layout: measured at 1.4 / 7.0 / 28.9
  µs at 5 / 60 / 300 rows by hand, against the naive write's 58.8 / 183.3 /
  750.3. Cheaper, but O(the siblings) rather than flat, and it has to get
  `justifyContent`, `gap` and wrapping right to be worth anything. Left out of
  the carve-out on purpose: the flat column is the one that earns the mechanism.
- **Making the naive path cheaper.** Two obvious wins fell out of §3 and belong
  to whoever needs them: the commit walk visits every child the container
  re-solved even when 299 of 300 rects are identical, and `setStyle` re-applies
  ~40 Yoga fields to change one. Neither is an animation feature.
