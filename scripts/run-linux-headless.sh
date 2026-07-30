#!/usr/bin/env bash
# Run an app through `react-native run-linux` (codegen ensure -> Metro ->
# Node+GTK host) under a headless sway and screenshot the window.
# usage: run-linux-headless.sh <app-dir> [out.png]
set -euo pipefail

APP_DIR="${1:?usage: run-linux-headless.sh <app-dir> [out.png]}"
OUT="${2:-/tmp/run-linux-shot.png}"
LOG=/tmp/run-linux-headless.log

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
CONF=/tmp/sway-run-linux.conf
printf 'output HEADLESS-1 resolution 640x480\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-run-linux.log 2>&1 &
SWAY=$!
trap 'kill $SWAY 2>/dev/null || true' EXIT
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-run-linux.log | cut -d"'" -f2 | head -1)
echo "SOCKET=$SOCKET"

cd "$APP_DIR"
WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  timeout 180 npx react-native run-linux >"$LOG" 2>&1 &
APP=$!
# Wait for Metro to finish, then give the host a moment to map the window.
for _ in $(seq 1 30); do
  if grep -q "Done writing bundle output" "$LOG"; then
    break
  fi
  sleep 5
done
sleep 8
WAYLAND_DISPLAY="$SOCKET" grim "$OUT" && echo "SHOT-OK $OUT"
kill $APP 2>/dev/null || true
echo "--- host log ---"
tail -20 "$LOG"
