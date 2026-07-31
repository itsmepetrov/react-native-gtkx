---
name: dev-loop
description: Cheap iterate-on-a-running-app loop for the gtkx dev (vite/HMR) path — attach to (or start) an example in the VM's real GNOME session, then sync a local edit and screenshot it once the reload has actually landed, no rebuild. Use instead of vm.ts sync + build:dist + build + vm.ts app + ydotool + scp when verifying a UI change.
---

# Dev loop: iterate on a running app

`scripts/dev-loop.ts` turns "does this UI change look right" into two
commands instead of the full rebuild path (`vm.ts sync` + `build:dist` +
build the example + `vm.ts app` + ydotool + scp — minutes per change). Both
toolchains already ship a dev server with HMR (`gtkx dev` here; Metro's
`run-linux --dev` for the RN path); syncing the tree alone is enough to
trigger a reload, no build step at all.

Prerequisite: same VM setup as the `vm` skill (`VM_HOST` in
`scripts/local/env.sh`). **Use your own `VM_DIR`** so this never touches
whatever another session has synced into the shared directory:

```bash
export VM_DIR=dev/devloop   # or any dir not used by anyone else right now
```

First time in a fresh `VM_DIR`: sync it and build once (`gtkx dev` reads the
workspace package through `dist/`, via the npm workspace symlink):

```bash
node scripts/vm.ts sync
node scripts/vm.ts run 'npm install && npm run codegen && npm run build:dist'
```

## Commands

| Command | Purpose |
| --- | --- |
| `node scripts/dev-loop.ts start examples/<name> [--unit=name] [--restart]` | Launch `gtkx dev` for the example into the VM's real GNOME session, or attach to one already running under that unit |
| `node scripts/dev-loop.ts shot <local-out.png> [--unit=name] [--timeout-ms=n]` | rsync the local tree into the VM (alone triggers HMR), wait for the reload to land, screenshot the window, scp the PNG to `local-out.png` |
| `node scripts/dev-loop.ts stop [--unit=name]` | Stop the dev-loop unit |

The systemd unit defaults to `rn-gtkx-dev` — **not** `rn-gtkx-app`, which
`vm.ts app` (and whoever else is using the VM right now) may already be
running. Pass `--unit=` to run several dev-loop sessions in parallel against
different examples without colliding on the same transient unit; `shot`
needs the same `--unit=` (and `VM_DIR`) that `start` used.

Typical loop after the one-time setup above:

```bash
node scripts/dev-loop.ts start examples/gallery
# ...edit examples/gallery/src/... locally...
node scripts/dev-loop.ts shot /tmp/gallery.png
# ...edit again...
node scripts/dev-loop.ts shot /tmp/gallery.png
```

`shot` prints a timing breakdown on success, e.g.:

```
OK /tmp/gallery.png — sync 812ms, reload 1904ms (via "Fast Refresh complete"), shot 3120ms, total 5836ms
```

## How "reload landed" is detected — and what else was checked

`gtkx dev`'s runner logs `"Fast Refresh complete"` for a hot-applied
component edit, or (when the edit isn't refresh-boundary-safe — e.g. the
entry file itself) does a full process restart and logs
`"HMR enabled - watching for changes..."` again once the restarted runner
has re-mounted the app. `shot` records the VM's clock right before the
rsync and polls `journalctl --user -u <unit> --since '<that time>'` for
either marker (`"Hot reload failed:"` fails fast instead of waiting out the
timeout). This is exactly what `scripts/gtkx-dev-headless.ts` already
asserts on for this dev server, just read from the unit's journal instead
of a local log file.

Checked and **not** used, so this isn't guessing: `gtkx dev` also starts an
MCP socket server (`@gtkx/mcp`) for editor/tooling integration with the live
app — it's an app-inspection protocol (query/mutate the live component
tree), not a "reload finished" event stream, and speaking it just to poll
one boolean would be more code and more fragile than journal-polling. There
is also no HTTP/WS endpoint to poll: unlike a browser-facing vite dev
server, `gtkx dev` runs vite in middleware mode with no HTTP listener at all
(`@gtkx/cli`'s `dev/vite-dev-server.ts`). Journal-polling on the runner's
own log lines is the best available signal.

## Known gap: Fast Refresh can log "complete" without repainting

Found while verifying this script against `examples/gallery` (the same edit
`gtkx-dev-headless.ts` exercises): the runner logged `"Fast Refresh
complete"` for a component-only text edit, but the GTK window did not
visually repaint it — reproduced 3 times, including with a deterministic
15-second wait after the marker before screenshotting, so it isn't a
settle-time race `shot` could fix by waiting longer. A full restart (edit a
file that fails the refresh-boundary check — e.g. an entry file with no
component exports — always takes this path) reliably repainted every time
in the same session. `gtkx-dev-headless.ts` only ever asserts on the log
line, never diffs the screenshots it takes, so this gap likely predates
this script. If a `shot` screenshot doesn't show an edit that should have
gone through Fast Refresh, run `start --restart` to force the full-mount
path instead.

## Screenshot mechanism

Same as the `vm` skill's native-GNOME path: `ydotool` presses Alt+Print
(GNOME's own screenshot shortcut) via a virtual keyboard — the Shell's
screenshot D-Bus API is allowlisted and unreachable from scripts, key
injection is not — and GNOME writes the focused window (frame + shadow)
into `$(xdg-user-dir PICTURES)/Screenshots/`. `shot` starts `ydotoold` (as
its own `ydotoold-devloop` unit, so it survives the ssh connection closing)
only if it isn't already running, then diffs the directory listing
before/after the keypress to find the new file and scps it back.

Needs `ydotool` installed and passwordless sudo in the VM (a dev sandbox) —
same requirement as the `vm` skill.
