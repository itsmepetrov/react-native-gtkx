#!/usr/bin/env bash
# run-linux-headless.sh variant for the hn-app verification loop: hnapp-
# prefixed conf/log/output names (the stock script's fixed /tmp names collide
# with parallel sessions) and a three-shot sequence instead of a single
# screenshot. The app is started with HN_APP_PROOF=1 — the dev-only hook in
# examples/hn-app/src/App.tsx scrolls the list, opens a story and goes back,
# logging a marker before each stage; the shots are paced by those markers:
#   <prefix>-list.png    the scrolled story list
#   <prefix>-story.png   the story screen with comments loaded
#   <prefix>-return.png  the list again — the offset still there proves the
#                        overlay approach preserves the FlatList state
# usage: run-linux-headless-hnapp.sh <app-dir> [out-prefix]
set -euo pipefail

APP_DIR="${1:?usage: run-linux-headless-hnapp.sh <app-dir> [out-prefix]}"
PREFIX="${2:-/tmp/hnapp}"
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
  HN_APP_PROOF=1 \
  timeout 240 npx react-native run-linux >"$LOG" 2>&1 &
APP=$!

# Block until the app logs a proof marker (the hook paces itself; markers
# only appear after the first page has rendered).
wait_marker() {
  for _ in $(seq 1 60); do
    if grep -q "$1" "$LOG"; then
      return 0
    fi
    sleep 2
  done
  echo "TIMEOUT waiting for marker: $1"
  return 1
}

wait_marker "HN_APP_PROOF scrolled"
sleep 3 # let the scroll allocation settle
WAYLAND_DISPLAY="$SOCKET" grim "${PREFIX}-list.png" && echo "SHOT-OK ${PREFIX}-list.png"

wait_marker "HN_APP_PROOF story-open"
sleep 20 # the comment tree fetches one request per node — let it fill in
WAYLAND_DISPLAY="$SOCKET" grim "${PREFIX}-story.png" && echo "SHOT-OK ${PREFIX}-story.png"

wait_marker "HN_APP_PROOF back"
sleep 3
WAYLAND_DISPLAY="$SOCKET" grim "${PREFIX}-return.png" && echo "SHOT-OK ${PREFIX}-return.png"

kill $APP 2>/dev/null || true
echo "--- host log ---"
tail -20 "$LOG"
