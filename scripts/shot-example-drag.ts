#!/usr/bin/env node
// Drive a REAL drag in a real window, and screenshot it.
//
// WHY this exists next to shot-example-headless.ts. That script takes one
// still of an app at rest, which is the right tool for a layout comparison
// and useless for drag-and-drop: a screenshot of a drop zone proves the zone
// rendered, not that anything can be dropped on it. And a test that asserts
// callbacks fired is not proof either — `tests/gtk/layout/child-order` records
// the bug where a reorder callback fired correctly while the rows redrew
// exactly where they started.
//
// So this is the same private headless sway (pixman, fixed resolution, own
// socket — no collision with a parallel run), plus the virtual pointer the
// GTK tests use. A wlroots seat started with WLR_LIBINPUT_NO_DEVICES=1
// advertises no pointer until something binds
// `zwlr_virtual_pointer_manager_v1` and KEEPS the device; this binds it for
// the whole session, so GTK sees a real seat with a real pointer and the
// compositor -> GDK -> GtkDragSource hop runs for real.
//
// A Wayland pointer is addressed by POSITION, not by focus, so every step is
// a coordinate. That also means the negative control is meaningful: nothing
// outside the path the pointer took can have been touched.
//
// Usage (in the VM):
//   node scripts/shot-example-drag.ts examples/reanimated-dnd /tmp/out \
//     --resolution=900x780 --steps=<script>
//
// `--steps` is a semicolon-separated program:
//   click:X,Y             press and release at (X, Y)
//   drag:X1,Y1>X2,Y2      press at the first point, move in 8 steps, release
//   drag:X1,Y1>X2,Y2@NAME the same, with a shot taken MID-DRAG (before the
//                         release) — which is the only way to photograph the
//                         thing that makes this platform's drag different:
//                         GDK carrying a Gtk.WidgetPaintable of the dragged
//                         view above the window
//   shot:NAME             grim to <out>-NAME.png
//   wait:MS               settle
import { spawn, spawnSync } from "node:child_process"
import { openSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  createVirtualPointer,
  type VirtualPointer,
} from "../packages/react-native-gtkx/tests/gtk/support/virtual-pointer.ts"
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
const outBase = positional[1]
if (!example || !outBase) {
  console.error(
    "usage: node scripts/shot-example-drag.ts <examples/name> <out-prefix> --steps=<program> [--resolution=WxH]",
  )
  process.exit(2)
}

const resolution = flag("resolution") ?? "900x780"
const [widthText, heightText] = resolution.split("x")
const width = Number(widthText)
const height = Number(heightText)
const steps = (flag("steps") ?? "").split(";").filter(Boolean)
const tag = flag("tag") ?? example.replace(/[^a-z0-9]+/gi, "-")
const log = `/tmp/drag-${tag}.log`

process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

const { proc: sway, socket } = await startHeadlessSway(
  `/tmp/sway-drag-${tag}.conf`,
  resolution,
  `/tmp/sway-drag-${tag}.log`,
)
if (!socket) {
  console.error("headless sway did not report a wayland display")
  process.exit(1)
}
process.env.WAYLAND_DISPLAY = socket

let dev: ReturnType<typeof spawn> | undefined
let pointer: VirtualPointer | undefined
try {
  const logFd = openSync(log, "w")
  dev = spawn("npx", ["gtkx", "dev"], {
    cwd: join(REPO, example),
    env: {
      ...process.env,
      WAYLAND_DISPLAY: socket,
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent",
    },
    stdio: ["ignore", logFd, logFd],
  })

  const deadline = Date.now() + Number(flag("wait-ms") ?? 60000)
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
    console.error("gtkx dev did not come up. Log:")
    console.error(readFileSync(log, "utf8").slice(-2000))
    process.exit(1)
  }
  await sleep(2500)

  pointer = await createVirtualPointer({ width, height })

  const shoot = (name: string): void => {
    const out = `${outBase}-${name}.png`
    const grim = spawnSync("grim", [out], {
      env: { ...process.env, WAYLAND_DISPLAY: socket },
      stdio: "inherit",
    })
    if (grim.status !== 0) {
      throw new Error(`grim failed for ${out}`)
    }
    console.log(`OK ${out}`)
  }

  for (const step of steps) {
    const [kind, argument = ""] = step.split(":")
    if (kind === "wait") {
      await sleep(Number(argument))
    } else if (kind === "shot") {
      shoot(argument)
    } else if (kind === "click") {
      const [x, y] = argument.split(",").map(Number)
      pointer.moveTo(x!, y!)
      await sleep(200)
      pointer.press()
      await sleep(120)
      pointer.release()
      await sleep(600)
    } else if (kind === "drag") {
      const [path, midShot] = argument.split("@")
      const [fromText, toText] = path!.split(">")
      const [x1, y1] = fromText!.split(",").map(Number)
      const [x2, y2] = toText!.split(",").map(Number)
      pointer.moveTo(x1!, y1!)
      await sleep(250)
      pointer.press()
      await sleep(250)
      // GDK starts a drag only after the pointer has travelled past
      // `gtk-dnd-drag-threshold` with a button held, and a drop target needs
      // at least one motion inside itself to become current — so this walks
      // rather than jumps.
      for (let index = 1; index <= 8; index += 1) {
        pointer.moveTo(
          x1! + ((x2! - x1!) * index) / 8,
          y1! + ((y2! - y1!) * index) / 8,
        )
        await sleep(90)
        if (midShot && index === 6) {
          await sleep(250)
          shoot(midShot)
        }
      }
      await sleep(250)
      pointer.release()
      await sleep(700)
    } else {
      throw new Error(`unknown step: ${step}`)
    }
  }
} finally {
  pointer?.dispose()
  dev?.kill()
  await sleep(500)
  sway.kill()
}
