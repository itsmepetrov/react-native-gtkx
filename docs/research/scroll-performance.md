# Scroll performance: measured breakdown and fixes

Research snapshot (2026-07-30) from the instrumented investigation on the
`perf-scroll` branch (merged: `GTKX_PERF=1` counters in the package,
`examples/perf-probe` — a deterministic 500-row self-scrolling matrix
app, `scripts/perf/`). Symptom investigated: FlatList scrolling lags;
reportedly worse maximized.

## Measured facts (headless sway, pixman, 4-core VM)

- **Virtualized-list churn is the dominant attributable cost.** A plain
  ScrollView with all 500 rows mounted shows exactly ZERO engine
  flushes, GTK allocates and Pango measures during scroll — scrolling is
  a pure native adjustment translation. FlatList spends ~13–20 ms/s in
  Yoga+commit, ~19–23 ms/s in GTK size-allocate and ~4–6 ms/s in Pango,
  driven by 13–15 cell mounts+unmounts and ~55 Yoga node create/frees
  per second as the window slides.
- **JS handler cost is negligible**: 0.03 ms per scroll event, 1–2 ms/s
  total — the synchronous-FFI-blocks-frames hypothesis is ruled out.
- **`windowSize` is the one unconditional lever**: 11 instead of the
  RN-mobile default 5 cut churn by ~21% and late frames from ~10/s to
  ~7.7/s. `getItemLayout` did NOT help. hn-app now passes
  `windowSize={11}`.
- **Sticky headers queue an allocation EVERY frame — even at rest**
  (1:1 with the frame clock while idle; ~10 ms/s of GTK layout for
  merely having a sticky header mounted). Not hn-app's symptom (no
  stickies there), but a real latent bug.
- **The "maximized is worse" half did not reproduce headless** — it
  reproduced REVERSED (fullscreen had 3–6× fewer late frames),
  consistently. Our own work is flat or lower at 1600 px. It DOES
  reproduce in the real session; see "Round three" below, which settles
  where the cost lives.

## Fix backlog (ccpm: perf epic)

1. Sticky tick callback: requeue the allocation only while the
   adjustment actually moves (`scroll-view.tsx` tick handler) — removes
   the continuous idle cost for sticky lists.
2. Desktop default `windowSize` (and documenting it as the primary
   scroll knob): mobile memory pressure does not apply here.
3. `LayoutEngine.commitTree` walks the ENTIRE live tree on every flush —
   O(all nodes), not O(changed). Fine at 100 nodes, a permanent tax that
   will bite under a large stable shell. Proposal: an engine-level dirty
   set fed by `setStyle`/`insertChild`/`markDirty`, flush walks dirty
   subtrees + ancestors only.

## Round two: the backlog, and the flick stall (branch `perf-fixes`)

Same rig, same probe. Two things were added to measure this round:
**per-frame burst counters** (accumulators that reset on every frame-clock
tick and report the WORST frame of each second) and two probe phases for a
newly reported symptom — `jump1`, a single-tick teleport, and `flick1`/
`flick2`, identical kinetic flicks into cold and warm rows. Per-second sums
cannot see a stall at all: twelve mounts inside one frame and twelve spread
over a second add up identically, and only the first is felt.

### The flick stall is a single-frame mount burst

Symptom (real session, touchpad two-finger flick): scrolling starts, freezes
for a fraction of a second, then continues fast. A flick moves the offset by
whole viewports per tick, so the target window is an almost entirely new set
of rows — and mounting all of them in the frame that discovered them is the
freeze. The teleport phase isolates it: **27 cell mounts inside ONE frame (54
with the wider window), and that frame took 88 ms** — five frames of work in
one; the list's very first window fill costs 113 mounts in one frame. The
kinetic handoff merely coincides, which is why it reads as "as if computing
the scroll force".

The fix is RN's own batching pair (`maxToRenderPerBatch` 10,
`updateCellsBatchingPeriod` 50 ms), and getting the burst to actually
disappear took two non-obvious details, both found by measuring:

1. **The allowance is a token bucket per PERIOD, not a cap per pass.** One
   frame runs several range passes (scroll event, content-size report,
   measurement version bump); a per-pass cap just stacks them back into the
   burst — 28 mounts in the worst frame with a per-pass cap.
