#!/usr/bin/env bash
# Scroll-perf probe runner for the REAL desktop session, as opposed to the
# private headless sway of run-probe.sh.
#
# Why both exist: headless renders through pixman, the session through
# llvmpipe/EGL-Zink. Those scale differently with window area, so the
# "maximized is worse" report can only be settled where the user saw it.
#
# Runs ON the VM, inside the graphical session:
#   bash scripts/perf/run-probe-session.sh <name> [--maximize] [KEY=VAL ...]
# Log: /tmp/perf-<name>-app.log
set -euo pipefail

NAME="${1:?usage: run-probe-session.sh <name> [--maximize] [KEY=VAL ...]}"
shift
MAXIMIZE=0
if [ "${1:-}" = "--maximize" ]; then
  MAXIMIZE=1
  shift
fi

LOG="/tmp/perf-$NAME-app.log"
UNIT="rn-gtkx-perf"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROBE="$REPO_ROOT/examples/perf-probe"
[ -f "$PROBE/dist/bundle.js" ] || {
  echo "missing $PROBE/dist/bundle.js — build the probe first" >&2
  exit 1
}

# Other example windows steal focus, and a maximize keystroke would land on
# whichever window has it.
systemctl --user stop rn-gtkx-app rn-gtkx-hnapp rn-gtkx-prim "$UNIT" 2>/dev/null || true
systemctl --user reset-failed rn-gtkx-app rn-gtkx-hnapp rn-gtkx-prim "$UNIT" 2>/dev/null || true
sleep 1

rm -f "$LOG"
# shellcheck disable=SC2086
systemd-run --user --unit="$UNIT" --setenv=WAYLAND_DISPLAY=wayland-0 \
  --setenv=GTKX_PERF=1 $(for kv in "$@"; do printf -- '--setenv=%s ' "$kv"; done) \
  --working-directory="$PROBE" \
  bash -c "node dist/bundle.js > $LOG 2>&1"

if [ "$MAXIMIZE" = "1" ]; then
  SOCK=/tmp/.ydotool.sock
  sudo pkill ydotoold 2>/dev/null || true
  sleep 0.5
  sudo ydotoold --socket-path "$SOCK" --socket-own "$(id -u):$(id -g)" \
    >/tmp/ydotoold-perf.log 2>&1 &
  # Let the window map and settle before the compositor resizes it, so the
  # maximized geometry is what the scroll phases actually run against.
  sleep 4
  # Super+Up is the GNOME maximize binding. 125 = KEY_LEFTMETA, 103 = KEY_UP.
  YDOTOOL_SOCKET="$SOCK" ydotool key 125:1 103:1 103:0 125:0
  sleep 2
fi

for _ in $(seq 1 110); do
  if grep -q "^PERF_DONE" "$LOG" 2>/dev/null; then
    break
  fi
  if ! systemctl --user is-active --quiet "$UNIT"; then
    echo "APP EXITED EARLY"
    break
  fi
  sleep 2
done

systemctl --user stop "$UNIT" 2>/dev/null || true
sudo pkill ydotoold 2>/dev/null || true
echo "LOG=$LOG"
