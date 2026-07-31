// Shared helper for the headless-sway proofs (run-linux-headless.ts,
// gtkx-dev-headless.ts, perf/run-probe.ts, perf/run-hover-probe.ts): each
// starts its OWN private headless Wayland compositor — prefixed conf/log
// paths, so parallel sessions on the same VM don't collide — and needs its
// WAYLAND_DISPLAY socket name once the compositor is up. Every caller used
// to duplicate this ~15-line dance in shell; one place is worth it in TS.
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { openSync, readFileSync, writeFileSync } from "node:fs"

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export interface HeadlessSway {
  proc: ChildProcess
  socket: string
}

/**
 * Writes a single-output sway config, kills any previous sway using that
 * same config (stale from a crashed run), and starts a fresh one headless
 * (pixman software rendering, no input devices). Returns once the socket
 * name has been read back from the compositor's own log.
 */
export const startHeadlessSway = async (
  confPath: string,
  resolution: string,
  logPath: string,
): Promise<HeadlessSway> => {
  writeFileSync(confPath, `output HEADLESS-1 resolution ${resolution}\n`)
  spawnSync("pkill", ["-f", `sway -V -c ${confPath}`])
  await sleep(500)

  const logFd = openSync(logPath, "w")
  const proc = spawn("sway", ["-V", "-c", confPath], {
    env: {
      ...process.env,
      WLR_BACKENDS: "headless",
      WLR_RENDERER: "pixman",
      WLR_LIBINPUT_NO_DEVICES: "1",
    },
    stdio: ["ignore", logFd, logFd],
  })
  await sleep(2000)
  const log = readFileSync(logPath, "utf8")
  const socket = /wayland display '([^']*)'/.exec(log)?.[1] ?? ""
  return { proc, socket }
}

export type MarkerOutcome = "found" | "dead" | "timeout"

/**
 * Polls a log file for a marker, the way the shell scripts poll with
 * `grep -q MARKER LOG || sleep N`. `anchored` matches `grep -q "^MARKER"`
 * (a whole line must start with it) instead of a plain substring anywhere
 * in the file. `isAlive` lets the caller bail out early (and report it) if
 * the process being watched has already exited.
 */
export const waitForLogMarker = async (
  logPath: string,
  marker: string,
  options: {
    attempts: number
    intervalMs: number
    isAlive?: () => boolean | Promise<boolean>
    anchored?: boolean
  },
): Promise<MarkerOutcome> => {
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    let content = ""
    try {
      content = readFileSync(logPath, "utf8")
    } catch {
      // log not created yet
    }
    const found = options.anchored
      ? content.split("\n").some((line) => line.startsWith(marker))
      : content.includes(marker)
    if (found) {
      return "found"
    }
    if (options.isAlive && !(await options.isAlive())) {
      return "dead"
    }
    await sleep(options.intervalMs)
  }
  return "timeout"
}

/** True while a process spawned with node:child_process is still alive. */
export const isProcessAlive = (proc: ChildProcess): boolean =>
  proc.exitCode === null && proc.signalCode === null

/** Equivalent of `tail -n <n>`, given the file's full contents. */
export const tailLines = (content: string, n: number): string => {
  const lines = content.split("\n")
  if (lines[lines.length - 1] === "") {
    lines.pop()
  }
  return lines.slice(-n).join("\n")
}
