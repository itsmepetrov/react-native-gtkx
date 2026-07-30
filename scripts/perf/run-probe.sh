#!/usr/bin/env bash
# Scroll-perf probe runner (perf-scroll branch). Starts a PRIVATE headless
# sway (perf-prefixed /tmp names — other sessions share this VM), runs the
# built perf-probe bundle with GTKX_PERF=1 plus any extra KEY=VAL env pairs,
# waits for PERF_DONE, screenshots, and exits. Runs ON the VM:
#   bash scripts/perf/run-probe.sh <name> <WxH> [KEY=VAL ...]
# Log: /tmp/perf-<name>-app.log  Shot: /tmp/perf-<name>-shot.png
set -euo pipefail

NAME="${1:?usage: run-probe.sh <name> <WxH> [KEY=VAL ...]}"
RES="${2:?resolution, e.g. 560x760}"
shift 2

PREFIX="/tmp/perf-$NAME"
LOG="$PREFIX-app.log"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

CONF="$PREFIX-sway.conf"
printf 'output HEADLESS-1 resolution %s\n' "$RES" > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >"$PREFIX-sway.log" 2>&1 &
SWAY=$!
trap 'kill $SWAY 2>/dev/null || true' EXIT
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" "$PREFIX-sway.log" | cut -d"'" -f2 | head -1)
echo "SOCKET=$SOCKET"

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT/examples/perf-probe"
WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  env GTKX_PERF=1 "$@" timeout 240 node dist/bundle.js >"$LOG" 2>&1 &
APP=$!

for _ in $(seq 1 110); do
  if grep -q "^PERF_DONE" "$LOG" 2>/dev/null; then
    break
  fi
  if ! kill -0 $APP 2>/dev/null; then
    echo "APP EXITED EARLY"
    break
  fi
  sleep 2
done
WAYLAND_DISPLAY="$SOCKET" grim "$PREFIX-shot.png" && echo "SHOT-OK $PREFIX-shot.png"
kill $APP 2>/dev/null || true
wait $APP 2>/dev/null || true
echo "LOG=$LOG"
