# gtkx rc.4: what we work around, and why

The platform is pinned to `@gtkx/*@1.0.0-rc.4`. This file is the baseline for
that pin: the workarounds still live in the code, the ones rc.4 let us
delete, and the quirks that are simply how the stack behaves.

Every live workaround is tagged in code with `RC4-WORKAROUND(<name>)` —
`grep -rn "RC4-WORKAROUND"` gives the full list of sites, and every tag has a
row below. **Rule:** new workaround → tag in the code AND a row here; when a
release removes the need, delete both in the same commit. (The `RC1-`, `RC2-`
and `RC3-` tags are retired — nothing in the tree carries them any more.)

The upstream side of these — reproductions, asks, what we would delete in
return — lives in [docs/upstream-gtkx.md](upstream-gtkx.md).

**rc.4 removed none of the four.** It is a naming release, not a behaviour
one: a repo-wide sweep renaming boolean options to `is*`/`has*`/`should*`/
`can*`/`requires*`. Every removal condition below was re-checked against the
real runtime on rc.4 — the receipts are in the rows and in "How each was
checked" — and all four still hold. What rc.4 did change is the API surface
under our bridge, catalogued in "What rc.4 renamed under us".

## Live workarounds

| Name                       | What rc.4 does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Our workaround                                                                                                                                                                                                                                              | Removal condition                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `use-signal-stale-handler` | `useSignal` still routes the handler through React's `useEffectEvent`; `react-reconciler@0.33.0` only refreshes it in `commitBeforeMutationEffects` for `case 0` (FunctionComponent) — `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed, so any `useEffectEvent` in a `memo`/`forwardRef` component is pinned to its mount closure forever (our `ScrollView` is a `forwardRef` with the `useSignal` calls inside it) — a fetch-fed FlatList empties itself on the first scroll. **rc.4 did not bump React and did not change the path** — see below | `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx's                                                                                                         | A stable React 19.3 (React fixed the refresh on the 19.3 line)                   |
| `runtime-dedupe`           | Two bundled copies of the gtkx runtime still double-init GLib and abort; nothing guards against it. Reproduced on rc.4: `g_log_set_writer_func() called multiple times`, SIGABRT                                                                                                                                                                                                                                                                                                                                                                                                       | `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits                                                                                                             | Idempotent runtime init upstream, or an error that names the duplicate           |
| `prop-portal`              | `createPortal(children, container, key?)` is byte-for-byte the rc.3 signature and can still only target a container's DEFAULT slot ("children"). Every other slot an object exposes declaratively — a window's `Gio.ActionMap` (`actions`), a widget's `controllers`, an `AdwApplicationWindow`'s `breakpoints` — is reached only by passing an element-valued PROP, which the reconciler routes through an internal `"gtkx:prop"` element. rc.4 exports that element from neither `@gtkx/react` nor `/internal`, and its `exports` map now refuses the deep path outright             | `gtkx/bridge/slot-portal.ts` restates the `"gtkx:prop"` element name and wraps it in `createSlotPortal(children, target, slot)` — the one line that would move if gtkx renames it. `WindowActions`/`ApplicationActions`/`WindowControllers` are built on it | gtkx exports a slot-aware portal (or the prop element) from a public entry point |
| `renderhook-no-window`     | `renderHook` still mounts into a bare `Gtk.Box` — rc.4's `render-hook.js` is byte-identical to rc.3's, which was byte-identical to rc.2's — so window-dependent APIs have no toplevel to read                                                                                                                                                                                                                                                                                                                                                                                          | Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`)                                                                                     | `renderHook` mounts into the same harness window `render` uses                   |

### `use-signal-stale-handler` is a decision upstream made, not an oversight

