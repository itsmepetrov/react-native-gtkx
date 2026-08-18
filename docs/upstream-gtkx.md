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

_(None open right now. Both bugs ever tracked here — the `useEffectEvent`
stale-closure defect and the log-writer panic — closed against gtkx 1.2.x;
see "## Closed" below for the receipts. Kept as a heading so the next one
filed here has an obvious home.)_

## API asks

### 3. A layout-manager contract for embedders

We subclass `GtkLayoutManager` (`RnGtkxLayout`) to place children at
Yoga-computed rects, and `GtkWidget.contains()` (via `registerClass`) to
implement RN's `pointerEvents="box-none"`. Both work — `registerClass`
wiring vfuncs is genuinely good — but they are load-bearing for us and
undocumented as an embedding surface.

- Ask: acknowledge (and ideally test upstream) that `registerClass` may
  install layout managers and override `contains()`/`measure()`/
  `allocate()`; or expose a first-class "custom layout" entry point.
  We would contribute the docs/tests for it.

- Ask, and it is a measured one: **a way to call the parent class's
  implementation of an overridden vfunc** — GObject's `g_type_class_peek_parent`
  chain-up, which `registerClass` has the pointer for at registration time and
  keeps no handle on. We override `GtkWidget.snapshot()` to paint a container's
  children in `zIndex` order, and because there is no chain-up, the case where
  nothing is raised has to reproduce `gtk_widget_real_snapshot` from JS rather
  than delegate to it: **1.05 µs per child against GTK's own 0.26 µs**, paid by
  every container whether or not anything is raised
  ([research/z-index.md §4](research/z-index.md) has the table; the residual
  was measured while landing zIndex, our PR #95). That is after the obvious
  fix — the sibling array the container's `allocate()` hook already walks is
  handed to the paint pass, which took it from 2.89 µs to 1.05 µs. What is
  left is one `snapshotChild()` FFI hop per child and nothing else, so a
  chain-up removes it entirely rather than shrinking it. The same shape would
  help anyone overriding `measure` or `size_allocate` to adjust rather than
  replace.

  Still true on rc.4: `registerClass` is unchanged apart from a boolean
  rename, and `@gtkx/utils`'s `getParentClass` walks the JS prototype chain,
  not the GObject class hierarchy — there is no `peek_parent` anywhere in the
  runtime.

- **1.0 looks like a candidate answer to both halves of this ask — recorded
  here, not built, per the `gtkx-1-0-migration` epic's scope (adopting it is
  a follow-up).** `registerClass`'s own generated `.d.ts` (`@gtkx/runtime`)
  now documents explicitly that "a slot is filled from the `vfunc`-prefixed
  methods on the class's prototype chain" — the first half of the ask,
  formally acknowledged rather than just empirically true. The second half —
  a parent-class chain-up — is also there: every generated `vfunc*` method
  on a wrapper class (`@gtkx/gi/gtk`'s `gtk.d.ts`/`gtk.js`, confirmed by
  reading both directly on the installed 1.0.0 package) is `protected` and
  documented "Override it on a class passed to `registerClass` and chain up
  with `super.vfuncX()`", and the base implementation is not a stub: e.g.
  `Gtk.Widget.prototype.vfuncSnapshot` calls into the real native default
  (`gtk_widget_real_snapshot`) through the same vtable-dispatch machinery
  `registerClass` itself uses — so `super.vfuncSnapshot()` from an
  overriding subclass reaches it. If this holds up under actual use, it
  removes exactly the residual this ask's own zIndex measurement above
  found: a container could chain up for every un-raised child instead of
  reproducing `gtk_widget_real_snapshot` from JS, which is the whole of
  what is left after the sibling-array fix already landed. Not verified
  end-to-end here (no code written against it) — the epic's task 002 audits
  workarounds and upstream asks, not new integrations; the follow-up that
  would actually wire this into `layout-manager.ts` and re-measure the
  zIndex table is out of scope.
