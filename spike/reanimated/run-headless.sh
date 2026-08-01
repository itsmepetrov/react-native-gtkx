#!/usr/bin/env bash
# Reanimated spike headless proof: build, run under headless sway, screenshot
# the animated box mid-flight and at rest, and print the in-process PASS/FAIL
# lines. The probe decides its own verdict (it measures real GTK geometry) —
# the screenshots are only there to show the thing actually moved on screen.
# usage (VM): bash spike/reanimated/run-headless.sh
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT=/tmp/rea-spike
mkdir -p "$OUT"

CONF=/tmp/sway-rea-spike.conf
printf 'output HEADLESS-1 resolution 800x520\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-rea-spike.log 2>&1 &
SWAY=$!
trap 'kill $SWAY 2>/dev/null || true' EXIT
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-rea-spike.log | cut -d"'" -f2 | head -1)

( cd "$DIR" && WAYLAND_DISPLAY="$SOCKET" \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
    node dist/bundle.js >"$OUT/probe.log" 2>&1 ) &
APP=$!
sleep 1.4
WAYLAND_DISPLAY="$SOCKET" grim "$OUT/1-before.png"
sleep 3.7
WAYLAND_DISPLAY="$SOCKET" grim "$OUT/2-after.png"
kill $APP 2>/dev/null || true
sleep 0.5

echo "=== probe output ==="
grep "\[rea-spike\]" "$OUT/probe.log" || echo "NO MARKERS — see $OUT/probe.log"
echo "=== shots: $OUT ==="
