# gtkx rc.2: what we work around, and why

The platform is pinned to `@gtkx/*@1.0.0-rc.2`. This file is the baseline for
that pin: the workarounds still live in the code, the rc.1-era ones rc.2 let us
delete, and the quirks that are simply how the stack behaves.

Every live workaround is tagged in code with `RC2-WORKAROUND(<name>)` —
`grep -rn "RC2-WORKAROUND"` gives the full list of sites, and every tag has a
row below. **Rule:** new workaround → tag in the code AND a row here; when a
release removes the need, delete both in the same commit. (The rc.1 tag
`RC1-WORKAROUND` is retired — nothing in the tree carries it any more.)

The upstream side of these — reproductions, asks, what we would delete in
return — lives in [docs/upstream-gtkx.md](upstream-gtkx.md).

## Live workarounds

| Name                               | What rc.2 does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Our workaround                                                                                                                                                                                                                                                                                                                             | Removal condition                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `use-signal-stale-handler`         | `useSignal` routes the handler through React's `useEffectEvent`; `react-reconciler@0.33.0` only refreshes it in `commitBeforeMutationEffects` for `case 0` (FunctionComponent) — `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed, so any `useEffectEvent` in a `memo`/`forwardRef` component is pinned to its mount closure forever (our `ScrollView` is a `forwardRef` with the `useSignal` calls inside it — confirmed upstream, gtkx-org/gtkx#467) — a fetch-fed FlatList empties itself on the first scroll | `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx's                                                                                                                                                                                        | A stable React 19.3 (React fixed the refresh on the 19.3 line; no stable gtkx 0.34.x yet)               |
| `runtime-dedupe`                   | Two bundled copies of the gtkx runtime still double-init GLib and abort (`g_log_set_writer_func` called twice); nothing guards against it                                                                                                                                                                                                                                                                                                                                                                                                           | `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits                                                                                                                                                                                            | Idempotent runtime init upstream, or an error that names the duplicate                                  |
| `renderhook-no-window`             | `renderHook` still mounts into a bare `Gtk.Box`, so window-dependent APIs have no toplevel to read                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`)                                                                                                                                                                    | `renderHook` mounts into the same harness window `render` uses                                          |
| `graphene-rect-nested-boxed-props` | `new Graphene.Rect({ origin: new Graphene.Point(...), size: new Graphene.Size(...) })` hits the same native "Expected an Object for Boxed field write type, got Object" as the `gsk-colorstop-boxed-write` row below — a boxed struct's constructor writing another boxed value into one of its own fields                                                                                                                                                                                                                                          | `gtkx/bridge/svg-node.ts` builds the clip rect through `Graphene.Rect.alloc().init(x, y, w, h)` instead — a working escape hatch `Gsk.ColorStop` does not have                                                                                                                                                                             | Upstream fixes boxed-struct fields that are themselves another boxed type                               |
| `gsk-colorstop-boxed-write`        | Constructing a `Gsk.ColorStop` (an inline `{ float offset; GdkRGBA color; }` boxed struct) crashes in the native addon writing the `color` field — "Expected an Object for Boxed field write type, got Object". Verified through three independent paths (constructor props, the property setter, and skipping `ColorStop` for a plain `{offset, color}` object, which fails differently with "No native handle associated with Object" — the array marshaling genuinely needs a native-backed instance per element)                                | `gtkx/bridge/svg-node.ts`'s `makeColorStop` catches the throw and returns `null`; a gradient with zero constructible stops paints nothing for that fill/stroke instead of crashing (the same path as an unresolved `url(#missing)` reference) — SVG `<LinearGradient>`/`<RadialGradient>` ship with this degradation, not cut from the API | Upstream fixes boxed-struct fields that are themselves another boxed type (nested embed, not a pointer) |

## Fixed in rc.2 (rc.1 history, one line each)

- **`vitest-compositor`** — rc.1 defaulted the headless display to weston and
  took sway through an option; rc.2's default IS sway, so `vitest.config.ts`
  calls the plugin with no arguments.
- **`no-virtual-seat`** — rc.1 had no input seat under sway, so windows never
  activated and `userEvent` was impossible; rc.2 starts a virtual seat for sway
  (`needsVirtualSeat: true`), a rendered toplevel now reports `is-active: true`,
  and coordinate-level input is on the table.
