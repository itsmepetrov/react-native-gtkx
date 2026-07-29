#!/usr/bin/env bash
# Local VM dev loop (a Linux desktop guest in a native window) — the primary
# macOS workflow: no container, native GTK, apps launch straight into the VM's
# desktop session. See CONTRIBUTING for the one-time VM setup.
#
# Host address and paths are machine-specific: export VM_HOST (user@host) or
# put exports into scripts/local/env.sh (gitignored).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$REPO_ROOT/scripts/local/env.sh" ]; then
  # shellcheck disable=SC1091
  . "$REPO_ROOT/scripts/local/env.sh"
fi
VM_HOST="${VM_HOST:?set VM_HOST (user@vm-address), e.g. in scripts/local/env.sh}"
VM_DIR="${VM_DIR:-dev/react-native-gtkx}"

case "${1:-}" in
  sync)
    rsync -az --delete \
      --exclude .git --exclude node_modules --exclude shots \
      --exclude dist --exclude out-tsc --exclude '*.log' \
      "$REPO_ROOT/" "$VM_HOST:$VM_DIR/"
    ;;
  run)
    shift
    ssh "$VM_HOST" "cd $VM_DIR && bash -lc '$*'"
    ;;
  app)
    # Launch a built example inside the VM's desktop session (native window).
    # systemd-run detaches cleanly (a plain nohup keeps the ssh channel open);
    # reset-failed first — a crashed previous run leaves the transient unit in
    # the failed state and systemd-run refuses to reuse the name.
    APP_DIR="${2:?usage: vm.sh app examples/<name>}"
    ssh "$VM_HOST" "export XDG_RUNTIME_DIR=/run/user/\$(id -u); systemctl --user stop rn-gtkx-app 2>/dev/null; systemctl --user reset-failed rn-gtkx-app 2>/dev/null; systemd-run --user --unit=rn-gtkx-app --setenv=WAYLAND_DISPLAY=wayland-0 --working-directory=\$HOME/$VM_DIR/$APP_DIR node dist/bundle.js && echo 'APP RUNNING (check the VM window)'"
    ;;
  app-stop)
    ssh "$VM_HOST" "pkill -f 'node .*dist/bundle.js'" || true
    ;;
  shell)
    ssh -t "$VM_HOST"
    ;;
  *)
    echo "usage: vm.sh sync | run <cmd> | app examples/<name> | app-stop | shell" >&2
    exit 1
    ;;
esac
