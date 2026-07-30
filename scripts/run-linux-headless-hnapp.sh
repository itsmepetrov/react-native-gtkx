#!/usr/bin/env bash
# run-linux-headless.sh variant for the hn-app verification loop: hnapp-
# prefixed conf/log/output names (the stock script's fixed /tmp names collide
# with parallel sessions), a taller output for the story list and a longer
# settle so the first page of live HN requests lands before the screenshot.
# usage: run-linux-headless-hnapp.sh <app-dir> [out.png]
set -euo pipefail

APP_DIR="${1:?usage: run-linux-headless-hnapp.sh <app-dir> [out.png]}"
OUT="${2:-/tmp/hnapp-shot.png}"
LOG=/tmp/hnapp-run-linux.log

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
CONF=/tmp/hnapp-sway.conf
printf 'output HEADLESS-1 resolution 640x800\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/hnapp-sway.log 2>&1 &
SWAY=$!
trap 'kill $SWAY 2>/dev/null || true' EXIT
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/hnapp-sway.log | cut -d"'" -f2 | head -1)
echo "SOCKET=$SOCKET"

cd "$APP_DIR"
WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  timeout 180 npx react-native run-linux >"$LOG" 2>&1 &
APP=$!
# Wait for Metro to finish, then give the host time to map the window and
# the app to fetch the first page from the live HN API.
for _ in $(seq 1 30); do
  if grep -q "Done writing bundle output" "$LOG"; then
    break
  fi
  sleep 5
done
sleep 15
WAYLAND_DISPLAY="$SOCKET" grim "$OUT" && echo "SHOT-OK $OUT"
kill $APP 2>/dev/null || true
echo "--- host log ---"
tail -20 "$LOG"
