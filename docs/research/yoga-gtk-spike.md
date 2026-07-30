# Yoga + GtkFixed spike — results

Date: 2026-07-28. Environment: `rn-gtkx-dev` container (Ubuntu 26.04, GTK 4.22.4, libadwaita 1.9.1, Node 24.18) on a remote Linux host (6 CPU), headless Xvfb 1280×800. Versions: @gtkx 1.0.0-rc.1, yoga-layout 3.2.1, react 19.2.8.

## Decision: **GO**

The "Yoga on the JS side + imperative positioning in GtkFixed" architecture is confirmed on every count. The performance headroom is two orders of magnitude above budget.

## Measurements

| Check                                                                                               | Result                                                                                       | Budget  | Verdict                                |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- | -------------------------------------- |
| Layout accuracy (23 widgets, nested flexbox: row/column, flex, gap, padding, space-between, center) | maxDelta = **0 px**                                                                          | ±1 px   | ✅                                     |
| Text accuracy (12 cases: 3 texts × widths 120/200/320/480, line wrapping)                           | maxDelta = **0 px**                                                                          | ±1 px   | ✅                                     |
| Reflow of a 500-node Yoga tree (100 passes with style changes)                                      | **0.13–0.17 ms**                                                                             | ≤ 16 ms | ✅ (~100× headroom)                    |
| Animating 100 widgets, direct path (`fixed.move()` in a tick callback)                              | **60.0 fps**                                                                                 | 60 fps  | ✅ (capped by Xvfb)                    |
| Animating 100 widgets through React state (setState → render → layoutEffect → 100 moves)            | **57.4 fps**                                                                                 | —       | ✅ (even the worst-case path is close) |
| Visual check                                                                                        | `shots/static.png` — header/sidebar/cards/footer, text wrapping, rounded corners via GTK CSS | —       | ✅                                     |

Screenshot: ![static](shots/static.png)

## gtkx rc.1 pitfalls

1. **Declarative `GtkFixedLayoutChild` does not work in rc.1**: the lazy layout-child resolution through `layoutManager.getLayoutChild()` landed on main after rc.1 (rc.1 creates a "detached" object → Gtk-CRITICAL "layout-manager property not set", positions are not applied). Solution: position **imperatively** — `fixed.move(child, x, y)` via refs (the reconciler attaches children with `fixed.put(child, 0, 0)`). This is the layout engine's target path anyway (coordinate diffing + batched moves), so the limitation does not hurt us. RN `transform` (scale/rotate), if needed — imperatively via `fixed.getLayoutManager().getLayoutChild(widget).setTransform()` from the gi bindings. Re-check when gtkx moves to the next RC.
2. **64-bit FFI values arrive as BigInt**: `frameClock.getFrameTime()` → BigInt; arithmetic with a number throws a TypeError. The bridge must normalize (`Number(...)`) at the boundary.
3. **Text measurement**: an offscreen `new Gtk.Label()` (wrap=true) + `measure(VERTICAL, forWidth)` works synchronously before mount and matches the actual render to 0 px — a perfect measure function for Yoga.
4. `widget.measure()` returns the tuple `[min, nat, minBaseline, natBaseline]`.
5. The "Unable to acquire accessibility bus" a11y warning in headless runs is noise; set `GTK_A11Y=none` in tests.
6. Infrastructure: an orphaned `dbus-daemon` keeps the container's stdout pipe open (write app output to a file, kill the daemon).

## Not verified (low risk, deferred)

- Live window resizing with a "jitter" assessment — headless screenshots cannot show it. The composite resize operations (0.17 ms reflow + a batch of moves at 60 fps) are already measured; the resize event comes from the window's `useProperty`. Eyeball it at the first live run (XQuartz/Wayland).
- The React-state animation path degrades to 57.4 fps at 100 widgets — Animated should use the direct path (as the Animated design assumed all along).
