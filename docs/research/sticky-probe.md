# Sticky-header jitter: subpixel quantization, not timing

The research behind the sticky-header pinning in
`src/components/scroll-view.tsx` (the standalone probe app lived in
`spike/sticky-probe/` before the retired spikes were cleaned up;
per-frame telemetry via `computeBounds` on the scrolled window).

## The symptom

A pinned sticky header shivered by 1px during slow scrolling — even after
the pin position was computed inside the same allocation pass as the
children (`beforeAllocate`), and even with a frame-clock tick callback
driving a same-frame re-allocation. Two timing-based theories failed
before telemetry settled it.

## The finding

Telemetry showed a deterministic 0/1px oscillation, not a race: GTK's
scrolled window translates the content viewport by the FRACTIONAL
adjustment value, while widget allocations are integers. As the fraction
crossed rounding boundaries, the header's on-screen position alternated
around the true edge.

## The fix

Quantize the pin to the grid the viewport translation lands on:
`Math.floor(rawScrollTop)` before computing the pinned offset — after
which the header's viewport-relative position telemetry reads a flat
0.00 throughout scrolling. The frame-clock tick callback stays as the
same-frame driver (queue an allocation every frame while sticky records
exist: comparing adjustment values can miss the frame's final offset
because the kinetic-scroll tick may run after ours).
