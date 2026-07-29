#!/usr/bin/env bash
# Run the spike host under a headless sway and screenshot the window.
# Usage (in the VM): bash run-headless.sh
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
CONF=/tmp/sway-spike.conf
printf 'output HEADLESS-1 resolution 640x480\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-spike.log 2>&1 &
SWAY=$!
trap 'kill $SWAY 2>/dev/null || true' EXIT
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-spike.log | cut -d"'" -f2 | head -1)
echo "SOCKET=$SOCKET"
cd "$(dirname "$0")"
WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  timeout 15 node host.mjs dist/main.jsbundle >/tmp/spike-host.log 2>&1 &
APP=$!
sleep 6
WAYLAND_DISPLAY="$SOCKET" grim /tmp/spike-shot.png && echo "SHOT-OK"
kill $APP 2>/dev/null || true
echo "--- host log ---"
tail -25 /tmp/spike-host.log
