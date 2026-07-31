#!/usr/bin/env node
// Real-session hover-latency measurement (task 007, hover-perf epic):
// launches examples/hover-probe in the actual GNOME session, maximizes it
// (so the window's bounds are known without reading its on-screen position),
// and drives a REAL pointer with ydotool back and forth across the row
// column for the whole run — the "fast mouse movement" the report
// describes, not a simulated one. GTKX_PERF=1 makes the app self-report
// (see examples/hover-probe/src/index.tsx for the two arms and their
// counters).
//
// Runs ON the VM, inside the graphical session:
//   node scripts/perf/run-hover-probe-session.ts <name> <HOVER_MODE> [KEY=VAL ...]
// Log: /tmp/perf-<name>-app.log
import { spawnSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { sleep, waitForLogMarker } from "../lib/headless-sway.ts"
import { run, runCheck, runDetached, runQuiet } from "../lib/proc.ts"

const [name, mode, ...extra] = process.argv.slice(2)
if (!name || !mode) {
  console.error(
    "usage: run-hover-probe-session.ts <name> <pressable|native> [KEY=VAL ...]",
  )
  process.exit(1)
}

const log = `/tmp/perf-${name}-app.log`
const unit = "rn-gtkx-hover-probe"
process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

const REPO_ROOT = join(import.meta.dirname, "../..")
const PROBE = join(REPO_ROOT, "examples/hover-probe")
if (!existsSync(join(PROBE, "dist/bundle.js"))) {
  console.error(`missing ${PROBE}/dist/bundle.js — build the probe first`)
  process.exit(1)
}

// Other example windows steal focus, and the maximize keystroke / pointer
// motion would land on whichever window has it.
const otherUnits = [
  "rn-gtkx-app",
  "rn-gtkx-hnapp",
  "rn-gtkx-prim",
  "rn-gtkx-perf",
  unit,
]
await runQuiet("systemctl", ["--user", "stop", ...otherUnits])
await runQuiet("systemctl", ["--user", "reset-failed", ...otherUnits])
await sleep(1000)

rmSync(log, { force: true })
await run("systemd-run", [
  "--user",
  `--unit=${unit}`,
  "--setenv=WAYLAND_DISPLAY=wayland-0",
  "--setenv=GTKX_PERF=1",
  `--setenv=HOVER_MODE=${mode}`,
  ...extra.map((kv) => `--setenv=${kv}`),
  `--working-directory=${PROBE}`,
  "bash",
  "-c",
  `node dist/bundle.js > ${log} 2>&1`,
])

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
  "/tmp/ydotoold-hover.log",
)
process.env.YDOTOOL_SOCKET = sock

// Let the window map and settle before maximizing, so the maximized
// geometry is what the whole run happens against — same reasoning as
// run-probe-session.ts's --maximize path.
await sleep(3000)
// Super+Up is the GNOME maximize binding. 125 = KEY_LEFTMETA, 103 = KEY_UP.
await run("ydotool", ["key", "125:1", "103:1", "103:0", "125:0"])
await sleep(2000)

// Read the phase durations the app logged so the sweep covers the whole
// run without needing to parse PERF_DONE first (the sweep loop below just
// needs to not stop early).
let idleMs = 6000
let scrollMs = 10000
for (const kv of extra) {
  if (kv.startsWith("HOVER_IDLE_MS=")) {
    idleMs = Number(kv.slice("HOVER_IDLE_MS=".length))
  } else if (kv.startsWith("HOVER_SCROLL_MS=")) {
    scrollMs = Number(kv.slice("HOVER_SCROLL_MS=".length))
  }
}
const sweepSeconds = Math.floor((idleMs + scrollMs) / 1000) + 4

// Clamp to the top-left corner (relative moves accumulate from wherever the
// cursor currently is; a huge negative delta clamps it at the screen edge
// regardless of starting position), then move inward, well clear of the
// titlebar/edges, before sweeping. The window is maximized, so this lands
// inside the row list regardless of the window's actual on-screen position.
const mouseMove = (dx: number, dy: number): void => {
  spawnSync("ydotool", ["mousemove", "--", String(dx), String(dy)], {
    env: process.env,
  })
}
mouseMove(-50000, -50000)
await sleep(200)
mouseMove(120, 160)

console.log(`SWEEPING for ${sweepSeconds}s over ${unit} (${mode})`)
const end = Date.now() + sweepSeconds * 1000
let direction = 1
const step = 18
let travelled = 0
const span = 500
while (Date.now() < end) {
  mouseMove(0, direction * step)
  travelled += step
  if (travelled >= span) {
    direction *= -1
    travelled = 0
  }
}

await waitForLogMarker(log, "PERF_DONE", {
  attempts: 30,
  intervalMs: 1000,
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
