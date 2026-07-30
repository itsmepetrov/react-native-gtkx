# Spike (layout manager): verdict — B0 WORKS

Date: 2026-07-29. Run: VM (Ubuntu 26.04 aarch64, GTK 4.20, headless sway + pixman), `bash run-vm.sh`.

## Verdict

**B0 confirmed: a GObject subclass of GtkLayoutManager registers entirely from JS —
our own native addon (B1) is NOT needed.** gtkx rc.1 ships everything ready-made:

- `@gtkx/native` exports `registerClass(name, parentType, {vfuncs})` with native
  trampolines (NAPI-RS), and `@gtkx/runtime.registerClass(klass, opts)` is the
  high-level wrapper: extend a codegen class, override methods.
- The codegen already ships the **complete `LayoutManagerClass` vfunc registry**
  (`registerWrapperClass(LayoutManager, ...)` in gi/gtk/gtk.js): byteOffset
  136/144/152 (get_request_mode/measure/allocate), descriptors including
  `t.ref(t.int32)` for the measure out-params. Nobody computes offsets by hand.
- Vfunc out-params are returned from the JS method **as a tuple**:
  `measure() → [minimum, natural, minBaseline, natBaseline]`
  (runtime `splitTupleResult`/`writeOutParams`).
- `receiver: "this"` — inside a vfunc `this` === the manager's JS instance
  (created by the wrapper constructor via setWrapper), so state (rects) lives
  directly in instance fields, no WeakMap needed.

## Run results (all phases green)

```
SUBCLASS OK type=RnGtkxLayout isA(LayoutManager)=true
MEASURE  OK h=[300,300] v=[200,200] labelMin=507 calls=2
ALLOCATE OK a=10,10,120,30 b=150,10,120,30 o=280,60,60,30
OVERFLOW OK measureAfter=[300,300] childRight=340
SHRINK   OK window=200x150 (each label's own minimum is 507px)
PERF     207.8ms / 1000 allocations x 50 children (~0.21ms per full pass)
PAINT-PIXELS OK block=86 control=250 — the overflow child painted past the boundary
```

Screenshot: shots/paint.png (the ██ block is drawn past the container's right
edge over the neighboring box's background — paint-overflow like RN).

## Facts affecting the implementation

1. **`typeName` is mandatory**: `registerClass` derives the GType name from
   `klass.name` by default, and the bundler minifies class names →
   `GLib-GObject-CRITICAL: type name 'X9' is too short` and G_TYPE_INVALID.
   Always pass `registerClass(K, { typeName: "..." })`.
2. **GtkFixed is incompatible with a foreign manager**: `gtk_fixed_put` demands
   a `GtkFixedLayoutChild` from the container's CURRENT manager. `GtkBox.append`
   does not touch layout children — swapping the manager after append is safe.
   → The containers therefore move from GtkFixed to GtkBox (the gtkx
   reconciler appends Box children natively), or we parent widgets manually.
3. **GTK4 is silent about under-minimum allocation** — 0 warnings for the whole
   run (the only warning was about the locale, unrelated to layout). No
   suppression needed.
4. **An under-allocated GtkLabel draws its FULL text past the allocation**
   (the two labels in the spike overlapped). RN text semantics require clipping
   to the own box → text leaves get `gtk_widget_set_overflow(HIDDEN)`
   (paint clip); containers keep VISIBLE (paint overflow).
5. **SHRINK without the wrapper**: the floating window accepted
   setDefaultSize(200,150) exactly; children minimums (507px) do not interfere —
   the ratchet is eliminated by the manager itself. sway-IPC resizing was not
   needed (floating + setDefaultSize is equivalent for testing the ratchet).
6. **Zero workarounds needed**: `getHandle`/`getInstanceType`/`typeIsA`/
   `resolveType`/`registerClass` are public `@gtkx/runtime` exports.
   `@gtkx/runtime` becomes a direct dependency of the package (it was
   transitive via @gtkx/react).
7. **Perf**: 0.21ms per synchronous vfunc pass (measure+allocate of 50 children,
   the FFI path native→JS→50×sizeAllocate). The budget baseline for the engine.
8. Registering the class at module load (before activate/Gtk.init) works — GObject
   is ready right after importing @gtkx/native (init() in the package's main.js).

## B1/B2

- B1 (a mini C addon) — not needed; the branch is closed without implementation.
- B2 (upstream) — remains a desirable track (native trampolines without
  per-frame FFI marshalling), to be drafted later; not a blocker.
