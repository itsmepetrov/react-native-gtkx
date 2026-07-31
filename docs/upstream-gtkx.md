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

### 1. `useEffectEvent` never refreshes inside `forwardRef`/`memo` (`case 11`/`case 15` fall through)

**Resolved upstream — recorded here for the receipt.** We originally read
this as a `useSignal` bug that worsened with tree depth. It is neither:
`react-reconciler@0.33.0` refreshes `useEffectEvent` in
`commitBeforeMutationEffects` only for `case 0` (FunctionComponent) —
`case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through
unrefreshed, so any `useEffectEvent` inside a `memo` or `forwardRef`
component is pinned to its mount closure permanently. It has nothing to do
with `useSignal`: plain `useEffectEvent` called only from inside an Effect
fails identically. It reproduced for us because our `ScrollView` is
`forwardRef<ScrollViewHandle, ScrollViewProps>` (`scroll-view.tsx:136`)
with the `useSignal` calls inside it — tree depth was coincidental, not
the trigger (confirmed by @eugeniodepalo, gtkx-org/gtkx#467).

Impact for us: a frozen scroll handler windows a virtualized list against
a stale `count = 0`, so the first scroll unmounts every row — any list fed
by an async fetch comes up blank. This contradicts the documented contract
("each emission runs the handler from the latest render"), so we read it
as a bug rather than a semantics change.

- Repro: `packages/react-native-gtkx/tests/gtk/components/list-late-data.gtk.test.tsx`
  (fails without our wrapper); `tests/gtk/bridge/use-signal-upstream.gtk.test.tsx`
  reproduces the underlying `useEffectEvent` defect directly (wrapping the
  subscriber in `memo` is what triggers it, not an async parent update).
- Our workaround: `src/gtkx/bridge/use-signal.ts`, tagged
  `RC2-WORKAROUND(use-signal-stale-handler)` — latest handler in a ref
  refreshed by an insertion effect, stable wrapper handed to gtkx.
- Status: React fixed the refresh on the 19.3 line (the refresh moved into
  `commitMutationEffectsOnFiber` under `case 0: case 11: case 14: case 15:`,
  ahead of child traversal). There is no stable gtkx `0.34.x` yet — the
  canaries pin an exact React prerelease peer — so our ref wrapper stays
  until a stable React 19.3 ships. Note the hazard is wider than
  `useSignal`: any future hook built on `useEffectEvent` inherits it until
  then.

### 2. `gtkx codegen` reports "up to date" when the store is missing

**Resolved upstream (gtkx-org/gtkx#470).** `npm install` prunes
`node_modules/.gtkx` (npm considers `@gtkx/gi` and `@gtkx/jsx` extraneous).
After that, `gtkx codegen` from the project root used to print _"bindings
up to date"_ while the store was genuinely absent — `isReactStoreStale`
checked the jsx self-link but not the manifest, and checked neither for
gi, so a store missing an entry point still read as fresh. A second facet:
running with the cwd _inside_ `node_modules` reported success without ever
creating a store, because `ensureGenerated`'s "no config resolves" fallback
(meant for the `dev`/`build` preflight) was also read by the `codegen`
command as "up to date". PR #470 checks both entry points for both stores,
and gives `codegen` a `requireProject` option so a command explicitly asked
to generate bindings fails instead of silently reporting success.

On our side: `@gtkx/cli` is meant for apps, not libraries (confirmed by
@eugeniodepalo) — a library generating bindings on a consumer's behalf
should use the programmatic `@gtkx/codegen` API instead, which takes the
GIR libraries and store paths directly. We switched `src/runner/index.ts`'s
`run-linux` codegen step to it, which removed our own cwd-reconstruction
workaround entirely rather than needing it fixed: there is no cwd for a
library call to get wrong, and `@gtkx/codegen`'s own fingerprint check
(unaffected by the bug above, which lived only in `@gtkx/cli`'s separate
freshness layer) regenerates a missing/pruned store rather than
misreporting it.

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
