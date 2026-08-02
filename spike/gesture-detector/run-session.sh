#!/usr/bin/env bash
# Probe 6: a real touchpad pinch, against the DESKTOP SESSION's compositor.
#
# Every other probe in this directory runs under a private headless sway, for
# the reason run-headless.sh gives: an injected pointer is aimed at absolute
# output coordinates, so a shared session would aim at whatever has focus.
# This one cannot, and the reason is the finding:
#
#   A touchpad pinch is not injected. It is CONCLUDED by libinput from two
#   fingers moving apart on a device it has classified as a touchpad — so the
#   compositor in the chain has to have a libinput backend. The headless sway
#   run-headless.sh starts (and the one @gtkx/vitest starts per worker) is
#   launched with WLR_BACKENDS=headless and WLR_LIBINPUT_NO_DEVICES=1. It
#   enumerates no input devices at all, and a uinput touchpad is invisible to
#   it. Measured: zero gesture activity, and the pointer never moves.
#
# So this runs against the session compositor, which is the only one here with
# a libinput backend, and takes the consequences: it fullscreens itself over
# the desktop for about twenty seconds and moves the real cursor. The negative
# control is what carries the assertions either way — a zone the pointer never
# visits has to stay at zero.
#
# usage (VM), after `npm install && npm run build` in this directory and
# `npm run build:dist` at the repo root — the spike resolves react-native-gtkx
# through its exports map into packages/react-native-gtkx/dist, so a source
# change is invisible until that runs:
#
#   bash spike/gesture-detector/run-session.sh
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
GD_PROBE=touchpad node dist/bundle.js >"$OUT/touchpad.log" 2>&1 || true

echo "=== touchpad ==="
grep "\[gd-touchpad\]" "$OUT/touchpad.log" || echo "NO MARKERS — see $OUT/touchpad.log"
echo "=== log: $OUT/touchpad.log ==="
