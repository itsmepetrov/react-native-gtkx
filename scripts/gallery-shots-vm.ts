#!/usr/bin/env node
// VM-side: native screenshots of every gallery section for docs/shots/gallery/.
// Runs inside a real GNOME session: each section is launched as a window and
// captured with GNOME's own Alt+Print (full Adwaita frame + shadow, HiDPI),
// pressed by a virtual keyboard — the Shell's screenshot D-Bus API is
// allowlisted and unreachable from scripts, key injection is not.
// Needs ydotool + passwordless sudo (a dev sandbox); see .claude/skills/vm.
// usage: run on the Linux host/VM from anywhere: node scripts/gallery-shots-vm.ts
import { execFileSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs"
import { join } from "node:path"
import { sleep } from "./lib/headless-sway.ts"
import { run, runDetached, runQuiet } from "./lib/proc.ts"

process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

const picturesDir = execFileSync("xdg-user-dir", ["PICTURES"], {
  encoding: "utf8",
}).trim()
const shotsDir = join(picturesDir, "Screenshots")
mkdirSync(shotsDir, { recursive: true })
const out = "/tmp/gallery-shots"
mkdirSync(out, { recursive: true })
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
  "/tmp/ydotoold.log",
)
await sleep(1500)

// Alt+Print captures the FOCUSED window — close interactive example
// windows first or they steal every frame.
await runQuiet("systemctl", ["--user", "stop", "rn-gtkx-app", "rn-gtkx-hnapp"])
await sleep(1000)

const GALLERY = join(import.meta.dirname, "../examples/gallery")
if (!existsSync(join(GALLERY, "dist/bundle.js"))) {
  console.error(`missing ${GALLERY}/dist/bundle.js — build the gallery first`)
  process.exit(1)
}

const pressAltPrint = (): Promise<number> =>
  run("ydotool", ["key", "56:1", "99:1", "99:0", "56:0"], {
    env: { ...process.env, YDOTOOL_SOCKET: sock },
  })

const newest = (): string | undefined => {
  const pngs = readdirSync(shotsDir).filter((name) => name.endsWith(".png"))
  const [first] = pngs
    .map((name) => ({ name, mtime: statSync(join(shotsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return first?.name
}

const shotSection = async (id: string, warmSeconds: number): Promise<void> => {
  const unit = "rn-gtkx-gallery-shot"
  await runQuiet("systemctl", ["--user", "stop", unit])
  await runQuiet("systemctl", ["--user", "reset-failed", unit])
  const before = newest()

  await run("systemd-run", [
    "--user",
    `--unit=${unit}`,
    "--setenv=WAYLAND_DISPLAY=wayland-0",
    `--setenv=GALLERY_SECTION=${id}`,
    `--working-directory=${GALLERY}`,
    "node",
    "dist/bundle.js",
  ])
  await sleep(warmSeconds * 1000)
  await pressAltPrint()

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(1000)
    const now = newest()
    if (now && now !== before) {
      copyFileSync(join(shotsDir, now), join(out, `${id}.png`))
      await runQuiet("systemctl", ["--user", "stop", unit])
      console.log(`SHOT ${id}`)
      await sleep(1000)
      return
    }
  }
  await runQuiet("systemctl", ["--user", "stop", unit])
  console.error(`NO-SHOT ${id}`)
}

for (const id of [
  "views",
  "text",
  "layout",
  "inputs",
  "buttons",
  "lists",
  "toggles",
  "animated",
  "modal",
  "apis",
]) {
  await shotSection(id, 5)
}
await shotSection("media", 9) // the remote-image demo needs a network fetch first

console.log(`DONE: ${readdirSync(out).length} screenshots in ${out}`)
