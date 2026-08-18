# gtkx 1.2: what we work around, and why

The platform is pinned to `@gtkx/*@1.2.2`. This file is the baseline for that
pin: the workarounds still live in the code, the one 1.2 let us delete
(`use-signal-stale-handler` — gtkx's oldest), and the quirks that are simply
how the stack behaves.

Every live workaround is tagged in code with `1.2-WORKAROUND(<name>)` —
`grep -rn "1.2-WORKAROUND"` gives the full list of sites, and every tag has a
row below. **Rule:** new workaround → tag in the code AND a row here; when a
release removes the need, delete both in the same commit. (The `RC1-`
through `RC4-` tags and the `1.0-` one are all retired — nothing in the
tree carries them any more.)

The upstream side of these — reproductions, asks, what we would delete in
return — lives in [docs/upstream-gtkx.md](upstream-gtkx.md).

**1.2 is a much smaller diff than 1.0 was.** gtkx shipped 1.1.0 and
1.2.0–1.2.2 in one week; the migration had three sharp edges (1.2.0's
strictly-typed signals, 1.2.1's criticals-raise-uncaught-exceptions change,
and 1.2.1's `useSignal` stale-closure fix below) but none of them needed a
workaround of its own. The strict-signal-typing break (`connect`/`on`/`off`
losing their plain-`string` overloads, which only ever meant our own call
sites were typed looser than what they actually passed) and the `gtkx build`
output-filename rename (`dist/bundle.js` → `dist/bundle.mjs`, a real,
unannounced change we had to follow everywhere) were both plain fixes, not
gtkx behavior we compensate for — neither carries a `1.2-WORKAROUND` tag.
The full diagnosis for both is in the `gtkx-1-2-migration` epic's
`001-notes.md`. `dialog-component-ref-widen` (resolved by configuration
since the 1.0 migration, see "Resolved by configuration" below) carries
forward unchanged: upstream ask #10 is still open on 1.2.2.

**1.2 removed one of the four workarounds this file carried into it.**
`use-signal-stale-handler` — gtkx's oldest workaround, alive since rc.3 — is
retired below: the gtkx 1.2.1 changelog's own bugfix entry names the exact
fix, reading the installed source confirms it, and the `it.fails` guard that
has failed (as expected) on every release since rc.3 now fails to fail. The
other three (`runtime-dedupe`, `prop-portal`, `renderhook-no-window`) were
re-checked against the real 1.2.2 runtime — the receipts are in the rows and
in "How each was checked" — and all three still hold.

## Live workarounds

| Name                   | What 1.2.2 does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Our workaround                                                                                                                                                                                                                                                                                                                                                                      | Removal condition                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-dedupe`       | Two bundled copies of the gtkx runtime still double-init GLib and abort; nothing guards against it across two DISTINCT `.node` files. Reproduced on 1.2.2 by actually building the duplicate: `gtkx: GLib-ERROR: g_log_set_writer_func() called multiple times`. The FAILURE MODE changed since 1.0 (see upstream-gtkx.md ask #2) — it is now a catchable, named Node `uncaughtException` instead of a SIGABRT/core dump — but the underlying defect has not: the init is still not idempotent across distinct binaries, and the error still does not name the duplicate package                                                                                                                                                                                                                                         | `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits                                                                                                                                                                                                                                     | Idempotent runtime init upstream across distinct native-addon files, or an error that names the duplicate                                                                           |
| `prop-portal`          | `createPortal(children, container, key?)` is still byte-for-byte the rc.3/rc.4 signature and can still only target a container's DEFAULT slot ("children"). `@gtkx/react`'s public entry and its `/internal` subpath both still withhold the `"gtkx:prop"` element — `/internal` still re-exports `createElementComponent` (the function that BUILDS an intrinsic element by GType name) but not the `Prop` literal itself, which stays a sibling export inside `element.js` that no public or `/internal` path reaches                                                                                                                                                                                                                                                                                                  | `gtkx/bridge/slot-portal.ts` restates the `"gtkx:prop"` element name and wraps it in `createSlotPortal(children, target, slot)` — the one line that would move if gtkx renames it. `WindowActions`/`ApplicationActions`/`WindowControllers` are built on it                                                                                                                         | gtkx exports a slot-aware portal (or the prop element) from a public entry point                                                                                                    |
| `renderhook-no-window` | `renderHook` still mounts into a bare `Gtk.Box` — 1.2.2's `render-hook.js` still passes `container: new Gtk.Box()` unconditionally, and `RenderHookOptions` still carries only `wrapper` and `initialProps` — so window-dependent APIs have no toplevel to read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`)                                                                                                                                                                                                             | `renderHook` mounts into the same harness window `render` uses                                                                                                                      |
| `gtk-application-argv` | `@gtkx/react`'s `<GtkApplication>` bootstrap still builds the GApplication's own command line as `[applicationId.split(".").at(-1), ...process.argv.slice(2)]` and hands it to `runApplication(application, commandLine)` — confirmed unchanged by reading the installed 1.2.2 source (`components/application.tsx`) directly, no `argv` prop or options object anywhere on `ApplicationComponentProps`. Our runner hosts are invoked as `node dist/runner/host.js <bundle-path>` / `node dist/runner/host-dev.js <bundle-url>`, so `process.argv[2]` is our OWN internal plumbing, not a user-facing argument — left in place it reaches GLib's local command-line handling as a stray positional it tries to open as a file (`GLib-GIO-CRITICAL: This application can not open files`), and the window never activates | `process.argv.length = 2` right after each host reads its own positional, before the bundle runs (`src/runner/host.ts`, `host-dev.ts`) — both mount `<GtkApplication>` from a `useLayoutEffect`, which always fires after this line. Not needed on the vite path (`gtkx build`/`gtkx dev` bundles run with no extra positional) or the SEA build (which never reads `process.argv`) | `@gtkx/react` exposes a way to pass `runApplication`'s argv explicitly (an `argv` prop on `<GtkApplication>`, or an options object) instead of always reading `process.argv` itself |

### How each was checked against 1.2.2

The rule is that a changelog entry (or, for a stable release, a release page)
is a claim and the removal condition is the test, so each row was re-run on
the real runtime rather than read about.

- **`runtime-dedupe`** — reproduced the exact shape the condition names —
  two DISTINCT `.node` files in one process — by copying the installed
  `@gtkx/native` + `@gtkx/native-linux-arm64-gnu` package trees (1.2.2) to
  two separate absolute paths, each under its own `node_modules/@gtkx/`
  (Node caches a native addon by the resolved path of the `.node` FILE, so
  two copies at different paths are two distinct files even with identical
  bytes) and importing both `main.js` entry points in one script. First
  import succeeds; the second raises `gtkx: GLib-ERROR:
g_log_set_writer_func() called multiple times` as an uncaught Node
  exception, exit code 1, no core file — reproduced twice for consistency.
  This is the SAME defect as 1.0 (`log_writer.rs`'s `install()` still uses a
  `OnceLock` — a WITHIN-one-binary guarantee only — confirmed unchanged
  since rc.4 by diffing the file across GitHub tags) but a DIFFERENT
  failure mode: 1.0's identical probe produced a bare SIGABRT/core dump
  (`exit 134`). The change traces to `node_env.rs`'s `raise_fatal`, which
  gained an explicit `napi_open_handle_scope`/`napi_close_handle_scope`
  pair around the raw `napi_fatal_exception` call in the 1.x line (absent
  at 1.0.0, confirmed by diffing `node_env.rs` at both tags) — see
  upstream-gtkx.md ask #2 for the full mechanism. Neither half of the
  removal condition is met: the error still does not name the duplicate
  package.
- **`prop-portal`** — enumerated the real module exports by reading the
  compiled `dist/index.js` and `dist/internal.js` directly (same method as
  before): `@gtkx/react`'s `dist/index.js` exports exactly `useApplication`,
  `useBindSetting`, `useParentWindow`, `useProperty`, `useSetting`,
  `useSignal`, `rootElement`, `createPortal`, `createRoot`, `quit`;
  `dist/internal.js` exports `createApplicationWindowComponent`,
  `createApplicationComponent`, `createElementComponent`,
  `createPortaledComponent`, `createWindowComponent`, `useLatestRef`,
  `useMergedRef`, `settleAccessible`, `isRootElement`,
  `createReconcilerRoot`, `setReconcilerErrorHandler`. No value in either is
  `"gtkx:prop"` — `components/element.js` itself still exports both `Prop`
  and `createElementComponent`, but `internal.js` re-exports only the
  latter. `createPortal`'s own `.d.ts` signature is still `(children,
container, key?)`, byte-identical to rc.3/rc.4/1.0. A deep import of
  `@gtkx/react/dist/components/element.js` still throws `Package subpath
'./dist/components/element.js' is not defined by "exports"` — reproduced
  fresh against 1.2.2. Functional confirmation:
  `tests/gtk/components/app-registry.gtk.test.tsx` (exercises
  `WindowActions`/`WindowControllers` built on `createSlotPortal`) passes
  clean, 6/6, on 1.2.2.
- **`renderhook-no-window`** — reproduced the rc.4-era check verbatim, fresh
  on 1.2.2: in one throwaway test file, `Gtk.Window.getToplevels().getNItems()`
  before and after a bare `renderHook(() => null)` reads 0 → 0, then
  `render(null)` in the same file reads 0 → 1. `RenderHookOptions` in
  `dist/render-hook.d.ts` still carries only `wrapper` and `initialProps`,
  and `render-hook.tsx` still constructs `new Gtk.Box()` unconditionally as
  its container. Functional confirmation: `tests/gtk/apis/dimensions.test.tsx`
  (3/3) still passes using the `render()`-first pattern.
- **`gtk-application-argv`** — read `@gtkx/react@1.2.2`'s installed
  `components/application.tsx` source directly: `commandLine` is still
  `[applicationId?.split(".").at(-1) ?? "gtkx", ...process.argv.slice(2)]`,
  and `ApplicationComponentProps` still only carries `applicationId`,
  `children` and `ref` — no `argv` field, no options object, grepped the
  whole `@gtkx/react` and `@gtkx/runtime` trees for `argv` and found nothing
  else relevant. Functional confirmation: this task's own
  `npm run typecheck`/`build:dist`/`gallery-smoke.ts` runs on the merged
  worktree state (which mounts `<GtkApplication>` through the workaround)
  stay green.

## What 1.2 changed under us

Unlike 1.0, 1.2 introduced **no new workaround**: the two breaks task 001
("first light") absorbed — strict signal typing, the `bundle.mjs` rename —
were both plain fixes to our own code (a looser-than-actual type signature,
a hardcoded output filename), not gtkx behavior we have to route around, so
neither has a row here or a removal condition to track.

**1.2.1's criticals-raise-uncaught-exceptions change** (task 001's own
"criticals-throw" probes already confirmed clean at the application level —
scroll adjustment lore, modal open/close cycles, teardown) turned out to
matter for this task too: it is the same change that altered
`runtime-dedupe`'s failure mode (see the row above and upstream-gtkx.md
ask #2), and re-probing it with two FRESH, more aggressive stress tests
(a synchronous 5,000-call burst of invalid `Gtk.Adjustment.configure()`
calls with an `uncaughtException` handler installed, and a real
`GtkWidget.addTickCallback`-driven burst of 2,000 identical calls under the
actual `@gtkx/vitest` forks pool — both well past the 1,699-call burst that
originally triggered ask #2's crash) produced zero crashes on 1.2.2, where
the same infrastructure crashed on 2026-08-04. See upstream-gtkx.md ask #2
for the full writeup and the mechanism found.

`registerClass` subclassing's chain-up capability (1.0's candidate answer to
upstream-gtkx.md ask #3 — every generated `vfunc*` method `protected` and
chainable via `super.vfuncX()`) is unchanged on 1.2.2, confirmed by reading
the installed `@gtkx/gi/gtk` typings directly; still not adopted into
`layout-manager.ts`, per this epic's scope (adopting it is a follow-up, not
a migration task).

`createDialogComponent` (upstream ask #10) is unchanged on 1.2.2: the
installed `dist/adw/dialog.d.ts` still types its returned component as
`(props: PresentedProps<Adw.Dialog>) => ReactNode` with `Adw.Dialog`
resolved against `@gtkx/react`'s own store — not generic, not
store-agnostic. See "Resolved by configuration" below; nothing to revert.

## Resolved by configuration

- `dialog-component-ref-widen` — @gtkx/react's `createDialogComponent` pins
  one store's `Adw.Dialog` in its returned props type, which breaks codegen
  typechecking for every workspace app with its own store (upstream ask #10
  in docs/upstream-gtkx.md, **still open on 1.2.2** — the installed
  `dist/adw/dialog.d.ts` is unchanged, confirmed by reading it directly). We
  no longer carry a workaround: the examples set `codegen: false` and share
  the root-generated store — the sanctioned workspace shape
  (`removeSharedStoreShadow` in @gtkx/cli exists exactly for it), which
  makes the app and @gtkx/react resolve the same store by construction.
  This shape stays required, not optional, on 1.2.2 — the factory has not
  become generic. A patch-package patch briefly filled this slot during the
  1.0 migration and was removed the same day: the installed `.d.ts` proved
  platform-specific for one published version, making any single patch
  unappliable on the other OS.

## Fixed in 1.2.1 (history)

- **`use-signal-stale-handler`** — gtkx's oldest workaround, alive since
  rc.3. `useSignal` routed the handler through React's `useEffectEvent`,
  and `react-reconciler@0.33.0` only refreshed it in
  `commitBeforeMutationEffects` for `case 0` (FunctionComponent) —
  `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fell through
  unrefreshed, so any `useEffectEvent` inside a `memo`/`forwardRef`
  component was pinned to its mount closure forever (our `ScrollView` is a
  `forwardRef` with the `useSignal` calls inside it — a fetch-fed FlatList
  emptied itself on the first scroll). Upstream had ruled on this before
  (gtkx-org/gtkx#467, our own fix offered as #469 and **closed unmerged on
  purpose** — @eugeniodepalo: "closing this in favour of waiting for
  upstream… Since React fixes this properly on 19.3 for all fiber tags, I'd
  rather take the version bump than carry a workaround I'd revert") — and
  it was re-checked and reconfirmed unfixed on both rc.4 and 1.0.0, since
  the removal condition names a React version a release could satisfy by
  bumping.
  **gtkx fixed it directly instead, without waiting for React 19.3.** The
  1.2.1 changelog's own bugfix entry: "Fixed `useSignal` running the handler
  captured on the first render for every emission inside a component
  wrapped in `memo` or `forwardRef`... The hook built on React 19.2's
  `useEffectEvent`, which does not pick up the updated function through
  those wrappers; the handler is now held in a ref written from
  `useInsertionEffect`." Confirmed by reading the installed 1.2.2 source
  directly: `@gtkx/react`'s `hooks/use-signal.ts` no longer imports
  `useEffectEvent` at all — it calls the package's own new `useLatestRef`
  (`hooks/use-latest-ref.ts`), a `useRef` refreshed by a `useInsertionEffect`,
  exactly the pattern our bridge wrapper used to restore by hand.
  `react-reconciler` stayed at `^0.33.0` and `react` stayed on `^19.2` in
  the installed 1.2.2 tree — this is gtkx's own fix, not a React bump.
  Probed by flipping `tests/gtk/bridge/use-signal-upstream.gtk.test.tsx`'s
  `it.fails` guard into a plain `it` and running it targeted on 1.2.2: it
  now passes (previously, running the unflipped `it.fails` guard on 1.2.2
  first, per the "reproduce the original failure first" discipline, reports
  `Error: Expect test to fail` — the wrapped assertion itself succeeds,
  meaning `it.fails`'s own expectation of failure is what fails). Deleted
  the workaround: `src/gtkx/bridge/use-signal.ts` (the ref-plus-
  `useInsertionEffect` wrapper) is gone, and `src/gtkx/bridge/core.ts`
  re-exports `useSignal` straight from `@gtkx/react` again, alongside the
  package's other hooks.

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
to the `gtkx-1-2-migration` epic's task 003, which runs it exactly once for
the whole migration. What is confirmed on 1.2.2 as of this task: `npm run
typecheck` and `npm run build:dist` green (both before and after deleting
`use-signal-stale-handler`), the flipped `use-signal-upstream.gtk.test.tsx`
regression test green on a targeted run, and every probe in the tables above
(four re-audited workarounds, two fresh upstream-ask #2 stress probes, one
retired workaround) behaves as expected. Nothing here should be read as "the
suite passes" — that claim belongs to task 003 alone.

Two environmental notes carried forward from the rc.3/rc.4/1.0 era, neither
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

Carried forward from the rc.3/rc.4/1.0 notes; none of this is re-verified by
this task (it is `@gtkx/testing`-adjacent runtime behavior, out of this
epic's scope — see the `gtkx-1-0-migration` epic's task 004 for the last
full re-check):

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
  needs a live settings change to trigger and stays on the list unconfirmed;
- GLib criticals and errors now raise as a Node `uncaughtException` (1.2.1,
  see upstream-gtkx.md ask #2) — a `g_return_if_fail` violation that used to
  scroll past in a log now ends an app with no `process.on("uncaughtException")`
  handler. `gtkx dev` already installs one; so does every headless probe
  script this repo uses.

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
   were not actually building the duplicate; the `use-signal-stale-handler`
   guard the 1.2 audit flipped is the same discipline the other direction —
   running the UNFLIPPED `it.fails` guard on the new runtime first, so the
   "now fails to fail" observation is the actual probe, not an assumption.
   The same discipline applies to every future audit, this one included;
4. Re-tag whatever survives (`1.2-WORKAROUND` → the new release), rename this
   file to match the new pin, and update `docs/upstream-gtkx.md` if an ask was
   answered.
