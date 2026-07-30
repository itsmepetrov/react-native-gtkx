#!/usr/bin/env bash
# Dev-mode: run the PRODUCT path (npx react-native run-linux --dev: Metro
# dev server + supervised dev host with Fast Refresh) under headless sway,
# then edit App.tsx on the LIVE app. Asserts via /tmp/spike-hmr-state.txt
# that the hot update applied (marker changed) AND component state
# survived (ticks kept counting, not reset).
# Usage (in the VM): bash run-dev-headless.sh
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
cd "$(dirname "$0")"

cleanup() {
  # Restore the marker so the tree stays clean for the next run.
  sed -i 's/const HMR_MARKER = "v2"/const HMR_MARKER = "v1"/' App.tsx || true
  kill "${APP:-0}" 2>/dev/null || true
  pkill -f "host-dev.js" 2>/dev/null || true
  pkill -f "react-native.*start" 2>/dev/null || true
  pkill -f "sway -V -c $CONF" 2>/dev/null || true
}
trap cleanup EXIT

sed -i 's/const HMR_MARKER = "v2"/const HMR_MARKER = "v1"/' App.tsx
rm -f /tmp/spike-hmr-state.txt

CONF=/tmp/sway-spike-dev.conf
printf 'output HEADLESS-1 resolution 640x480\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-spike-dev.log 2>&1 &
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-spike-dev.log | cut -d"'" -f2 | head -1)
echo "SOCKET=$SOCKET"

# The command owns everything: codegen ensure, Metro start, dev host.
WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  npx react-native run-linux --dev --port 8081 >/tmp/spike-dev-host.log 2>&1 &
APP=$!

# Wait for the app to render and tick a few times.
for _ in $(seq 1 60); do
  TICKS=$(grep -o "ticks=[0-9]*" /tmp/spike-hmr-state.txt 2>/dev/null | cut -d= -f2 || echo "")
  if [ -n "$TICKS" ] && [ "$TICKS" -ge 3 ]; then
    break
  fi
  sleep 2
done
STATE1=$(cat /tmp/spike-hmr-state.txt)
echo "STATE-BEFORE: $STATE1"
WAYLAND_DISPLAY="$SOCKET" grim /tmp/spike-dev-1.png && echo "SHOT-1"

# THE EDIT: change the marker on the live app.
sed -i 's/const HMR_MARKER = "v1"/const HMR_MARKER = "v2"/' App.tsx
sleep 10
STATE2=$(cat /tmp/spike-hmr-state.txt)
echo "STATE-AFTER: $STATE2"
WAYLAND_DISPLAY="$SOCKET" grim /tmp/spike-dev-2.png && echo "SHOT-2"

TICKS1=$(echo "$STATE1" | grep -o "ticks=[0-9]*" | cut -d= -f2)
TICKS2=$(echo "$STATE2" | grep -o "ticks=[0-9]*" | cut -d= -f2)
if echo "$STATE2" | grep -q "marker=v2" && [ "$TICKS2" -gt "$TICKS1" ]; then
  echo "HMR-OK: update applied, state preserved (ticks $TICKS1 -> $TICKS2)"
else
  echo "HMR-FAIL"
  echo "--- run-linux --dev log ---"
  tail -40 /tmp/spike-dev-host.log
  exit 1
fi
