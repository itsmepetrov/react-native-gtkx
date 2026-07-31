# Research: rotate/scale on GTK widgets

Date: 2026-07-31. Run: VM (Ubuntu 26.04 aarch64, GTK 4.20), headless sway via
the `gtk` vitest project. Everything below is measured, not inferred.

## Verdict

RN's `transform` — `translateX/Y`, `scale`, `scaleX`, `scaleY`,
`rotate`/`rotateZ` — applies to real widgets through the **allocation's
`GskTransform`**, with correct RN semantics (visual only, origin at the
view's centre) and with **hit-testing that follows the transform for free**.
No compositing layer of our own, no CSS.

## Why the allocation and not CSS

`gtk_widget_size_allocate()` is a two-line wrapper: it turns the rect's x/y
into `gsk_transform_translate()` and calls
`gtk_widget_allocate(width, height, baseline, transform)`. So the transform
argument is the same door translation already goes through — a rotated child
is not a special case for GTK, it is the general case we were only using half
of. GTK4 CSS has no widget `transform` property; nothing was being dropped
into CSS that could have carried this instead.

`gtk_widget_allocate` also keeps the width/height it is given, so the widget
still occupies exactly the box Yoga computed: RN's "transforms are visual
only" is what the API already does, not something we enforce on top.

## Findings

### 1. Ownership: the consuming API is safe, manual unref is not

Every mutating `GskTransform` method is consuming (`transfer full` on
`next`), and gtkx's codegen carries that through — the descriptors in
`@gtkx/gi/gsk` mark those arguments `ownership: "full"` while read-only ones
are `"borrowed"`.

- 100 000 `child.allocate(w, h, -1, transform)` calls with a fresh transform
  each, inside one allocate pass: RSS 728.3 → 728.3 MB, no crash. Ownership
  moves to GTK correctly.
- Building 400 000 chained transforms and dropping them: RSS plateaus after
  the first round (709 → 713 → 715 → 724 MB over four rounds of 100 000).
  Finalization is asynchronous — a synchronous loop with `global.gc()` in it
  shows an apparent 800 B/transform "leak" that is simply napi finalizers
  that have not run yet. Not a leak.
- **Calling `unref()` by hand aborts the process** — GLib's
  `g_atomic_rc_box_release_full` fails its `G_BOX_MAGIC` assertion. The JS
  wrapper owns a reference and finalizes it, so releasing it again is a
  double free. Never unref a transform in our code.

### 2. Build the matrix in JS, hand it over in one call

| construction                                                       | cost per transform |
| ------------------------------------------------------------------ | ------------------ |
| `new()` + `translate` + `translate` + `rotate` + `scale` (chained) | 18.3 µs            |
| `Gsk.Transform.parse("translate(…) rotate(…) scale(…)")`           | 7.4 µs             |
| `new().matrix2d(xx, yx, xy, yy, dx, dy)`                           | 5.7 µs             |
| `new()` alone                                                      | 1.8 µs             |

`to2d()` of the chained and the `matrix2d` form are bit-identical, so the
cheap one is not an approximation. Composition therefore happens in
`src/style/transform.ts` (plain numbers, unit-testable on macOS) and the
bridge makes exactly one `matrix2d` call.

Two notes on `parse()`: it wants unitless numbers (`translate(10, 20)`
parses, `translate(10px, 20px)` does not), and it is slower than `matrix2d`
anyway.

### 3. Hit-testing follows the transform — no caveat needed

`gtk_widget_pick()` inverts the child's transform before descending, so a
rotated widget is picked in its rotated shape. Measured on an 80×40 box at
(50, 50), centre (90, 70):

| transform         | `computeBounds`   | picks that hit           |
| ----------------- | ----------------- | ------------------------ |
| none              | (50, 50, 80, 40)  | (60,60) (120,85) (95,65) |
| `rotate: "90deg"` | (70, 30, 40, 80)  | (75,100) (95,65)         |
| `scale: 2`        | (10, 30, 160, 80) | all four probes          |

Under `rotate: "90deg"` the points that hit the flat box — (60,60), (120,85)
— miss, and (75,100), which was below the flat box, hits. This is the same
behaviour RN and the web give a transformed element, and it is why nothing in
`pointerEvents` needed changing.

### 4. Cost on the animation fast path

An Animated write is still a WeakMap store plus one queued GTK allocation —
no React render, no Yoga pass. What the store step now costs (500 000
iterations each):

| write                                                    | before | after  |
| -------------------------------------------------------- | ------ | ------ |
| `setStoredOffset(w, x, 0)` — what a translate used to do | 41 ns  | —      |
| `setStoredTransform(w, [{translateX}])`                  | —      | 123 ns |
| `setStoredTransform(w, [{translateX}, {translateY}])`    | —      | 124 ns |
| `setStoredTransform(w, [{rotate}])`                      | —      | 254 ns |
| `setStoredTransform(w, [{rotate}, {scale}])`             | —      | 538 ns |

So an existing translate animation pays **+82 ns per value per frame**. The
write also queues the allocation, and `queueAllocate` alone is 755 ns of FFI
(unchanged), so the whole write goes from ~796 ns to ~878 ns: **+10 % of a
step that runs once per animated value per frame**, or +5 µs per second at
60 fps.

Per allocate pass, per child (200 000 iterations inside a real layout phase):

|                                     | cost   |
| ----------------------------------- | ------ |
| `allocateChild` without a transform | 3.5 µs |
| `allocateChild` with a transform    | 8.5 µs |

Untransformed children are untouched — the matrix travels in the same
rect-store record the allocate hook already reads, so there is no extra
lookup, only a null check. A rotated or scaled child costs **+5.0 µs per
allocate pass**, i.e. 0.03 % of a 16.7 ms frame; ten of them cost 0.3 %.

Sanity check against the earlier baseline: `docs/research/layout-manager.md`
measured 0.21 ms for a full pass of 50 children — 4.2 µs per child, against
the 3.5 µs measured here for the allocation call itself. Same ballpark, same
machine, so the harness is measuring what it claims to.

## Not implemented

- **3D**: `rotateX`, `rotateY`, `perspective`. `GskTransform` has
  `rotate3d`/`perspective`, but RN's model puts perspective on the parent and
  that is a design of its own.
- **`skewX`/`skewY`, `matrix`**: RN has them, our `TransformPart` never did.
  `gsk_transform_skew` exists, so this is a small addition when asked for.
- **`transformOrigin`** (RN 0.74+): the origin is always the view's centre.
  Nothing in GTK prevents it — the bridge already re-centres explicitly, so
  it is a contract question, not a platform one.
