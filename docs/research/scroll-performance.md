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

**What this means.** Nothing in the virtualization or layout path explains
the maximized symptom, and there is no fix for it on our side of the
boundary. The rig has no GPU acceleration — llvmpipe is software rendering —
so the honest scope of the finding is _this VM_. On accelerated hardware the
same measurement is the obvious next question, and it needs real hardware
rather than another probe run.

Caveats: one run per configuration, and frame maxima are noisy on this rig
(±30 ms). The `veryLate` swing (0.13/s → 22/s) is two orders of magnitude
past that noise, which is why one run is reported as settling the question
where a 10% difference would not have been.
