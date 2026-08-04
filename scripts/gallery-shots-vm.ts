#!/usr/bin/env node
// VM-side: native screenshots of every gallery section for docs/shots/gallery/.
// Runs inside a real GNOME session: each section is launched as a window and
// captured with GNOME's own Alt+Print (full Adwaita frame + shadow, HiDPI),
// pressed by a virtual keyboard — the Shell's screenshot D-Bus API is
// allowlisted and unreachable from scripts, key injection is not.
// Needs ydotool + passwordless sudo (a dev sandbox); see .claude/skills/vm.
//
// Safety — read this before touching the flow below. This used to open with
// `systemctl --user stop rn-gtkx-app rn-gtkx-hnapp`: stopping units BY NAME
// regardless of who started them, the same class of mine already removed
// from gtkx-dev-headless.ts's `pkill -f gtkx` and vm.ts app-stop's
// `pkill -f 'node .*dist/bundle.js'` (see git history, "Stop two cleanup
// paths killing every app on the machine"). And it shot with blind
// Alt+Print, which captures whatever window the compositor currently has
// focused — proven on 2026-08-03 to grab the user's own gallery instead of
// this script's, twice, because nothing checked.
//
// Both are fixed the same way: this script owns only what IT started in
// THIS run.
//   - It never stops anything else. If the session already looks busy (a
//     unit, or a bare process, that could already hold a gtkx/RN window),
//     it reports what it found and exits — see refuseIfBusy.
//   - Before every capture it confirms, over the accessibility bus (see
//     scripts/lib/atspi.ts for why AT-SPI and not GNOME Shell's Introspect,
//     which is blocked), that the window about to be shot is the one this
//     run launched and that it actually holds focus — see
//     verifyOwnWindowFocused. It refuses rather than shoot otherwise.
//
// usage: node scripts/gallery-shots-vm.ts [--dry-run]
import { execFileSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs"
import { join } from "node:path"
import {
  atspiAddress,
  findAtspiSenderForPid,
  isAtspiSenderActive,
} from "./lib/atspi.ts"
import { sleep } from "./lib/headless-sway.ts"
import { capture, run, runDetached, runQuiet } from "./lib/proc.ts"

const DRY_RUN = process.argv.includes("--dry-run")
const OWN_UNIT = "rn-gtkx-gallery-shot"

// Command-line patterns that mean "a gtkx/RN-on-Linux app already has a
// window in this session" — the three ways one gets launched: gtkx's
// dev-mode runner (dev-loop / `gtkx dev`), a built vite-path bundle (this
// script, vm.ts app, the perf/hover probes), and Metro's run-linux.
const CONFLICT_PROCESS_PATTERNS = [
  /gtkx-dev-runner\.js/,
  /dist\/bundle\.js/,
  /react-native run-linux/,
]

process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid?.() ?? 0}`

/** Active rn-gtkx-* systemd --user units, excluding the one this run owns. */
const conflictingUnits = async (): Promise<string[]> => {
  const { stdout } = await capture("systemctl", [
    "--user",
    "list-units",
    "rn-gtkx-*",
    "--no-legend",
    "--plain",
  ])
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [unit, , active] = line.split(/\s+/)
      return unit ? [{ unit, active }] : []
    })
    .filter(
      ({ unit, active }) =>
        unit !== `${OWN_UNIT}.service` &&
        active !== "failed" &&
        active !== "inactive",
    )
    .map(({ unit }) => unit)
}

/** Running processes that look like a gtkx/RN app window, excluding pids this run started. */
const conflictingProcesses = async (
  ownPids: ReadonlySet<number>,
): Promise<{ pid: number; cmd: string }[]> => {
  const { stdout } = await capture("ps", ["-eo", "pid=,args="])
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [pidText, ...rest] = line.split(/\s+/)
      const pid = Number(pidText)
      return Number.isFinite(pid) ? [{ pid, cmd: rest.join(" ") }] : []
    })
    .filter(
      ({ pid, cmd }) =>
        !ownPids.has(pid) &&
        CONFLICT_PROCESS_PATTERNS.some((pattern) => pattern.test(cmd)),
    )
}

/**
 * Reports — never stops — anything that looks like it could already own a
 * window in this session. Returns true (after printing what it found) if
 * the caller should refuse to proceed; ownPids excludes PIDs this run
 * itself started (its own section unit shows up in `ps` too, matching the
 * same patterns being watched for).
 */
const refuseIfBusy = async (ownPids: ReadonlySet<number>): Promise<boolean> => {
  const units = await conflictingUnits()
  const procs = await conflictingProcesses(ownPids)
  if (units.length === 0 && procs.length === 0) {
    return false
  }
  console.error(
    "REFUSING: the session already looks busy with a gtkx/RN window — " +
      "this script only ever stops what it starts. Stop these yourself, " +
      "then rerun:",
  )
  for (const unit of units) {
    console.error(`  unit ${unit}`)
  }
  for (const { pid, cmd } of procs) {
    console.error(`  pid ${pid}: ${cmd}`)
  }
  return true
}

/** systemd's MainPID for a --user unit, or undefined if it isn't running. */
const mainPidOf = async (unit: string): Promise<number | undefined> => {
  const { stdout } = await capture("systemctl", [
    "--user",
    "show",
    unit,
    "--property=MainPID",
    "--value",
  ])
  const pid = Number(stdout.trim())
  return Number.isFinite(pid) && pid > 0 ? pid : undefined
}

/**
 * Confirms the unit's own process is the one holding focus, via AT-SPI
 * (scripts/lib/atspi.ts) — GNOME Shell's own window-listing D-Bus API is
 * not reachable from a script (see that file for the empirical proof).
 * Retries briefly, since AT-SPI registration and focus can lag a beat
 * behind the window mapping, then fails loudly rather than let the caller
 * shoot whatever is focused instead.
 */
const verifyOwnWindowFocused = async (
  unit: string,
  pid: number,
): Promise<void> => {
  const address = atspiAddress()
  if (!address) {
    console.error(
      "REFUSING: could not reach the accessibility bus (org.a11y.Bus) — " +
        "cannot verify which window has focus. Not shooting.",
    )
    process.exit(1)
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const sender = findAtspiSenderForPid(address, pid)
    if (sender && isAtspiSenderActive(address, sender)) {
      return
    }
    await sleep(500)
  }
  console.error(
    `REFUSING: could not confirm pid ${pid} (unit ${unit}) is the focused ` +
      "window — either it hasn't registered with the accessibility bus " +
      "yet, or something else currently has focus. Not shooting.",
  )
  process.exit(1)
}

// Kept in step with examples/gallery/src/sections/index.ts by hand — this
// script is run by a person, not by CI, so a missing id costs a rerun rather
// than a red build. `media` warms longer: the remote-image demo needs a
// network fetch first.
const SECTIONS: { id: string; warmSeconds: number }[] = [
  "views",
  "text",
  "layout",
  "clipping",
  "inputs",
  "buttons",
  "toggles",
  "lists",
  "modal",
  "animated",
  "interpolate",
  "transforms",
  "gestures",
  "apis",
  "widget-hosting",
  "adwaita-stack",
  "reanimated",
  "reanimated-motion",
  "reanimated-layout",
  "reanimated-limits",
  "gesture-detector",
  "gesture-pinch",
  "gesture-relations",
  "dnd",
  "svg",
  "upstream",
].map((id) => ({ id, warmSeconds: 5 }))
SECTIONS.push({ id: "media", warmSeconds: 9 })

console.log(
  DRY_RUN
    ? "[dry-run] checking whether the session is already busy..."
    : "checking whether the session is already busy...",
)
if (await refuseIfBusy(new Set())) {
  if (DRY_RUN) {
    console.log(
      "[dry-run] a real run would exit(1) here, without touching anything else",
    )
    process.exit(0)
  }
  process.exit(1)
}
console.log("session looks free")

const GALLERY = join(import.meta.dirname, "../examples/gallery")
if (!existsSync(join(GALLERY, "dist/bundle.js"))) {
  console.error(`missing ${GALLERY}/dist/bundle.js — build the gallery first`)
  process.exit(1)
}

if (DRY_RUN) {
  console.log(
    `[dry-run] would restart ydotoold, then iterate ${SECTIONS.length} sections:`,
  )
  for (const { id, warmSeconds } of SECTIONS) {
    console.log(
      `[dry-run]   ${OWN_UNIT} GALLERY_SECTION=${id}, warm ${warmSeconds}s, ` +
        "verify focus via AT-SPI, Alt+Print, save to " +
        `/tmp/gallery-shots/${id}.png, stop ${OWN_UNIT}`,
    )
  }
  process.exit(0)
}

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
  await runQuiet("systemctl", ["--user", "stop", OWN_UNIT])
  await runQuiet("systemctl", ["--user", "reset-failed", OWN_UNIT])
  const before = newest()

  await run("systemd-run", [
    "--user",
    `--unit=${OWN_UNIT}`,
    "--setenv=WAYLAND_DISPLAY=wayland-0",
    `--setenv=GALLERY_SECTION=${id}`,
    `--working-directory=${GALLERY}`,
    "node",
    "dist/bundle.js",
  ])
  await sleep(warmSeconds * 1000)

  const ownPid = await mainPidOf(OWN_UNIT)
  if (!ownPid) {
    console.error(
      `REFUSING: ${OWN_UNIT} did not start (no MainPID). Not shooting.`,
    )
    process.exit(1)
  }
  if (await refuseIfBusy(new Set([ownPid]))) {
    await runQuiet("systemctl", ["--user", "stop", OWN_UNIT])
    process.exit(1)
  }
  await verifyOwnWindowFocused(OWN_UNIT, ownPid)

  await pressAltPrint()

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(1000)
    const now = newest()
    if (now && now !== before) {
      copyFileSync(join(shotsDir, now), join(out, `${id}.png`))
      await runQuiet("systemctl", ["--user", "stop", OWN_UNIT])
      console.log(`SHOT ${id}`)
      await sleep(1000)
      return
    }
  }
  await runQuiet("systemctl", ["--user", "stop", OWN_UNIT])
  console.error(`NO-SHOT ${id}`)
}

for (const { id, warmSeconds } of SECTIONS) {
  await shotSection(id, warmSeconds)
}

console.log(`DONE: ${readdirSync(out).length} screenshots in ${out}`)
