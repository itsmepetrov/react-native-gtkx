// Real tablet input, for the one axis no pointer and no touchpad can carry.
//
// Why this exists, and why it is not `virtual-pointer.ts` with an extra
// argument: `wl_pointer` has no pressure axis and never will. Pressure lives
// in a different Wayland protocol entirely (`zwp_tablet_v2`), and a client
// cannot synthesize into it — there is no `zwlr_virtual_tablet_v1` in wlroots
// or anywhere else. Pressure is something libinput READS off a device it has
// classified as a tablet, exactly as a pinch is something it CONCLUDES from
// two fingers on a device it has classified as a touchpad.
//
// So the injection point is the same one `./virtual-touchpad.ts` uses, one
// layer below Wayland: a virtual pen tablet on `/dev/uinput`. The chain is
// then entirely real:
//
//   uinput -> kernel evdev -> libinput (TABLET_TOOL_AXIS/TIP/PROXIMITY)
//          -> compositor (zwp_tablet_tool_v2.pressure, 0..65535)
//          -> GDK (GdkDeviceTool, GDK_AXIS_PRESSURE normalised to [0, 1])
//          -> GtkGestureStylus.get_axis(Gdk.AxisUse.PRESSURE)
//
// THREE THINGS WERE MEASURED ON THIS CHAIN, and a caller has to know all
// three, because each one changes what an assertion may say:
//
// 1. It works under a compositor with a libinput backend and delivers nothing
//    at all under one without — the same split `./virtual-touchpad.ts`
//    documents, for the same reason. The headless sway `@gtkx/vitest` starts
//    per worker is launched with `WLR_BACKENDS=headless` and
//    `WLR_LIBINPUT_NO_DEVICES=1`, so it enumerates zero input devices and a
//    uinput tablet is invisible to it. Under the VM's real GNOME session the
//    same injection reaches `GtkGestureStylus` with varying pressure.
//    `spike/gesture-detector/run-stylus.sh` is what runs against the real one.
//
// 2. THE CURVE IS NOT LINEAR. mutter applies a transfer curve between the
//    libinput reading and the Wayland wire, and it measured as roughly
//    QUADRATIC: the pressure GTK reports is about the SQUARE of the fraction
//    injected here (inject 0.5, GTK says ~0.25; inject 1.0, GTK says ~1.0).
//    So a test may assert MONOTONICITY and the ENDPOINTS and nothing in
//    between — asserting that GTK sees the number that went in would be
//    asserting that this particular compositor has no curve, which is not a
//    property of the platform.
//
// 3. **THE DEVICE HAS TO EXIST BEFORE THE CLIENT DOES**, and this is the
//    constraint that shapes every caller. It was measured on the wire
//    (`WAYLAND_DEBUG=1` on the client) against `libinput debug-events` one
//    layer below, and libinput is never the problem: it emitted every injected
//    cycle, complete, correct and linear, in every run that follows. What
//    varies is whether mutter forwards one. Same client, same device, same
//    injected ramp — only the startup order changed:
//
//      device, throwaway cycle, then client -> 24 samples, 0.0016 .. 1.0000
//      client, then device                  -> 0 samples
//      client, then device, throwaway cycle -> 0 samples
//
//    A client that is already connected when the tablet appears is told
//    `tablet_added` and then never told `tool_added`, so no tool ever enters
//    proximity for it. A client that binds `zwp_tablet_seat_v2` after the
//    device exists is told both. A probe that is itself the GTK client
//    therefore has to open the device BEFORE it starts its application —
//    `spike/gesture-detector/src/probe-stylus.tsx` does exactly that and says
//    so at its entry point.
//
//    Two smaller findings sit under that one. The throwaway cycle is still
//    needed, because the first proximity after a hotplug is swallowed even in
//    the working order; `createVirtualStylus` burns it, which is safe
//    precisely because there is no client yet. And a cycle that starts within
//    about a second of the previous `proximity_out` is dropped in full —
//    `proximity_in`, `down`, every axis event, `up` — so the rule for callers
//    is ONE `proximityIn`, everything inside it, ONE `proximityOut`. The pen
//    may be pressed and lifted as often as a test likes without leaving
//    proximity, which is how several zones get measured in one run and is what
//    a real pen does anyway.
//
// COORDINATES ARE SCREEN FRACTIONS, not widget pixels, and that follows from
// the device shape: `INPUT_PROP_POINTER` marks an EXTERNAL tablet, which the
// compositor maps whole-area-onto-whole-screen. `0.5, 0.5` is the middle of
// the display. Only a FULLSCREEN surface is guaranteed to be under every
// coordinate a caller can name, so a test that aims at a widget should
// fullscreen its window first and work out fractions from the widget's rect
// over the toplevel's size.
//
// The device itself is created from Python, in `./virtual-stylus.py`: uinput
// needs ioctls and Node has none. This half is the process and the line
// protocol, in the shape `createVirtualPointer` and `createVirtualTouchpad`
// already established, so a test drives a pen the same way it drives the
// other two.
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { createInterface, type Interface } from "node:readline"

