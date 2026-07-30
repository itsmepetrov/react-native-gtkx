#!/usr/bin/env bash
# Dev-mode spike, error path: break App.tsx on the LIVE app (parse error),
# assert Metro's error reaches the dev-host log readably, then fix the file
# and assert the next update applies (recovery without restart).
# Usage (in the VM): bash run-dev-error-probe.sh
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
cd "$(dirname "$0")"

cleanup() {
  sed -i 's/const HMR_MARKER = ((("v1"/const HMR_MARKER = "v1"/' App.tsx || true
  sed -i 's/const HMR_MARKER = "v2"/const HMR_MARKER = "v1"/' App.tsx || true
  kill "${APP:-0}" "${METRO:-0}" 2>/dev/null || true
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

npx react-native start --port 8081 >/tmp/spike-metro.log 2>&1 &
METRO=$!
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:8081/status" | grep -q "packager-status:running"; then
    break
  fi
  sleep 2
done
echo "METRO-UP"

WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  node dev-host.mjs >/tmp/spike-dev-host.log 2>&1 &
APP=$!
for _ in $(seq 1 45); do
  if grep -q "ticks=" /tmp/spike-hmr-state.txt 2>/dev/null; then
    break
  fi
  sleep 2
done
echo "APP-UP: $(cat /tmp/spike-hmr-state.txt)"

# Break the file on the live app.
sed -i 's/const HMR_MARKER = "v1"/const HMR_MARKER = ((("v1"/' App.tsx
sleep 8
if grep -q "Metro error" /tmp/spike-dev-host.log; then
  echo "ERROR-SEEN:"
  grep -A 2 "Metro error" /tmp/spike-dev-host.log | head -4
else
  echo "ERROR-MISSED"
  tail -20 /tmp/spike-dev-host.log
  exit 1
fi

# Fix it (and move the marker so recovery is observable).
sed -i 's/const HMR_MARKER = ((("v1"/const HMR_MARKER = "v2"/' App.tsx
sleep 10
STATE=$(cat /tmp/spike-hmr-state.txt)
echo "STATE-AFTER-FIX: $STATE"
if echo "$STATE" | grep -q "marker=v2"; then
  echo "RECOVERY-OK"
else
  echo "RECOVERY-FAIL"
  tail -20 /tmp/spike-dev-host.log
  exit 1
fi
