# What react-native-gtkx needs from gtkx

This is the standing agenda for issues and pull requests against
[gtkx](https://github.com/gtkx-org/gtkx). It exists so a conversation
upstream starts from a reproducible case and a concrete ask, not from a
wish. Everything below is something we hit while building a React Native
compatibility layer on top of gtkx — the most demanding consumer the
reconciler has, since we drive layout ourselves and mount RN trees inside
arbitrary GTK containers.

Each entry: what happens, how to reproduce, what we do today, and what we
would like. Bugs first, then API asks, then the workaround receipts.

## Bugs

### 1. `useSignal` freezes the handler for components deep in the tree

**rc.2 regression.** `useSignal` routes the handler through React's
`useEffectEvent`; under the gtkx reconciler that event ref stops
refreshing for components deep in the tree. Instrumented case: a
ScrollView at its 8th render still ran the closure from its first render
(`closure_render=1, effectEvent_render=1, ref_render=8`). Simple, shallow
components refresh correctly, which is why this survives casual testing.

Impact for us: a frozen scroll handler windows a virtualized list against
a stale `count = 0`, so the first scroll unmounts every row — any list fed
by an async fetch comes up blank. This contradicts the documented contract
("each emission runs the handler from the latest render"), so we read it
as a bug rather than a semantics change.

- Repro: `packages/react-native-gtkx/tests/gtk/components/list-late-data.gtk.test.tsx`
  (fails without our wrapper).
- Our workaround: `src/gtkx/bridge/use-signal.ts`, tagged
  `RC2-WORKAROUND(use-signal-stale-handler)` — latest handler in a ref
  refreshed by an insertion effect, stable wrapper handed to gtkx.
- Ask: fix the refresh under the reconciler, or drop `useEffectEvent`
  from `useSignal` until it behaves. Note the hazard is wider than
  `useSignal`: any future hook built on `useEffectEvent` inherits it.
- Not root-caused by us to the exact React-internals trigger — happy to
  bisect further with a hint about where to look.

### 2. `gtkx codegen` reports "up to date" when the store is missing

`npm install` prunes `node_modules/.gtkx` (npm considers `@gtkx/gi` and
`@gtkx/jsx` extraneous). After that, `gtkx codegen` from the project root
prints _"bindings up to date"_ while the store is genuinely absent, and
the next `gtkx dev` regenerates from scratch mid-startup. `rm -rf
node_modules/.gtkx` before codegen is the reliable fix, so the freshness
check appears to trust a stamp that outlives the store.

A second facet: run with the cwd _inside_ `node_modules` and codegen
reports success without ever creating the store. We work around it by
running the CLI from the project that owns that `node_modules`
(`src/runner/index.ts`).

- Ask: validate the store's existence, not just the stamp; and either
  make an in-node_modules cwd work or fail loudly.

### 3. Writing a boxed struct into another boxed struct's field crashes

`Gsk.ColorStop` is `{ float offset; GdkRGBA color; }` — `color` is an
_inline_ embedded boxed struct, not a pointer. Setting it (constructor
props or the property setter — both take the same code path in the
native addon) throws `Error during field write: Expected an Object for
Boxed field write type, got Object`, every time, regardless of how the
`Gdk.RGBA` value was produced. We tried three constructions before
concluding this is not reachable from JS: constructor props, the
generated setter, and skipping `ColorStop` for a plain `{offset, color}`
object handed straight to `Gtk.Snapshot.appendLinearGradient`'s stops
array — that one fails differently ("No native handle associated with
Object"), confirming the array marshaling genuinely needs a real
native-backed instance per element, so there is no way around
constructing a working `ColorStop`.

Impact for us: SVG `<LinearGradient>`/`<RadialGradient>` (a
react-native-svg-compatible component API we are shipping) cannot
actually paint a gradient today — every stop fails to construct, so the
shape silently paints nothing for that fill/stroke instead of crashing,
which is at least safe but not the feature.

- Repro: any `Gsk.ColorStop` with a `color` field set, e.g.
  `const s = new Gsk.ColorStop(); s.color = new Gdk.RGBA({red:1,green:0,blue:0,alpha:1})`.
  Also reachable through `packages/react-native-gtkx`'s own test suite —
  see `tests/gtk/components/svg.gtk.test.tsx`'s gradient tests, which
  assert on the degraded (non-crashing) behavior.
- Our workaround: `gtkx/bridge/svg-node.ts`'s `makeColorStop`, tagged
  `RC2-WORKAROUND(gsk-colorstop-boxed-write)` — catches the throw,
  treats a stop that failed to construct like a missing gradient
  reference.
- Ask: fix boxed-struct fields whose type is itself another boxed struct
  embedded inline (not the common "pointer to boxed" case, which works
  fine elsewhere in our tree — e.g. `Graphene.Rect`'s `origin`/`size`
  fields hit a _different_, separately-worked-around bug when set via
  constructor props, but succeed through `Rect.alloc().init(x,y,w,h)`;
  `ColorStop.color` has no such escape hatch since `init()`-style methods
  are generated per-struct and `GskColorStop` does not have one).
  `GdkRGBA` embedded in another struct is probably not a one-off case in
  GTK4's own API surface, so this likely affects other consumers too.

## API asks

### 4. A layout-manager contract for embedders

We subclass `GtkLayoutManager` (`RnGtkxLayout`) to place children at
Yoga-computed rects, and `GtkWidget.contains()` (via `registerClass`) to
implement RN's `pointerEvents="box-none"`. Both work — `registerClass`
wiring vfuncs is genuinely good — but they are load-bearing for us and
undocumented as an embedding surface.

- Ask: acknowledge (and ideally test upstream) that `registerClass` may
  install layout managers and override `contains()`/`measure()`/
  `allocate()`; or expose a first-class "custom layout" entry point.
  We would contribute the docs/tests for it.

### 5. Config registration for embedders

Our runner hosts execute a plain Node bundle, so they synthesize the
`virtual:gtkx-config` module themselves. rc.2 added two required exports
(`elements`, `userEventSignals`) and every app on our platform broke
until we mirrored `renderConfigModule` through
`createConfigLoader` from `@gtkx/config/internal`.

- Ask: a supported way to register a resolved config at runtime — e.g.
  `registerConfig(resolved)` exported from `@gtkx/config`, or make
  `renderConfigModule` public. Depending on `/internal` is a standing
  liability for both sides.

### 6. Keep the user-event signal table extensible and documented

rc.2 inverted commit-time signal suppression (an allowlist became a
built-in per-type table plus `userEventSignals`). The change was correct
for us — `AdwNavigationView::popped` now reaches our stack navigator —
but we only learned the semantics by reading
`@gtkx/config/dist/user-event-signals.js`.

- Ask: document the table and the extension point; it is exactly what a
  library embedding gtkx must reason about.

## Workaround receipts (things we would like to delete)

Kept only until upstream changes; each has a row in
`docs/gtkx-rc2-notes.md` with its tag.

| Workaround                                    | Why it exists                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `resolve.dedupe` over `@gtkx/*` in our preset | two copies of the runtime abort GLib (`g_log_set_writer_func` twice)                                    |
| codegen cwd juggling                          | see bug 2                                                                                               |
| `use-signal` wrapper                          | see bug 1                                                                                               |
| `renderHook` window wrapper in tests          | `renderHook` mounts into a bare `Gtk.Box`, so window-dependent APIs (`Dimensions`) have nothing to read |
| `ColorStop` construction wrapped in try/catch | see bug 3 — a broken gradient stop degrades to "no paint" instead of crashing                           |

A guard against the double-init class of problems (an idempotent runtime
init, or a clear error naming the duplicate) would let us drop the dedupe
list, which today has to be repeated by every consumer of our vite preset.

## What we are happy to give back

- The reproduction tests above, upstreamed as gtkx's own.
- Documentation for the embedding surfaces in asks 4–6, written from the
  perspective of a consumer that got them wrong first.
- Real-world pressure data: our suite drives ~450 GTK component tests
  under headless Wayland on every commit, plus perf probes that measure
  reconciler-adjacent costs (allocation passes per second, per-frame
  mount bursts). We can report regressions early if that is useful.