- Re-checked against 1.2.2: unchanged. `Gtk.Widget.prototype.vfuncSnapshot`
  and every other generated `vfunc*` method are still `protected` and
  documented "chain up with `super.vfuncX()`" (installed `@gtkx/gi/gtk`
  typings, read directly), and `@gtkx/utils`'s `getParentClass` still walks
  the JS prototype chain (`Object.getPrototypeOf`), not the GObject class
  hierarchy — no `peek_parent` anywhere in the runtime. The candidate answer
  still stands, still not adopted into `layout-manager.ts` — out of this
  epic's scope, same as the 1.0 audit.

### 4. Config registration for embedders — **it has now broken us three releases running**

Our runner hosts execute a plain Node bundle, so they synthesize the
`virtual:gtkx-config` module themselves, through `createConfigLoader` from
`@gtkx/config/internal`. That import has now broken on three consecutive
releases:

- rc.2 added two required module exports (`elements`, `userEventSignals`);
- rc.3 changed `createConfigLoader`'s return type from
  `(cwd) => Promise<ResolvedConfig>` to `{ load, resolve }`, so every call
  site had to become `createConfigLoader().resolve(cwd)`;
- rc.4 renamed the element config's keys — `lazy` → `isLazy`, `omitProps` →
  `omittedProps` — so the `elements` map we emit stopped marking anything
  lazy.

None is wrong as a change — but all three are silent for us, because
`/internal` carries no compatibility promise and no changelog entry, and
the failure mode is "no app on our platform starts".

**rc.4's is the worst shape of the three, and it is worth being concrete
about why.** We do not call an API that renamed a parameter; we emit the
module as SOURCE TEXT (`export const elements = {"GtkPopover":{"lazy":true}}`),
because that is the only way to hand a bundle a virtual module. A renamed key
in emitted text is invisible to the compiler, invisible to the type system,
and invisible to a test suite that does not happen to assert lazy behaviour.
It typechecks, it starts, and it is quietly wrong. We caught it by diffing
rc.4's own `renderConfigModule` against ours line by line — not by any gate
we own.

- Ask: a supported way to register a resolved config at runtime — e.g.
  `registerConfig(resolved)` exported from `@gtkx/config`, or make
  `renderConfigModule` public. Either one turns all three of these breakages
  into no-ops, because the shape stops being ours to reproduce. Depending on
  `/internal` is a standing liability for both sides, and rc.3's "make the CLI
  the sole owner of config" (gtkx-org/gtkx#474) moved in the opposite
  direction: it is exactly the case an embedder that is not the CLI has no
  seat at.
- **Re-checked against 1.0.0: it did not break us a fourth release
  running.** `createConfigLoader`'s `{ load, resolve }` shape (installed
  1.0.0 `@gtkx/config/dist/loader.d.ts`) and the element config's
  `isLazy`/`omittedProps` keys and `signals`/`constructProps`/
  `constructOnlyProps`/`defaultProps` metadata names are all unchanged from
  rc.4 — confirmed by `rm -rf node_modules/.gtkx && npm run codegen` plus
  the gallery/hn-app headless launch proofs (`gtkx-1-0-migration` epic, task
  001), not by any gate we own. The underlying ask is still unmet, though:
  `/internal` is still the only route to `createConfigLoader` (still no
  `registerConfig` export anywhere in `@gtkx/config`'s public entry), and
  `renderConfigModule` lives in `@gtkx/config/dist/virtual.d.ts`, which
  is not reachable through the public entry point OR `/internal` — an even
  narrower fourth path than either.
- **Re-checked against 1.2.2: it did not break us a fifth release running.**
  `createConfigLoader`'s `{ load, resolve }`-shaped `ConfigLoader` (installed
  1.2.2 `@gtkx/config/dist/loader.d.ts`) and the element config's
  `isLazy`/`omittedProps` keys (installed `dist/config.d.ts`) are unchanged
  from 1.0.0 — confirmed by reading the installed 1.2.2 source directly,
  plus this task's own `rm -rf node_modules/.gtkx && npm run codegen` and
  the gallery/hn-app headless launch proofs (`gtkx-1-2-migration` epic, task
  001). The underlying ask is still unmet: `dist/index.d.ts` exports only
  `Config`/`defineConfig`/`mergeConfig`/`ResolvedConfig`/`ConfigLoader`/
  `LoadedConfig`/`loadConfig`; `createConfigLoader` is still only in
  `dist/internal.d.ts` (still no `registerConfig` anywhere in either), and
  `renderConfigModule` is still confined to `dist/virtual.d.ts`, reachable
  through neither the public entry point nor `/internal`.

