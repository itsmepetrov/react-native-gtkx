#!/usr/bin/env bash
# Probe 7: real stylus pressure, against the DESKTOP SESSION's compositor.
#
# The same runner run-session.sh is, for the same reason, and the reason is
# again the finding:
#
#   Pressure is not injected. It is READ by libinput off a device it has
#   classified as a tablet, and carried on zwp_tablet_v2 — a protocol nothing
#   in user space can write into. So the compositor in the chain has to have a
#   libinput backend. The headless sway run-headless.sh starts (and the one
#   @gtkx/vitest starts per worker) is launched with WLR_BACKENDS=headless and
#   WLR_LIBINPUT_NO_DEVICES=1. It enumerates no input devices at all, and a
#   uinput tablet is invisible to it.
#
# So this runs against the session compositor, which is the only one here with
# a libinput backend, and takes the consequences: it fullscreens itself over
# the desktop for about half a minute. It does NOT move the pointer — a tablet
# tool has its own cursor — but the pen is mapped over the whole screen, so the
# window has to be the thing under it. The negative control is what carries the
# assertions either way: a card the pen never touches has to stay at zero.
#
# WHAT THE NUMBERS WILL LOOK LIKE, so a reader is not surprised into thinking
# it is broken: mutter puts a roughly QUADRATIC transfer curve between the
# libinput reading and the Wayland wire, so GTK reports about the SQUARE of the
# fraction the probe injects. libinput's own reading of the same ramp is
# exactly linear (0.04, 0.08, ... 1.00 — checked with `libinput debug-events`),
# and what comes out at the top is 0.0016, 0.0063, 0.0142, ... 0.9224, 1.0000.
# So the probe asserts monotonicity and the endpoints and nothing in between.
#
# THE ONE THING THAT MAKES THIS RELIABLE, because it cost several runs to find:
# the tablet must exist BEFORE this process is a Wayland client. A client that
# is already connected when the device appears is told `tablet_added` and then
# never told `tool_added`, and receives nothing for the rest of its life —
# measured with the reference rig's own GTK client, so that nothing in this
# repo was on trial: device-then-client gave 24 pressure samples,
# client-then-device gave 0, with or without a warm-up cycle. src/probe-stylus
# therefore opens the device at its entry point, before it starts the GTK
# application, and run-headless.sh could not host this probe even if the
# compositor had a libinput backend.
#
# usage (VM), after `npm install && npm run build` in this directory and
# `npm run build:dist` at the repo root — the spike resolves react-native-gtkx
# through its exports map into packages/react-native-gtkx/dist, so a source
# change is invisible until that runs:
#
#   bash spike/gesture-detector/run-stylus.sh
#
# Needs /dev/uinput, passwordless sudo (it is root:input 0660) and
# python3-evdev; the probe reports SKIP by name if any is missing.
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
export GDK_BACKEND=wayland
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT=/tmp/gd-spike
mkdir -p "$OUT"

cd "$DIR"
GD_PROBE=stylus node dist/bundle.js >"$OUT/stylus.log" 2>&1 || true

echo "=== stylus ==="
grep "\[gd-stylus\]" "$OUT/stylus.log" || echo "NO MARKERS — see $OUT/stylus.log"
echo "=== log: $OUT/stylus.log ==="
