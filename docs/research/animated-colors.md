# Research: animating colours, and refusing to animate layout

Date: 2026-08-01. Run: VM (Ubuntu 26.04 aarch64, GTK 4.22.4), headless sway
via the `gtk` vitest project — the same machine and harness as
[transforms.md](transforms.md), so the numbers here sit next to that file's
without conversion. Software rendering, so the absolute paint costs are
pessimistic; every comparison below is between two paths measured against
each other on the same machine, which is what the decisions turn on.

## Verdict

**Colours animate.** `backgroundColor`, `color` and every `border*Color` /
`outlineColor` reach a mounted widget through a `GtkCssProvider` private to
that widget, at **11.2 µs per frame end to end and zero React renders**.

**Layout does not, on purpose.** A `width` write costs a Yoga pass, and a
Yoga pass costs what the TREE costs — 64 µs at five children, 128 µs at
sixty, 496 µs at three hundred — before GTK re-measures every ancestor the
resize invalidated. The transform that replaces it costs 0.7 µs at every one
of those tree sizes. Layout properties are refused by name, with the
transform to use instead.

## 1. Why the existing CSS path cannot carry a colour

Every visual style on this platform becomes a class:
`visualStyleToCss` renders the declarations, `createCssRegistry`
(`src/style/registry.ts`) memoises **by the generated CSS text**, and
`@gtkx/css` inserts the rule into one process-wide stylesheet that is handed
to GTK with `gtk_css_provider_load_from_string`.

Every part of that is right for a style that changes when React renders, and
wrong for one that changes sixty times a second. The cache key is the value,
so a distinct colour is a distinct class; the stylesheet is append-only, so
the rule is never removed; and the provider is reloaded with the **whole**
document each time, so the parse cost grows with the number of frames that
have already run.

Measured: 600 frames, a distinct colour each, `getClassName` plus the
stylesheet reload it queues.

| frame | cost of that frame |
| ----- | ------------------ |
| 0     | 0.80 ms            |
| 1     | 0.13 ms            |
| 99    | 0.47 ms            |
| 199   | 1.11 ms            |
| 299   | 2.21 ms            |
| 399   | 3.52 ms            |
| 499   | 5.14 ms            |
| 599   | 6.78 ms            |

600 frames produced **600 distinct classes**, all of them permanently live in
both the registry's `Map` and the GTK document. Adding one more class once
the sheet already holds 600 costs **7.96 ms** — half a frame budget, for one
colour, and still climbing. Ten seconds of a colour animation would leave 600
dead classes behind and be spending more than a third of every frame parsing
them.

Two components of that, separated:

| step                                             | cost    |
| ------------------------------------------------ | ------- |
| `getClassName` for a NEW style (no sheet reload) | 10.4 µs |
| `getClassName` for a style already in the cache  | 1.11 µs |

The second row is the number that must not regress: it is what every static
style in a real app pays on every render. Nothing in this work touches the
registry, and a unit test drives 600 frames of colour through the imperative
path while asserting the registry mints exactly one class
(`tests/unit/style/imperative-css.test.ts`).

## 2. Two ways to attach a provider, and a 5× difference

GTK4 has two places to put a `GtkCssProvider`:

- `Gtk.StyleContext.addProviderForDisplay(display, provider, priority)` — the
  supported API, applying to the whole display, so the rule needs a selector
  that picks out the one widget (a unique CSS class);
- `styleContext.addProvider(provider, priority)` on the widget's own style
  context — **deprecated since GTK 4.10**, applying to that widget alone.

The difference is not the call, it is what a reload invalidates. 600
iterations, on a mounted 60-widget tree; the "restyle" columns force GTK to
recompute by reading a value back out of it.

