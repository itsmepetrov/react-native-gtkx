#!/usr/bin/env bash
# VM-side: native screenshots of every gallery section for docs/shots/gallery/.
# Runs inside a real GNOME session: each section is launched as a window and
# captured with GNOME's own Alt+Print (full Adwaita frame + shadow, HiDPI),
# pressed by a virtual keyboard — the Shell's screenshot D-Bus API is
# allowlisted and unreachable from scripts, key injection is not.
# Needs ydotool + passwordless sudo (a dev sandbox); see .claude/skills/vm.
# usage: run on the Linux host/VM from anywhere: bash scripts/gallery-shots-vm.sh
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
SHOTS_DIR="$(xdg-user-dir PICTURES)/Screenshots"
mkdir -p "$SHOTS_DIR"
OUT=/tmp/gallery-shots
mkdir -p "$OUT"
SOCK=/tmp/.ydotool.sock

sudo pkill ydotoold 2>/dev/null || true
sleep 0.5
sudo ydotoold --socket-path "$SOCK" --socket-own "$(id -u):$(id -g)" >/tmp/ydotoold.log 2>&1 &
trap 'sudo pkill ydotoold 2>/dev/null || true' EXIT
sleep 1.5

# Alt+Print captures the FOCUSED window — close interactive example
# windows first or they steal every frame.
systemctl --user stop rn-gtkx-app rn-gtkx-hnapp 2>/dev/null || true
sleep 1

GALLERY="$(cd "$(dirname "$0")/../examples/gallery" && pwd)"
[ -f "$GALLERY/dist/bundle.js" ] || {
  echo "missing $GALLERY/dist/bundle.js — build the gallery first" >&2
  exit 1
}

press_alt_print() { YDOTOOL_SOCKET="$SOCK" ydotool key 56:1 99:1 99:0 56:0; }
newest() { ls -t "$SHOTS_DIR"/*.png 2>/dev/null | head -1; }

shot_section() {
  local id="$1" warm="$2" unit=rn-gtkx-gallery-shot
  systemctl --user stop "$unit" 2>/dev/null || true
  systemctl --user reset-failed "$unit" 2>/dev/null || true
  local before
  before=$(newest || true)
  systemd-run --user --unit="$unit" --setenv=WAYLAND_DISPLAY=wayland-0 \
    --setenv=GALLERY_SECTION="$id" \
    --working-directory="$GALLERY" node dist/bundle.js
  sleep "$warm"
  press_alt_print
  for _ in $(seq 1 10); do
    sleep 1
    local now
    now=$(newest || true)
    if [ -n "$now" ] && [ "$now" != "$before" ]; then
      cp "$now" "$OUT/$id.png"
      systemctl --user stop "$unit" 2>/dev/null || true
      echo "SHOT $id"
      sleep 1
      return 0
    fi
  done
  systemctl --user stop "$unit" 2>/dev/null || true
  echo "NO-SHOT $id" >&2
  return 0
}

for id in views text layout inputs buttons lists toggles animated modal apis; do
  shot_section "$id" 5
done
shot_section media 9 # the remote-image demo needs a network fetch first
echo "DONE: $(ls "$OUT" | wc -l) screenshots in $OUT"
