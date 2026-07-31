#!/usr/bin/env node
// Scroll-perf probe runner for the REAL desktop session, as opposed to the
// private headless sway of run-probe.ts.
//
// Why both exist: headless renders through pixman, the session through
// llvmpipe/EGL-Zink. Those scale differently with window area, so the
// "maximized is worse" report can only be settled where the user saw it.
//
// Runs ON the VM, inside the graphical session:
//   node scripts/perf/run-probe-session.ts <name> [--maximize] [KEY=VAL ...]
// Log: /tmp/perf-<name>-app.log
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { sleep, waitForLogMarker } from "../lib/headless-sway.ts"
import { run, runCheck, runDetached, runQuiet } from "../lib/proc.ts"

const [name, ...rest] = process.argv.slice(2)
if (!name) {
  console.error("usage: run-probe-session.ts <name> [--maximize] [KEY=VAL ...]")
  process.exit(1)
}
const maximize = rest[0] === "--maximize"
const extra = maximize ? rest.slice(1) : rest

const log = `/tmp/perf-${name}-app.log`
const unit = "rn-gtkx-perf"
process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

const REPO_ROOT = join(import.meta.dirname, "../..")
const PROBE = join(REPO_ROOT, "examples/perf-probe")
if (!existsSync(join(PROBE, "dist/bundle.js"))) {
  console.error(`missing ${PROBE}/dist/bundle.js — build the probe first`)
  process.exit(1)
}

// Other example windows steal focus, and a maximize keystroke would land on
// whichever window has it.
const otherUnits = ["rn-gtkx-app", "rn-gtkx-hnapp", "rn-gtkx-prim", unit]
await runQuiet("systemctl", ["--user", "stop", ...otherUnits])
await runQuiet("systemctl", ["--user", "reset-failed", ...otherUnits])
await sleep(1000)

rmSync(log, { force: true })
await run("systemd-run", [
  "--user",
  `--unit=${unit}`,
  "--setenv=WAYLAND_DISPLAY=wayland-0",
  "--setenv=GTKX_PERF=1",
  ...extra.map((kv) => `--setenv=${kv}`),
  `--working-directory=${PROBE}`,
  "bash",
  "-c",
  `node dist/bundle.js > ${log} 2>&1`,
])

if (maximize) {
  const sock = "/tmp/.ydotool.sock"
  await runQuiet("sudo", ["pkill", "ydotoold"])
  await sleep(500)
  runDetached(
    "sudo",
    [
      "ydotoold",
      "--socket-path",
      sock,
      "--socket-own",
      `${process.getuid?.()}:${process.getgid?.()}`,
    ],
    "/tmp/ydotoold-perf.log",
  )
  // Let the window map and settle before the compositor resizes it, so the
  // maximized geometry is what the scroll phases actually run against.
  await sleep(4000)
  // Super+Up is the GNOME maximize binding. 125 = KEY_LEFTMETA, 103 = KEY_UP.
  await run("ydotool", ["key", "125:1", "103:1", "103:0", "125:0"], {
    env: { ...process.env, YDOTOOL_SOCKET: sock },
  })
  await sleep(2000)
}

await waitForLogMarker(log, "PERF_DONE", {
  attempts: 110,
  intervalMs: 2000,
  anchored: true,
  isAlive: async () => {
    const active = await runCheck("systemctl", [
      "--user",
      "is-active",
      "--quiet",
      unit,
    ])
    if (!active) {
      console.log("APP EXITED EARLY")
    }
    return active
  },
})

await runQuiet("systemctl", ["--user", "stop", unit])
await runQuiet("sudo", ["pkill", "ydotoold"])
console.log(`LOG=${log}`)
