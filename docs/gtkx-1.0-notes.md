# gtkx 1.0: what we work around, and why

The platform is pinned to `@gtkx/*@1.0.0`. This file is the baseline for that
pin: the workarounds still live in the code, the ones 1.0 let us delete
(none, this round), and the quirks that are simply how the stack behaves.

Every live workaround is tagged in code with `1.0-WORKAROUND(<name>)` —
`grep -rn "1.0-WORKAROUND"` gives the full list of sites, and every tag has a
row below. **Rule:** new workaround → tag in the code AND a row here; when a
release removes the need, delete both in the same commit. (The `RC1-`
through `RC4-` tags are all retired — nothing in the tree carries them any
more.)

The upstream side of these — reproductions, asks, what we would delete in
return — lives in [docs/upstream-gtkx.md](upstream-gtkx.md).

**1.0 is not another naming sweep — it is the real release rc.4 was a
candidate for**, and it earned a bigger diff than rc.4 did: a mandatory
codegen store rebuild, a changed application-bootstrap signature
(`runApplication` now takes an explicit argv and the shared
`createDialogComponent` factory that backs every generated Adw dialog
component types its props against a single hardcoded `@gtkx/gi` store).
Both broke us and are absorbed as two new tags below
(`gtk-application-argv`, `dialog-component-ref-widen`) — the full diagnosis
for each is in the `gtkx-1-0-migration` epic's `001-notes.md` and, for the
second, the patch file's own header comment
(`patches/@gtkx+react+1.0.0.patch`). Neither lives in `src/gtkx/bridge/`:
the first is bootstrap sequencing (an already-documented leak past the
bridge), the second is a build-time patch to gtkx's own package, which the
bridge — a runtime-import boundary — has no natural slot for.

Separately, **1.0 removed none of the four rc.4-era workarounds.** Every
removal condition below was re-checked against the real runtime on 1.0 —
the receipts are in the rows and in "How each was checked" — and all four
still hold. Runtime-behavior changes 1.0 makes elsewhere (unclaimed
children throwing, automatic portal mounting, `AdwAlertDialog`'s extra-child
area, `transientFor` defaults) and the `@gtkx/testing` rework are out of
this file's scope — they are the `gtkx-1-0-migration` epic's tasks 003 and
004 respectively, not re-litigated here.

## Live workarounds

