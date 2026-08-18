#!/usr/bin/env bash
# animated-size probe: drives a `width` at frame rate through the platform's
# own `useAnimatedStyle` path, asserts the result against real GTK geometry,
# and times the whole write against the naive one it replaces.
#
# A PRIVATE headless compositor per invocation, not `dev-loop shot`: the probe
# fullscreens its own window, reads the toplevel's size request back, and
# hit-tests with gtk_widget_pick() at absolute coordinates — a shared session
# would answer all three about whatever else happens to be on screen.
#
# usage (VM), from the repo root:
#
#   bash spike/animated-size/run-headless.sh
#
# No `npm install` in this directory and no `npm run build:dist`: the spike
# imports the package SOURCE (see the note at the top of src/index.tsx), so
# the root workspace's node_modules is all it needs and a source change is
# visible immediately.
#
# Logs and screenshots land in /tmp/as-spike/.
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT=/tmp/as-spike
mkdir -p "$OUT"

CONF=/tmp/sway-as.conf
printf 'output HEADLESS-1 resolution 1024x768\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-as.log 2>&1 &
SWAY=$!
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-as.log | cut -d"'" -f2 | head -1)

(
  cd "$DIR" && WAYLAND_DISPLAY="$SOCKET" \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
    node dist/bundle.mjs >"$OUT/probe.log" 2>&1
) &
APP=$!
WAITED=0
while kill -0 $APP 2>/dev/null && [ $WAITED -lt 240 ]; do
  sleep 1
  WAITED=$((WAITED + 1))
  if [ $WAITED -eq 4 ]; then
    WAYLAND_DISPLAY="$SOCKET" grim "$OUT/mid.png" 2>/dev/null || true
  fi
done
WAYLAND_DISPLAY="$SOCKET" grim "$OUT/end.png" 2>/dev/null || true
kill $APP 2>/dev/null || true
kill $SWAY 2>/dev/null || true
sleep 0.5

echo "=== animated-size probe ==="
grep "\[as\]" "$OUT/probe.log" || echo "NO MARKERS — see $OUT/probe.log"
echo "=== logs and shots: $OUT ==="
