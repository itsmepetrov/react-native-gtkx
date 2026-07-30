#!/usr/bin/env bash
# Verify the vite dev path: run the gallery through `gtkx dev` under
# headless sway and edit a COMPONENT module on the LIVE app. Asserts the
# gtkx runner performed a Fast Refresh (not a restart) and screenshots
# before/after.
# Usage (in the VM): bash scripts/gtkx-dev-headless.sh
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$REPO/examples/gallery"
TARGET="$APP/src/sections/views.tsx"
LOG=/tmp/gtkx-dev.log

cleanup() {
  sed -i 's/title="backgroundColor HMR"/title="backgroundColor"/' "$TARGET" || true
  kill "${DEV:-0}" 2>/dev/null || true
  pkill -f "gtkx" 2>/dev/null || true
  pkill -f "sway -V -c $CONF" 2>/dev/null || true
}
trap cleanup EXIT

sed -i 's/title="backgroundColor HMR"/title="backgroundColor"/' "$TARGET"

CONF=/tmp/sway-gtkx-dev.conf
printf 'output HEADLESS-1 resolution 1000x700\n' > "$CONF"
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-gtkx-dev.log 2>&1 &
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-gtkx-dev.log | cut -d"'" -f2 | head -1)
echo "SOCKET=$SOCKET"

cd "$APP"
WAYLAND_DISPLAY="$SOCKET" DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
  npx gtkx dev >"$LOG" 2>&1 &
DEV=$!
sleep 25
WAYLAND_DISPLAY="$SOCKET" grim /tmp/gtkx-dev-1.png && echo "SHOT-1"

# THE EDIT: a component module — must go through Fast Refresh, no restart.
sed -i 's/title="backgroundColor"/title="backgroundColor HMR"/' "$TARGET"
sleep 8
WAYLAND_DISPLAY="$SOCKET" grim /tmp/gtkx-dev-2.png && echo "SHOT-2"

if grep -aq "Fast Refresh complete" "$LOG"; then
  echo "FAST-REFRESH-OK"
  grep -aE "File changed|Fast Refresh" "$LOG" | tail -3
else
  echo "FAST-REFRESH-FAIL"
  tail -20 "$LOG"
  exit 1
fi
