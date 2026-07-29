#!/usr/bin/env bash
# VM-side: golden screenshots of every gallery section under headless sway
# (pixman renderer — a desktop session may own the GPU; the session bus is cut
# off so a desktop portal cannot reach the app mid-run, see the rc.1 notes in
# docs/gtkx-rc1-vs-main.md). Copy the results into docs/shots/gallery/.
# usage: run on the Linux host/VM from anywhere: bash scripts/gallery-shots-vm.sh
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
OUT=/tmp/gallery-shots
mkdir -p "$OUT"
CONF=/tmp/sway-shots.conf
printf 'output HEADLESS-1 resolution 1000x700\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-shots.log 2>&1 &
SWAY=$!
trap 'kill $SWAY 2>/dev/null || true' EXIT
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-shots.log | cut -d"'" -f2 | head -1)
cd "$(dirname "$0")/../examples/gallery"

for id in views text layout inputs buttons lists toggles media animated modal apis; do
  WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
    GALLERY_SECTION="$id" node dist/bundle.js >"$OUT/$id.log" 2>&1 &
  APP=$!
  sleep 4
  WAYLAND_DISPLAY="$SOCKET" grim "$OUT/$id.png"
  kill $APP 2>/dev/null || true
  sleep 0.5
  echo "SHOT $id"
done
rm -f "$OUT"/*.log
echo "DONE: $(ls "$OUT" | wc -l) screenshots in $OUT"
