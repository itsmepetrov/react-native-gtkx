# gtkx rc.3: what we work around, and why

The platform is pinned to `@gtkx/*@1.0.0-rc.3`. This file is the baseline for
that pin: the workarounds still live in the code, the ones rc.3 let us
delete, and the quirks that are simply how the stack behaves.

Every live workaround is tagged in code with `RC3-WORKAROUND(<name>)` —
`grep -rn "RC3-WORKAROUND"` gives the full list of sites, and every tag has a
row below. **Rule:** new workaround → tag in the code AND a row here; when a
release removes the need, delete both in the same commit. (The `RC1-` and
`RC2-` tags are retired — nothing in the tree carries them any more.)

The upstream side of these — reproductions, asks, what we would delete in
return — lives in [docs/upstream-gtkx.md](upstream-gtkx.md).

## Live workarounds

| Name                       | What rc.3 does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Our workaround                                                                                                                                                          | Removal condition                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `use-signal-stale-handler` | `useSignal` routes the handler through React's `useEffectEvent`; `react-reconciler@0.33.0` only refreshes it in `commitBeforeMutationEffects` for `case 0` (FunctionComponent) — `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed, so any `useEffectEvent` in a `memo`/`forwardRef` component is pinned to its mount closure forever (our `ScrollView` is a `forwardRef` with the `useSignal` calls inside it) — a fetch-fed FlatList empties itself on the first scroll. **Unchanged in rc.3, deliberately** — see below | `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx's                     | A stable React 19.3 (React fixed the refresh on the 19.3 line)         |
| `runtime-dedupe`           | Two bundled copies of the gtkx runtime still double-init GLib and abort (`g_log_set_writer_func` called twice); nothing guards against it                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits                         | Idempotent runtime init upstream, or an error that names the duplicate |
| `prop-portal`              | `createPortal(children, container)` can only target a container's DEFAULT slot ("children"). Every other slot an object exposes declaratively — a window's `Gio.ActionMap` (`actions`), a widget's `controllers`, an `AdwApplicationWindow`'s `breakpoints` — is reached only by passing an element-valued PROP, which the reconciler routes through an internal `"gtkx:prop"` element. That element is exported from neither `@gtkx/react` nor its `/internal` subpath, so there is no supported way to portal into a named slot                                | `gtkx/bridge/slot-portal.ts` restates the `"gtkx:prop"` element name and wraps it in `createSlotPortal(children, target, slot)` — the one line that would move if gtkx renames it. `WindowActions`/`ApplicationActions`/`WindowControllers` are built on it | gtkx exports a slot-aware portal (or the prop element) from a public entry point |
| `renderhook-no-window`     | `renderHook` still mounts into a bare `Gtk.Box` — rc.3's `render-hook.js` is byte-identical to rc.2's — so window-dependent APIs have no toplevel to read                                                                                                                                                                                                                                                                                                                                                                                                    | Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`) | `renderHook` mounts into the same harness window `render` uses         |

### `use-signal-stale-handler` is a decision upstream made, not an oversight

We shipped the fix as a PR (gtkx-org/gtkx#469) and it was **closed unmerged
on purpose**. @eugeniodepalo: _"closing this in favour of waiting for
upstream… Since React fixes this properly on 19.3 for all fiber tags, I'd
rather take the version bump than carry a workaround I'd revert."_ So this
row does not move on any gtkx release — only a stable React 19.3 retires it,
and the hazard is wider than `useSignal`: any hook built on `useEffectEvent`
inherits it until then.

## Fixed in rc.3

- **`gsk-colorstop-boxed-write`** — constructing a `Gsk.ColorStop` threw
  `Expected an Object for Boxed field write type, got Object` in the native
  addon, so SVG `<LinearGradient>`/`<RadialGradient>` had zero constructible
  stops and painted nothing. **We fixed this upstream ourselves**
  (gtkx-org/gtkx#473, closing gtkx-org/gtkx#472): a record field write
  converts through `toNative` now, the counterpart of the `fromNative` its
  getter already used. `makeColorStop`'s try/catch and the null-filtering it
  forced through `collectStops`/`appendGradient` are gone; gradients paint for
  real, asserted on the stop colors that actually reach Gsk in
  `tests/gtk/components/svg.gtk.test.tsx`.
- **`graphene-rect-nested-boxed-props`** — the same native bug reached through
  `new Graphene.Rect({ origin, size })`; we had been building the SVG clip
  rect through `Graphene.Rect.alloc().init(x, y, w, h)`, the escape hatch
  `Gsk.ColorStop` did not have. Same upstream fix, so `svg-node.ts` uses the
  plain constructor again.
- **The codegen freshness lie** — `npm install` prunes `node_modules/.gtkx`,
  and rc.2's `@gtkx/cli` could report "bindings up to date" over a store that
  was not there. Fixed upstream in gtkx-org/gtkx#470 (also ours): both stores'
  manifests and self-links are checked now. Separately, `src/runner` calls the
  programmatic `@gtkx/codegen` API rather than the CLI, so a library
  generating bindings on a consumer's behalf has no cwd or stamp to misread.

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

## Behaviour rc.3 changed under us

None of these needed a code change, but they change what the stack does
beneath us and are worth knowing before debugging something odd:

- **Blockable signals are no longer suppressed for a whole React commit.**
  rc.2 suppressed `onChanged`/`onToggled`/`onNotify*`/`onSelectionChanged`
  from `prepareForCommit` until after `resetAfterCommit`; rc.3 wraps each
  framework write individually, so an emission the framework did not cause —
  one raised from a `useLayoutEffect`, or aimed at another `createRoot` tree —
  now reaches its handler. Our navigators lean on exactly this class of
  signal; the full suite is unchanged (825 passed + 1 expected fail, same as
  on rc.2), so nothing of ours was relying on the over-broad suppression.
- **`render`'s harness window is undecorated.** rc.2 gave it a `Gtk.HeaderBar`
  whose window handle, center box and title label sat in the accessibility
  tree competing with the widgets under test. Role queries now see only what
  the test rendered.
- **A widget with `accessibleLabelledBy` reports the relation as its
  accessible name**, ahead of its own text — the precedence ARIA defines.
  Changes what `getByRole(role, { name })` matches.
- **`toHaveTextContent` no longer falls back to the accessible name** (we have
  no uses of it); **`toHaveDisplayValue` throws** on a widget without one
  instead of comparing to `null`; **checked state is tri-state**.
- **Records are constructible only when their bytes can be copied**, a new
  restriction that could have taken `Gsk.ColorStop` away with one hand while
  the fix above gave it with the other. Verified on the VM that neither
  `Gsk.ColorStop` nor `Graphene.Rect` is caught by it — both construct from
  props — which is what makes the two deletions above real rather than paper.
- **Single-child widgets lost their `content`/`child` props** (pass the widget
  as a child instead). No JSX in this repo used either, and typecheck against
  the regenerated bindings is clean, so this cost us nothing — but an app
  built on the raw gtkx surface will feel it.

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
  Normal desktop and container runs are unaffected. The exit-time segfault
  seen on rc.1 no longer reproduces; the portal-push crash needs a live
  settings change to trigger and stays on the list unconfirmed.

## Procedure when the next release ships

1. Update the `@gtkx/*` pins (root, spike, examples, template), then
   `npm install && rm -rf node_modules/.gtkx && npm run codegen`;
2. Run everything on Linux: `npm run typecheck && npm test`, `build:dist`,
   `check:package`, plus the headless example proofs;
3. Walk the live-workaround table: for each row check the removal condition,
   delete the tag and the row together when it is met, and move the entry into
   the history section above — **with a probe that proves the fix on the real
   runtime**, not just the release notes claiming it;
4. Re-tag whatever survives (`RC3-WORKAROUND` → the new release), rename this
   file to match the new pin, and update `docs/upstream-gtkx.md` if an ask was
   answered.
