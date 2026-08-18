#!/usr/bin/env bash
# gesture-detector recon: run both probes under a PRIVATE headless sway and
# print their PASS/FAIL lines.
#
# A private compositor per invocation, not `dev-loop shot`: these probes
# inject a real pointer at absolute output coordinates and fullscreen their
# own window, so a shared session would both aim at whatever has focus and
# move the user's actual cursor.
#
# usage (VM), after `npm install && npm run build` in this directory:
#
#   bash spike/gesture-detector/run-headless.sh          # probes 1 and 4
#
# Probe 5 (the GestureDetector spike) shipped and is gone; its assertions are
# tests now — see src/index.tsx. What is left measures GTK itself, which no
# test in the suite reproduces. See docs/research/gesture-detector.md.
#
# Logs and screenshots land in /tmp/gd-spike/.
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT=/tmp/gd-spike
mkdir -p "$OUT"

run_probe() {
  local probe="$1"
  local conf="/tmp/sway-gd-$probe.conf"
  # 1024x768 — matches OUTPUT in src/harness.ts, which is what the injected
  # absolute coordinates are expressed against.
  printf 'output HEADLESS-1 resolution 1024x768\n' > "$conf"
  pkill -f "sway -V -c $conf" 2>/dev/null || true
  sleep 0.5
  WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
    sway -V -c "$conf" >"/tmp/sway-gd-$probe.log" 2>&1 &
  local sway=$!
  sleep 2
  local socket
  socket=$(grep -o "wayland display '[^']*'" "/tmp/sway-gd-$probe.log" | cut -d"'" -f2 | head -1)

  (
    cd "$DIR" && GD_PROBE="$probe" WAYLAND_DISPLAY="$socket" \
      DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
      node dist/bundle.mjs >"$OUT/$probe.log" 2>&1
  ) &
  local app=$!
  # Long enough for the whole scripted pointer session; the probe exits by
  # itself when it is done.
  local waited=0
  while kill -0 $app 2>/dev/null && [ $waited -lt 90 ]; do
    sleep 1
    waited=$((waited + 1))
    if [ $waited -eq 6 ]; then
      WAYLAND_DISPLAY="$socket" grim "$OUT/$probe-mid.png" 2>/dev/null || true
    fi
  done
  WAYLAND_DISPLAY="$socket" grim "$OUT/$probe-end.png" 2>/dev/null || true
  kill $app 2>/dev/null || true
  kill $sway 2>/dev/null || true
  sleep 0.5

  echo "=== $probe ==="
  grep "\[gd-" "$OUT/$probe.log" || echo "NO MARKERS — see $OUT/$probe.log"
}

run_probe gtk
echo "=== logs and shots: $OUT ==="
