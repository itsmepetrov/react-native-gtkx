// Small async process helpers for the systemd/ydotool session scripts
// (perf/run-probe-session.ts, perf/run-hover-probe-session.ts,
// gallery-shots-vm.ts): these launch into the VM's real desktop session,
// where output usually matters (systemd-run announces the unit name) but
// cleanup calls are expected to fail harmlessly and should stay quiet,
// exactly like the shell scripts' `... 2>/dev/null || true`.
import { spawn, type ChildProcess } from "node:child_process"
import { openSync } from "node:fs"

export interface RunOptions {
  env?: NodeJS.ProcessEnv
  cwd?: string
}

/** Runs a command to completion with inherited stdio; resolves with its exit code. */
export const run = (
  command: string,
  args: string[] = [],
  options: RunOptions = {},
): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", ...options })
    child.on("error", () => resolve(1))
    child.on("close", (code) => resolve(code ?? 1))
  })

/** Like `run`, but discards stdio and never rejects — matches `cmd 2>/dev/null || true`. */
export const runQuiet = (
  command: string,
  args: string[] = [],
  options: RunOptions = {},
): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", ...options })
    child.on("error", () => resolve(1))
    child.on("close", (code) => resolve(code ?? 1))
  })

/** Runs a command and reports whether it exited 0 (e.g. `systemctl is-active`). */
export const runCheck = async (
  command: string,
  args: string[] = [],
  options: RunOptions = {},
): Promise<boolean> => (await runQuiet(command, args, options)) === 0

/**
 * Starts a detached background process with its output redirected to a log
 * file, and does not wait for it to exit — the caller is responsible for
 * killing it later (e.g. `pkill ydotoold`).
 */
export const runDetached = (
  command: string,
  args: string[],
  logFile: string,
  options: RunOptions = {},
): ChildProcess => {
  const fd = openSync(logFile, "w")
  const child = spawn(command, args, {
    stdio: ["ignore", fd, fd],
    detached: true,
    ...options,
  })
  child.unref()
  return child
}
