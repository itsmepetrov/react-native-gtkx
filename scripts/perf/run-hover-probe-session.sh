#!/usr/bin/env bash
# Real-session hover-latency measurement (task 007, hover-perf epic):
# launches examples/hover-probe in the actual GNOME session, maximizes it
# (so the window's bounds are known without reading its on-screen position),
# and drives a REAL pointer with ydotool back and forth across the row
# column for the whole run — the "fast mouse movement" the report
# describes, not a simulated one. GTKX_PERF=1 makes the app self-report
# (see examples/hover-probe/src/index.tsx for the two arms and their
# counters).
#
# Runs ON the VM, inside the graphical session:
#   bash scripts/perf/run-hover-probe-session.sh <name> <HOVER_MODE> [KEY=VAL ...]
# Log: /tmp/perf-<name>-app.log
set -euo pipefail

NAME="${1:?usage: run-hover-probe-session.sh <name> <pressable|native> [KEY=VAL ...]}"
MODE="${2:?mode: pressable or native}"
shift 2

LOG="/tmp/perf-$NAME-app.log"
UNIT="rn-gtkx-hover-probe"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROBE="$REPO_ROOT/examples/hover-probe"
[ -f "$PROBE/dist/bundle.js" ] || {
  echo "missing $PROBE/dist/bundle.js — build the probe first" >&2
  exit 1
}

# Other example windows steal focus, and the maximize keystroke / pointer
# motion would land on whichever window has it.
systemctl --user stop rn-gtkx-app rn-gtkx-hnapp rn-gtkx-prim rn-gtkx-perf "$UNIT" 2>/dev/null || true
systemctl --user reset-failed rn-gtkx-app rn-gtkx-hnapp rn-gtkx-prim rn-gtkx-perf "$UNIT" 2>/dev/null || true
sleep 1

rm -f "$LOG"
# shellcheck disable=SC2086
systemd-run --user --unit="$UNIT" --setenv=WAYLAND_DISPLAY=wayland-0 \
  --setenv=GTKX_PERF=1 --setenv=HOVER_MODE="$MODE" \
  $(for kv in "$@"; do printf -- '--setenv=%s ' "$kv"; done) \
  --working-directory="$PROBE" \
  bash -c "node dist/bundle.js > $LOG 2>&1"

SOCK=/tmp/.ydotool.sock
sudo pkill ydotoold 2>/dev/null || true
sleep 0.5
sudo ydotoold --socket-path "$SOCK" --socket-own "$(id -u):$(id -g)" \
  >/tmp/ydotoold-hover.log 2>&1 &
export YDOTOOL_SOCKET="$SOCK"

# Let the window map and settle before maximizing, so the maximized
# geometry is what the whole run happens against — same reasoning as
# run-probe-session.sh's --maximize path.
sleep 3
# Super+Up is the GNOME maximize binding. 125 = KEY_LEFTMETA, 103 = KEY_UP.
ydotool key 125:1 103:1 103:0 125:0
sleep 2

# Read the phase durations the app logged so the sweep covers the whole
# run without needing to parse PERF_DONE first (the sweep loop below just
# needs to not stop early).
IDLE_MS=6000
SCROLL_MS=10000
for kv in "$@"; do
  case "$kv" in
    HOVER_IDLE_MS=*) IDLE_MS="${kv#HOVER_IDLE_MS=}" ;;
    HOVER_SCROLL_MS=*) SCROLL_MS="${kv#HOVER_SCROLL_MS=}" ;;
  esac
done
SWEEP_SECONDS=$(( (IDLE_MS + SCROLL_MS) / 1000 + 4 ))

# Clamp to the top-left corner (relative moves accumulate from wherever the
# cursor currently is; a huge negative delta clamps it at the screen edge
# regardless of starting position), then move inward, well clear of the
# titlebar/edges, before sweeping. The window is maximized, so this lands
# inside the row list regardless of the window's actual on-screen position.
ydotool mousemove -- -50000 -50000
sleep 0.2
ydotool mousemove -- 120 160

echo "SWEEPING for ${SWEEP_SECONDS}s over $UNIT ($MODE)"
END=$((SECONDS + SWEEP_SECONDS))
DIRECTION=1
STEP=18
TRAVELLED=0
SPAN=500
while [ $SECONDS -lt $END ]; do
  ydotool mousemove -- 0 $((DIRECTION * STEP))
  TRAVELLED=$((TRAVELLED + STEP))
  if [ $TRAVELLED -ge $SPAN ]; then
    DIRECTION=$((DIRECTION * -1))
    TRAVELLED=0
  fi
done

for _ in $(seq 1 30); do
  if grep -q "^PERF_DONE" "$LOG" 2>/dev/null; then
    break
  fi
  if ! systemctl --user is-active --quiet "$UNIT"; then
    echo "APP EXITED EARLY"
    break
  fi
  sleep 1
done

systemctl --user stop "$UNIT" 2>/dev/null || true
sudo pkill ydotoold 2>/dev/null || true
echo "LOG=$LOG"