- **`fixed-layout-child`** — rc.1's declarative `<GtkFixedLayoutChild>` created
  a detached object (Gtk-CRITICAL, positions never applied); moot for us since
  containers moved to our own `RnGtkxLayout` manager and GtkFixed left the
  codebase entirely.
- **`controllers-as-children`** — rc.1 silently ignored controllers passed as
  JSX; rc.2 has a `controllers` slot on `GtkWidget`. Pressable and TextInput
  still attach theirs imperatively on purpose (wired once per widget, handlers
  read from a ref) — a choice now, not a workaround.

## New in the rc.2 era

Two regressions/gaps first seen on rc.2, both with reproductions and both
written up for upstream in [docs/upstream-gtkx.md](upstream-gtkx.md):

- **The `useSignal` freeze.** Not a `useSignal` bug and not about tree depth:
  `react-reconciler@0.33.0` refreshes `useEffectEvent` in
  `commitBeforeMutationEffects` only for `case 0` (FunctionComponent) —
  `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through
  unrefreshed, so any `useEffectEvent` inside a `memo`/`forwardRef` component
  is pinned to its mount closure permanently (confirmed upstream,
  gtkx-org/gtkx#467). It reproduced for us because our `ScrollView` is a
  `forwardRef` with the `useSignal` calls inside it; simple, shallow
  components refresh correctly, which is why it survives casual testing. The
  visible symptom was a virtualized list that blanked on the first scroll.
  Repro: `tests/gtk/components/list-late-data.gtk.test.tsx`, plus the contract
  test in `tests/gtk/bridge.smoke.test.tsx`.
- **The codegen freshness lie — resolved.** `npm install` prunes
  `node_modules/.gtkx` (npm sees `@gtkx/gi`/`@gtkx/jsx` as extraneous), and on
  rc.2 `@gtkx/cli`'s codegen could report "bindings up to date" over a store
  that was not there; fixed upstream in gtkx-org/gtkx#470 (the freshness check
  now verifies both stores' manifests and self-links, not just one). Separately,
  we were never supposed to be exposed to this: `@gtkx/cli` is meant for apps,
  not libraries generating bindings on a consumer's behalf, so `src/runner`
  now calls the programmatic `@gtkx/codegen` API directly (see
  `docs/upstream-gtkx.md` bug 2) — no CLI subprocess, no cwd, no stamp to
  misread. `rm -rf node_modules/.gtkx` before `npm run codegen` at the repo
  root is still the right sequence for our own monorepo tooling, which still
  runs the CLI.

## Non-workarounds (quirks that stay)

- 64-bit FFI values arrive as BigInt → `toNumber()` at the boundary
  (`gtkx/bridge/measure.ts`);
- signal names are kebab-case ("value-changed"); signals do not pass the
  emitter (get the widget from a ref);
- role queries in tests use the `Gtk.AccessibleRole` enum, not strings;
- `npm install` prunes the codegen store (`node_modules/.gtkx` is not in the
  lockfile) → run `npm run codegen` after installing — npm behavior, not gtkx;
- measuring unmapped widgets yields 0 (offscreen Label probes are the
  exception) → re-measure on the `map` signal + re-commit measured leaves on
  every flush (`layout/node.ts`);
- mixed-session setups only: running an app on a bare compositor (headless
  sway) while `XDG_RUNTIME_DIR` points at a full GNOME session can segfault in
  a GTK signal handler when the GNOME settings portal pushes updates into the
  app (`g_cclosure_marshal_VOID__OBJECTv` via the FFI emit path); cutting
  `DBUS_SESSION_BUS_ADDRESS` avoids it, which is why the headless scripts do.
  Normal desktop and container runs are unaffected. Retested on rc.2 (gallery
  under headless sway with the real session bus attached): the app ran clean
  and SIGTERM teardown exited 143, so the exit-time segfault we saw on rc.1 no
  longer reproduces; the portal-push crash needs a live settings change to
  trigger and stays on the list unconfirmed.

## Procedure when the next release ships

1. Update the `@gtkx/*` pins (root, spike, examples, template), then
   `npm install && rm -rf node_modules/.gtkx && npm run codegen`;
2. Run everything on Linux: `npm run typecheck && npm test`, `build:dist`,
   `check:package`, plus the headless example proofs;
3. Walk the live-workaround table: for each row check the removal condition,
   delete the tag and the row together when it is met, and move the entry into
   the history section above;
4. Re-tag whatever survives (`RC2-WORKAROUND` → the new release) and update
   `docs/upstream-gtkx.md` if an ask was answered.