2. **The mounted set may only be reused while it still covers the visible
   rows.** It is ONE contiguous range, so keeping a window that no longer
   reaches the viewport means mounting the whole gap in this pass. Testing
   the overlap against the target WINDOW instead of the visible rows kept the
   burst alive at windowSize 11 (28 mounts) while looking fixed at 5 (10).

With both, the worst frame of a teleport mounts 10 rows at every window size.
The visible rows are never delayed; only the overscan waits.

### What the fixes moved

Steady scroll over measured rows (`down2`), windowSize 11 / windowSize 5:

| Metric                                 |           before |          after |
| -------------------------------------- | ---------------: | -------------: |
| Commit walk: nodes with an entry       |       178 / 88.6 |      3.2 / 2.4 |
| Nodes VISITED per flush (tree 409/189) |        409 / 189 |        94 / 50 |
| `engine.flush` per flush               |   1.93 / 1.36 ms | 1.26 / 0.89 ms |
| GTK allocate passes                    |  867 / 546 per s |  51 / 64 per s |
| GTK allocate time                      | 27.9 / 19.1 ms/s | 8.6 / 7.3 ms/s |

Sticky header mounted, list untouched (`idle`): GTK allocate passes 56/s → 0,
allocate time 18.4 ms/s → 0.00.

Single-tick teleport (`jump1`, 6000 px → 0), windowSize 11 / 5:

| Metric                         |     before |      after |
| ------------------------------ | ---------: | ---------: |
| Cell mounts in the worst frame |    28 / 27 |    10 / 10 |
| Worst frame                    | 90 / 88 ms | 62 / 34 ms |
| Window's first fill at startup | 113 mounts |  27 mounts |

The dirty-set walk paid twice. The direct win is the walk itself (it no longer
reads four computed values off all 409 nodes every flush), but the larger one
is second-order: measured leaves recommit on every pass by design (a Yoga
re-measure resets their widget size request), and each recommit queued an
allocation on its parent. Skipping the leaves Yoga did not touch removes ~94%
of the GTK allocate passes — the single biggest measured cost in the first
snapshot.

### Honest notes

- **`windowSize` 11 is not the unconditional win the first snapshot
  reported.** The churn claim reproduces (mount+unmount over a 6000 px scroll:
  118 at 5 → 96 at 11, −19%), but the late-frame improvement does not: with
  the dirty-set flush and batching in place, 5 and 11 land inside the noise of
  each other (`engine.flush` 0.89 vs 1.26 ms per flush, GTK allocate 7.3 vs
  8.6 ms/s — the wider window costs a bigger tree). What the wider window
  definitely used to cost was the mount burst on a jump (54 mounts in a frame
  versus 27), and batching is what removes that. Keep 11 as the default; it is
  not a lever to reach for first.
- **The flick's own frames were nearly bounded already** — a flick SLIDES the
  window (~13 rows per frame at 1000 px/frame) instead of replacing it, so the
  cap barely binds there (12 → 10 mounts in the worst frame, though its worst
  frame did drop from 53–66 ms to 27–53 ms). What the burst fix really repairs
  is every TELEPORT: `scrollToOffset`/`scrollToIndex`, the window's first fill
  after mount (113 → 27), and the moment a flick outruns its window.
- **A teleport now mounts MORE rows in total** (54 versus 28 over the two
  seconds after the jump, unmounts 100 versus 74): dropping the far-away window
  and regrowing costs more work than filling the gap — it is simply spread over
  frames instead of landing in one. Per-frame is what stalls; the trade is
  deliberate.
- **Frame maxima are noisy on this rig** (±30 ms run to run on the same
  build), so the mount-per-frame counters — deterministic, mechanism-level —
  are the primary evidence here and the frame times are corroboration.
- **`frame.late` is unusable on this rig**: idle seconds show 15–22 late
  frames per second with zero work in flight. `frame.veryLate` (>34 ms) and
  the per-frame burst maxima are the metrics that track the felt behaviour.
- Cold rows (never measured, so `estimatedItemSize` off by ~30 px) cost
  roughly double: 46 version bumps and 40 ms/s of Yoga+commit during the cold
  flick versus none and 20 ms/s over the same rows warm. Using the running
  average of measured sizes instead of the fixed estimate is the obvious next
  step and was NOT tried.
