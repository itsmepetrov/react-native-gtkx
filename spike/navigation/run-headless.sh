#!/usr/bin/env bash
# Navigation spike headless proof: build, run under headless sway and shoot
# the auto-driven push/pop sequence, then a second run at a smaller window
# size (allocation-driven reflow of the nested Roots).
# usage (VM): bash spike/navigation/run-headless.sh
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT=/tmp/nav-spike
mkdir -p "$OUT"

CONF=/tmp/sway-nav-spike.conf
printf 'output HEADLESS-1 resolution 1000x700\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-nav-spike.log 2>&1 &
SWAY=$!
trap 'kill $SWAY 2>/dev/null || true' EXIT
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-nav-spike.log | cut -d"'" -f2 | head -1)

run_case() {
  local name="$1" width="$2" height="$3"
  ( cd "$DIR" && WAYLAND_DISPLAY="$SOCKET" \
      DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
      NAV_SPIKE_AUTO=1 NAV_SPIKE_W="$width" NAV_SPIKE_H="$height" \
      node dist/bundle.js >"$OUT/$name.log" 2>&1 ) &
  local APP=$!
  sleep 1.5
  WAYLAND_DISPLAY="$SOCKET" grim "$OUT/$name-1-home.png"
  sleep 2 # auto push at t+2s
  WAYLAND_DISPLAY="$SOCKET" grim "$OUT/$name-2-details.png"
  sleep 3 # auto pop at t+5s
  WAYLAND_DISPLAY="$SOCKET" grim "$OUT/$name-3-back.png"
  kill $APP 2>/dev/null || true
  sleep 0.5
  echo "CASE $name done"
}

run_case wide 900 620
run_case narrow 560 420

grep "\[nav-spike\]" "$OUT"/*.log || true
echo "DONE: $(ls "$OUT" | wc -l) files in $OUT"
