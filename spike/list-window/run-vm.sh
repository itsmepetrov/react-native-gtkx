#!/usr/bin/env bash
# VM-side harness: run the windowing spike under headless sway (pixman, bus
# cut off) and report the phase markers.
set -euo pipefail
cd "$(dirname "$0")"

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
CONF=/tmp/sway-listwindow.conf
printf 'output HEADLESS-1 resolution 640x720\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-listwindow.log 2>&1 &
SWAY=$!
trap 'kill $SWAY 2>/dev/null || true' EXIT
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-listwindow.log | cut -d"'" -f2 | head -1)

mkdir -p shots
: > shots/app.log
WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  SPIKE_EXIT=1 timeout 40 node dist/bundle.js >shots/app.log 2>&1 &
APP=$!
sleep 6
WAYLAND_DISPLAY="$SOCKET" grim shots/window.png && echo "SHOT shots/window.png"
wait "$APP" || true

echo "--- results"
grep -E "MOUNT|WINDOW|SHIFT|JUMP|ANCHOR|SPIKE-DONE" shots/app.log \
  || { echo "no markers, log tail:"; awk 'length < 200' shots/app.log | tail -15; }
