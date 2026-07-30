# Spike 001 (list-virtualization): windowing over the layout manager — GO

Run: VM (headless sway + pixman), 10 000 rows, window 30, `bash run-vm.sh`.

## Numbers

```
MOUNT  29ms to first layout        (v1 full-mount: 879ms for 1000 rows → ~30× faster on 10× the rows)
WINDOW 30 mounted of 10000
SHIFT  p50=22.3ms p95=30.7ms       (worst-case: 800px jumps remount ~20 of 30 rows)
ANCHOR height correction above the window, scroll compensated — no visual jump
```

## Findings for 002

1. The mechanics hold with ZERO engine changes: content View with an explicit
   prefix-sum height gives the scroll range; rows are `position:absolute` at
   their offsets; scrolling swaps the mounted slice.
2. SHIFT p50 22ms is the WORST case (800px steps replace 2/3 of the window).
   Real smooth scrolling shifts 1–2 rows per frame; the core must keep keys
   stable so React reuses mounted rows, and batch remounts (maxToRenderPerBatch)
   for jump-like offsets.
3. The JUMP marker in the log is timer-bound (300ms wait), not a measurement —
   the real cost of random access is one window remount (~SHIFT p95).
4. Anchoring: when a height above the window is corrected, compensating the
   scroll offset by the delta keeps the view still — do it inside the same
   commit as the offset shift.
5. GTK handles a 400 000px scroll range without complaint (adjustments are
   doubles; our measure returns ints well under 2^31).
