#!/usr/bin/env node
// Cheap iterate-on-a-running-app loop for the vite (`gtkx dev`) path — the
// rebuild path this replaces is `vm.ts sync` + `build:dist` + build the
// example + `vm.ts app` + ydotool + scp, minutes per change. Both toolchains
// already ship a dev server with HMR (`gtkx dev` here; Metro's
// `run-linux --dev` for the RN path) — syncing the tree alone is enough to
// trigger a reload, no build step at all. See .claude/skills/dev-loop.
//
// Two commands:
//   node scripts/dev-loop.ts start examples/<name> [--unit=name] [--restart]
//   node scripts/dev-loop.ts shot <local-out.png> [--unit=name] [--timeout-ms=n]
//   node scripts/dev-loop.ts stop [--unit=name]
//
// The systemd unit defaults to "rn-gtkx-dev" — deliberately NOT rn-gtkx-app,
// which `vm.ts app` and other sessions may already be using; `--unit=` lets
// several dev-loop sessions run in parallel against different examples
// without colliding on the same transient unit.
//
// Investigated and NOT used: `gtkx dev` also starts an MCP socket server
// (@gtkx/mcp) for editor/tooling integration with the live app — it is an
// app-inspection protocol (querying/mutating the live component tree), not
// a "reload finished" event stream, and speaking it just to poll one
// boolean would be more code and more fragile than reading the unit's own
// journal. There is also no HTTP/WS endpoint to poll: unlike a
// browser-facing vite dev server, `gtkx dev` runs vite in middleware mode
// with no HTTP listener at all (see @gtkx/cli's vite-dev-server.ts). The dev
// runner's own log lines (dev/runner.ts: "Fast Refresh complete" for a
// hot-applied change, "HMR enabled - watching for changes..." once more
// after a full restart) are the best available signal — journalctl-polling
// for them is exactly what scripts/gtkx-dev-headless.ts already asserts on
// for this same dev server, just read from the unit's journal instead of a
// local log file.
//
// Known gap, found while verifying this script against examples/gallery
// (the exact edit gtkx-dev-headless.ts exercises): the runner can log "Fast
// Refresh complete" for a component-only edit without the GTK window
// actually repainting it — reproduced with a deterministic 15s wait after
// the marker, so it isn't a settle-time race this script could fix by
// waiting longer. A full restart (edit a file that fails the
// refresh-boundary check, e.g. one with no component exports) reliably
// repaints. If a `shot` screenshot doesn't show an edit that should have
// gone through Fast Refresh, `start --restart` forces the full-mount path.
import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { sleep } from "./lib/headless-sway.ts"
import { capture, run, runCheck, runQuiet } from "./lib/proc.ts"
import { resolveVmEnv, syncToVm } from "./lib/vm-env.ts"

const REPO_ROOT = join(import.meta.dirname, "..")
const DEFAULT_UNIT = "rn-gtkx-dev"
const YDOTOOLD_UNIT = "ydotoold-devloop"
const YDOTOOL_SOCKET = "/tmp/.ydotool.sock"

// A plain non-interactive `ssh host cmd` doesn't reliably inherit
// XDG_RUNTIME_DIR from the user's graphical login — every remote
// systemctl/systemd-run call needs it explicitly, the same reasoning
// vm.ts's own "app" command already documents.
const withRuntimeDir = (remoteCommand: string): string =>
  `export XDG_RUNTIME_DIR=/run/user/$(id -u); ${remoteCommand}`

const sshRun = (vmHost: string, remoteCommand: string): Promise<number> =>
  run("ssh", [vmHost, withRuntimeDir(remoteCommand)])

const sshRunQuiet = (vmHost: string, remoteCommand: string): Promise<number> =>
  runQuiet("ssh", [vmHost, withRuntimeDir(remoteCommand)])

const sshCheck = (vmHost: string, remoteCommand: string): Promise<boolean> =>
  runCheck("ssh", [vmHost, withRuntimeDir(remoteCommand)])

const sshCapture = async (
  vmHost: string,
  remoteCommand: string,
): Promise<string> =>
  (await capture("ssh", [vmHost, withRuntimeDir(remoteCommand)])).stdout

interface Args {
  positional: string[]
  unit: string
  timeoutMs: number
  restart: boolean
}

const parseArgs = (rest: string[]): Args => {
  const positional: string[] = []
  let unit = DEFAULT_UNIT
  let timeoutMs = 30_000
  let restart = false
  for (const arg of rest) {
    if (arg.startsWith("--unit=")) {
      unit = arg.slice("--unit=".length)
    } else if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = Number(arg.slice("--timeout-ms=".length))
    } else if (arg === "--restart") {
      restart = true
    } else {
      positional.push(arg)
    }
  }
  return { positional, unit, timeoutMs, restart }
}

const usage = (): never => {
  console.error(
    "usage: dev-loop.ts start examples/<name> [--unit=name] [--restart]\n" +
      "       dev-loop.ts shot <local-out.png> [--unit=name] [--timeout-ms=n]\n" +
      "       dev-loop.ts stop [--unit=name]",
  )
  process.exit(1)
}