/** Where the helper sits in the repo, from the repo root. */
const HELPER_FROM_ROOT = join(
  "packages",
  "react-native-gtkx",
  "tests",
  "gtk",
  "support",
  "virtual-stylus.py",
)

/**
 * The sibling `.py`, or the repo copy of it.
 *
 * A test running from source finds it next to this file, which is the whole of
 * it. A BUNDLED consumer does not: `spike/gesture-detector` builds this module
 * into `dist/bundle.mjs`, where `import.meta.dirname` is the bundle's directory
 * and there is no sibling to find — the helper is a Python file, so no bundler
 * will ever carry it along. Walking up for the repo path covers that without
 * an environment variable nobody would remember to set.
 */
const resolveHelper = (): string | null => {
  const sibling = join(import.meta.dirname, "virtual-stylus.py")
  if (existsSync(sibling)) {
    return sibling
  }
  for (const start of [import.meta.dirname, process.cwd()]) {
    let directory = start
    for (;;) {
      const candidate = join(directory, HELPER_FROM_ROOT)
      if (existsSync(candidate)) {
        return candidate
      }
      const parent = dirname(directory)
      if (parent === directory) {
        break
      }
      directory = parent
    }
  }
  return null
}

const HELPER = resolveHelper()

/** How long a single injected sequence may take before it is given up on. */
const COMMAND_TIMEOUT_MS = 15_000

/**
 * How long to wait, on top of the helper's own udev settle, before the tablet
 * is usable — the window mutter needs to finish adding it to the seat. Both
 * halves together are the 4.5s the working rig this was ported from waits.
 */
const TABLET_SETTLE_MS = 3000

/**
 * How long to wait after the throwaway cycle's `proximity_out` before handing
 * the pen over. Matches the `sleep 1` the reference rig has in the same place;
 * a caller that then starts a GTK application adds several seconds more.
 */
const PROXIMITY_COOLDOWN_MS = 1000

export class VirtualStylusUnavailable extends Error {}

/** One frame's worth of pen state. Fractions of the screen, and of `[0, 1]`. */
export type StylusPoint = {
  x: number
  y: number
  /**
   * The fraction of the pressure axis to INJECT, which is not the number GTK
   * will report — see point 2 in the header.
   */
  force: number
}

export type VirtualStylus = {
  /**
   * Brings the pen into hover range over `(x, y)` with the tip UP.
   *
   * Separate from touching because the device makes it separate and because
   * the distinction is the point: a pen in proximity produces motion with no
   * pressure, which is what `GtkGestureStylus` reports as `proximity`/`motion`
   * and never as `down`.
   */
  proximityIn(x: number, y: number): Promise<void>
  /**
   * One frame with the pen at `(x, y)` under `force`.
   *
   * A `force` of 0 lifts the tip (BTN_TOUCH goes low) and is how a press is
   * ENDED — that is the `up` `GtkGestureStylus` reports.
   */
  moveTo(x: number, y: number, force: number): Promise<void>
  /**
   * `steps` frames interpolating position and pressure linearly from `from` to
   * `to`, which is the only way to produce a pressure RAMP: one frame per
   * value, at the device's frame interval, so libinput sees a plausible pen
   * rather than a jump it would filter.
   */
  ramp(from: StylusPoint, to: StylusPoint, steps?: number): Promise<void>
  /** Takes the pen out of range. Ends the tablet tool's proximity. */
  proximityOut(): Promise<void>
  dispose(): void
}

/**
 * Everything that has to be true before a virtual stylus can exist, checked up
 * front so a test can skip on an environment difference rather than fail on
 * one. Returns the reason it cannot, or null.
 *
 * Deliberately NOT checked here: whether the compositor has a libinput
 * backend. There is no way to ask one, and the failure it produces is a
 * silence rather than an error — which is why every caller of this needs a
 * negative control and an explicit runner, not a probe for the backend.
 */
