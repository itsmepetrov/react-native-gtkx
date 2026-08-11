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
  `1.0-WORKAROUND(use-signal-stale-handler)` — latest handler in a ref
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
- Re-checked on rc.4, then again on the stable 1.0.0 release, because the
  condition names a React version and a release could satisfy it by bumping
  one: `@gtkx/react@1.0.0` still peers `react: ^19.2` and depends on
  `react-reconciler: ^0.33.0` (both unchanged since rc.4), React's own
  `latest` is still 19.2.8, and `useSignal` still routes through
  `useEffectEvent`. The `it.fails` guard
  (`tests/gtk/bridge/use-signal-upstream.gtk.test.tsx`) still fails on 1.0,
  targeted-run confirmed.
- Nothing for gtkx to do here. Kept in this file so the next release does
  not re-open the question.

### 2. A panic inside the GLib log-writer trampoline aborts the whole process, not just the offending log call

A burst of ordinary (non-fatal) `g_log()` traffic — many `Gtk-CRITICAL`
warnings issued back-to-back, nothing a consuming app would consider
fatal — can bring the entire embedding process down with `SIGABRT`,
because the writer function gtkx installs via `log_set_writer_func` (the
`glib` crate's own hook) panics while handling one of them, and that panic
crosses a C→Rust callback boundary Rust's runtime has decided cannot
unwind.

- Repro: our own `tests/gtk/dnd/collision-thresholds.gtk.test.tsx`, run
  under `@gtkx/vitest`'s `pool: "forks"` (one headless-compositor fork per
  test file). One of our own components (see "our bug" below) was calling
  `Gtk.Adjustment.configure()` with a `page_size` bigger than `upper` —
  invalid per `gtk_adjustment_configure`'s own precondition. GTK's
  `g_return_if_fail` rejects the call, logs a `Gtk-CRITICAL`, and — this is
  the part that matters — leaves the adjustment'S properties UNCHANGED, so
  a caller gating a retry on "did the properties already reach the target"
  (ours did, inside a per-frame tick callback) reissues the exact same
  invalid call on every animation frame for as long as the callback stays
  active. In one 73-second run this produced 1,699 identical rejected
  calls; somewhere inside that burst, the writer trampoline panics and
  takes the whole Node process with it — full gdb backtrace on file, main
  thread:
  ```
  #3  __GI_abort
  #4  std::sys::pal::unix::abort_internal          (native.linux-arm64-gnu.node)
  #5  std::process::abort                          (native.linux-arm64-gnu.node)
  #6  std::panicking::panic_with_hook               (native.linux-arm64-gnu.node)
  ...
  #10 core::panicking::panic_nounwind_fmt           (native.linux-arm64-gnu.node)
  #12 core::panicking::panic_cannot_unwind          (native.linux-arm64-gnu.node)
  #13 glib::log::log_set_writer_func::writer_trampoline (native.linux-arm64-gnu.node)
  #14 g_log_structured_array                        (libglib-2.0.so.0)
  #15 g_log_default_handler                         (libglib-2.0.so.0)
  #16 g_logv                                        (libglib-2.0.so.0)
  #17 g_log                                         (libglib-2.0.so.0)
  #18 ffi_call_SYSV                                 (native.linux-arm64-gnu.node)
  ...
  #23 v8impl::FunctionCallbackWrapper::Invoke
  ```
  `panic_cannot_unwind` is Rust's own "this panic tried to cross an
  `extern "C"` frame, which is undefined behaviour, so abort instead of
  unwind" path — the panic itself, not the log message, is what is
  uncharacterized: we do not know what inside `writer_trampoline` panics
  under this traffic, only that something does.