| Name                         | What 1.0 does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Our workaround                                                                                                                                                                                                                                                                                                                                                                                                                 | Removal condition                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `use-signal-stale-handler`   | `useSignal` still routes the handler through React's `useEffectEvent`; `react-reconciler@0.33.0` only refreshes it in `commitBeforeMutationEffects` for `case 0` (FunctionComponent) — `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed, so any `useEffectEvent` in a `memo`/`forwardRef` component is pinned to its mount closure forever (our `ScrollView` is a `forwardRef` with the `useSignal` calls inside it) — a fetch-fed FlatList empties itself on the first scroll. **1.0 did not bump React and did not change the path** — see below                                                    | `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx's                                                                                                                                                                                                                                                                            | A stable React 19.3 (React fixed the refresh on the 19.3 line)                                                                                                                                                           |
| `runtime-dedupe`             | Two bundled copies of the gtkx runtime still double-init GLib and abort; nothing guards against it across two DISTINCT `.node` files. Reproduced on 1.0: `g_log_set_writer_func() called multiple times`, SIGABRT                                                                                                                                                                                                                                                                                                                                                                                                                        | `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits                                                                                                                                                                                                                                                                                | Idempotent runtime init upstream across distinct native-addon files, or an error that names the duplicate                                                                                                                |
| `prop-portal`                | `createPortal(children, container, key?)` is byte-for-byte the rc.3/rc.4 signature and can still only target a container's DEFAULT slot ("children"). `@gtkx/react`'s public entry and its `/internal` subpath both still withhold the `"gtkx:prop"` element — `/internal` now re-exports `createElementComponent` (the function that BUILDS an intrinsic element by GType name) but not the `Prop` literal itself, which stays a sibling export inside `element.js` that no public or `/internal` path reaches                                                                                                                          | `gtkx/bridge/slot-portal.ts` restates the `"gtkx:prop"` element name and wraps it in `createSlotPortal(children, target, slot)` — the one line that would move if gtkx renames it. `WindowActions`/`ApplicationActions`/`WindowControllers` are built on it                                                                                                                                                                    | gtkx exports a slot-aware portal (or the prop element) from a public entry point                                                                                                                                         |
| `renderhook-no-window`       | `renderHook` still mounts into a bare `Gtk.Box` — 1.0's `render-hook.js` still passes `container: new Gtk.Box()` unconditionally, and `RenderHookOptions` still carries only `wrapper` and `initialProps` — so window-dependent APIs have no toplevel to read                                                                                                                                                                                                                                                                                                                                                                            | Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`)                                                                                                                                                                                                                                                        | `renderHook` mounts into the same harness window `render` uses                                                                                                                                                           |
| `gtk-application-argv`       | `@gtkx/react`'s `<GtkApplication>` bootstrap now builds the GApplication's own command line as `[applicationId.split(".").at(-1), ...process.argv.slice(2)]` and hands it to `runApplication(application, commandLine)`. Our runner hosts are invoked as `node dist/runner/host.js <bundle-path>` / `node dist/runner/host-dev.js <bundle-url>`, so `process.argv[2]` is our OWN internal plumbing, not a user-facing argument — left in place it reaches GLib's local command-line handling as a stray positional it tries to open as a file (`GLib-GIO-CRITICAL: This application can not open files`), and the window never activates | `process.argv.length = 2` right after each host reads its own positional, before the bundle runs (`src/runner/host.ts`, `host-dev.ts`) — both mount `<GtkApplication>` from a `useLayoutEffect`, which always fires after this line. Not needed on the vite path (`gtkx build`/`gtkx dev` bundles run with no extra positional) or the SEA build (which never reads `process.argv`)                                            | `@gtkx/react` exposes a way to pass `runApplication`'s argv explicitly (an `argv` prop on `<GtkApplication>`, or an options object) instead of always reading `process.argv` itself                                      |
| `dialog-component-ref-widen` | The shared `createDialogComponent` factory backing all five generated Adw dialog JSX wrappers (`AboutDialog`/`AlertDialog`/`Dialog`/`PreferencesDialog`/`ShortcutsDialog`) types its returned component's props as `PresentedProps<Adw.Dialog>`, where `Adw.Dialog` resolves against WHATEVER `@gtkx/gi` store `@gtkx/react` itself sees — the workspace root's, in an npm workspace — not each app's own freshly-generated per-app store. Every app whose store differs from the root's fails `gtkx build`/`gtkx codegen` with 5 ref-covariance typecheck errors, one per dialog type                                                   | `patch-package` patch (`patches/@gtkx+react+1.0.0.patch`, applied via `scripts/apply-patches.ts` — Linux-only, since the installed `.d.ts` shape is platform-specific and macOS never runs codegen) makes the factory generic, `<P = DialogComponentProps>` — each generated store instantiates `P` with its own props type, so typing survives intact; `dialog.js`'s runtime is fully duck-typed, so this is a types-only fix | `@gtkx/react`'s `createDialogComponent` stops hardcoding a single `@gtkx/gi` store's `Dialog` type (generic over the component's own props, or typed loosely enough to survive multiple per-app stores in one workspace) |

### `use-signal-stale-handler` is a decision upstream made, not an oversight

