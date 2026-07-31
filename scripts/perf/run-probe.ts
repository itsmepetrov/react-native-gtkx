#!/usr/bin/env node
// Scroll-perf probe runner (perf-scroll branch). Starts a PRIVATE headless
// sway (perf-prefixed /tmp names — other sessions share this VM), runs the
// built perf-probe bundle with GTKX_PERF=1 plus any extra KEY=VAL env pairs,
// waits for PERF_DONE, screenshots, and exits. Runs ON the VM:
//   node scripts/perf/run-probe.ts <name> <WxH> [KEY=VAL ...]
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
  console.error("usage: run-probe.ts <name> <WxH> [KEY=VAL ...]")
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

const PROBE_DIR = join(import.meta.dirname, "../../examples/perf-probe")

try {
  const logFd = openSync(log, "w")
  const app = spawn("timeout", ["240", "node", "dist/bundle.js"], {
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
    attempts: 110,
    intervalMs: 2000,
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
