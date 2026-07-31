#!/usr/bin/env node
// run-linux-headless.ts variant for the hn-app verification loop: hnapp-
// prefixed conf/log/output names (the stock script's fixed /tmp names collide
// with parallel sessions) and a three-shot sequence instead of a single
// screenshot. The app is started with HN_APP_PROOF=1 — the dev-only hook in
// examples/hn-app/src/App.tsx scrolls the list, opens a story and goes back,
// logging a marker before each stage; the shots are paced by those markers:
//   <prefix>-list.png    the scrolled story list
//   <prefix>-story.png   the story screen with comments loaded
//   <prefix>-return.png  the list again — the offset still there proves the
//                        overlay approach preserves the FlatList state
// usage: run-linux-headless-hnapp.ts <app-dir> [out-prefix]
import { spawn, spawnSync } from "node:child_process"
import { openSync, readFileSync } from "node:fs"
import {
  sleep,
  startHeadlessSway,
  tailLines,
  waitForLogMarker,
} from "./lib/headless-sway.ts"

const [appDir, prefixArg] = process.argv.slice(2)
if (!appDir) {
  console.error("usage: run-linux-headless-hnapp.ts <app-dir> [out-prefix]")
  process.exit(1)
}
const prefix = prefixArg ?? "/tmp/hnapp"
const log = "/tmp/hnapp-run-linux.log"

process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

const { proc: sway, socket } = await startHeadlessSway(
  "/tmp/hnapp-sway.conf",
  "640x800",
  "/tmp/hnapp-sway.log",
)
console.log(`SOCKET=${socket}`)

// Blocks until the app logs a proof marker (the hook paces itself; markers
// only appear after the first page has rendered).
const requireMarker = async (marker: string): Promise<void> => {
  const outcome = await waitForLogMarker(log, marker, {
    attempts: 60,
    intervalMs: 2000,
  })
  if (outcome !== "found") {
    console.error(`TIMEOUT waiting for marker: ${marker}`)
    process.exit(1)
  }
}

const shot = (name: string): void => {
  spawnSync("grim", [`${prefix}-${name}.png`], {
    env: { ...process.env, WAYLAND_DISPLAY: socket },
    stdio: "inherit",
  })
  console.log(`SHOT-OK ${prefix}-${name}.png`)
}

try {
  const logFd = openSync(log, "w")
  const app = spawn("timeout", ["240", "npx", "react-native", "run-linux"], {
    cwd: appDir,
    env: {
      ...process.env,
      WAYLAND_DISPLAY: socket,
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent",
      HN_APP_PROOF: "1",
    },
    stdio: ["ignore", logFd, logFd],
  })

  await requireMarker("HN_APP_PROOF scrolled")
  await sleep(3000) // let the scroll allocation settle
  shot("list")

  await requireMarker("HN_APP_PROOF story-open")
  await sleep(20000) // the comment tree fetches one request per node — let it fill in
  shot("story")

  await requireMarker("HN_APP_PROOF back")
  await sleep(3000)
  shot("return")

  app.kill()
} finally {
  sway.kill()
}

console.log("--- host log ---")
console.log(tailLines(readFileSync(log, "utf8"), 20))