We shipped the fix as a PR (gtkx-org/gtkx#469) and it was **closed unmerged
on purpose**. @eugeniodepalo: _"closing this in favour of waiting for
upstream… Since React fixes this properly on 19.3 for all fiber tags, I'd
rather take the version bump than carry a workaround I'd revert."_ So this
row does not move on any gtkx release — only a stable React 19.3 retires it,
and the hazard is wider than `useSignal`: any hook built on `useEffectEvent`
inherits it until then.

1.0 was checked against that condition anyway, because the condition names a
React version and a release could satisfy it by bumping one: it does not.
`@gtkx/react@1.0.0` peers `react: ^19.2` and depends on
`react-reconciler: ^0.33.0` — unchanged from rc.4 — and React's own `latest`
is still 19.2.8, with 19.3.0 published only as canaries.

### How each was checked against 1.0

The rule is that a changelog entry (or, for a stable release, a release page)
is a claim and the removal condition is the test, so each row was re-run on
the real runtime rather than read about.

- **`use-signal-stale-handler`** —
  `tests/gtk/bridge/use-signal-upstream.gtk.test.tsx` still calls gtkx's own
  hook directly on a `memo` component; targeted run on 1.0
  (`vitest run --project gtk tests/gtk/bridge/use-signal-upstream.gtk.test.tsx`)
  reports the same "1 expected fail" it always has. `@gtkx/react`'s
  `peerDependencies.react` and its `react-reconciler` dependency were read
  directly out of the installed 1.0.0 tree (`^19.2` / `0.33.0`, both
  unchanged), and npm's own `react@latest` is still 19.2.8.
- **`runtime-dedupe`** — reproduced the exact shape the condition names —
  two DISTINCT `.node` files in one process — by copying the installed
  `@gtkx/native` + `@gtkx/native-linux-arm64-gnu` package trees to two
  separate absolute paths (Node caches a native addon by the resolved path
  of the `.node` FILE, so two copies at different paths are two distinct
  files even with identical bytes) and importing both `main.js` entry
  points in one script. First import succeeds; the second aborts
  identically to the rc.4-era finding — `gtkx: GLib-ERROR: g_log_set_writer_func() called multiple times`, exit 134, core dumped.
  Neither half of the removal condition is met on 1.0 either — the init is
  still not idempotent ACROSS distinct binaries (it is, and always was,
  idempotent WITHIN one loaded binary — `packages/native/src/host/log_writer.rs`'s
  `install()` has used a `OnceLock` since at least rc.4,
  confirmed byte-identical on GitHub at both tags — that is a different,
  narrower guarantee than the removal condition asks for), and the error
  still does not name the duplicate package.
- **`prop-portal`** — enumerated the real module objects on the 1.0 runtime
  rather than reading the `.d.ts`, same method as before: `@gtkx/react`'s
  `dist/index.js` exports exactly `useApplication`, `useBindSetting`,
  `useParentWindow`, `useProperty`, `useSetting`, `useSignal`,
  `rootElement`, `createPortal`, `createRoot`, `quit`; `dist/internal.js`
  exports `createApplicationWindowComponent`, `createApplicationComponent`,
  `createElementComponent`, `createPortaledComponent`,
  `createWindowComponent`, `useMergedRef`, `settleAccessible`,
  `isRootElement`, `createReconcilerRoot`, `setReconcilerErrorHandler`. No
  value in either is `"gtkx:prop"` — `components/element.js` itself exports
  both `Prop` and `createElementComponent`, but `internal.js` re-exports
  only the latter. `createPortal`'s own `.d.ts` signature is still
  `(children, container, key?)`, byte-identical to rc.3/rc.4. A deep import
  of `@gtkx/react/dist/components/element.js` still throws `Package subpath './dist/components/element.js' is not defined by "exports"`. Functional
  confirmation: `tests/gtk/components/app-registry.gtk.test.tsx` (exercises
  `WindowActions`/`WindowControllers` built on `createSlotPortal`) passes
  clean, 6/6, on 1.0.
- **`renderhook-no-window`** — reproduced the rc.4-era check verbatim: in one
  test file, `Gtk.Window.getToplevels().getNItems()` before and after a bare
  `renderHook(() => null)` reads 0 → 0, then `render(null)` in the same file
  reads 0 → 1. `RenderHookOptions` in `dist/render-hook.d.ts` still carries
  only `wrapper` and `initialProps`, and `render-hook.js` still constructs
  `new Gtk.Box()` unconditionally as its container.

## What 1.0 changed under us

Unlike rc.4 (a pure naming sweep), 1.0 changed real behavior in the two
places task 001 ("first light") absorbed as new workarounds — see the live
table above for `gtk-application-argv` and `dialog-component-ref-widen`.
Everything else task 001 touched (the mandatory codegen store rebuild, the
11 test-helper `as unknown as` casts a stricter generated `__properties__`
type needed) either has no removal condition to track here or was a plain
compile fix, not a gtkx behavior change.

One config-registration data point worth recording here even though it
produced no workaround: **1.0 did not break `virtual:gtkx-config` a fourth
release running** (upstream-gtkx.md ask #4 has broken us on rc.2, rc.3 and
rc.4 in three different ways). `createConfigLoader`'s `{ load, resolve }`
shape and the `elements`/`userEventSignals`/metadata re-export contract our
runner hosts synthesize against are unchanged from rc.4 — confirmed by
`rm -rf node_modules/.gtkx && npm run codegen` plus the headless launch
proofs in task 001, not by a gate we own (there still isn't one; see the ask
itself in [docs/upstream-gtkx.md](upstream-gtkx.md)).

1.0 also makes `registerClass` subclassing considerably richer — every
`vfunc`-prefixed method gtkx's own generated `.d.ts` documents is now
`protected` and chainable with `super.vfuncX()` (confirmed by reading the
generated `@gtkx/gi/gtk` typings and JS directly: `Gtk.Widget.prototype.vfuncSnapshot`
calls into the native default implementation, so a subclass
override can chain up to it). This is a candidate answer to
upstream-gtkx.md ask #3 (the layout-manager contract) — recorded there,
not built here, per the migration epic's scope (adopting it belongs to a
follow-up, not this audit).