### 5. Keep the settings types importable from where the hooks are

rc.4 moved `SettingsSchema`, `SettingsSchemaKeys` and `SettingValue` off
`@gtkx/react` into `@gtkx/react/internal`, while `useSetting` and
`useBindSetting` — the hooks those types describe — stayed public. So the
public API hands you a value whose type has no public name: an app that wants
to write `const value: SettingValue = ...`, or to declare its own schema, has
to import from `/internal` and inherit that subpath's no-promises status.

- Repro: `import type { SettingValue } from "@gtkx/react"` on rc.4 →
  `TS2305: Module '"@gtkx/react"' has no exported member 'SettingValue'`.
  (`MenuItem` and `VflConstraints` left the public entry point in the same
  sweep; we do not use them, but the same argument applies to anyone typing a
  menu model.)
- Our workaround: the bridge re-exports all three from `/internal`
  (`src/gtkx/bridge/index.ts`), so the rest of this package and our consumers
  never see it.
- Ask: re-export the three from `@gtkx/react`. This looks like a slip in the
  `/** @public */` annotation pass rc.4 did across the entry points rather
  than a decision — the hooks kept their annotations and their types did not.
- Re-checked against 1.0.0: still true. Installed `@gtkx/react@1.0.0`'s
  `dist/index.d.ts` exports exactly `useApplication`, `useBindSetting`,
  `useParentWindow`, `useProperty`, `useSetting`, `useSignal`,
  `RootElement`/`rootElement`, `createPortal`/`createRoot`/`quit`/`Root`,
  `AccessibleProps`, `RefProp` — no `SettingsSchema`, `SettingsSchemaKeys`
  or `SettingValue`. `dist/internal.d.ts` still re-exports all three from
  `./utils/settings.js`, so the bridge's `/internal` re-export stays needed
  unchanged.
- Re-checked against 1.2.2: still true, unchanged from 1.0.0. Installed
  `@gtkx/react@1.2.2`'s `dist/index.d.ts` exports exactly `useApplication`,
  `useBindSetting`, `useParentWindow`, `useProperty`, `useSetting`,
  `useSignal`, `rootElement`, `createPortal`/`createRoot`/`quit` — still no
  `SettingsSchema`, `SettingsSchemaKeys` or `SettingValue`; `dist/internal.d.ts`
  still carries `export type { SettingsSchema, SettingsSchemaKeys,
SettingValue } from "./utils/settings.js"`, so the bridge's `/internal`
  re-export (`src/gtkx/bridge/core.ts`) stays needed, unchanged.

### 7. Let `GtkScrolledWindow` report the phases of the controller it owns

RN's `ScrollView` contract has four phases — `onScrollBeginDrag`,
`onScrollEndDrag`, `onMomentumScrollBegin`, `onMomentumScrollEnd` — and a
`GtkScrolledWindow` already knows all four: it owns a
`GtkEventControllerScroll` and runs its own kinetic animation, so it knows
exactly when a drag starts, when the fingers leave, and when the deceleration
stops. It just does not say so.