|                            | reload alone | + restyle the target | + restyle all 60 | + restyle an UNRELATED widget |
| -------------------------- | ------------ | -------------------- | ---------------- | ----------------------------- |
| display-wide provider      | 7.4 µs       | 117.4 µs             | 1195.9 µs        | 517.5 µs                      |
| widget-scoped provider     | 4.1 µs       | 23.8 µs              | 327.6 µs         | 25.2 µs                       |
| control — no reload at all | —            | 2.1 µs               | 169.9 µs         | 2.1 µs                        |

The "reload alone" column is misleading on its own and is kept only to show
why: GTK invalidates lazily, so 599 of those 600 reloads are never paid for
by anything. The honest number is the next column along. A display-level
reload invalidates **every CSS node on the display** — an unrelated widget
costs 517 µs to read afterwards — while a widget-scoped one costs 25 µs on
the same widget.

Seen per frame, with the paint the frame does anyway:

| children in the tree | paint floor | widget-scoped provider | display-wide provider |
| -------------------- | ----------- | ---------------------- | --------------------- |
| 5                    | 152 µs      | 239 µs                 | 290 µs                |
| 60                   | 297 µs      | 347 µs                 | 743 µs                |
| 300                  | 1190 µs     | 1279 µs                | 2625 µs               |

The widget-scoped provider stays ~50–90 µs above the paint floor at every
size. The display-wide one costs **+446 µs at 60 widgets and +1435 µs at
300** — it gets worse the bigger the app, which is exactly the property an
animation primitive must not have.

**Decision: the widget's own style context, deprecated API and all.** GTK's
own migration note for `gtk_style_context_add_provider` points at the
display-wide replacement, i.e. at the slower column; taking it would make an
animated colour the most expensive thing on the platform and would make its
cost depend on what else is on screen. `src/gtkx/bridge/widget-css.ts` is the
one place that decision lives, which is what `src/gtkx/bridge/` is for — if
GTK5 removes the per-widget cascade the fallback is a display-wide provider
plus a unique class, at the measured cost, and nothing above the bridge
changes.

### Two properties of the widget-scoped provider, verified

Both were open questions and both were measured rather than assumed
(`min-width` through a provider on a parent, read back with
`gtk_widget_measure`):

- **`*` matches the widget, not its children.** A provider on a parent's
  style context moved the parent to 123 px and left its child at 10 px. So
  the rule needs no selector of its own — no CSS class, no widget name, and
  therefore nothing React has to be told about.
- **A class selector would not survive React.** With `.rn-anim-1` as the
  selector, `gtk_widget_set_css_classes` — which is how gtkx writes the
  `cssClasses` prop, replacing the whole list — dropped the widget back to
  its unstyled 40 px. `*` is unaffected by any class write.

`removeProvider` reverts the widget cleanly, which is what the unmount path
relies on.

## 3. The implemented path, per frame

End to end: a shared-value write → the mapper → the style node → the view
layer's listener → the CSS body → the provider reload. No paint, so that this
is comparable with transforms.md's separation of the write from the allocate
pass.

