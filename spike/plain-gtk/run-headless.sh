#!/usr/bin/env bash
# Builds the probe and runs it under a PRIVATE headless sway (never the
# user's session), screenshots it, and prints the [plain-gtk] marker lines.
#
# usage (VM), after `npm install` in this directory:
#
#   bash spike/plain-gtk/run-headless.sh          # build + probe
#   PLAIN_GTK_SKIP_BUILD=1 bash …/run-headless.sh  # probe only
#
# Logs and screenshots land in /tmp/plain-gtk/.
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT=/tmp/plain-gtk
mkdir -p "$OUT"

if [ "${PLAIN_GTK_SKIP_BUILD:-0}" != "1" ]; then
  (cd "$DIR" && npm run build)
fi

CONF=/tmp/sway-plain-gtk.conf
# Matched on TITLE, not app_id: gtkx does not set a Wayland app_id from
# applicationId, so every app on this platform arrives as "GTK Application".
cat > "$CONF" <<'EOF'
output HEADLESS-1 resolution 900x700
for_window [title="plain-gtk-probe"] fullscreen enable
EOF
pkill -f "sway -V -c $CONF" 2>/dev/null || true
sleep 0.5
WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
  sway -V -c "$CONF" >/tmp/sway-plain-gtk.log 2>&1 &
SWAY=$!
sleep 2
SOCKET=$(grep -o "wayland display '[^']*'" /tmp/sway-plain-gtk.log | cut -d"'" -f2 | head -1)

(
  cd "$DIR" && WAYLAND_DISPLAY="$SOCKET" \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent \
    PLAIN_GTK_AUTO_OPEN_MODAL=1 \
    PLAIN_GTK_AUTO_PROBE=1 \
    node --enable-source-maps dist/bundle.mjs >"$OUT/probe.log" 2>&1
) &
APP=$!
WAITED=0
# PLAIN_GTK_AUTO_PROBE self-activates the app/window actions at 0.7s and
# self-closes via quit() at 7s (see App.tsx) — .claude/epics/adw-optional/
# 002.md's window fallback (chrome: "content" with no Adw-1 declared). The
# loop still caps at 15s in case that self-close ever regresses.
while kill -0 $APP 2>/dev/null && [ $WAITED -lt 15 ]; do
  sleep 1
  WAITED=$((WAITED + 1))
  if [ $WAITED -eq 1 ]; then
    WAYLAND_DISPLAY="$SOCKET" grim "$OUT/start.png" 2>/dev/null || true
  fi
  if [ $WAITED -eq 3 ]; then
    # PLAIN_GTK_AUTO_OPEN_MODAL fires the Modal open at 1.5s — this shot is
    # after that, over the sway compositor's own default focus-follows
    # behaviour: the modal is a second, transient GtkWindow, so both windows
    # exist and grim captures whichever the compositor stacked/focused.
    WAYLAND_DISPLAY="$SOCKET" grim "$OUT/modal.png" 2>/dev/null || true
  fi
  if [ $WAITED -eq 5 ]; then
    # A real compositor-driven resize (same mechanism as
    # tests/gtk/components/window-root.gtk.test.tsx's resizeViaCompositor) —
    # proves the fallback GtkApplicationWindow resizes under chrome:
    # "content" the same as it always did under chrome: "system". The sway
    # IPC socket is a separate file from $SOCKET (the Wayland display).
    IPC_SOCKET=$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -name "sway-ipc*" | head -1)
    if [ -n "$IPC_SOCKET" ]; then
      # The for_window rule below starts it fullscreen — undo that first, a
      # fullscreen window ignores "resize set" entirely.
      swaymsg -s "$IPC_SOCKET" \
        '[title="plain-gtk-probe"] fullscreen disable' \
        >/dev/null 2>&1 || true
      swaymsg -s "$IPC_SOCKET" \
        '[title="plain-gtk-probe"] resize set width 700 px height 500 px' \
        >/dev/null 2>&1 || true
    fi
    WAYLAND_DISPLAY="$SOCKET" grim "$OUT/resized.png" 2>/dev/null || true
  fi
done
WAYLAND_DISPLAY="$SOCKET" grim "$OUT/end.png" 2>/dev/null || true
kill $APP 2>/dev/null || true
kill $SWAY 2>/dev/null || true
sleep 0.5

echo "=== [plain-gtk] ==="
grep "\[plain-gtk\]" "$OUT/probe.log" || echo "NO MARKERS — see $OUT/probe.log"
echo "=== logs and shots: $OUT ==="
