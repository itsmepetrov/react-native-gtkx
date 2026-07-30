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
  consistently. Our own work is flat or lower at 1600 px. The remaining
  overage is compositor/paint cost invisible to JS instrumentation;
  pixman (headless) and the session's llvmpipe/EGL-Zink path evidently
  scale differently with area. Verification path: run
  `examples/perf-probe` with `GTKX_PERF=1` in the real session while
  resizing, diff `frame.late`/`frame.max` against the headless numbers.

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