export const virtualStylusBlocker = (): string | null => {
  if (process.platform !== "linux") {
    return "not Linux"
  }
  if (!existsSync("/dev/uinput")) {
    return "no /dev/uinput — the kernel module is not loaded"
  }
  if (HELPER === null) {
    return `the uinput helper is missing (${HELPER_FROM_ROOT})`
  }
  // Root, because /dev/uinput is root:input 0660 and the test user is not in
  // the `input` group on any machine this has run on.
  if (spawnSync("sudo", ["-n", "true"]).status !== 0) {
    return "no passwordless sudo, and /dev/uinput is root:input 0660"
  }
  if (spawnSync("python3", ["-c", "import evdev"]).status !== 0) {
    return "python3-evdev is not importable"
  }
  return null
}

type Pending = {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const settle = (pending: Pending[], line: string): void => {
  const next = pending.shift()
  if (!next) {
    return
  }
  clearTimeout(next.timer)
  if (line.startsWith("error")) {
    next.reject(new Error(`virtual stylus: ${line}`))
    return
  }
  next.resolve()
}

/**
 * Creates the tablet, waits for the compositor to have added it, and burns the
 * proximity cycle mutter swallows.
 *
 * Throws {@link VirtualStylusUnavailable} when the machine cannot host one, so
 * a test can skip rather than fail on an environment difference — the same
 * contract `createVirtualTouchpad` and `createVirtualPointer` have.
 */
export const createVirtualStylus = async (): Promise<VirtualStylus> => {
  const blocker = virtualStylusBlocker()
  if (blocker !== null) {
    throw new VirtualStylusUnavailable(blocker)
  }

  const child: ChildProcessWithoutNullStreams = spawn(
    "sudo",
    // `blocker` is null, so the helper was found.
    ["-n", "python3", HELPER as string],
    { stdio: ["pipe", "pipe", "pipe"] },
  )
  const pending: Pending[] = []
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })

  const lines: Interface = createInterface({ input: child.stdout })
  const ready = new Promise<void>((resolve, reject) => {
    const onExit = (): void => {
      reject(
        new VirtualStylusUnavailable(
          `the uinput helper exited before it was ready: ${stderr.trim()}`,
        ),
      )
    }
    child.once("exit", onExit)
    lines.once("line", (line: string) => {
      child.off("exit", onExit)
      if (line.trim() === "ready") {
        resolve()
        return
      }
      reject(new VirtualStylusUnavailable(`the uinput helper said: ${line}`))
    })
  })
  await ready

  lines.on("line", (line: string) => {
    settle(pending, line.trim())
  })
  child.on("exit", () => {
    while (pending.length > 0) {
      settle(pending, "error the uinput helper exited")
    }
  })

  const send = (command: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`virtual stylus: \`${command}\` did not finish`))
      }, COMMAND_TIMEOUT_MS)
      pending.push({ resolve, reject, timer })
      child.stdin.write(`${command}\n`)
    })

  const stylus: VirtualStylus = {
    proximityIn: (x, y) => send(`prox_in ${x} ${y}`),
    moveTo: (x, y, force) => send(`move ${x} ${y} ${force}`),
    ramp: (from, to, steps = 20) =>
      send(
        `ramp ${from.x} ${from.y} ${to.x} ${to.y} ${from.force} ${to.force} ${steps}`,
      ),
    proximityOut: () => send("prox_out"),
    dispose() {
      for (const entry of pending) {
        clearTimeout(entry.timer)
      }
      pending.length = 0
      child.stdin.end("quit\n")
      lines.close()
      // The helper closes the uinput device on its way out, which is what
      // makes the kernel remove it. If it will not go, the device would
      // outlive the test run.
      const killer = setTimeout(() => {
        child.kill("SIGKILL")
      }, 2000)
      child.once("exit", () => {
        clearTimeout(killer)
      })
    },
  }

  // Point 3 in the header, and the difference between a run that measures
  // something and a run that measures silence: settle, spend one whole
  // proximity cycle on nothing, and then wait again before handing the pen
  // over. Both waits were measured; neither is a guess.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, TABLET_SETTLE_MS)
  })
  await stylus.proximityIn(0.5, 0.5)
  await stylus.moveTo(0.5, 0.5, 0.3)
  await stylus.moveTo(0.5, 0.5, 0)
  await stylus.proximityOut()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, PROXIMITY_COOLDOWN_MS)
  })

  return stylus
}
