#!/usr/bin/env bash
# VM-side spike harness: headless sway (pixman — the desktop session owns the
# GPU) + floating windows (tiling would dictate the window size and void the
# SHRINK phase) + grim screenshot of the PAINT phase + pixel check.
# usage: bash run-vm.sh   (from the spike directory, after gtkx build)
set -euo pipefail
cd "$(dirname "$0")"

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
CONF=/tmp/sway-spike.conf
printf 'output HEADLESS-1 resolution 640x480\nfor_window [app_id=".*"] floating enable\ndefault_border none\n' > "$CONF"

pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-spike.log 2>&1 &
SWAY_PID=$!
trap 'kill $SWAY_PID 2>/dev/null || true' EXIT
sleep 2

SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-spike.log | cut -d"'" -f2 | head -1)
[ -n "$SOCKET" ] || { echo "no sway socket"; tail -5 /tmp/sway-spike.log; exit 1; }

mkdir -p shots
: > shots/app.log
WAYLAND_DISPLAY="$SOCKET" SPIKE_EXIT=1 timeout 30 node dist/bundle.js >shots/app.log 2>&1 &
APP_PID=$!

# The PAINT phase (fullscreen) is active from ~1.7s to ~5.7s — shoot mid-window.
sleep 4
WAYLAND_DISPLAY="$SOCKET" grim -t ppm shots/paint.ppm && echo "SHOT shots/paint.ppm"
wait "$APP_PID" || true

node pixel-check.mjs shots/paint.ppm || true

echo "--- results"
grep -E "SUBCLASS|MEASURE|ALLOCATE|OVERFLOW|SHRINK|PERF|PAINT|SPIKE-DONE" shots/app.log \
  || { echo "no markers found, log tail:"; tail -20 shots/app.log; }
echo "--- GTK warnings: $(grep -cE 'Gtk-WARNING|CRITICAL' shots/app.log || true)"
