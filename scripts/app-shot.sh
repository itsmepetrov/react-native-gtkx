#!/usr/bin/env bash
# Container-side: run a built app headless and capture a screenshot.
# usage: app-shot.sh <app-dir> <out.png> [WxH]
set -euo pipefail

APP_DIR="${1:?app dir}"
OUT="${2:?output png}"
GEOMETRY="${3:-800x640}"

export DISPLAY=:96
export GDK_BACKEND=x11

Xvfb :96 -screen 0 "${GEOMETRY}x24" &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null || true; pkill dbus-daemon 2>/dev/null || true' EXIT
sleep 1

dbus-run-session -- node "$APP_DIR/dist/bundle.js" >"$APP_DIR/app.log" 2>&1 &
APP_PID=$!
sleep 4
import -display :96 -window root "$OUT"
kill $APP_PID 2>/dev/null || true
echo "SCREENSHOT $OUT"
tail -3 "$APP_DIR/app.log" || true
