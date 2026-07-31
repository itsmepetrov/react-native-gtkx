---
name: vm
description: Run Linux-only work (typecheck, GTK tests, build:dist, launching apps, headless proofs) in the project's Linux VM from macOS. Use whenever a task needs GTK, the codegen store, or a visual check.
---

# Working with the Linux VM

react-native-gtkx is Linux-only at runtime: `typecheck`, `test:gtk`,
`build:dist` and anything that opens a window need the codegen store and
GTK — on macOS all of that runs in a UTM VM through `scripts/vm.ts`.
The VM address comes from `VM_HOST` (put the export into
`scripts/local/env.sh`, gitignored). One-time VM setup: CONTRIBUTING.md.

## Commands

| Command | Purpose |
| --- | --- |
| `node scripts/vm.ts sync` | rsync the repo into the VM (excludes node_modules, dist, logs) |
| `node scripts/vm.ts run '<cmd>'` | run a shell command in the VM repo dir |
| `node scripts/vm.ts app examples/<name>` | launch a BUILT vite-path app into the VM's GNOME session |
| `node scripts/vm.ts app-stop` | stop it |

Quoting over ssh is fragile — for anything beyond a one-liner, write a
script file, sync, and `vm.ts run 'bash path/to/script.sh'`.

## The critical quirks

1. **`npm install` prunes the codegen store** (`@gtkx/gi`, `@gtkx/jsx`
   are "extraneous" to npm): after EVERY install in the VM run
   `npm run codegen`, or typecheck/build will fail with
   "Cannot find module '@gtkx/gi/...'".
2. **dist is not synced**: after sync run `npm run build:dist` in the VM
   before anything that consumes the package (examples, Metro, vite).
3. First-time after sync: `npm install && npm run codegen && npm run build:dist`.

## Headless proofs (no desktop session needed)

- `node scripts/run-linux-headless.ts examples/rn-app /tmp/shot.png` —
  full `react-native run-linux` under headless sway + a screenshot;
- `node scripts/gtkx-dev-headless.ts` — the vite dev path: edits a gallery
  component on the live app and asserts a Fast Refresh in the log;
- `bash spike/rn-platform/run-dev-headless.sh` /
  `run-dev-error-probe.sh` — Metro dev-mode regressions (HMR applies,
  state survives, errors are readable and recoverable).

Screenshots land in the VM's /tmp — `scp` them back to inspect.

## Launching into the user's desktop session

`vm.ts app` covers built vite-path examples. For anything else use the
same systemd-run pattern (detaches cleanly; a plain nohup keeps ssh open):

```bash
ssh "$VM_HOST" 'export XDG_RUNTIME_DIR=/run/user/$(id -u); \
  systemctl --user stop rn-gtkx-app 2>/dev/null; \
  systemctl --user reset-failed rn-gtkx-app 2>/dev/null; \
  systemd-run --user --unit=rn-gtkx-app --setenv=WAYLAND_DISPLAY=wayland-0 \
    --working-directory=$HOME/dev/react-native-gtkx/examples/rn-app \
    bash -lc "npx react-native run-linux"'
```

EGL/ZINK warnings at startup are normal (software rendering in the VM).

## Native (juicy) screenshots — full GNOME chrome

Headless-sway shots are flat (pixman, sway titlebar). For README-grade
shots capture the REAL session window: GNOME's own Alt+Print, pressed by
a virtual keyboard (the Shell's screenshot D-Bus API is allowlisted and
unreachable from scripts; key injection is not):

```bash
sudo ydotoold --socket-path /tmp/.ydotool.sock --socket-own "$(id -u):$(id -g)" &
# launch the app into the session (systemd-run, it grabs focus), then:
YDOTOOL_SOCKET=/tmp/.ydotool.sock ydotool key 56:1 99:1 99:0 56:0   # Alt+Print
# GNOME saves the focused window (frame + shadow) into
# "$(xdg-user-dir PICTURES)/Screenshots/"
```

Needs `ydotool` installed and passwordless sudo in the VM (a dev sandbox).
For live CPU bars in the monitor example run `yes > /dev/null` workers
during the shot. `node scripts/gallery-shots-vm.ts` shoots every gallery
section this way for docs/shots/gallery/. For a shot without the outer
shadow, crop to the bounding box of alpha ≥ 250 pixels afterwards.