We shipped the fix as a PR (gtkx-org/gtkx#469) and it was **closed unmerged
on purpose**. @eugeniodepalo: _"closing this in favour of waiting for
upstream… Since React fixes this properly on 19.3 for all fiber tags, I'd
rather take the version bump than carry a workaround I'd revert."_ So this
row does not move on any gtkx release — only a stable React 19.3 retires it,
and the hazard is wider than `useSignal`: any hook built on `useEffectEvent`
inherits it until then.

rc.4 was checked against that condition anyway, because the condition names a
React version and a release could satisfy it by bumping one: it does not.
`@gtkx/react@1.0.0-rc.4` peers `react: ^19.2` and depends on
`react-reconciler: ^0.33.0` — character-identical to rc.3 — and React's own
`latest` is still 19.2.8, with 19.3.0 published only as canaries. rc.4 did
touch `useSignal`, but only to rename its options (`after`/`immediate` →
`isAfter`/`isImmediate`); the body still calls `useEffectEvent`, and its
doc comment still says React fixes this on the 19.3 line.

### How each was checked against rc.4

The rule is that a changelog entry is a claim and the removal condition is
the test, so each row was re-run on the real runtime rather than read about.

- **`use-signal-stale-handler`** — `tests/gtk/bridge/use-signal-upstream.gtk.test.tsx`
  calls gtkx's own hook directly on a `memo` component; it is an `it.fails`
  guard that starts passing the day the defect is gone. On rc.4 it still
  fails, and it is the "1 expected fail" the whole suite reports.
- **`runtime-dedupe`** — the first two attempts at a probe both said "no
  abort", and both were wrong, which is worth recording: Node caches a native
  addon by the resolved path of the `.node` FILE, so a second copy of the thin
  `@gtkx/native` JS wrapper shares one addon instance and one Rust static, and
  a second `init()` on it returns normally — on rc.3 exactly as on rc.4. The
  failure needs two DISTINCT `.node` files in one process (an app with its own
  `@gtkx/native-linux-*-gnu` plus a nested one under the library), each
  carrying its own `glib::log::WRITER_FUNC`. Built that way, rc.4 dies:
  `gtkx: GLib-ERROR: g_log_set_writer_func() called multiple times`, exit 134,
  core dumped. Neither half of the condition is met — the init is not
  idempotent, and while the error names the symbol it does not name the
  duplicate package, which is the part that would make it debuggable.

  **Not the only SIGABRT out of this subsystem.** A second, separate crash —
  a Rust panic inside the `writer_trampoline` `log_set_writer_func` installs
  (registered fine, once) rather than a double-registration — twice took
  down a CI worker fork under `tests/gtk/dnd/collision-thresholds.gtk.test.tsx`
  (2026-08-04, runs 30903167960 and 30904467362). Not a new
  `RC4-WORKAROUND` row: the trigger was our own bug (`scroll-view.tsx`'s
  `syncAdjustmentRange` calling `Gtk.Adjustment.configure()` with an invalid
  range, retried every frame), now fixed, not gtkx drift to absorb in the
  bridge. Full backtrace and the upstream ask (harden `writer_trampoline`
  with `catch_unwind`) are in
  [docs/upstream-gtkx.md](upstream-gtkx.md#2-a-panic-inside-the-glib-log-writer-trampoline-aborts-the-whole-process-not-just-the-offending-log-call).

- **`prop-portal`** — enumerated the real module objects on the runtime rather
  than reading the `.d.ts`. `@gtkx/react` exports exactly `createPortal`,
  `createRoot`, `quit`, `rootElement`, `useApplication`, `useBindSetting`,
  `useParentWindow`, `useProperty`, `useSetting`, `useSignal`;
  `@gtkx/react/internal` exports `applyWrite`, `createApplicationComponent`,
  `createElementComponent`, `createReconcilerRoot`, `createWindowComponent`,
  `getAccessibleMetadata`, `isRootElement`, `setReconcilerErrorHandler`,
  `useMergedRef`. No value in either is `"gtkx:prop"`, and there is no
  slot-aware portal. rc.4 also made the fallback worse rather than better:
  importing `@gtkx/react/dist/components/element.js` now fails with _"not
  exported under the conditions [node, development, import]"_, so restating
  the literal is the only route left. The literal itself did not move —
  `const Prop = "gtkx:prop"` is unchanged in rc.4's `components/element.tsx`
  (only a doc comment above it was deleted), which the passing
  `WindowActions`/`WindowControllers`/breakpoint suites confirm functionally.
- **`renderhook-no-window`** — `RenderHookOptions` still carries only
  `wrapper` and `initialProps`, no `container`, and on the runtime
  `renderHook` took the toplevel count from 0 to 0 while `render` took it
  from 0 to 1 in the same file.

## What rc.4 renamed under us

rc.4 is a naming-convention sweep. Nothing below changed behaviour, but each
one is a compile error or a silent runtime miss for a consumer of the RC.

- **`@gtkx/react` moved the settings types off its public entry point.**
  `SettingsSchema`, `SettingsSchemaKeys` and `SettingValue` are now exported
  from `/internal` only, while the hooks they type (`useSetting`,
  `useBindSetting`) stay public — so an app that wants to name the type of a
  setting has no supported import for it. The bridge re-exports them from
  `/internal`; the ask to put them back is in
  [docs/upstream-gtkx.md](upstream-gtkx.md). (`MenuItem` and `VflConstraints`
  left the public entry too; nothing here used them.)
- **`@gtkx/codegen`'s `runCodegen` result renamed `regenerated` →
  `isRegenerated`** (`src/runner/index.ts`), and the package dropped its
  `./gi` and `./jsx` subpath exports in favour of a new `./internal`.
- **`@gtkx/vitest` renamed `GtkxPluginOptions` → `PluginOptions`**
  (`src/vitest/index.ts`).
- **The element config renamed `lazy` → `isLazy` and `omitProps` →
  `omittedProps`.** This is the one with no compiler behind it: our three
  hosts synthesize `virtual:gtkx-config` as SOURCE TEXT
  (`src/runner/host.ts`, `src/runner/host-dev.ts`,
  `src/sea/gtkx-config-module.ts`), so a stale key typechecks perfectly and
  simply stops marking elements lazy at runtime. Caught by diffing rc.4's own
  `renderConfigModule` against ours and proven by the headless `run-linux`
  proof, not by a gate.
- **`virtual:gtkx-config`'s metadata constants** went `SIGNALS` → `signals`,
  `CONSTRUCT_PROPS` → `constructProps`, `CONSTRUCT_ONLY_PROPS` →
  `constructOnlyProps`, `DEFAULT_PROPS` → `defaultProps`. Free for us: all
  three hosts re-export the module wholesale
  (`export * from "@gtkx/jsx/metadata"`) rather than naming its members.
- **`@gtkx/testing` renamed `GtkxElementError` → `ElementError`,
  `render`'s `animations`/`reactStrictMode` → `areAnimationsEnabled`/
  `isReactStrictMode`, and `prettyWidget`'s `highlight` → `shouldHighlight`.**
  We use none of them, but a consumer's test suite will.
- **`defineBehavior`'s `createContext` → `initialize`**, and
  `@gtkx/utils` dropped its `./function` subpath. Neither reaches us.

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

## Behaviour rc.4 changed under us

Nothing measurable. The suite is **166 files, 1601 passed + 1 expected fail**
on rc.4 — identical to main's own CI run on rc.3 (251c353), file for file and
test for test. The renames above are the whole of the release as far as this
repo can observe it: the reconciler's commit-time signal handling, the
harness window, the accessibility tree and the codegen output all behave as
they did on rc.3, and the regenerated bindings typecheck clean.

Two things worth knowing before debugging something odd on rc.4:

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
  Verified identical on rc.3, so this is not new, but it makes the dev-path
  proof unreliable when another app is running.

## Behaviour rc.3 changed under us (still true)

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
   were not actually building the duplicate;
4. Re-tag whatever survives (`RC4-WORKAROUND` → the new release), rename this
   file to match the new pin, and update `docs/upstream-gtkx.md` if an ask was
   answered.