To report them we attach a second `GtkEventControllerScroll` alongside the
one the widget already has, purely to observe. It works and it is honest
about what the input device can produce
([research/scroll-phases.md](research/scroll-phases.md)), but it is a
duplicate controller on a hot path: **0.31 µs per scroll event** against the
7.17 µs a scroll event already costs, measured as the slope over controller
count (PR #97). Zero while nobody subscribes — the controller is only
installed when a phase handler exists — but any app that wants RN's scroll
contract pays it forever.

- Ask: surface the phases `GtkScrolledWindow` already computes — signals, or
  a scroll-state property gtkx maps to an element prop. Anything that lets a
  consumer read them off the existing controller instead of installing a
  parallel one removes the residual entirely rather than reducing it.
- This one is arguably a GTK ask rather than a gtkx ask, and we would take
  either answer: a gtkx-side wrapper over what GTK exposes today would help
  even if the underlying signals never appear.
- Re-checked against 1.0.0: unchanged. `GtkScrolledWindow`'s own generated
  `.d.ts` gains no new signals; `Gtk.EventControllerScroll` still only has
  `scroll-begin`/`scroll-end`, the same two generic signals it always had —
  nothing named after RN's four phases.
- Re-checked against 1.2.2: unchanged. `ScrolledWindowSignals` and
  `EventControllerScrollSignals` in the installed `@gtkx/gi/gtk` `.d.ts` are
  the same shape — `EventControllerScrollSignals` still only has
  `decelerate`, `scroll`, `scroll-begin`, `scroll-end` and `notify::flags`.

### 8. Keep the user-event signal table extensible and documented

rc.2 inverted commit-time signal suppression (an allowlist became a
built-in per-type table plus `userEventSignals`), and rc.3 narrowed the
suppression window again so a signal the framework did not raise is no
longer swallowed for the whole commit. Both changes were right for us —
`AdwNavigationView::popped` reaches our stack navigator, and an emission
from a `useLayoutEffect` now arrives — but we learned the semantics of each
by reading `@gtkx/config/dist/user-event-signals.js` and a release note.

- Ask: document the table and the extension point; it is exactly what a
  library embedding gtkx must reason about.
- Re-checked against 1.0.0: unchanged. Installed
  `@gtkx/config/src/user-event-signals.ts` still ships
  `DEFAULT_USER_EVENT_SIGNALS` as a bare object literal with no doc comment
  above it and no mention of the table in `@gtkx/config`'s README.
- Re-checked against 1.2.2: unchanged. Installed
  `@gtkx/config/dist/user-event-signals.js` still ships
  `DEFAULT_USER_EVENT_SIGNALS` as a bare object literal (same entries, e.g.
  `GtkScrolledWindow: ["edge-reached"]`), no doc comment above it, no
  mention of the table anywhere in `@gtkx/config`'s README.

### 9. `userEvent` cannot produce a real `GdkEvent` — and the missing piece is already in the box

`@gtkx/testing`'s `userEvent` drives widgets by **emitting GtkGesture
signals** on the controllers of the widget you name — `userEvent.drag` calls
`getAllControllers(widget, Gtk.GestureDrag)` and emits
`drag-begin`/`drag-update`/`drag-end` with `getStartPoint`/`getOffset`
patched. That is a good default: it is fast, deterministic, and needs no
compositor cooperation.

It also means an entire layer is untestable, because no `GdkEvent` is ever
created:

- the compositor -> GDK -> `GtkGesture` hop itself (every app depends on it;
  nothing tests it);
- real propagation through the hierarchy — `GTK_PHASE_CAPTURE` versus
  `BUBBLE` ordering, `gtk_widget_pick` targeting, `can-target`/`contains`;
- GTK's own arbitration: `GtkEventSequenceState`, gesture groups, implicit
  grabs;
- anything on a `GtkEventControllerLegacy`, which by construction only ever
  sees real events.

**The missing piece is three requests.** `@gtkx/vitest`'s
`virtual-seat.js` already opens a raw Wayland connection to the headless
compositor and binds `zwlr_virtual_pointer_manager_v1`, calling
`create_device` so the compositor advertises pointer capability to GTK. It
never sends anything through that object. Adding `motion_absolute`,
`button` and `frame` on the pointer it already holds is the whole feature.

We have a working implementation:
`packages/react-native-gtkx/tests/gtk/support/virtual-pointer.ts` (~250
lines of hand-rolled wire protocol, no dependencies) plus
`tests/gtk/components/real-input.gtk.test.tsx`, which drives a real drag
through `GtkGestureDrag` into React Native's `PanResponder` and asserts the
neighbouring widget stayed silent. Two practical notes for anyone
implementing it upstream:

- the harness config floats and centres windows
  (`for_window [app_id=".*"] floating enable`), so tests must fullscreen the
  window before treating widget coordinates as output coordinates —
  or `userEvent` should do the coordinate mapping itself, which is the
  better API;
- a Wayland pointer is addressed by **position, not focus**, so a test that
  merely asserts "a handler fired" can pass on a mis-aimed event that landed
  somewhere plausible. Ours is verified by a negative control: aiming 900 px
  away makes it fail.

- Ask: `userEvent` gains a real-input mode (or `userEvent.real.*`) built on
  the virtual pointer that is already created, with the widget-to-output
  coordinate mapping handled inside. We are happy to contribute the
  implementation.
- Re-checked against 1.0.0: unchanged. Installed
  `@gtkx/vitest/src/virtual-seat.ts` still only implements `wl_seat`/the
  virtual keyboard and pointer managers' `create_device` request — no
  `motion_absolute`,
  `button` or `frame` opcode anywhere in the file, so the device the seat
  creates is never actually driven. `@gtkx/testing/src/user-event/` is
  still built entirely on emitting `GtkGesture` signals directly
  (`gesture.ts`, `dispatch.ts`, `controller.ts`); no `real`-flavored entry
  point exists anywhere in its module list.
- Re-checked against 1.2.2: unchanged. Installed `@gtkx/vitest/src/virtual-seat.ts`
  (214 lines) still only defines a `CREATE_DEVICE` opcode — no
  `motion_absolute`, `button` or `frame` constant anywhere in the file.
  `@gtkx/testing/src/user-event/` gained a `native-click.ts` module since
  1.0, but it is unrelated to real input — it special-cases `GtkColumnView`/
  `GtkListItem` factory-row and tab clicks via `activateAction`, not
  `GdkEvent` delivery. `userEvent` is still built entirely on emitted
  `GtkGesture` signals.

### 10. `createDialogComponent` pins one store's `Adw.Dialog` in its returned props type

The shared factory behind the five generated Adw dialog JSX wrappers types
its returned component as `(props: PresentedProps<Adw.Dialog>) => ReactNode`,
with `Adw.Dialog` resolved against whatever `@gtkx/gi` store `@gtkx/react`
itself sees. In an npm workspace that is the hoisted root store — so every
workspace app with its own freshly-generated store fails `gtkx codegen`
typechecking with a ref-covariance error per dialog type (reproduced on two
of our examples with a bare `npx gtkx codegen`; the runtime is fully
duck-typed and unaffected). One-line fix that keeps typing intact — make
the factory generic with a default, so each generated store instantiates
the parameter with its own props type:

```ts
declare const createDialogComponent: <P = DialogComponentProps>(
  Component: ElementType,
) => (props: P) => ReactNode
```

We sidestep this in our own workspace by setting `codegen: false` in every
example (sharing the root-generated store), so we carry no patch — but any
workspace user generating per-app stores hits it on their first codegen. Worth knowing while fixing: the installed `dist/adw/dialog.d.ts`
differs between Linux and macOS installs of the same published version —
the store-bound `PresentedProps` shape appears on Linux only, which is also
why our patch is platform-gated.

- **Re-checked against 1.2.2: unchanged, still open.** Read the installed
  `@gtkx/react@1.2.2` `dist/adw/dialog.d.ts` directly (Linux, VM install):
  `createDialogComponent` still types as
  `(Component: ElementType) => ((props: DialogComponentProps) => ReactNode)`
  with `DialogComponentProps = PresentedProps<Adw.Dialog>` and `Adw.Dialog`
  imported from `@gtkx/gi/adw` — i.e. `@gtkx/react`'s own store, not a
  generic parameter. The factory has not become generic or store-agnostic,
  so the `codegen: false` shared-root-store shape our examples use stays
  **required, not optional** — nothing to revert here. (Also worth
  recording: this is the one ask this audit read installed source for
  rather than reproducing the actual typecheck error, since the fix is
  purely a type-level question the `.d.ts` answers directly and the
  reproduction itself — a workspace app generating its own store — is
  exactly the shape this repo's `codegen: false` setup exists to avoid
  running into again.)

## Workaround receipts (things we would like to delete)

Kept only until upstream changes; each has a row in
`docs/gtkx-1.2-notes.md` with its tag. All three were re-checked against
1.2.2 on the real runtime and all three survived — the notes file has the
receipts. (A fourth entry, the `use-signal` wrapper, was on this list
through the 1.0 migration; gtkx 1.2.1 fixed the underlying defect directly
and the wrapper is retired — see "## Closed" below.)

| Workaround                                    | Why it exists                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `resolve.dedupe` over `@gtkx/*` in our preset | two copies of the runtime abort GLib (`g_log_set_writer_func` twice)                                    |
| `createSlotPortal`'s `"gtkx:prop"` literal    | `createPortal` reaches only the default slot, and the prop element has no public export (see below)     |
| `renderHook` window wrapper in tests          | `renderHook` mounts into a bare `Gtk.Box`, so window-dependent APIs (`Dimensions`) have nothing to read |

A guard against the double-init class of problems (an idempotent runtime
init, or a clear error naming the duplicate) would let us drop the dedupe
list, which today has to be repeated by every consumer of our vite preset.
The current failure is still not idempotent and still does not name the
duplicate package, but the SEVERITY changed since 1.0: on 1.2.2, two
distinct `@gtkx/native` addon copies in one process give `GLib-ERROR:
g_log_set_writer_func() called multiple times` as a catchable, named Node
`uncaughtException` (exit code 1, no core file) rather than the bare
SIGABRT/core-dump 1.0.0 produced for the identical scenario — see the
log-writer-panic closure below for the mechanism, found while re-probing
this exact row.
Worth knowing if you go to reproduce it: Node caches a native addon by the
`.node` file path, so duplicating the JS wrapper alone is not enough — the
platform binding package has to be duplicated with it.

**A slot-aware portal is the one on this list with no workaround we are happy
with.** `createPortal(children, container)` reaches a container's default
slot; every named slot an object exposes declaratively (a window's
`Gio.ActionMap`, a widget's `controllers`, an `AdwApplicationWindow`'s
`breakpoints`) is reached only through the internal `"gtkx:prop"` element,
which 1.2.2 still exports from neither `@gtkx/react` nor `/internal`
(`/internal` re-exports `createElementComponent`, the function that
BUILDS an intrinsic element by GType name, but not the `Prop` literal
itself — a different export from the same source file) — and whose deep
module path the `exports` map still refuses outright, so restating the
string literal is the only route left. `createSlotPortal` confines that to
one line (`src/gtkx/bridge/slot-portal.ts`), and `WindowActions`,
`ApplicationActions` and `WindowControllers` are all built on it.

- Ask: export a slot-aware portal —
  `createPortal(children, container, { slot })` — or simply export the prop
  element from `@gtkx/react/internal`, which costs nothing and makes the
  existing pattern supported instead of guessed.

`renderHook` is a two-line fix on gtkx's side — `render` already creates and
presents a harness window whenever no container is given, and `renderHook`
passes `container: new Gtk.Box()` unconditionally. 1.2.2's `render-hook.tsx`
still constructs `new Gtk.Box()` unconditionally, same as 1.0's, rc.4's,
rc.3's and rc.2's, and `RenderHookOptions` still carries only `wrapper` and
`initialProps`. Letting it take the same `container`/window choice `render`
takes would retire our `renderHookWithWindow` entirely.

## Closed

- **`useEffectEvent` never refreshes inside `forwardRef`/`memo`, freezing
  `useSignal` handlers** (gtkx-org/gtkx#467) — **fixed by gtkx itself in
  1.2.1**, without waiting for React. Diagnosed by @eugeniodepalo:
  `react-reconciler@0.33.0` only refreshes `useEffectEvent` in
  `commitBeforeMutationEffects` for `case 0` (FunctionComponent) —
  `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fell through
  unrefreshed, so any `useEffectEvent` inside a `memo`/`forwardRef`
  component was pinned to its mount closure forever; our `ScrollView` is a
  `forwardRef` with the `useSignal` calls inside it, so a fetch-fed
  FlatList emptied itself on the first scroll. We offered the fix as PR
  #469 and it was **closed unmerged on purpose** —
  @eugeniodepalo: "closing this in favour of waiting for upstream… Since
  React fixes this properly on 19.3 for all fiber tags, I'd rather take the
  version bump than carry a workaround I'd revert" — and it was re-checked
  and reconfirmed unfixed on rc.4 and 1.0.0 both, since the removal
  condition names a React version a release could satisfy by bumping.
  **1.2.1 fixed it directly instead.** Its own changelog bugfix entry:
  "Fixed `useSignal` running the handler captured on the first render for
  every emission inside a component wrapped in `memo` or `forwardRef`...
  The hook built on React 19.2's `useEffectEvent`, which does not pick up
  the updated function through those wrappers; the handler is now held in
  a ref written from `useInsertionEffect`." Confirmed by reading the
  installed 1.2.2 source: `hooks/use-signal.ts` no longer imports
  `useEffectEvent` — it uses the package's own new `useLatestRef`
  (`useRef` refreshed by `useInsertionEffect`), exactly the pattern our
  bridge wrapper used to restore by hand; `react-reconciler` stayed at
  `^0.33.0` and `react` stayed on `^19.2`, so this is gtkx's own fix, not a
  React bump. Probed by flipping the `it.fails` guard
  (`tests/gtk/bridge/use-signal-upstream.gtk.test.tsx`) into a plain `it`
  on 1.2.2: passes. Our workaround (`src/gtkx/bridge/use-signal.ts`) is
  deleted; the bridge re-exports gtkx's `useSignal` directly again. Full
  receipts in `docs/gtkx-1.2-notes.md`'s "Fixed in 1.2.1" section.
- **A panic inside the GLib log-writer trampoline could abort the whole
  process over an ordinary burst of criticals** — **closed on 1.2.x, by a
  different mechanism than we asked for.** We asked for
  `writer_trampoline`'s body to be wrapped in `std::panic::catch_unwind`
  (reusing the existing `guard_ffi_boundary` helper); that specific wrap
  still has not been applied — `write_log` in
  `packages/native/src/host/log_writer.rs` is byte-identical from rc.4
  through 1.2.2 (diffed on GitHub across all four tags) and is still not
  wrapped in `guard_ffi_boundary`. What changed instead, diffing
  `packages/native/src/host/node_env.rs` between the `v1.0.0` and `v1.2.2`
  tags: `raise_fatal` — the function `error_reporter::report_str` calls to
  turn a GLib CRITICAL/ERROR into a Node exception, exactly the call the
  original crash's backtrace passes through
  (`writer_trampoline` → `write_log` → `report_str` → `raise_fatal`) — moved
  out of `error_reporter.rs` and into `node_env.rs`, and now explicitly
  opens and closes its own `napi_handle_scope` around the raw
  `napi_fatal_exception` call (`sys::napi_open_handle_scope`/
  `napi_close_handle_scope`), instead of going through napi-rs's
  higher-level `Env::fatal_exception` convenience wrapper, which does not
  guarantee an active handle scope. This is the one line that differs
  between the two files at those tags. `panic_handler::install()` — new in
  the 1.x line, confirmed absent from `runloop.rs` at `v1.0.0` and present
  at `v1.2.2` — also now records a panic's source location for any
  `guard_ffi_boundary`-wrapped call, so a caught panic's report reads
  `panic at <boundary> (<file>:<line>:<column>): <payload>` (matches
  1.2.1's own changelog bugfix entry for this). Reproduced the ORIGINAL
  trigger fresh on 1.2.2, at greater scale than the original burst
  (1,699 calls): a bare script issuing 5,000 back-to-back invalid
  `Gtk.Adjustment.configure()` calls with an `uncaughtException` handler
  installed, and a real `GtkWidget.addTickCallback`-driven burst of 2,000
  identical calls under the actual `@gtkx/vitest` forks pool — the same
  infrastructure the original 2026-08-04 CI crashes ran under. Both clean:
  every call raised a catchable, named exception, zero crashes, zero core
  files. **Residual**: `write_log` itself is still not wrapped in
  `guard_ffi_boundary`, so a panic from a DIFFERENT source inside that
  function (not an invalid handle-scope access) is not architecturally
  ruled out — the literal ask still stands as a hardening measure, but the
  specific crash class we filed against is gone, confirmed by two fresh
  stress probes exceeding the original repro's scale with zero failures.
  **Organic evidence, from the `gtkx-1-2-migration` epic's own task 003
  full-suite run** (not a synthetic probe): two of our own GTK tests
  (`tests/gtk/gesture-handler/touchpad-gestures.gtk.test.tsx`,
  `tests/gtk/platform/widget-surface.gtk.test.tsx`) already, deliberately,
  provoke upstream GTK/libadwaita criticals we've long known are harmless —
  under 1.0 those were mere G_LOG lines; under 1.2.1's criticals-as-
  exceptions change the same 56 calls across one full suite run surfaced as
  56 real `uncaughtException`s, caught by vitest's own handler and reported
  as a run-failing "Unhandled Errors" bucket even though every named
  assertion still passed. Not a new ask (both underlying criticals are
  pre-existing, understood, upstream-caused, and already documented at
  their call sites) and not a reopening of this ask (still closed, via the
  `raise_fatal` handle-scope fix above) — just a data point that the
  residual's blast radius is not only synthetic: an ordinary test suite
  written before 1.2.1 already exercised it, 56 times, in ONE run. Fixed on
  our side with `tests/gtk/support/expected-critical.ts` (registers a
  second, temporary `uncaughtException` listener for the span of an action
  known to provoke one of these — vitest's own listener steps back the
  moment a second one exists).
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
- **The Wayland `app_id` is no longer the shared `"GTK Application"`
  literal** — closed on 1.0.0, but by a different mechanism than we asked
  for. We asked for an explicit `g_set_prgname(applicationId)` bootstrap
  call with the FULL `applicationId`; grepping the installed 1.0.0
  `@gtkx/react` `dist/` for "prgname" finds nothing. What actually closed
  it is a side effect of the `gtk-application-argv` breaking change
  (`docs/gtkx-1.2-notes.md`): `@gtkx/react`'s application bootstrap now
  builds `runApplication`'s command line as
  `[applicationId.split(".").at(-1), ...process.argv.slice(2)]`, and
  GLib's own `g_application_run()` sets `prgname` from `argv[0]`'s
  basename whenever it was not already set ([documented GLib
  behavior](https://docs.gtk.org/gio/method.Application.run.html)); GTK4
  then reads that same `prgname` as the xdg-shell `app_id`. Measured on rc.4, headless sway, `examples/rn-app` with `applicationId: "dev.rngtkx.example"`, sway reported `{"app_id": "GTK Application"}`. Measured on 1.0.0, `examples/gallery` with `applicationId: "dev.rngtkx.gallery"`, sway now reports `{"app_id": "gallery"}` — no longer shared, now app-specific and stable, which answers the practical complaint (`for_window` rules, taskbar/switcher identity, session restore). **Residual gap against the literal ask**: the app_id is the LAST dot-segment of `applicationId`, not the fully-qualified id, so a `for_window [app_id="dev.rngtkx.gallery"]` rule (the full id) still matches nothing — only `[app_id="gallery"]` does — and two apps whose `applicationId`s differ only in their leading segments would still collide. Not worth a workaround: the shared-literal problem is gone, and the residual is a narrower, less likely collision than the one that motivated the ask.

## What we are happy to give back

- The reproduction tests above, upstreamed as gtkx's own.
- Documentation for the embedding surfaces in asks 2–7, written from the
  perspective of a consumer that got them wrong first.
- Real-world pressure data: our suite drives ~1600 GTK and unit tests under
  headless Wayland on every commit, plus perf probes that measure
  reconciler-adjacent costs (allocation passes per second, per-frame
  mount bursts, per-child snapshot and per-event scroll overhead). We can
  report regressions early if that is useful — and we do run each release
  against the full suite the week it ships.
- Fixes: two of the three bugs we filed against rc.2 we also closed
  ourselves (#470, #473). We are happy to keep doing that — the `app_id`
  patch in ask 3c in particular is one we would rather send than file.
