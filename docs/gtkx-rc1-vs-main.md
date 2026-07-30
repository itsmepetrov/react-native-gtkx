# gtkx rc.1 ↔ main: divergences and the rc.2 migration plan

We are pinned to `@gtkx/*@1.0.0-rc.1`, but main has moved ahead, and some of our
code consists of deliberate workarounds for capabilities missing in rc.1. Every
workaround is tagged in code with `RC1-WORKAROUND(<name>)` — `grep -rn "RC1-WORKAROUND"`
gives the full list of sites. When rc.2 is out, walk the table top to bottom.

**Rule:** when adding a new workaround, add the tag to the code and a row here.

| Name                      | In rc.1                                                                                                             | Already in main                                                                                                                      | Our workaround                                                                                                                                                                                    | rc.2 migration                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `fixed-layout-child`      | The declarative `<GtkFixedLayoutChild transform>` creates a "detached" object (Gtk-CRITICAL, positions not applied) | Lazy resolution via `layoutManager.getLayoutChild()` (`element-config.ts: lazy: true`, `element-behaviors.ts: resolve: layoutChild`) | **REMOVED (branch B)**: containers now run our own `RnGtkxLayout` (GObject subclass registered from JS, `gtkx/bridge/layout-manager.ts`) — GtkFixed and `fixed.move()` left the codebase entirely | Nothing to migrate: the rc.1 limitation no longer applies to us either way                                      |
| `controllers-as-children` | Gestures/controllers as JSX children of a widget are silently ignored (dist lacks `addController`)                  | Controller slot: `element-behaviors.ts` → `widget.addController(controller)`                                                         | Imperative `new Gtk.GestureClick()` + `addController` in `components/pressable.tsx`, `components/text-input.tsx`                                                                                  | Switch to JSX children (declaratively cleaner), or keep as is — the API is more stable against shifts like this |
| `vitest-compositor`       | The default headless compositor is weston; sway is supported via an option                                          | Default is sway                                                                                                                      | `vitest.gtk.config.ts`: `gtkx({ compositor: "sway" })`                                                                                                                                            | Drop the option after verifying the new default                                                                 |
| `no-virtual-seat`         | `@gtkx/vitest` has no virtual seat: windows under sway never become active, `userEvent` is impossible               | `packages/vitest/src/virtual-seat.ts`                                                                                                | Tests use `fireEvent`/direct signal emission; alert tests click via `fireEvent(button, "clicked")`                                                                                                | Move interaction tests to `userEvent` (coordinate-based clicks, focus) — closer to production behavior          |
| `renderhook-no-window`    | `renderHook` mounts into a bare `Gtk.Box` without a window                                                          | (verify in rc.2)                                                                                                                     | Hook tests first create a window via `render()` (`tests/gtk/apis/dimensions.test.tsx`)                                                                                                            | Drop the wrapper if fixed                                                                                       |

## Non-workarounds (quirks that will most likely stay)

- 64-bit FFI values arrive as BigInt → `toNumber()` at the boundary (`gtkx/bridge/measure.ts`);
- signal names are kebab-case ("value-changed"); signals do not pass the emitter (get the widget from a ref);
- role queries in tests use the `Gtk.AccessibleRole` enum, not strings;
- `npm install` prunes the codegen store (`node_modules/.gtkx` is not in the lockfile) → run `npm run codegen` after installing — this is npm behavior, not gtkx;
- measuring unmapped widgets yields 0 (offscreen Label probes are the exception) → re-measure on the `map` signal + re-commit measured leaves on every flush (`layout/node.ts`);
- observed on rc.1 (mixed-session setups only): running an app on a bare compositor (headless sway) while `XDG_RUNTIME_DIR` points at a full GNOME session can segfault in a GTK signal handler when the GNOME settings portal pushes updates into the app (`g_cclosure_marshal_VOID__OBJECTv` via the FFI emit path); cutting `DBUS_SESSION_BUS_ADDRESS` avoids it. Normal desktop or container runs are unaffected. Teardown of gtkx apps on SIGTERM may also segfault after windows are gone (harmless, exit-time only).

## Procedure when rc.2 ships

1. Update the `@gtkx/*` pins in package.json (root, spike, examples, template), then `npm install && npm run codegen`;
2. Run everything: `npm run typecheck && npm test && npm run test:gtk` plus the example builds;
3. Walk the table: for each row, check whether it is resolved, migrate, remove the tag;
4. Update this file and the `spike/RESULTS.md` references.
