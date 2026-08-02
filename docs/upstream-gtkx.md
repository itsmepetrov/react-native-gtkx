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
  `RC4-WORKAROUND(use-signal-stale-handler)` — latest handler in a ref
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
- Re-checked on rc.4, because the condition names a React version and a
  release could satisfy it by bumping one: `@gtkx/react@1.0.0-rc.4` still
  peers `react: ^19.2` and depends on `react-reconciler: ^0.33.0`, React's
  own `latest` is 19.2.8, and rc.4's `useSignal` still routes through
  `useEffectEvent` (it renamed the options `after`/`immediate` →
  `isAfter`/`isImmediate` and nothing else). The `it.fails` guard still
  fails.
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

### 3. Config registration for embedders — **it has now broken us three releases running**

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

### 4. Keep the settings types importable from where the hooks are

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

### 5. Set the Wayland `app_id` from `applicationId`

`gtkx.config.ts` makes an app declare `applicationId`, validated against
`g_application_id_is_valid`, and it becomes the GApplication id. Nothing
gives it to the compositor: GTK4 takes the xdg-shell `app_id` from
`g_get_prgname()`, and no part of gtkx sets that. Every app built on this
platform therefore arrives at the compositor under GTK's fallback.

Measured on rc.4, headless sway, `examples/rn-app` whose config says
`applicationId: "dev.rngtkx.example"` — sway's own IPC reports:

```json
{ "app_id": "GTK Application", "name": "RN gtkx Example", "shell": "xdg_shell" }
```

`"GTK Application"` is not a namespace, it is a literal shared by every gtkx
app on the machine. The consequences are all the things a compositor keys off
app_id and nothing else: a `for_window [app_id="dev.rngtkx.example"]` rule
matches nothing, window rules written for one app hit all of them, the
`.desktop` file cannot be associated with the window (so no icon in the
taskbar and no correct name in the switcher), and session restore cannot tell
two gtkx apps apart. Found while wiring up the compositor-side proofs for
our PR #88.

- Ask: call `g_set_prgname(applicationId)` (or `GLib.setPrgname`) during
  bootstrap, where `applicationId` is already in hand — `@gtkx/react`'s
  application component reads it from `virtual:gtkx-config` today. On GNOME
  the same value should also match the `.desktop` file's basename for the
  icon to resolve, which apps can already arrange.
- Happy to send the patch; it is a one-line bootstrap change plus a test that
  reads the app_id back through a compositor.

### 6. Let `GtkScrolledWindow` report the phases of the controller it owns

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

### 7. Keep the user-event signal table extensible and documented

rc.2 inverted commit-time signal suppression (an allowlist became a
built-in per-type table plus `userEventSignals`), and rc.3 narrowed the
suppression window again so a signal the framework did not raise is no
longer swallowed for the whole commit. Both changes were right for us —
`AdwNavigationView::popped` reaches our stack navigator, and an emission
from a `useLayoutEffect` now arrives — but we learned the semantics of each
by reading `@gtkx/config/dist/user-event-signals.js` and a release note.

- Ask: document the table and the extension point; it is exactly what a
  library embedding gtkx must reason about.

### 8. `userEvent` cannot produce a real `GdkEvent` — and the missing piece is already in the box

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

## Workaround receipts (things we would like to delete)

Kept only until upstream changes; each has a row in
`docs/gtkx-rc4-notes.md` with its tag. All four were re-checked against
rc.4 on the real runtime and all four survived — the notes file has the
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
The current failure is still a bare abort with no attribution — on rc.4,
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
which rc.4 exports from neither `@gtkx/react` nor `/internal` — and whose
deep module path the `exports` map now refuses outright, so restating the
string literal is the only route left. `createSlotPortal` confines that to
one line (`src/gtkx/bridge/slot-portal.ts`), and `WindowActions`,
`ApplicationActions` and `WindowControllers` are all built on it.

- Ask: export a slot-aware portal —
  `createPortal(children, container, { slot })` — or simply export the prop
  element from `@gtkx/react/internal`, which costs nothing and makes the
  existing pattern supported instead of guessed.

`renderHook` is a two-line fix on gtkx's side — `render` already creates and
presents a harness window whenever no container is given, and `renderHook`
passes `container: new Gtk.Box()` unconditionally. rc.4's `render-hook.js` is
byte-identical to rc.3's, which was byte-identical to rc.2's, and
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

## What we are happy to give back

- The reproduction tests above, upstreamed as gtkx's own.
- Documentation for the embedding surfaces in asks 2–7, written from the
  perspective of a consumer that got them wrong first.
- Real-world pressure data: our suite drives ~1600 GTK and unit tests under
  headless Wayland on every commit, plus perf probes that measure
  reconciler-adjacent costs (allocation passes per second, per-frame
  mount bursts, per-child snapshot and per-event scroll overhead). We can
  report regressions early if that is useful — and we do run each RC against
  the full suite the week it ships.
- Fixes: two of the three bugs we filed against rc.2 we also closed
  ourselves (#470, #473). We are happy to keep doing that — the `app_id`
  patch in ask 3c in particular is one we would rather send than file.
