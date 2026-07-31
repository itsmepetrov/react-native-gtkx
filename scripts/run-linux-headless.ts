#!/usr/bin/env node
// Run an app through `react-native run-linux` (codegen ensure -> Metro ->
// Node+GTK host) under a headless sway and screenshot the window.
// usage: run-linux-headless.ts <app-dir> [out.png]
import { spawn, spawnSync } from "node:child_process"
import { openSync, readFileSync } from "node:fs"
import {
  isProcessAlive,
  sleep,
  startHeadlessSway,
  tailLines,
  waitForLogMarker,
} from "./lib/headless-sway.ts"

const [appDir, outArg] = process.argv.slice(2)
if (!appDir) {
  console.error("usage: run-linux-headless.ts <app-dir> [out.png]")
  process.exit(1)
}
const out = outArg ?? "/tmp/run-linux-shot.png"
const log = "/tmp/run-linux-headless.log"

process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

const { proc: sway, socket } = await startHeadlessSway(
  "/tmp/sway-run-linux.conf",
  "640x480",
  "/tmp/sway-run-linux.log",
)
console.log(`SOCKET=${socket}`)

try {
  const logFd = openSync(log, "w")
  const app = spawn("timeout", ["180", "npx", "react-native", "run-linux"], {
    cwd: appDir,
    env: {
      ...process.env,
      WAYLAND_DISPLAY: socket,
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent",
    },
    stdio: ["ignore", logFd, logFd],
  })

  // Wait for Metro to finish, then give the host a moment to map the window.
  await waitForLogMarker(log, "Done writing bundle output", {
    attempts: 30,
    intervalMs: 5000,
    isAlive: () => isProcessAlive(app),
  })
  await sleep(8000)

  spawnSync("grim", [out], {
    env: { ...process.env, WAYLAND_DISPLAY: socket },
    stdio: "inherit",
  })
  console.log(`SHOT-OK ${out}`)

  app.kill()
} finally {
  sway.kill()
}

console.log("--- host log ---")
console.log(tailLines(readFileSync(log, "utf8"), 20))