Runtime-behavior changes 1.0 makes that are NOT reflected here on purpose —
unclaimed children throwing, automatic portal mounting, `AdwAlertDialog`'s
extra-child area, `transientFor` defaults — are the `gtkx-1-0-migration`
epic's task 003 (the runtime-behavior sweep); `@gtkx/testing`'s own 1.0
rework (accessibility reads, `getMapped` filtering, click targeting) is task 004. Both run in parallel with this task and are out of its scope.

## Fixed in rc.3 (history, one line each)

- **`gsk-colorstop-boxed-write`** — constructing a `Gsk.ColorStop` threw in
  the native addon, so SVG gradients had zero constructible stops and painted
  nothing. **Fixed upstream by us** (gtkx-org/gtkx#473, closing #472): a
  record field write converts through `toNative` now.
- **`graphene-rect-nested-boxed-props`** — the same native bug reached through
  `new Graphene.Rect({ origin, size })`; same upstream fix, so `svg-node.ts`
  uses the plain constructor again.
- **The codegen freshness lie** — rc.2's `@gtkx/cli` could report "bindings up
  to date" over a store `npm install` had pruned. Fixed upstream in
  gtkx-org/gtkx#470 (also ours); separately `src/runner` calls the
  programmatic `@gtkx/codegen` API rather than the CLI.

## Fixed in rc.2 (history, one line each)

- **`vitest-compositor`** — rc.1 defaulted the headless display to weston;
  rc.2's default IS sway, so `vitest.config.ts` calls the plugin with no
  arguments.
- **`no-virtual-seat`** — rc.1 had no input seat under sway, so windows never
  activated and `userEvent` was impossible; rc.2 starts a virtual seat.
- **`fixed-layout-child`** — rc.1's declarative `<GtkFixedLayoutChild>`
  created a detached object; moot since containers moved to our own
  `RnGtkxLayout` manager and GtkFixed left the codebase.
- **`controllers-as-children`** — rc.1 silently ignored controllers passed as
  JSX; rc.2 has a `controllers` slot on `GtkWidget`. Pressable and TextInput
  still attach theirs imperatively on purpose — a choice now, not a
  workaround.

## Status of this migration

The full suite (186+ files) has not run yet — that is deliberately deferred
to the `gtkx-1-0-migration` epic's task 005, which runs it exactly once for
the whole migration. What is confirmed on 1.0 as of this task: `npm run typecheck`
and `npm run build:dist` green (task 001), `scripts/gallery-smoke.ts`
ALIVE, and the six targeted probes above (four re-audited
workarounds + functional confirmation of the two new ones via task 001's own
headless proofs) all behave as expected. Nothing here should be read as "the
suite passes" — that claim belongs to task 005 alone.

Two environmental notes carried forward from the rc.3/rc.4 era, neither
gtkx-version-specific and both unexamined by this task:

- **A first codegen after a version bump is slow enough to look like a hang.**
  The store fingerprint includes the app's own config, so each example
  regenerates once on top of the root's run — ~45 s for the gallery on the
  VM. `scripts/gtkx-dev-headless.ts` sleeps 25 s before its first shot and
  will report `FAST-REFRESH-FAIL` on a cold store; run `npx gtkx codegen` in
  the example first.
- **`gtkx dev` still binds vite's HMR websocket on the fixed port 24678**, and
  the CLI exposes no way to move it. A second `gtkx dev` anywhere on the
  machine logs `WebSocket server error: Port 24678 is already in use` and the
  edit never reaches the app, while the supervisor still prints "Fast Refresh
  complete" — so the log marker alone is not proof the refresh applied.

## Behaviour rc.3 changed under us (still true)

Carried forward from the rc.3/rc.4 notes; none of this is re-verified against
1.0 by this task (task 004 owns the `@gtkx/testing`-adjacent parts of it —
`toHaveTextContent`/`toHaveDisplayValue`/checked-state):

- **Blockable signals are no longer suppressed for a whole React commit** —
  rc.3 wraps each framework write individually, so an emission the framework
  did not cause (one raised from a `useLayoutEffect`, or aimed at another
  `createRoot` tree) reaches its handler. Our navigators lean on this.
- **`render`'s harness window is undecorated**, so role queries see only what
  the test rendered.
- **A widget with `accessibleLabelledBy` reports the relation as its
  accessible name**, ahead of its own text — the precedence ARIA defines.
- **`toHaveTextContent` no longer falls back to the accessible name**;
  **`toHaveDisplayValue` throws** on a widget without one; **checked state is
  tri-state**.
- **Records are constructible only when their bytes can be copied.** Neither
  `Gsk.ColorStop` nor `Graphene.Rect` is caught by it.
- **Single-child widgets have no `content`/`child` props** (pass the widget as
  a child instead).

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
  Normal desktop and container runs are unaffected. The portal-push crash
  needs a live settings change to trigger and stays on the list unconfirmed.

## Procedure when the next release ships

1. Update the `@gtkx/*` pins (root, spike, examples, template), then
   `npm install && rm -rf node_modules/.gtkx && npm run codegen`;
2. Run everything on Linux: `npm run typecheck && npm test`, `build:dist`,
   `check:package`, plus the headless example proofs;
3. Walk the live-workaround table: for each row check the removal condition,
   delete the tag and the row together when it is met, and move the entry into
   the history section above — **with a probe that proves the fix on the real
   runtime**, not just the release notes claiming it. And make the probe
   reproduce the ORIGINAL failure first: two of the three `runtime-dedupe`
   probes written for rc.4 reported a fix that was not there, because they
   were not actually building the duplicate — the same discipline applies to
   every future audit, this one included;
4. Re-tag whatever survives (`1.0-WORKAROUND` → the new release), rename this
   file to match the new pin, and update `docs/upstream-gtkx.md` if an ask was
   answered.
