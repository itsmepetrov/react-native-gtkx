# What react-native-gtkx needs from gtkx

This is the standing agenda for issues and pull requests against
[gtkx](https://github.com/gtkx-org/gtkx). It exists so a conversation
upstream starts from a reproducible case and a concrete ask, not from a
wish. Everything below is something we hit while building a React Native
compatibility layer on top of gtkx — the most demanding consumer the
reconciler has, since we drive layout ourselves and mount RN trees inside
arbitrary GTK containers.

Each entry: what happens, how to reproduce, what we do today, and what we
would like. Open items first, then the receipts for what has closed.

## Open bugs

### 1. `useEffectEvent` never refreshes inside `forwardRef`/`memo` (`case 11`/`case 15` fall through)

**Not a gtkx bug, and upstream has ruled on it — we carry the workaround
until React ships.** `react-reconciler@0.33.0` refreshes `useEffectEvent`
in `commitBeforeMutationEffects` only for `case 0` (FunctionComponent) —
`case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through
unrefreshed, so any `useEffectEvent` inside a `memo` or `forwardRef`
component is pinned to its mount closure permanently. It has nothing to do
with `useSignal`: plain `useEffectEvent` called only from inside an Effect
fails identically. It reproduced for us because our `ScrollView` is
`forwardRef<ScrollViewHandle, ScrollViewProps>` (`scroll-view.tsx:136`)
with the `useSignal` calls inside it — tree depth was coincidental, not
the trigger (diagnosed by @eugeniodepalo, gtkx-org/gtkx#467).

Impact for us: a frozen scroll handler windows a virtualized list against
a stale `count = 0`, so the first scroll unmounts every row — any list fed
by an async fetch comes up blank.

- Repro: `packages/react-native-gtkx/tests/gtk/components/list-late-data.gtk.test.tsx`
  (fails without our wrapper); `tests/gtk/bridge/use-signal-upstream.gtk.test.tsx`
  reproduces the underlying `useEffectEvent` defect directly (wrapping the
  subscriber in `memo` is what triggers it, not an async parent update).
- Our workaround: `src/gtkx/bridge/use-signal.ts`, tagged
  `RC3-WORKAROUND(use-signal-stale-handler)` — latest handler in a ref
  refreshed by an insertion effect, stable wrapper handed to gtkx.
- Status: **we offered the fix (gtkx-org/gtkx#469) and it was closed
  unmerged, deliberately** — @eugeniodepalo would "rather take the version
  bump than carry a workaround I'd revert", since React fixed the refresh
  on the 19.3 line for all fiber tags (it moved into
  `commitMutationEffectsOnFiber` under `case 0: case 11: case 14: case 15:`,
  ahead of child traversal). There is no stable gtkx `0.34.x` — the canaries
  pin an exact React prerelease peer — so our ref wrapper stays until a
  stable React 19.3 ships. Note the hazard is wider than `useSignal`: any
  future hook built on `useEffectEvent` inherits it until then.
- Nothing for gtkx to do here. Kept in this file so the next release does
  not re-open the question.

## API asks

### 2. A layout-manager contract for embedders

We subclass `GtkLayoutManager` (`RnGtkxLayout`) to place children at
Yoga-computed rects, and `GtkWidget.contains()` (via `registerClass`) to
implement RN's `pointerEvents="box-none"`. Both work — `registerClass`
wiring vfuncs is genuinely good — but they are load-bearing for us and
undocumented as an embedding surface.

- Ask: acknowledge (and ideally test upstream) that `registerClass` may
  install layout managers and override `contains()`/`measure()`/
  `allocate()`; or expose a first-class "custom layout" entry point.
  We would contribute the docs/tests for it.

### 3. Config registration for embedders — **now urgent, it broke us twice**

Our runner hosts execute a plain Node bundle, so they synthesize the
`virtual:gtkx-config` module themselves, through `createConfigLoader` from
`@gtkx/config/internal`. That import has now broken on two consecutive
releases:

- rc.2 added two required module exports (`elements`, `userEventSignals`);
- rc.3 changed `createConfigLoader`'s return type from
  `(cwd) => Promise<ResolvedConfig>` to `{ load, resolve }`, so every call
  site had to become `createConfigLoader().resolve(cwd)`.

Neither is wrong as a change — but both are silent for us, because
`/internal` carries no compatibility promise and no changelog entry, and
the failure mode is "no app on our platform starts".

- Ask: a supported way to register a resolved config at runtime — e.g.
  `registerConfig(resolved)` exported from `@gtkx/config`, or make
  `renderConfigModule` public. Depending on `/internal` is a standing
  liability for both sides, and rc.3's "make the CLI the sole owner of
  config" (gtkx-org/gtkx#474) moved in the opposite direction: it is
  exactly the case an embedder that is not the CLI has no seat at.

### 4. Keep the user-event signal table extensible and documented

rc.2 inverted commit-time signal suppression (an allowlist became a
built-in per-type table plus `userEventSignals`), and rc.3 narrowed the
suppression window again so a signal the framework did not raise is no
longer swallowed for the whole commit. Both changes were right for us —
`AdwNavigationView::popped` reaches our stack navigator, and an emission
from a `useLayoutEffect` now arrives — but we learned the semantics of each
by reading `@gtkx/config/dist/user-event-signals.js` and a release note.

- Ask: document the table and the extension point; it is exactly what a
  library embedding gtkx must reason about.

## Workaround receipts (things we would like to delete)

Kept only until upstream changes; each has a row in
`docs/gtkx-rc3-notes.md` with its tag.

| Workaround                                    | Why it exists                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `resolve.dedupe` over `@gtkx/*` in our preset | two copies of the runtime abort GLib (`g_log_set_writer_func` twice)                                    |
| `use-signal` wrapper                          | see bug 1 — waiting on React, not on gtkx                                                               |
| `renderHook` window wrapper in tests          | `renderHook` mounts into a bare `Gtk.Box`, so window-dependent APIs (`Dimensions`) have nothing to read |

A guard against the double-init class of problems (an idempotent runtime
init, or a clear error naming the duplicate) would let us drop the dedupe
list, which today has to be repeated by every consumer of our vite preset.

`renderHook` is a two-line fix on gtkx's side — `render` already creates and
presents a harness window whenever no container is given, and `renderHook`
passes `container: new Gtk.Box()` unconditionally
(`@gtkx/testing/dist/render-hook.js`). Letting `RenderHookOptions` carry the
same `container`/window choice `render` takes would retire our
`renderHookWithWindow` entirely.

## Closed

- **`useSignal` stale handler** (gtkx-org/gtkx#467) — diagnosed and closed;
  the fix is React's, see bug 1 above. Our PR #469 closed unmerged by
  design.
- **`gtkx codegen` reports "up to date" when the store is missing**
  (gtkx-org/gtkx#468) — **fixed by our PR #470**, shipped in rc.3: the
  freshness check verifies both stores' manifests and self-links rather
  than only the jsx self-link, and `codegen` gained a `requireProject`
  option so a command explicitly asked to generate bindings fails instead
  of silently reporting success. Separately, `@gtkx/cli` is meant for apps,
  not libraries (confirmed by @eugeniodepalo), so `src/runner` now calls
  the programmatic `@gtkx/codegen` API — which removed our cwd
  reconstruction entirely rather than needing it fixed.
- **Writing a boxed struct into another boxed struct's field crashes**
  (gtkx-org/gtkx#472) — **fixed by our PR #473**, shipped in rc.3. A record
  field write crossed into native code through the same
  `write(handle, descriptor, offset, value)` binding a GI call uses for its
  handle-passing arguments, and `value::handle_ptr` requires a native
  `External`; function-argument codegen converted through
  `getHandle`/`tryGetHandle` first, but `emitFieldWrite` — shared by the
  generated constructor and the generated property setter — passed the raw
  JS value straight through. The fix exports `toNative` from
  `@gtkx/runtime` (the write-side counterpart of the `fromNative` the
  getter already used) and routes field writes through it.
  `new Gsk.ColorStop({ offset, color })` and
  `new Graphene.Rect({ origin, size })` both construct now, verified on our
  own VM against rc.3, which let us delete two workarounds and turn SVG
  gradients from a documented degradation into a working feature.

## What we are happy to give back

- The reproduction tests above, upstreamed as gtkx's own.
- Documentation for the embedding surfaces in asks 2–4, written from the
  perspective of a consumer that got them wrong first.
- Real-world pressure data: our suite drives ~800 GTK and unit tests under
  headless Wayland on every commit, plus perf probes that measure
  reconciler-adjacent costs (allocation passes per second, per-frame
  mount bursts). We can report regressions early if that is useful.
- Fixes: two of the three bugs we filed against rc.2 we also closed
  ourselves (#470, #473). We are happy to keep doing that.
