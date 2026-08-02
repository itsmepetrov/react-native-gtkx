#!/usr/bin/env node
// Local VM dev loop (a Linux desktop guest in a native window) — the primary
// macOS workflow: no container, native GTK, apps launch straight into the VM's
// desktop session. See CONTRIBUTING for the one-time VM setup.
//
// Host address and paths are machine-specific: export VM_HOST (user@host) or
// put exports into scripts/local/env.sh (gitignored). See scripts/dev-loop.ts
// for the cheap HMR-based iteration loop (no build step) that complements
// this script's `app`/`app-stop` (which launch a BUILT bundle).
import { spawnSync, type SpawnSyncOptions } from "node:child_process"
import { join } from "node:path"
import { resolveVmEnv, syncToVm } from "./lib/vm-env.ts"

const REPO_ROOT = join(import.meta.dirname, "..")
const { vmHost: VM_HOST, vmDir: VM_DIR } = resolveVmEnv(REPO_ROOT)

// Runs a command with stdio inherited (the child's output goes straight to
// ours, matching the shell script's behavior) and exits the process with
// the child's own status — this function never returns.
const runInherit = (
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): never => {
  const result = spawnSync(command, args, { stdio: "inherit", ...options })
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
}

const [command, ...rest] = process.argv.slice(2)

if (command === "sync") {
  const result = syncToVm(REPO_ROOT, VM_HOST, VM_DIR)
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
} else if (command === "run") {
  const remoteCommand = rest.join(" ")
  runInherit("ssh", [VM_HOST, `cd ${VM_DIR} && bash -lc '${remoteCommand}'`])
} else if (command === "app") {
  // Launch a built example inside the VM's desktop session (native window).
  // systemd-run detaches cleanly (a plain nohup keeps the ssh channel open);
  // reset-failed first — a crashed previous run leaves the transient unit in
  // the failed state and systemd-run refuses to reuse the name.
  const appDir = rest[0]
  if (!appDir) {
    console.error("usage: vm.ts app examples/<name>")
    process.exit(1)
  }
  const remote =
    "export XDG_RUNTIME_DIR=/run/user/$(id -u); " +
    "systemctl --user stop rn-gtkx-app 2>/dev/null; " +
    "systemctl --user reset-failed rn-gtkx-app 2>/dev/null; " +
    "systemd-run --user --unit=rn-gtkx-app --setenv=WAYLAND_DISPLAY=wayland-0 " +
    `--working-directory=$HOME/${VM_DIR}/${appDir} node dist/bundle.js ` +
    "&& echo 'APP RUNNING (check the VM window)'"
  runInherit("ssh", [VM_HOST, remote])
} else if (command === "app-stop") {
  // Stops the unit `app` started, and nothing else. This used to be
  // `pkill -f 'node .*dist/bundle.js'`, which matches EVERY example app on
  // the VM — so stopping one demo took down every other agent's window and
  // whatever the user was looking at. The pattern cannot tell them apart;
  // the unit name can.
  //
  // `|| true` on the stop, as before: succeeds whether or not it was running.
  spawnSync(
    "ssh",
    [
      VM_HOST,
      "export XDG_RUNTIME_DIR=/run/user/$(id -u); " +
        "systemctl --user stop rn-gtkx-app 2>/dev/null; " +
        "systemctl --user reset-failed rn-gtkx-app 2>/dev/null; true",
    ],
    { stdio: "inherit" },
  )
  process.exit(0)
} else if (command === "shell") {
  runInherit("ssh", ["-t", VM_HOST])
} else {
  console.error(
    "usage: vm.ts sync | run <cmd> | app examples/<name> | app-stop | shell",
  )
  process.exit(1)
}