- CI sightings this closed (both 2026-08-04, same signature — a green test
  summary followed by `[vitest-pool]: Worker forks emitted error` /
  `Worker exited unexpectedly`, the pool discovering only after the fact
  that one file's fork died mid-run): runs 30903167960 and 30904467362.
  Reproduced locally at will once the trigger was known — see "our bug".
- **This is the same subsystem as the `runtime-dedupe` workaround above**
  (`docs/gtkx-1.0-notes.md`): that row is a SIGABRT from calling
  `log_set_writer_func` twice; this is a SIGABRT from a panic inside the
  function it installs. Different call sites, same conclusion — the
  writer-func integration is not yet hardened against being wrong in an
  ordinary way.
- Our bug, fixed here: `syncAdjustmentRange` in
  `packages/react-native-gtkx/src/components/scroll-view.tsx` computed
  `upper` as the content's own size, which can be smaller than the
  viewport's (a short list in a tall `ScrollView` — routine, not an edge
  case). Clamping `upper` to at least `page_size` (the standard "nothing to
  scroll" `GtkAdjustment` range) makes every call valid and stops the
  retry loop entirely, removing the one path we had into this. It does not
  touch gtkx.
- Ask: wrap `writer_trampoline`'s body in `std::panic::catch_unwind`,
  returning `glib::LogWriterOutput::Unhandled` (or the crate's equivalent
  "let GLib fall back to its own default handler") on a caught panic,
  rather than letting the panic reach the FFI boundary at all. A bug in
  formatting or forwarding one log line should cost that log line, not the
  process embedding gtkx — the same principle the `runtime-dedupe` ask
  above is already asking for at the registration site.
- We do not have a minimal repro outside our own app (constructing one
  needs whatever inside `writer_trampoline` panics, which we have not
  isolated) — the backtrace and the reproduction path above are what we
  have to open an issue with.
- **Re-checked against 1.0.0, both by reading gtkx's own source and by
  probing.** `packages/native/src/host/log_writer.rs` and
  `packages/native/src/host/error_reporter.rs` (fetched from
  `gtkx-org/gtkx` at both the `v1.0.0-rc.4` and `v1.0.0` tags) are
  byte-for-byte identical between the two — nothing here changed. gtkx's
  own `packages/native/src/host/panic_handler.rs` already exists on both
  tags (also unchanged) with exactly the general-purpose helper this ask
  is asking for, `guard_ffi_boundary(context, body)` — a thin
  `catch_unwind` wrapper that reports the panic through
  `error_reporter::report_str` instead of letting it reach the FFI
  boundary — and it is already used at four other native callback sites
  (`node_env.rs`, `value/wrapper.rs`'s wrapper cleanup, `ffi/closure.rs`'s
  callback destroy notify, `api/register_class.rs`'s instance init). It is
  NOT used around `write_log`, the GLib log-writer closure `log_writer.rs`
  installs — so the ask can now be phrased more precisely: apply the SAME
  existing pattern to the log writer, rather than inventing a new one.
  Two fresh probes against 1.0.0, neither of which crashed: a bare script
  issuing 5,000 back-to-back invalid `Gtk.Adjustment.configure()` calls
  (the exact original trigger, ~3× the original burst's 1,699), and the
  same call issued from inside a real `GtkWidget.addTickCallback` running
  under the real `@gtkx/vitest` forks pool — the same infrastructure the
  original CI crashes ran under. Given the source is unchanged, this is
  recorded as inconclusive rather than a close: either the real trigger
  needs conditions neither probe reproduced (parallel test-file forks,
  timing, allocator state), or it was already this rare on rc.4 and the
  two 2026-08-04 CI sightings were unlucky. The ask stands, updated with
  the precise fix (reuse `guard_ffi_boundary`) and the two 1.0 probes as
  evidence it has not gone away by chance.

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

We carry exactly this as a `patch-package` patch
(`1.0-WORKAROUND(dialog-component-ref-widen)`) and would delete it the day
this ships. Worth knowing while fixing: the installed `dist/adw/dialog.d.ts`
differs between Linux and macOS installs of the same published version —
the store-bound `PresentedProps` shape appears on Linux only, which is also
why our patch is platform-gated.

## Workaround receipts (things we would like to delete)

Kept only until upstream changes; each has a row in
`docs/gtkx-1.0-notes.md` with its tag. All four were re-checked against
1.0.0 on the real runtime and all four survived — the notes file has the
receipts.

| Workaround                                    | Why it exists                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `resolve.dedupe` over `@gtkx/*` in our preset | two copies of the runtime abort GLib (`g_log_set_writer_func` twice)                                    |
| `use-signal` wrapper                          | see bug 1 — waiting on React, not on gtkx                                                               |
| `createSlotPortal`'s `"gtkx:prop"` literal    | `createPortal` reaches only the default slot, and the prop element has no public export (see below)     |
| `renderHook` window wrapper in tests          | `renderHook` mounts into a bare `Gtk.Box`, so window-dependent APIs (`Dimensions`) have nothing to read |

A guard against the double-init class of problems (an idempotent runtime
init, or a clear error naming the duplicate) would let us drop the dedupe
list, which today has to be repeated by every consumer of our vite preset.
The current failure is still a bare abort with no attribution — on 1.0.0,
two distinct `@gtkx/native` addon copies in one process give
`GLib-ERROR: g_log_set_writer_func() called multiple times` and SIGABRT,
which names the symbol but not the package that brought the second copy.
Worth knowing if you go to reproduce it: Node caches a native addon by the
`.node` file path, so duplicating the JS wrapper alone is not enough — the
platform binding package has to be duplicated with it.

**A slot-aware portal is the one on this list with no workaround we are happy
with.** `createPortal(children, container)` reaches a container's default
slot; every named slot an object exposes declaratively (a window's
`Gio.ActionMap`, a widget's `controllers`, an `AdwApplicationWindow`'s
`breakpoints`) is reached only through the internal `"gtkx:prop"` element,
which 1.0 exports from neither `@gtkx/react` nor `/internal` (1.0's
`/internal` now re-exports `createElementComponent`, the function that
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
passes `container: new Gtk.Box()` unconditionally. 1.0's `render-hook.js` is
byte-identical to rc.4's, which was byte-identical to rc.3's and rc.2's, and
`RenderHookOptions` still carries only `wrapper` and `initialProps`. Letting
it take the same `container`/window choice `render` takes would retire our
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
- **The Wayland `app_id` is no longer the shared `"GTK Application"`
  literal** — closed on 1.0.0, but by a different mechanism than we asked
  for. We asked for an explicit `g_set_prgname(applicationId)` bootstrap
  call with the FULL `applicationId`; grepping the installed 1.0.0
  `@gtkx/react` `dist/` for "prgname" finds nothing. What actually closed
  it is a side effect of the `gtk-application-argv` breaking change
  (`docs/gtkx-1.0-notes.md`): `@gtkx/react`'s application bootstrap now
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
