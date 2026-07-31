#!/usr/bin/env bash
# Headless smoke test for examples/hover-probe (task 007, hover-perf epic):
# same private-headless-sway pattern as run-probe.sh, just pointed at the
# hover probe. No pointer motion here — this only proves the app boots,
# renders, drives its scroll phase and exits cleanly under GTKX_PERF=1.
# Real hover-latency numbers need a real pointer, see
# run-hover-probe-session.sh. Runs ON the VM:
#   bash scripts/perf/run-hover-probe.sh <name> <WxH> [KEY=VAL ...]
# Log: /tmp/perf-<name>-app.log  Shot: /tmp/perf-<name>-shot.png
set -euo pipefail

NAME="${1:?usage: run-hover-probe.sh <name> <WxH> [KEY=VAL ...]}"
RES="${2:?resolution, e.g. 480x820}"
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
cd "$REPO_ROOT/examples/hover-probe"
WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  env GTKX_PERF=1 "$@" timeout 60 node dist/bundle.js >"$LOG" 2>&1 &
APP=$!

for _ in $(seq 1 40); do
  if grep -q "^PERF_DONE" "$LOG" 2>/dev/null; then
    break
  fi
  if ! kill -0 $APP 2>/dev/null; then
    echo "APP EXITED EARLY"
    break
  fi
  sleep 1
done
WAYLAND_DISPLAY="$SOCKET" grim "$PREFIX-shot.png" && echo "SHOT-OK $PREFIX-shot.png"
kill $APP 2>/dev/null || true
wait $APP 2>/dev/null || true
echo "LOG=$LOG"
