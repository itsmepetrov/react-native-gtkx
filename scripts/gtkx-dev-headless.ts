#!/usr/bin/env node
// Verify the vite dev path: run the gallery through `gtkx dev` under
// headless sway and edit a COMPONENT module on the LIVE app. Asserts the
// gtkx runner performed a Fast Refresh (not a restart) and screenshots
// before/after.
// Usage (in the VM): node scripts/gtkx-dev-headless.ts
import { spawn, spawnSync } from "node:child_process"
import { openSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { sleep, startHeadlessSway } from "./lib/headless-sway.ts"

const REPO = join(import.meta.dirname, "..")
const APP = join(REPO, "examples/gallery")
const TARGET = join(APP, "src/sections/views.tsx")
const LOG = "/tmp/gtkx-dev.log"

const HMR_TITLE = 'title="backgroundColor HMR"'
const BASE_TITLE = 'title="backgroundColor"'

const resetTarget = (): void => {
  const source = readFileSync(TARGET, "utf8")
  writeFileSync(TARGET, source.replace(HMR_TITLE, BASE_TITLE))
}

process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

resetTarget()

const { proc: sway, socket } = await startHeadlessSway(
  "/tmp/sway-gtkx-dev.conf",
  "1000x700",
  "/tmp/sway-gtkx-dev.log",
)

let dev: ReturnType<typeof spawn> | undefined
try {
  const logFd = openSync(LOG, "w")
  dev = spawn("npx", ["gtkx", "dev"], {
    cwd: APP,
    env: {
      ...process.env,
      WAYLAND_DISPLAY: socket,
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent",
    },
    stdio: ["ignore", logFd, logFd],
  })
  await sleep(25000)
  spawnSync("grim", ["/tmp/gtkx-dev-1.png"], {
    env: { ...process.env, WAYLAND_DISPLAY: socket },
    stdio: "inherit",
  })
  console.log("SHOT-1")

  // THE EDIT: a component module — must go through Fast Refresh, no restart.
  writeFileSync(
    TARGET,
    readFileSync(TARGET, "utf8").replace(BASE_TITLE, HMR_TITLE),
  )
  await sleep(8000)
  spawnSync("grim", ["/tmp/gtkx-dev-2.png"], {
    env: { ...process.env, WAYLAND_DISPLAY: socket },
    stdio: "inherit",
  })
  console.log("SHOT-2")

  const log = readFileSync(LOG, "utf8")
  if (log.includes("Fast Refresh complete")) {
    console.log("FAST-REFRESH-OK")
    const matches = log
      .split("\n")
      .filter((line) => /File changed|Fast Refresh/.test(line))
    console.log(matches.slice(-3).join("\n"))
  } else {
    console.log("FAST-REFRESH-FAIL")
    console.log(
      log
        .split("\n")
        .filter((line) => line !== "")
        .slice(-20)
        .join("\n"),
    )
    process.exitCode = 1
  }
} finally {
  resetTarget()
  dev?.kill()
  spawnSync("pkill", ["-f", "gtkx"])
  sway.kill()
}
