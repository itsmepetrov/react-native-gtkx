#!/usr/bin/env node
// Local VM dev loop (a Linux desktop guest in a native window) — the primary
// macOS workflow: no container, native GTK, apps launch straight into the VM's
// desktop session. See CONTRIBUTING for the one-time VM setup.
//
// Host address and paths are machine-specific: export VM_HOST (user@host) or
// put exports into scripts/local/env.sh (gitignored).
import { spawnSync, type SpawnSyncOptions } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dirname, "..")

// scripts/local/env.sh is a per-developer, gitignored file that only ever
// holds plain `KEY=VALUE` lines (see CONTRIBUTING.md) — not a script to
// execute, so a small line parser here is simpler and safer than shelling
// out to source it.
const loadLocalEnv = (): void => {
  const envFile = join(REPO_ROOT, "scripts/local/env.sh")
  if (!existsSync(envFile)) {
    return
  }
  for (const rawLine of readFileSync(envFile, "utf8").split("\n")) {
    const line = rawLine.trim()
    if (line === "" || line.startsWith("#")) {
      continue
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    const key = match?.[1]
    if (key && !(key in process.env)) {
      process.env[key] = match[2]
    }
  }
}

loadLocalEnv()

const VM_HOST = process.env.VM_HOST
if (!VM_HOST) {
  console.error("set VM_HOST (user@vm-address), e.g. in scripts/local/env.sh")
  process.exit(1)
}
const VM_DIR = process.env.VM_DIR ?? "dev/react-native-gtkx"

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
  runInherit("rsync", [
    "-az",
    "--delete",
    "--exclude",
    ".git",
    "--exclude",
    "node_modules",
    "--exclude",
    "shots",
    "--exclude",
    "dist",
    "--exclude",
    "out-tsc",
    "--exclude",
    "*.log",
    `${REPO_ROOT}/`,
    `${VM_HOST}:${VM_DIR}/`,
  ])
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
  // `|| true` in the original: always succeeds, whether or not a process
  // was actually running to kill.
  spawnSync("ssh", [VM_HOST, "pkill -f 'node .*dist/bundle.js'"], {
    stdio: "inherit",
  })
  process.exit(0)
} else if (command === "shell") {
  runInherit("ssh", ["-t", VM_HOST])
} else {
  console.error(
    "usage: vm.ts sync | run <cmd> | app examples/<name> | app-stop | shell",
  )
  process.exit(1)
}
