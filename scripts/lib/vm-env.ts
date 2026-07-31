// Shared VM connection config for scripts/vm.ts and scripts/dev-loop.ts: both
// need VM_HOST/VM_DIR from the environment or scripts/local/env.sh (a
// per-developer, gitignored file of plain KEY=VALUE lines — see
// CONTRIBUTING.md), and both push the repo into the VM the same way. One
// place for the env lookup and the rsync exclude list keeps the two scripts
// from drifting apart.
import { spawnSync, type SpawnSyncOptions } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Reads scripts/local/env.sh (plain KEY=VALUE lines) into process.env,
 * without overwriting anything already set there — so `VM_DIR=... node
 * scripts/foo.ts` on the command line always wins over the file. Not a
 * script to execute: a small line parser is simpler and safer than shelling
 * out to source it.
 */
export const loadLocalEnv = (repoRoot: string): void => {
  const envFile = join(repoRoot, "scripts/local/env.sh")
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

export interface VmEnv {
  vmHost: string
  vmDir: string
}

/**
 * Loads scripts/local/env.sh, then requires VM_HOST (exits the process with
 * a usage message if unset — every VM script needs it to do anything).
 * `defaultVmDir` lets a script fall back to its own directory when nothing
 * sets VM_DIR at all; scripts/local/env.sh (if it defines VM_DIR) or an
 * exported shell variable both take precedence over it either way.
 */
export const resolveVmEnv = (
  repoRoot: string,
  defaultVmDir = "dev/react-native-gtkx",
): VmEnv => {
  loadLocalEnv(repoRoot)
  const vmHost = process.env.VM_HOST
  if (!vmHost) {
    console.error("set VM_HOST (user@vm-address), e.g. in scripts/local/env.sh")
    process.exit(1)
  }
  return { vmHost, vmDir: process.env.VM_DIR ?? defaultVmDir }
}

// node_modules is reinstalled VM-side (see the vm skill's "npm install
// prunes the codegen store" quirk); dist/out-tsc/logs are build artifacts
// that don't need to travel either way.
const RSYNC_EXCLUDES = [
  ".git",
  "node_modules",
  "shots",
  "dist",
  "out-tsc",
  "*.log",
]

/**
 * Runs `rsync -az --delete <repoRoot>/ <vmHost>:<vmDir>/` with stdio
 * inherited, and returns the spawnSync result instead of exiting — callers
 * that need to keep going afterward (dev-loop.ts, timing its own sync step)
 * can check `result.status` themselves instead of the process dying here.
 */
export const syncToVm = (
  repoRoot: string,
  vmHost: string,
  vmDir: string,
  options: SpawnSyncOptions = {},
) =>
  spawnSync(
    "rsync",
    [
      "-az",
      "--delete",
      ...RSYNC_EXCLUDES.flatMap((pattern) => ["--exclude", pattern]),
      `${repoRoot}/`,
      `${vmHost}:${vmDir}/`,
    ],
    { stdio: "inherit", ...options },
  )
