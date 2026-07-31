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

## Round four: hover latency, and separating our cost from native's

A different symptom, reported against a native reference rather than felt in
isolation: hover lags during fast scrolling (worse than a native file
manager, but native lags too — not necessarily ours to fix), and hover along
a sidebar-style list reacts visibly slower than a native sidebar (fully
ours, or so the hypothesis went). Two hypotheses, and they turned out to
both be right, one per case:

- Every row boundary crossing runs `onHoverIn`/`onHoverOut` → `setState` →
  React render → Yoga → allocation → repaint — a full framework cycle to
  swap a background color, where a native `GtkListBox` swaps a CSS class
  and does nothing else.
- During scrolling, frames are already busy with scroll work, and pointer
  motion is handled on the same loop — hover would queue behind it with no
  separate mechanism at fault.

### Method

`examples/hover-probe` renders the SAME row list two ways, so the method is
identical for both: `HOVER_MODE=pressable` is a FlatList of `Pressable` rows
with `style={({ hovered }) => ...}` — the exact pattern hn-app, the gallery
and adwaita-primitives already use for row hover. `HOVER_MODE=native` is a
plain `Gtk.ListBox`/`Gtk.ListBoxRow` built with the raw GI classes (not
JSX — see the file for why: a `wrapReactNative` component nested inside
another one resolves its Yoga node against the wrong parent and never gets
allocated), relying entirely on GTK's own prelight/`:hover` handling — no
Pressable, no FlatList, no Yoga on the rows at all. Both arms fill a
maximized window, so `scripts/perf/run-hover-probe-session.sh` can drive a
REAL pointer with ydotool (relative moves, clamped to a screen corner first
so the starting position never has to be known) without needing the
window's on-screen coordinates.

Latency is measured as signal-to-applied, not felt: `pressable.hoverApply`
(in `components/pressable.tsx`, `GTKX_PERF=1`) times from the native
enter/leave signal to the resulting CSS class actually landing on the
widget — synchronously for the direct-swap path, after the commit for the
setState path. The native arm has no such hook by design (that is the
point), so the probe adds one of its own, `native.hoverApply`, timing from
the same `enter` signal to GTK's own `state-flags-changed` reporting
PRELIGHT — both driven by the identical pointer-motion signal, so the two
numbers are comparable despite coming from different code paths.

### Case 2 (sidebar hover) confirmed, by about 500x

Real session, maximized window, 60-row list, continuous ydotool sweep, no
scrolling — `pressable.hoverEvent` and `pressable.hoverFullCycle` were
equal, every single one of 283 crossings over 7s ran the full cycle:

| metric (idle, at rest)   |     `pressable` (before) |     `native` |
| ------------------------ | ------------------------: | -----------: |
| crossings                |                       283 |     (n/a, continuous) |
| apply, average            |                    4.85 ms |       0.01 ms |
| apply, worst              |                   80.91 ms |       0.13 ms |

Average latency is ~485x native's; the worst crossing is ~620x. Both numbers
are the same physical event (a `GtkBox`'s `EventControllerMotion` firing
"enter") measured to the same kind of outcome (the highlight is now applied)
— the gap is entirely the setState-render-Yoga-allocate cycle standing
between them, exactly hypothesis 2's shape.

### Case 1 (hover during scroll): the scroll work dominates, not hover

Same probe, `down`-style bouncing scroll running underneath the same
pointer sweep. Two things are true at once here, and they point the same
way:

| metric (scroll phase)     | `pressable` (before) | `pressable` (after) |
| -------------------------- | ---------------------: | ---------------------: |
| `frame.avg`                |                30.29 ms |               30.95 ms |
| `frame.veryLate`/s          |                   12.33 |                   15.92 |
| hover apply, average        |                 6.25 ms |                0.017 ms |
| hover apply, worst          |                11.72 ms |                 0.17 ms |

Fixing hover's own cost moved the hover numbers by two orders of magnitude
and left `frame.avg`/`frame.veryLate` unchanged (within this rig's noise —
the whole doc's running theme). That is the signature of hypothesis 1: the
frame budget during a scroll is already spent on scroll work, hover's own
cost was never the dominant term there, and it needs no separate fix — it
improves incidentally alongside whatever 006 does to the scroll loop itself,
exactly as the task predicted. What this task's fix DOES contribute to case
1 is one less thing competing for that budget, which is real but not the
story; the honest read is "measured, and it's the scroll loop" for the
scroll-phase frame cost, same as rounds one through three found for scroll
performance generally.

One caveat on the native arm's OWN scroll-phase numbers, in the interest of
not overclaiming: `examples/hover-probe`'s native mode drives its
`GtkAdjustment` with `setValue()` on a 16ms JS timer (there is no native
kinetic-scroll input to synthesize headlessly), which is not necessarily
representative of a real scrollbar drag or touchpad flick — its own
`frame.avg` degrades similarly during that phase. That is why the case-1
comparison above uses the `pressable` arm's before/after, not a
pressable-vs-native comparison: the scroll-mechanics comparison is
`scroll-perf`'s job (rounds one through three, and 006 in progress), this
task's job was isolating hover's own cost, and the native arm answers that
cleanly at rest (no scrolling involved) in the case-2 numbers above.

### The fix

`components/pressable.tsx`: hover stopped being React state. `hoveredRef`
(a ref, not `useState`) is the single source of truth, read directly during
render — safe here specifically because this component already mutates
`handlersRef.current` in the render body for the press gestures, so render
was never React-DOM-pure to begin with. Each render precomputes the CSS
class for BOTH hover values (current and hypothetical-other) whenever
`style` is a function and `children` is not; the native enter/leave
handlers then swap between the two directly with `widget.addCssClass` /
`removeCssClass`, no `setState`, no render, no Yoga, no allocation.

Two cases fall back to the ordinary `setState`-driven render (a small
`forceRender` via `useReducer`, since `hovered` is no longer state):
`children` reading `hovered` (content, not just style, may differ — no way
to precompute that generically), and a hover style that resolves to a
DIFFERENT layout (padding, size, position) rather than only paint — checked
by comparing the Yoga-relevant half of the flattened style between the two
hover values and bailing to a real render if they differ, since a CSS class
alone cannot reflow anything. Both are exercised by
`tests/gtk/components/pressable-hover.gtk.test.tsx`, along with the
common-case fast path and the "nothing reads `hovered`" no-op case.

This is the same shape the round-two/three fixes took: the win comes from
recognizing a whole category of work (React's render pipeline) is
unreachable-by-construction for the common case, not from making that
pipeline faster.
