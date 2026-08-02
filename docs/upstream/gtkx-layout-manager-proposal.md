# Draft: gtkx feature proposal — first-class custom layout managers

Status: DRAFT, not filed. To be posted to gtkx-org/gtkx once this project is
public (the maintainers will likely want the reproduction links).

---

## Title

First-class support for custom GtkLayoutManager subclasses (or a built-in
"absolute layout" manager)

## What we built and why

react-native-gtkx renders React Native apps with GTK4: layout is computed by
Yoga on the JS side, and GTK must place widgets at exactly those rects. Stock
managers cannot express that:

- `GtkFixedLayout` reports children bounds as the container's natural size and
  children minimums as its minimum, so out-of-bounds children inflate
  ancestors and content minimums "ratchet" the window (it grows but never
  shrinks back);
- any stock manager allocates children according to its own policy, not an
  external engine's.

We ended up subclassing `GtkLayoutManager` from pure JS — and gtkx made that
possible today: `registerClass` + the generated vfunc registry for
`LayoutManagerClass` (byte offsets and ref descriptors included) meant the
subclass is literally a class with `measure`/`allocate` methods. It works,
ships, and passes a 40+ test GTK suite. Kudos — this is a remarkable
foundation.

## What could be better upstream

1. **A documented, supported story for layout-manager subclassing.** We rely
   on `registerWrapperClass`-generated vfunc metadata that is currently an
   internal detail; a blessed API (docs + a test) would let downstreams depend
   on it without fear.
2. **Per-frame marshalling cost.** Every measure/allocate round-trips
   native→JS with argument marshalling (~0.2 ms for a 50-child container on
   aarch64 under llvmpipe — fine, but it is the hot path). A native
   "external-rects layout manager" shipped by gtkx — a manager that reads a
   plain rect buffer (widget → x/y/w/h) filled from JS and never calls back —
   would cut JS out of the frame loop entirely.
3. **Gotchas we hit that upstream docs could mention:**
   - `registerClass` derives the GType name from `klass.name`; bundlers minify
     class names, producing `G_TYPE_INVALID` with a confusing CRITICAL. An
     explicit `typeName` option exists — recommending it in docs (or hard
     failing without it) would save downstreams a debugging session;
   - `gtk_fixed_put` demands a `GtkFixedLayoutChild` from the container's
     CURRENT manager — swapping the manager on a GtkFixed breaks `put()`;
     `GtkBox.append` is layout-child-free and safe. Worth a note in the
     subclassing docs;
   - vfunc out-params are returned from JS as a tuple — great design, just
     underdocumented.

## Proposal options (either helps, both is ideal)

- **A. Bless the current path**: document layout-manager subclassing, add a
  conformance test, keep the vfunc registry stable across releases.
- **B. Ship `GtkxExternalLayout`**: a C-side manager with
  `set_rect(widget, x, y, w, h)` / `set_content_size(w, h)` JS API, measure
  returning the content size (min == nat) and allocate applying stored rects.
  Downstreams (any JS layout engine — Yoga, Taffy, custom) get native-speed
  frames for free.

## Reproduction / references

- Layout manager in production: `react-native-gtkx`
  `packages/react-native-gtkx/src/gtkx/bridge/layout-manager.ts`
- Standalone spike with measurements: `docs/research/layout-manager.md (` (FINDINGS.md)
- Our divergence catalog: `docs/gtkx-rc4-notes.md`
