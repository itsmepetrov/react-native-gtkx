#!/usr/bin/env bash
# Container-side: run a built app with a live VNC view on :5901.
# usage: live-app.sh <app-dir> [WxH]
set -euo pipefail

APP_DIR="${1:?app dir}"
# The virtual screen must be larger than the app window, or the window looks
# fullscreen-pinned; openbox provides decorations for moving/resizing.
GEOMETRY="${2:-1400x900}"

export DISPLAY=:97
export GDK_BACKEND=x11

Xvfb :97 -screen 0 "${GEOMETRY}x24" &
sleep 1
openbox &
sleep 0.5
# macOS Screen Sharing hangs on SecurityTypes=None, so classic VNC auth is required.
x11vnc -display :97 -rfbport 5901 -passwd "${VNC_PASSWORD:-gtkx2026}" -forever -shared -quiet &
sleep 1

dbus-run-session -- node "$APP_DIR/dist/bundle.js"
