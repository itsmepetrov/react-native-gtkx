#!/usr/bin/env bash
# Container-side: capture a baseline screenshot of every gallery section.
# usage: gallery-shots.sh [out-dir]   (default /work/docs/shots/gallery)
# Section ids are parsed from the gallery's SECTION_IDS export.
set -euo pipefail

OUT="${1:-/work/docs/shots/gallery}"
mkdir -p "$OUT"

IDS=$(grep -o '"[a-z-]*"' /work/examples/gallery/src/sections/index.ts | tr -d '"' | sort -u)
echo "sections: $IDS"

export DISPLAY=:95
export GDK_BACKEND=x11
Xvfb :95 -screen 0 1000x700x24 &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null || true; pkill dbus-daemon 2>/dev/null || true' EXIT
sleep 1

for id in $IDS; do
  GALLERY_SECTION="$id" dbus-run-session -- node /work/examples/gallery/dist/bundle.js \
    >"$OUT/$id.log" 2>&1 &
  APP_PID=$!
  sleep 4
  import -display :95 -window root "$OUT/$id.png"
  kill $APP_PID 2>/dev/null || true
  sleep 0.5
  echo "SHOT $id"
done
rm -f "$OUT"/*.log
echo "DONE: $(ls "$OUT" | wc -l) screenshots in $OUT"
