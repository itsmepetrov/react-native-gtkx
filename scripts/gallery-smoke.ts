#!/usr/bin/env node
// CI smoke check: build the flagship example (Adw profile) and assert the
// BUILT bundle actually stays alive for a few seconds headless. Nothing on
// CI previously launched a built app at all — every gate exercised
// components under the test harness (@gtkx/vitest) or typechecked source,
// neither of which loads the real `gtkx build` output the way a user would
// run it. That gap is exactly how the double-init regression this script
// guards against shipped on main for a day before anyone noticed it by
// hand — see .claude/epics/adw-optional/006-gallery-launch-regression.md.
//
// usage: gallery-smoke.ts [seconds] (default 10)
import { spawn, spawnSync } from "node:child_process"
import { openSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  isProcessAlive,
  sleep,
  startHeadlessSway,
  tailLines,
} from "./lib/headless-sway.ts"

const REPO = join(import.meta.dirname, "..")
const APP = join(REPO, "examples/gallery")
const LOG = "/tmp/gallery-smoke.log"
const aliveSeconds = Number(process.argv[2] ?? "10")

process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

console.log(`[gallery-smoke] building ${APP}`)
const build = spawnSync("npx", ["gtkx", "build"], {
  cwd: APP,
  stdio: "inherit",
})
if (build.status !== 0) {
  console.error("[gallery-smoke] BUILD-FAIL")
  process.exit(1)
}

const { proc: sway, socket } = await startHeadlessSway(
  "/tmp/sway-gallery-smoke.conf",
  "1000x700",
  "/tmp/sway-gallery-smoke.log",
)

try {
  const logFd = openSync(LOG, "w")
  const app = spawn("node", ["dist/bundle.js"], {
    cwd: APP,
    // Its own process group: SIGTERM on the group below reaches a child the
    // built bundle itself spawns too, not just this direct process — the
    // same reasoning gtkx-dev-headless.ts documents for `gtkx dev`.
    detached: true,
    env: {
      ...process.env,
      WAYLAND_DISPLAY: socket,
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent",
    },
    stdio: ["ignore", logFd, logFd],
  })

  await sleep(aliveSeconds * 1000)

  if (isProcessAlive(app)) {
    console.log(`[gallery-smoke] ALIVE after ${aliveSeconds}s`)
  } else {
    console.error(
      `[gallery-smoke] DEAD before ${aliveSeconds}s (exit ${app.exitCode}, signal ${app.signalCode})`,
    )
    process.exitCode = 1
  }

  if (app.pid !== undefined) {
    try {
      process.kill(-app.pid, "SIGTERM")
    } catch {
      // already gone
    }
  }
} finally {
  sway.kill()
}

console.log("--- gallery log ---")
console.log(tailLines(readFileSync(LOG, "utf8"), 30))
