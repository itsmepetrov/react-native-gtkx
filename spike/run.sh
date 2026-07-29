#!/usr/bin/env bash
# Run a spike scenario headless (inside the dev container): Xvfb + dbus + optional screenshot.
# App output goes to shots/app.log so no stray daemon can hold the caller's stdout pipe open.
# usage: run.sh static|measure|perf
set -euo pipefail
cd "$(dirname "$0")"

SCENARIO="${1:-static}"
export DISPLAY=:97
export GDK_BACKEND=x11

mkdir -p shots
: > shots/app.log

Xvfb :97 -screen 0 1280x800x24 &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null || true; pkill dbus-daemon 2>/dev/null || true' EXIT
sleep 1

if [ "$SCENARIO" = "static" ]; then
    SPIKE=static dbus-run-session -- node dist/bundle.js >shots/app.log 2>&1 &
    APP_PID=$!
    sleep 4
    import -display :97 -window root "shots/static.png"
    kill $APP_PID 2>/dev/null || true
    echo "SCREENSHOT shots/static.png"
else
    SPIKE="$SCENARIO" SPIKE_EXIT=1 dbus-run-session -- timeout 120 node dist/bundle.js >shots/app.log 2>&1 || true
fi

grep -E "ACCURACY|MEASURE|PERF|delta key" shots/app.log || tail -5 shots/app.log | cut -c1-300
