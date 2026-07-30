#!/usr/bin/env bash
# Run the app through the PRODUCT path (npx react-native run-linux: codegen
# ensure -> Metro bundle -> Node+GTK host) under a headless sway and
# screenshot the window.
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
  timeout 120 npx react-native run-linux --bundle-output dist/main.jsbundle \
  >/tmp/spike-host.log 2>&1 &
APP=$!
# Metro finishes writing the bundle, then the host needs a moment to map
# the window.
for _ in $(seq 1 24); do
  if grep -q "Done writing bundle output" /tmp/spike-host.log; then
    break
  fi
  sleep 5
done
sleep 8
WAYLAND_DISPLAY="$SOCKET" grim /tmp/spike-shot.png && echo "SHOT-OK"
kill $APP 2>/dev/null || true
echo "--- host log ---"
tail -25 /tmp/spike-host.log