const tail = (text: string, n: number): string => {
  const lines = text.split("\n").filter((line) => line !== "")
  return lines.slice(-n).join("\n")
}

type JournalOutcome = {
  status: "ok" | "failed" | "timeout"
  marker?: string
  log: string
}

/**
 * Polls `journalctl --user -u <unit>` (over ssh) for one of `okMarkers`,
 * failing fast on `failMarkers` instead of waiting out the full timeout.
 * `sinceLocalTime` scopes the search to lines written after the poll
 * started, so a marker left over from an earlier edit in the same session
 * can't be mistaken for this one's.
 */
const waitForJournalMarker = async (
  vmHost: string,
  unit: string,
  sinceLocalTime: string,
  options: {
    okMarkers: string[]
    failMarkers: string[]
    attempts: number
    intervalMs: number
  },
): Promise<JournalOutcome> => {
  let log = ""
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    log = await sshCapture(
      vmHost,
      `journalctl --user -u ${unit} --since '${sinceLocalTime}' --no-pager -o cat`,
    )
    for (const marker of options.failMarkers) {
      if (log.includes(marker)) {
        return { status: "failed", marker, log }
      }
    }
    for (const marker of options.okMarkers) {
      if (log.includes(marker)) {
        return { status: "ok", marker, log }
      }
    }
    await sleep(options.intervalMs)
  }
  return { status: "timeout", log }
}

const ensureYdotoold = async (vmHost: string): Promise<void> => {
  if (
    await sshCheck(
      vmHost,
      `systemctl --user is-active --quiet ${YDOTOOLD_UNIT}`,
    )
  ) {
    return
  }
  await sshRunQuiet(vmHost, `systemctl --user reset-failed ${YDOTOOLD_UNIT}`)
  // systemd-run (not a plain `sudo ydotoold ... &`) so the daemon survives
  // this ssh connection closing — the same detach reasoning vm.ts's "app"
  // command uses for the app itself.
  await sshRun(
    vmHost,
    `systemd-run --user --unit=${YDOTOOLD_UNIT} -- sudo ydotoold ` +
      `--socket-path ${YDOTOOL_SOCKET} --socket-own "$(id -u):$(id -g)"`,
  )
  await sleep(1000) // let the socket file appear before ydotool tries to use it
}

/** Newest *.png in a remote directory, as "<epoch-mtime> <filename>" — undefined if empty. */
const newestScreenshot = async (
  vmHost: string,
  screenshotsDir: string,
): Promise<string | undefined> => {
  const listing = await sshCapture(
    vmHost,
    `bash -lc 'shopt -s nullglob; cd "${screenshotsDir}" 2>/dev/null && for f in *.png; do printf "%s %s\\n" "$(stat -c %Y "$f")" "$f"; done | sort -rn | head -1'`,
  )
  const line = listing.trim()
  if (!line) {
    return undefined
  }
  const spaceIndex = line.indexOf(" ")
  return spaceIndex === -1 ? undefined : line.slice(spaceIndex + 1)
}

/**
 * GNOME's own Alt+Print (pressed by a virtual keyboard — the Shell's
 * screenshot D-Bus API is allowlisted and unreachable from scripts, key
 * injection is not) captures the focused window into
 * `$(xdg-user-dir PICTURES)/Screenshots/`; this copies the newest one there
 * back to `localOut`. See .claude/skills/vm for the underlying mechanism.
 */
const shootWindow = async (vmHost: string, localOut: string): Promise<void> => {
  await ensureYdotoold(vmHost)

  const picturesDir = (
    await sshCapture(vmHost, "bash -lc 'xdg-user-dir PICTURES'")
  ).trim()
  if (!picturesDir) {
    throw new Error("could not resolve xdg-user-dir PICTURES on the VM")
  }
  const screenshotsDir = `${picturesDir}/Screenshots`
  await sshRunQuiet(vmHost, `mkdir -p "${screenshotsDir}"`)

  const before = await newestScreenshot(vmHost, screenshotsDir)
  await sshRun(
    vmHost,
    `YDOTOOL_SOCKET=${YDOTOOL_SOCKET} ydotool key 56:1 99:1 99:0 56:0`,
  ) // Alt+Print

  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(1000)
    const after = await newestScreenshot(vmHost, screenshotsDir)
    if (after && after !== before) {
      mkdirSync(dirname(localOut), { recursive: true })
      const scp = spawnSync(
        "scp",
        [`${vmHost}:${screenshotsDir}/${after}`, localOut],
        { stdio: "inherit" },
      )
      if (scp.error) {
        throw scp.error
      }
      if ((scp.status ?? 1) !== 0) {
        throw new Error(`scp failed (exit ${scp.status})`)
      }
      return
    }
  }
  throw new Error(
    `no new screenshot appeared in ${screenshotsDir} within 15s of Alt+Print`,
  )
}

