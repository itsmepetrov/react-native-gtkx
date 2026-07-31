#!/usr/bin/env node
// Headless smoke test for examples/hover-probe (task 007, hover-perf epic):
// same private-headless-sway pattern as run-probe.ts, just pointed at the
// hover probe. No pointer motion here — this only proves the app boots,
// renders, drives its scroll phase and exits cleanly under GTKX_PERF=1.
// Real hover-latency numbers need a real pointer, see
// run-hover-probe-session.ts. Runs ON the VM:
//   node scripts/perf/run-hover-probe.ts <name> <WxH> [KEY=VAL ...]
// Log: /tmp/perf-<name>-app.log  Shot: /tmp/perf-<name>-shot.png
import { spawn, spawnSync } from "node:child_process"
import { openSync } from "node:fs"
import { join } from "node:path"
import {
  isProcessAlive,
  startHeadlessSway,
  waitForLogMarker,
} from "../lib/headless-sway.ts"

const [name, res, ...extra] = process.argv.slice(2)
if (!name || !res) {
  console.error("usage: run-hover-probe.ts <name> <WxH> [KEY=VAL ...]")
  process.exit(1)
}

const extraEnv: Record<string, string> = {}
for (const kv of extra) {
  const eq = kv.indexOf("=")
  if (eq !== -1) {
    extraEnv[kv.slice(0, eq)] = kv.slice(eq + 1)
  }
}

const prefix = `/tmp/perf-${name}`
const log = `${prefix}-app.log`
process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

const { proc: sway, socket } = await startHeadlessSway(
  `${prefix}-sway.conf`,
  res,
  `${prefix}-sway.log`,
)
console.log(`SOCKET=${socket}`)

const PROBE_DIR = join(import.meta.dirname, "../../examples/hover-probe")

try {
  const logFd = openSync(log, "w")
  const app = spawn("timeout", ["60", "node", "dist/bundle.js"], {
    cwd: PROBE_DIR,
    env: {
      ...process.env,
      WAYLAND_DISPLAY: socket,
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent",
      GTKX_PERF: "1",
      ...extraEnv,
    },
    stdio: ["ignore", logFd, logFd],
  })

  await waitForLogMarker(log, "PERF_DONE", {
    attempts: 40,
    intervalMs: 1000,
    anchored: true,
    isAlive: () => {
      if (!isProcessAlive(app)) {
        console.log("APP EXITED EARLY")
        return false
      }
      return true
    },
  })

  spawnSync("grim", [`${prefix}-shot.png`], {
    env: { ...process.env, WAYLAND_DISPLAY: socket },
    stdio: "inherit",
  })
  console.log(`SHOT-OK ${prefix}-shot.png`)

  app.kill()
} finally {
  sway.kill()
}

console.log(`LOG=${log}`)
