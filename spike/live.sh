#!/usr/bin/env bash
# Run a spike scenario with a live VNC view (inside the dev container, port 5901).
# usage: live.sh static|measure|perf
set -euo pipefail
cd "$(dirname "$0")"

SCENARIO="${1:-static}"
export DISPLAY=:97
export GDK_BACKEND=x11

Xvfb :97 -screen 0 1280x800x24 &
sleep 1
# macOS Screen Sharing hangs on SecurityTypes=None, so classic VNC auth is required.
x11vnc -display :97 -rfbport 5901 -passwd "${VNC_PASSWORD:-gtkx2026}" -forever -shared -quiet &
sleep 1

SPIKE="$SCENARIO" dbus-run-session -- node dist/bundle.js