| step                                                        | cost        |
| ----------------------------------------------------------- | ----------- |
| **whole write, `useAnimatedStyle` → `backgroundColor`**     | **11.2 µs** |
| of which `driveableColorsToCss` (parse, normalise, render)  | 2.2 µs      |
| of which `provider.loadFromString`                          | 4.3 µs      |
| for scale: `setStoredTransform` (a transform's whole write) | 0.12 µs     |
| for scale: `queueAllocate`                                  | 0.58 µs     |

2000 consecutive frames cost **one** React render — the mount. With the
paint, the whole frame is 320 µs against a 160 µs paint floor on a 60-widget
tree; the difference is the widget redrawing, which any visible colour change
pays.

A colour is therefore ~16× a transform write and still 0.07 % of a 16.7 ms
frame. Against the class-registry path it is **70× cheaper on the first
frame, 600× cheaper by the six hundredth**, and — the part that actually
matters — constant instead of growing.

## 4. Layout properties: the measured refusal

Reanimated animates `width`, `height`, `top`, `flex` and every
`margin*`/`padding*` on iOS and Android by writing the shadow tree and
running Yoga on the UI thread. Not implementing that here is a real deviation
from upstream, so it needs a number rather than an opinion.

The write a `width` animation would have to make is `node.setStyle({width})`
plus an engine flush — a Yoga `calculateLayout` over the dirty subtree and
the commit walk that follows it. The commit calls `queueResize`, which makes
GTK re-measure the widget and every ancestor up to the toplevel.

| children in the tree | Yoga pass + commit | + GTK relayout & paint | transform + paint | paint floor |
| -------------------- | ------------------ | ---------------------- | ----------------- | ----------- |
| 5                    | 63.9 µs            | 295 µs                 | 197 µs            | 152 µs      |
| 60                   | 127.6 µs           | 793 µs                 | 596 µs            | 297 µs      |
| 300                  | 496.3 µs           | 3292 µs                | 3330 µs           | 1190 µs     |

`queueResize` itself is 0.64 µs; the cost is not the call, it is what the call
makes GTK do afterwards.

The shape of that first column is the decision. A layout write is **O(the
tree)**: 64 µs, 128 µs, 496 µs for the same single animated value, because
changing one child's width re-lays-out its following siblings and every
ancestor whose size follows. Both other imperative paths are O(1) in the
tree — 0.12 µs for a transform, 11.2 µs for a colour, at every size. At 300
children a single animated `width` spends 3 % of a frame budget in Yoga
alone, before GTK has re-measured anything, and it grows with the app.

It is also the one write that is not paint-only: `queueResize` propagates to
the toplevel, so an animated `width` can resize the window it is in. There is
no version of that which is safe to run at 60 Hz.

**Decision: refuse, by name, with the alternative.** `useAnimatedStyle`
returning a layout property warns once for that property with its own
message — that it is a LAYOUT property, that the cost is a Yoga pass plus a
GTK resize of every ancestor, that the cost grows with the tree, and which
transform to use instead (`translateX` for `left`/`right`, `translateY` for
`top`/`bottom`, `scaleX`/`scaleY` for `width`/`height`). The value is still
applied on the next React render rather than dropped, exactly as before.

The refusal is a warning and not a throw for one reason: a layout property in
an animated style is usually a constant sitting next to the thing that moves
(`{ width: 40, transform: [...] }`), and that is ordinary code. Only a
property that CHANGES between mapper runs warns.

**What would change this decision.** Two numbers. If the Yoga column became
flat in tree size — which needs an incremental layout that re-solves only the
dirty node and its ancestors, not the following siblings — the O(1) argument
disappears and the remaining cost is comparable with a colour. And if
`queueResize` could be scoped so it did not reach the toplevel, the window-
resize hazard would go with it. Neither is a small change, and neither is
worth doing speculatively: RN's own native driver restricts animations to
`transform` and `opacity` for the same reason, and every consumer already
writes to that restriction.

## Not implemented, and why

- **Radii, border widths, shadows.** They go through the same provider and
  the same generator, and would be a few lines each. Left out because
  `borderWidth` participates in Yoga on other platforms and the surface is
  worth designing once, with the layout question settled, rather than twice.
- **`Animated.Text` / `Animated.Image` colours.** The provider is generic
  over any widget, but those components expose no ref yet — the same blocker
  slice 1 recorded for `createAnimatedComponent`.
- **`interpolateColor`'s `'LAB'` colour space.** Upstream's is a vendored
  slice of culori and is fed 0-255 channels where culori documents 0-1, so
  reproducing it means reproducing the scaling. Refused by name; `'RGB'`
  (with upstream's 2.2 gamma) and `'HSV'` (with upstream's hue-wrap
  correction) are implemented exactly.
- **`processColor`.** It returns RN's packed AARRGGBB integer, whose only
  consumer is a native module. A colour's destination here is a GTK
  stylesheet, which takes strings, so the integer would be accepted by
  nothing downstream — including this platform's own styles.
