#!/usr/bin/env node
// Screenshot a vite-path example under its OWN headless compositor.
//
// WHY this exists next to dev-loop.ts: dev-loop screenshots the VM's real
// GNOME session, which has exactly one focused window. That is right for
// README-grade shots, and useless for an A/B comparison — whichever app
// another session launched last owns the screen, and `grim`'s GNOME
// equivalent (Alt+Print) can only capture whatever that is. Two examples
// shot for comparison must also be shot at the SAME size and with the same
// renderer, or the difference being measured is the rig's.
//
// So: one private headless sway per invocation (pixman, fixed resolution,
// no input devices), `gtkx dev` inside it, `grim` on that compositor's own
// socket. Sequential runs are byte-comparable; parallel runs on the same VM
// do not collide, because startHeadlessSway prefixes its conf/log paths.
//
// No pointer control here — this script takes ONE still of an app at rest,
// and that is all most comparisons need. It is not because a pointer is
// impossible: an earlier note here said so, and it was wrong. The
// observations behind it were right (a wlroots seat started with
// WLR_LIBINPUT_NO_DEVICES=1 reports `capabilities: 0, devices: []`, so no
// wl_pointer is advertised; sway's `seat - cursor set X Y` answers
// `success: true` and changes nothing; wlrctl's wlr-virtual-pointer creates
// and destroys its device per invocation, so the capability blinks in and
// out faster than a frame) — but the conclusion did not follow. A process
// that binds zwlr_virtual_pointer_manager_v1 itself and KEEPS the device
// for the whole session gives the seat a real pointer for as long as it
// lives. packages/react-native-gtkx/tests/gtk/support/virtual-pointer.ts
// does that, and a drag on this rig was screenshotted with it (see
// docs/research/react-native-first-showcase.md). Reach for it when a shot
// needs a pointer; hover STYLING is still cheaper to cover through
// tests/gtk/components/pressable-hover.gtk.test.tsx, which drives the real
// EventControllerMotion signal.
//
// Usage (in the VM):
//   node scripts/shot-example-headless.ts examples/tasks-app /tmp/a.png \
//     [--resolution=1100x760] [--wait-ms=25000] [--tag=name]
import { spawn, spawnSync } from "node:child_process"
import { openSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  isProcessAlive,
  sleep,
  startHeadlessSway,
} from "./lib/headless-sway.ts"

const REPO = join(import.meta.dirname, "..")

const args = process.argv.slice(2)
const positional = args.filter((arg) => !arg.startsWith("--"))
const flag = (name: string): string | undefined =>
  args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=")

const example = positional[0]
const out = positional[1]
if (!example || !out) {
  console.error(
    "usage: node scripts/shot-example-headless.ts <examples/name> <out.png> [--resolution=WxH] [--wait-ms=n] [--tag=name]",
  )
  process.exit(2)
}

const resolution = flag("resolution") ?? "1100x760"
const waitMs = Number(flag("wait-ms") ?? 25000)
// Distinct conf/log prefixes per tag so two of these can run at once.
const tag = flag("tag") ?? example.replace(/[^a-z0-9]+/gi, "-")
const log = `/tmp/shot-${tag}.log`

process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

const { proc: sway, socket } = await startHeadlessSway(
  `/tmp/sway-shot-${tag}.conf`,
  resolution,
  `/tmp/sway-shot-${tag}.log`,
)
if (!socket) {
  console.error("headless sway did not report a wayland display")
  process.exit(1)
}

let dev: ReturnType<typeof spawn> | undefined
try {
  const logFd = openSync(log, "w")
  dev = spawn("npx", ["gtkx", "dev"], {
    cwd: join(REPO, example),
    env: {
      ...process.env,
      WAYLAND_DISPLAY: socket,
      // No session bus in here: these examples register application-level
      // actions and (tasks-nav) send Gio.Notifications, and a headless run
      // must not talk to the real session's shell.
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent",
    },
    stdio: ["ignore", logFd, logFd],
  })

  // Poll for the runner's own readiness line rather than sleeping blind —
  // the same marker dev-loop.ts waits on — then settle for one beat so the
  // first frame is painted before grim asks for it.
  const deadline = Date.now() + waitMs
  let ready = false
  while (Date.now() < deadline) {
    await sleep(500)
    if (!isProcessAlive(dev)) {
      break
    }
    if (readFileSync(log, "utf8").includes("HMR enabled")) {
      ready = true
      break
    }
  }
  if (!ready) {
    console.error(`gtkx dev did not come up within ${waitMs}ms. Log:`)
    console.error(readFileSync(log, "utf8").slice(-2000))
    process.exit(1)
  }
  await sleep(2500)

  const grim = spawnSync("grim", [out], {
    env: { ...process.env, WAYLAND_DISPLAY: socket },
    stdio: "inherit",
  })
  if (grim.status !== 0) {
    process.exit(grim.status ?? 1)
  }
  console.log(`OK ${out} (${example}, ${resolution})`)
} finally {
  dev?.kill()
  await sleep(500)
  sway.kill()
}