const cmdStart = async (args: Args): Promise<void> => {
  const appDir = args.positional[0]
  if (!appDir) {
    return usage()
  }
  const { vmHost, vmDir } = resolveVmEnv(REPO_ROOT, "dev/devloop")
  const unit = args.unit

  if (
    !args.restart &&
    (await sshCheck(vmHost, `systemctl --user is-active --quiet ${unit}`))
  ) {
    const execStart = (
      await sshCapture(
        vmHost,
        `systemctl --user show ${unit} -p ExecStart --value`,
      )
    ).trim()
    console.log(`${unit} already running — attaching.\n  ${execStart}`)
    return
  }

  await sshRunQuiet(vmHost, `systemctl --user stop ${unit}`)
  await sshRunQuiet(vmHost, `systemctl --user reset-failed ${unit}`)

  const workingDirectory = `$HOME/${vmDir}/${appDir}`
  const launchCode = await sshRun(
    vmHost,
    `systemd-run --user --unit=${unit} --setenv=WAYLAND_DISPLAY=wayland-0 ` +
      `--working-directory=${workingDirectory} bash -lc "npx gtkx dev"`,
  )
  if (launchCode !== 0) {
    console.error(`systemd-run failed (exit ${launchCode})`)
    process.exit(1)
  }

  console.log(
    `${unit} launched (${appDir}) — waiting for the dev server to come up...`,
  )
  const since = (await sshCapture(vmHost, "date '+%Y-%m-%d %H:%M:%S'")).trim()
  const outcome = await waitForJournalMarker(vmHost, unit, since, {
    okMarkers: ["HMR enabled - watching for changes..."],
    failMarkers: ["Hot reload failed:"],
    attempts: 60,
    intervalMs: 1000,
  })
  if (outcome.status !== "ok") {
    console.error(
      `${unit} did not report ready in time (${outcome.status}). Recent log:\n${tail(outcome.log, 30)}`,
    )
    process.exit(1)
  }
  console.log(`${unit} is up (HMR enabled).`)
}

const cmdStop = async (args: Args): Promise<void> => {
  const { vmHost } = resolveVmEnv(REPO_ROOT, "dev/devloop")
  await sshRunQuiet(vmHost, `systemctl --user stop ${args.unit}`)
  console.log(`${args.unit} stopped.`)
}

const cmdShot = async (args: Args): Promise<void> => {
  const localOut = args.positional[0]
  if (!localOut) {
    return usage()
  }
  const { vmHost, vmDir } = resolveVmEnv(REPO_ROOT, "dev/devloop")
  const unit = args.unit

  if (!(await sshCheck(vmHost, `systemctl --user is-active --quiet ${unit}`))) {
    console.error(
      `${unit} is not running — run 'dev-loop.ts start examples/<name>' first`,
    )
    process.exit(1)
  }

  // Captured before the sync starts, so the journal search below can't pick
  // up a marker left over from an earlier edit in the same session.
  const since = (await sshCapture(vmHost, "date '+%Y-%m-%d %H:%M:%S'")).trim()

  const syncStart = Date.now()
  const syncResult = syncToVm(REPO_ROOT, vmHost, vmDir)
  if (syncResult.error) {
    throw syncResult.error
  }
  if ((syncResult.status ?? 1) !== 0) {
    console.error(`rsync failed (exit ${syncResult.status})`)
    process.exit(1)
  }
  const syncMs = Date.now() - syncStart

  const reloadStart = Date.now()
  const outcome = await waitForJournalMarker(vmHost, unit, since, {
    // Either a Fast Refresh (component-only edit) or a full process restart
    // (anything else, e.g. the entry file) counts as "the reload landed" —
    // dev/runner.ts logs "HMR enabled - watching for changes..." again once
    // the restarted runner has re-mounted the app.
    okMarkers: [
      "Fast Refresh complete",
      "HMR enabled - watching for changes...",
    ],
    failMarkers: ["Hot reload failed:"],
    attempts: Math.max(1, Math.ceil(args.timeoutMs / 500)),
    intervalMs: 500,
  })
  if (outcome.status !== "ok") {
    console.error(
      `reload did not land within ${args.timeoutMs}ms (${outcome.status}). Recent ${unit} log:\n${tail(outcome.log, 30)}`,
    )
    process.exit(1)
  }
  const reloadMs = Date.now() - reloadStart

  const shotStart = Date.now()
  await shootWindow(vmHost, localOut)
  const shotMs = Date.now() - shotStart

  const totalMs = syncMs + reloadMs + shotMs
  console.log(
    `OK ${localOut} — sync ${syncMs}ms, reload ${reloadMs}ms (via "${outcome.marker}"), shot ${shotMs}ms, total ${totalMs}ms`,
  )
}

const main = async (): Promise<void> => {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)
  if (command === "start") {
    await cmdStart(args)
  } else if (command === "shot") {
    await cmdShot(args)
  } else if (command === "stop") {
    await cmdStop(args)
  } else {
    return usage()
  }
}

await main()
