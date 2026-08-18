#!/usr/bin/env bash
# Builds the probe and runs it under a PRIVATE headless sway, then drives it
# with a real pointer and prints the [core-exports] lines.
#
# A private compositor per invocation, not the user's session: the probe
# injects a pointer at absolute output coordinates and the window is
# fullscreened so those coordinates mean something. Aiming into a shared
# session would move the user's real cursor and land wherever focus happened
# to be.
#
# usage (VM), after `npm install` in this directory:
#
#   bash spike/core-exports/run-headless.sh          # build + probe
#   CORE_EXPORTS_SKIP_BUILD=1 bash …/run-headless.sh # probe only
#
# Logs and screenshots land in /tmp/core-exports/.
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT=/tmp/core-exports
mkdir -p "$OUT"

if [ "${CORE_EXPORTS_SKIP_BUILD:-0}" != "1" ]; then
  (cd "$DIR" && npm run build)
fi

CONF=/tmp/sway-core-exports.conf
# 1024x768 — matches OUTPUT in src/probe.ts, which is what the injected
# absolute coordinates are expressed against. The window is fullscreened by
# the compositor so window coordinates and output coordinates coincide, which
# is what lets the probe aim with `measureInWindow` numbers.
# Matched on the TITLE, not the app_id: gtkx does not set a Wayland app_id
# from `applicationId`, so every app on this platform arrives as
# "GTK Application" and an app_id rule would fullscreen nothing. Without the
# rule the window is 1024x743 at y=25 under sway's own decoration, and the
# probe's first check is what catches that.
cat > "$CONF" <<'EOF'
output HEADLESS-1 resolution 1024x768
for_window [title="core-exports-probe"] fullscreen enable
EOF
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-core-exports.log 2>&1 &
SWAY=$!
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-core-exports.log | cut -d"'" -f2 | head -1)

(
  cd "$DIR" && CORE_EXPORTS_PROBE=1 WAYLAND_DISPLAY="$SOCKET" \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
    node --enable-source-maps dist/bundle.mjs >"$OUT/probe.log" 2>&1
) &
APP=$!
WAITED=0
while kill -0 $APP 2>/dev/null && [ $WAITED -lt 90 ]; do
  sleep 1
  WAITED=$((WAITED + 1))
  if [ $WAITED -eq 3 ]; then
    WAYLAND_DISPLAY="$SOCKET" grim "$OUT/start.png" 2>/dev/null || true
  fi
  if [ $WAITED -eq 5 ]; then
    WAYLAND_DISPLAY="$SOCKET" grim "$OUT/dragging.png" 2>/dev/null || true
  fi
  if [ $WAITED -eq 9 ]; then
    WAYLAND_DISPLAY="$SOCKET" grim "$OUT/settled.png" 2>/dev/null || true
  fi
done
WAYLAND_DISPLAY="$SOCKET" grim "$OUT/end.png" 2>/dev/null || true
kill $APP 2>/dev/null || true
kill $SWAY 2>/dev/null || true
sleep 0.5

echo "=== [core-exports] ==="
grep "\[core-exports\]" "$OUT/probe.log" || echo "NO MARKERS — see $OUT/probe.log"
echo "=== logs and shots: $OUT ==="