- The sticky requeue skip keeps same-frame correctness through a three-frame
  grace window (the scrolled window's kinetic tick can run after ours). During
  motion it still queues on ~49 of every 50 frames; the pinned header renders
  pixel-identically before and after at the same offset.

## Round three: the session settles "maximized is worse"

Headless said fullscreen was _better_, the user said it was worse. Since
headless renders through pixman and the session through llvmpipe/EGL-Zink,
only the session can answer. `scripts/perf/run-probe-session.sh` runs the
same probe under the real GNOME session, optionally sending the maximize
keybinding once the window has settled.

Same build, same probe parameters (`windowSize` 11, 500 rows), one run each,
windowed 560×760 against maximized.

**The symptom is real in the session, and large.** Per-second, by phase:

| Phase                    | `frame.veryLate` win → max | `frame.avg` ms win → max |
| ------------------------ | -------------------------: | -----------------------: |
| `idle` (nothing moving)  |                      0 → 0 |              16.9 → 16.9 |
| `down1` (steady scroll)  |                  0.25 → 22 |              13.9 → 45.7 |
| `down2` (over warm rows) |                  0.13 → 22 |              15.7 → 40.4 |
| `flick1` / `flick2`      |                      1 → 7 |              17.1 → 28.1 |

Maximized, a scrolling second spends essentially EVERY frame over 34 ms —
about 22 fps against the windowed 60.

**And it is not our work.** The viewport roughly doubled, which the
instrumentation confirms independently: live Yoga nodes went 445 → 801 while
scrolling, so the maximize keystroke did land and the comparison is valid.
Yet over the same phase our attributable costs are flat or LOWER:

| `down2`, per second | windowed | maximized |
| ------------------- | -------: | --------: |
| `gtk.allocTop.ms`   |     7.42 |      7.78 |
| `engine.flush.ms`   |    10.10 |      8.52 |
| `vl.cellMount`      |     9.25 |      8.00 |

Twice the tree, the same layout cost — which is the dirty-set commit from
round two doing its job — and 2.6× the frame time. The gap is paint, not
layout: cost that scales with pixel area and is invisible to JS
instrumentation.

`idle` is the control: unchanged (late frames even fell, 6 → 1.3), so this is
not a constant tax on a big window. It appears only while pixels change.

**What this means — corrected twice, and then fixed.** The first reading was
"paint scales with area, nothing on our side". A control run disproved it:
the same probe in `PERF_MODE=scrollview`, where all 500 rows are mounted and
scrolling is a pure native adjustment translation, is **identical maximized
and windowed** (16.4 vs 17.0 ms), at full screen area. Area alone costs
nothing.

Nor does the tree. Separating the two variables:

| Configuration              | Live nodes | `frame.avg` | `frame.veryLate`/s |
| -------------------------- | ---------: | ----------: | -----------------: |
| windowed, `windowSize` 11  |        445 |     15.7 ms |                0.1 |
| windowed, `windowSize` 23  |        777 |     16.7 ms |                0.6 |
| maximized, `windowSize` 5  |        205 |     16.3 ms |                0.7 |
| maximized, `windowSize` 11 |        801 |     40.4 ms |               22.1 |

777 widgets in a small window: free. A full-screen window holding 205: free.
Only the PRODUCT hurts. That is the signature of re-allocating and
re-snapshotting N widgets over an area A, and it says the lever is ours:
shrink N per frame.

### The cause: unchanged nodes were committing

`LayoutEngine.collectChange()` already drops nodes whose rect did not move —
except nodes carrying a measure function, which the walk must still visit.
Every `Text` leaf is one, and a card list is mostly Text. Those arrived at
the commit callback with the rect they already had, and the callback queued
an allocation anyway. GTK dedupes the queue, so the pass COUNT looked
innocent (~1 per frame); what it hid is that each pass re-allocated the whole
container and every child in it, ~1200 child allocations per second, then
repainted an area that is four times larger maximized.

The fix is four lines in `use-layout-child.ts`: if the committed rect equals
the stored one, return before queueing.

| Maximized, `windowSize` 11 |  before |   after |
| -------------------------- | ------: | ------: |
| `frame.avg`, steady scroll | 40.4 ms | 17.3 ms |
| `frame.veryLate`/s         |    22.1 |     0.8 |
| `frame.avg`, flick         | 28.1 ms | 17.3 ms |
| `frame.veryLate`/s, flick  |     7.0 |     0.3 |

About 22 fps to about 58. Windowed is unchanged (15.7 → 16.8 ms, inside this
rig's noise), which is expected: with a small area the wasted work was cheap
enough not to show. The flick there still got quieter — child allocations
−41%, commits −33%.

`allocPass` per second went UP maximized (48 → 65) because the frames got
faster and there are simply more of them per second; per frame it is the
same one pass.

Scope: this rig has no GPU, so the wasted repaint was at its most expensive
here and the win is at its most visible. The waste was real everywhere
though — it is work that produced no pixel change on any renderer.

### Do not reach for `GSK_RENDERER=cairo`

The VM logs `libEGL warning: failed to get driver name` and `MESA: error:
ZINK: failed to choose pdev` on every launch, which reads like a broken GL
path worth routing around. It is not: Mesa simply finds no Vulkan device,
falls back to software GL, and that fallback is twice as fast as cairo.
Measured maximized, steady scroll: 17.3 ms per frame on the default path
against 32.6 ms with `GSK_RENDERER=cairo`, and 0.8 late frames a second
against 13.0. The warnings are noise, not a diagnosis.

Hardware acceleration is not available here at all: `systemd-detect-virt`
reports `apple`, so the guest runs on Apple's Virtualization.framework, whose
virtio-gpu is display-only for Linux guests. Getting GL would mean rebuilding
the VM on UTM's QEMU backend with `virtio-gpu-gl`. Worth knowing before
chasing renderer settings — and worth remembering that the software renderer
is what made the wasted allocations above expensive enough to notice.

### The cold-row estimate: a lead that closed itself

Round two left one open item: cold rows (never measured, so `estimatedItemSize`
off by ~30 px) cost roughly double, 46 version bumps and 40 ms/s of
Yoga+commit against none and 20 ms/s warm. The obvious fix was a running
average of measured sizes instead of the fixed estimate. It was tried and
reverted, for two separate reasons, both worth keeping.

**The lead was already gone.** Those numbers predate the unchanged-rect fix
above. Measured after it, on the same probe, a cold flick and a warm flick
over the same rows are indistinguishable — 17.26 against 17.68 ms per frame.
The version bumps still happen on the cold pass; they simply no longer cost
frames, because the re-render they trigger no longer drags a full container
re-allocation behind it.

**And the fix was worse than the problem.** The running average did what it
was meant to — version bumps on the cold flick went 17.7/s to zero — while
frame time went the wrong way, 17.3 to 51.3 ms on steady scroll, worse than
before any of today's work. The reason is structural: a fixed estimate is
wrong per row, but a running average is wrong for EVERY unmeasured row at
once. With 500 rows, a tenth of a pixel of drift in the average moves the
content extent by ~50 px, so each measurement re-lays-out the entire list
instead of one row. Trading a handful of local corrections for continuous
global churn is a bad trade at any list length.

If this is ever revisited, the shape that avoids the trap is a frozen
estimate: average the first handful of measured rows, then stop updating it,
so the content extent settles instead of drifting.

## Round five: the sticky-header amplifier, still unsolved

Round three's unchanged-rect fix closed the "maximized is worse" gap but left
a narrower, still-real bug. Maximized, a sticky list costs 44.0 ms per frame
against 17.3 ms for the same list without stickiness (`down2`), while OUR
measured costs are flat or LOWER in the sticky case — the same signature as
round three, at the child-count scale instead of the window-area scale.

The mechanism is not in doubt: the pin-correction tick (`scroll-view.tsx`
~441) calls `queueAllocate(content)` on nearly every frame of motion, and
`content`'s `allocate()` (`use-layout-child.ts` ~274) then unconditionally
`sizeAllocate`s every child — about 1268 a second — to move one pinned
widget. Skipping the children whose rect had not changed proved the cost is
real: 44.0 ms down to 19.8. It also broke five test files, both times it was
tried, in the naive form and in a corrected form that additionally tracked
which widgets we had queued work for.

**What is NOT the cause.** The corrected attempt was diagnosed as a
wrapper-identity problem: `GtkScrolledWindow` wraps a non-scrollable child in
an internal `GtkViewport`, and the theory was that `getParent()` through that
never-explicitly-referenced widget returns a different JS object than the
React ref to the same `ScrolledWindow`, so a `WeakSet` of ancestors silently
misses. **Measured, and it is false.** A probe comparing a traversed widget
against the React ref for the same object returns true through the viewport
hop, and repeated traversals return the same object:

| Comparison                                       | Result |
| ------------------------------------------------ | ------ |
| `box.getParent().getParent() === scrolledRef`    | true   |
| `sw.getFirstChild().getParent() === scrolledRef` | true   |
| `sw.getFirstChild().getFirstChild() === boxRef`  | true   |

So gtkx does intern wrappers by pointer, including for widgets it creates
itself. Whatever breaks the skip, it is not identity. That conclusion was
nearly filed upstream as a gtkx bug; verifying it first is the only reason it
was not.

**The other candidate**, moving the pinned header into its own small
container, was rejected on review rather than measurement, for two
independent reasons in our own code: `use-layout-child.ts` computes a child's
Yoga index from its GTK sibling position, which assumes the GTK parent and
the Yoga parent are the same container — reparenting breaks that for any
sibling mounting while the header is pinned, which is the normal case in a
live list. And Yoga resolves `position: absolute` against the immediate
parent, while `FlatList` positions every cell that way relative to the list
start — exactly the configuration the perf bar measures.

**Where it stands.** The amplifier is understood and reproducible, the cost
is quantified, and no safe fix has been found. Skipping allocations needs a
reliable "does this widget still need allocating" signal, which GTK4 does not
expose publicly and which our own bookkeeping has now failed to reconstruct
twice — for a reason still unknown, since the identity theory is dead. The
next honest step is to find out what actually breaks under the skip, with the
same instrument-first discipline that settled rounds three and four, rather
than to try a third variant.

> Round six re-measured the two numbers this section compares (44.0 against
> 17.3) with the window geometry actually verified, and they do not survive:
> the 17.3 is a windowed measurement. See below.

## Round six: the maximized numbers were never area-controlled

Re-measured 2026-08-01 on the same rig, on `main` at gtkx `1.0.0-rc.3`,
after transforms in the allocation path (#29), the negative-size and
classifier fixes (#32), and the responder system (#41). The starting question
was whether a next win exists past round three's 17.3 ms. The answer is that
17.3 ms was never a maximized number.

### The instrument that was missing

Every session run resizes the window by pressing GNOME's maximize binding
through `ydotool` — and the keystroke goes to whatever window has focus.
This box is shared with other agents' running example apps, and the miss is
not rare: of the eight maximize runs taken today whose geometry could be
checked at all, **one silently stayed windowed** and reported windowed
numbers under a maximized label. Round three caught that class of error for
the FlatList runs by
checking live Yoga nodes (445 windowed against ~800 maximized), which is why
its FlatList numbers hold up.

**That check is blind in exactly the run the conclusion rested on.** In
`PERF_MODE=scrollview` all 500 rows are mounted no matter how big the window
is, so the node count is ~1504 either way and cannot witness the geometry.
The control that established "area alone costs nothing" is the one run whose
geometry nothing verified.

The probe now logs its own root allocation (`PERF_MARK size WxH`) on every
change, so a run certifies its own geometry instead of the analysis assuming
it. Two things fell out immediately:

- Maximized on this display (2632×1700) is **1981×1212**, and windowed is
  560×724 — a **5.9× area ratio**, not the "roughly doubled" viewport round
  three inferred from the node count. Nodes track viewport HEIGHT (2.2×
  here); the width went 4.7× and nothing was counting it.
- Requesting an oversized window (`PERF_WIDTH=2600 PERF_HEIGHT=1620`) is
  clamped by the compositor to that same 1981×1212. So the large-area cell
  needs no keystroke, no focus, and no ydotool at all — it is deterministic.
  Prefer it.

### Area is most of the frame, and it is not ours

The 2×2 that separates painted area from our own work, medians of three
interleaved repeats on a quiet box (`down2`, steady scroll over warm rows):

| Configuration              |      area | `frame.avg` | `frame.veryLate`/s |
| -------------------------- | --------: | ----------: | -----------------: |
| ScrollView, windowed       |   560×724 |     15.5 ms |                0.3 |
| FlatList `windowSize` 11   |   560×724 |     15.0 ms |                0.4 |
| ScrollView, full area      | 1981×1212 | **43.9 ms** |               22.0 |
| FlatList `windowSize` 11   | 1981×1212 |     44.5 ms |               21.8 |
| …plus a sticky header      | 1981×1212 |     52.6 ms |               18.5 |

The ScrollView row is the control: all 500 rows mounted, scrolling is a pure
native adjustment translation, and the instrumentation confirms it does
**zero** engine flushes and **zero** GTK allocate passes for the whole phase —
the only thing we spend is 0.04 ms/s of scroll handler. It still costs
43.9 ms per frame at full area against 15.5 ms windowed.

So round three's control does not reproduce, and its central inference —
"area alone costs nothing… only the PRODUCT hurts… the lever is ours: shrink
N per frame" — rests on a run that was almost certainly never maximized. Area
alone costs 2.8×, measured with nothing of ours in the loop.

What our whole virtualized list adds on top of a native scroll of the same
content at the same size is the difference between rows three and four:
**0.6 ms of a 44.5 ms frame.** Windowed it is negative (15.0 against 15.5) —
inside the noise. The same run repeated before the rc.3 rebase landed on the
same shape (15.5 / 15.3 / 47.7 / 49.9), so the renderer bump moves none of
this either way.

### Round five's sticky amplifier, with the geometry held still

The sticky row above is the same comparison round five made, and it shrinks
the same way. Round five recorded 44.0 ms sticky against 17.3 ms plain and
read the gap as a 2.5× amplifier; measured at one geometry, it is **52.6
against 44.5 — about 8 ms**, because the 17.3 comparator was windowed.

The mechanism round five described is real and is still there (the pin tick
calls `queueAllocate(content)` on nearly every frame of motion, and the
container's `allocate()` re-allocates every child to move one pinned widget:
`gtk.allocPass` 55.5/s sticky against 49.2/s plain, for the same ~1200 child
allocations a second). What changed is the size of the prize. Eight
milliseconds is real, but it sits on top of a frame that is already 44 ms of
rasterization, so buying all of it still leaves ~23 fps. Against a fix that
has broken five test files on two separate attempts, that is not a trade
worth a third variant — the cost is now quantified and documented, which is
the useful state for it to be in.

### The round-three fix does not fire

`use-layout-child.ts`'s early return on an identical rect was credited with
40.4 → 17.3 ms. It is now instrumented: `rect.skip` counts the guard firing,
`rect.change` counts it not firing.

**`rect.skip` is zero in every phase, at both window sizes, in every run.**
`rect.change` equals `engine.commits` exactly. The unchanged-rect commit the
guard exists to catch does not occur at all in this workload — `collectChanges()`
only descends into a child that Yoga gave a new layout or that lies on the
dirty path, so a leaf that reaches the commit callback during a scroll has
genuinely moved.

Gating the guard off behind an env flag and running it head to head confirms
it: identical counters (`gtk.allocPass` 47.2 against 46.9, `gtk.allocChild`
1264 against 1255) and frame times inside the noise, maximized and windowed.

The guard is correct and free, so it stays — but it is not what moved those
numbers. Reading the two records together, the pre-fix 40.4 ms is recorded
with 801 live nodes (so it really was maximized, and it agrees with today's
~48 ms for the same geometry), while the post-fix 17.3 ms carries no geometry
evidence and matches today's **windowed** 15.3 ms. The pair compares a
maximized run against a windowed one.

### What this means for the epic

At full-screen size on this rig, a scrolling frame costs ~44 ms and ~44 of
those are the software rasterizer moving pixels. Our layer is under 1 ms of
it. Removing every allocation, commit and measure we do would take a 22 fps
window to about 23 fps. There is no next win on our side of the line, and the
"maximized is worse" symptom that started rounds three to five is a property
of a guest with no GPU: `systemd-detect-virt` reports `apple`, whose
virtio-gpu is display-only, and round three already measured that the cairo
renderer is twice as slow again.

Windowed — the size these apps actually run at in the gallery and the
examples — FlatList is at 15.0 ms and 0.4 very-late frames a second, i.e.
60 fps with headroom, and indistinguishable from a plain native
`GtkScrolledWindow` holding the same content. That is the honest end state,
and the epic closes here.

One caveat the numbers cannot settle: because this guest has no GPU, paint is
at its most expensive here and our share is at its smallest. On hardware with
a working GL path the ~44 ms would collapse and our ~1 ms would be a much
larger fraction of a much smaller frame. Nothing measured here says our layer
is cheap in absolute terms — it says it is not what is costing frames on the
only rig available.

Two things worth keeping from this round, both instruments rather than fixes:
the probe's `PERF_MARK size` line, and the `rect.skip`/`rect.change` counters.
Between them, a future run cannot repeat either of the mistakes in this
document — comparing two geometries by accident, or crediting a guard that
never fired.
