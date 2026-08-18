// Real touchpad input, for the two gestures the pointer stream cannot carry.
//
// Why this exists, and why it is not `virtual-pointer.ts` with more requests:
// `zwlr_virtual_pointer_v1` has motion, button, axis and frame, and no
// gesture requests of any kind. There is no Wayland protocol for injecting a
// pinch — not in wlroots, not anywhere — because a pinch is not something a
// client synthesizes. It is something libinput CONCLUDES from two fingers
// moving apart on a device it has classified as a touchpad.
//
// So the injection point is one layer lower than the pointer's: a virtual
// multitouch touchpad on `/dev/uinput`, which is the technique libinput's own
// litest suite uses. The chain is then entirely real:
//
//   uinput -> kernel evdev -> libinput (GESTURE_PINCH_BEGIN/UPDATE/END)
//          -> compositor (zwp_pointer_gestures_v1)
//          -> GDK (GDK_TOUCHPAD_PINCH)
//          -> GtkGestureZoom / GtkGestureRotate
//
// MEASURED, and this is the constraint every caller has to know about: the
// chain works under a compositor with a libinput backend, and delivers
// nothing at all under one without. The headless sway `@gtkx/vitest` starts
// per worker is the second kind — it is launched with `WLR_BACKENDS=headless`
// and `WLR_LIBINPUT_NO_DEVICES=1`, so it enumerates no input devices and a
// uinput touchpad is invisible to it. Under the VM's real GNOME session the
// same injection reaches `GtkGestureZoom` with the right numbers.
// `spike/gesture-detector/run-session.sh` is what runs against the real one;
// see docs/research/gesture-detector.md, probe 6.
//
// The device itself is created from Python, in `./virtual-touchpad.py`:
// uinput needs ioctls and Node has none. This half is the process and the
// line protocol, in the shape `createVirtualPointer` already established, so
// a test drives a touchpad the same way it drives a pointer.
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
  "virtual-touchpad.py",
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
  const sibling = join(import.meta.dirname, "virtual-touchpad.py")
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

export class VirtualTouchpadUnavailable extends Error {}

export type VirtualTouchpad = {
  /**
   * Two fingers, their distance multiplied by `scale` over `steps` frames.
   * Above 1 spreads (zoom in), below 1 pinches.
   */
  pinchBy(scale: number, steps?: number): Promise<void>
  /** Two fingers rotated about their midpoint; positive is clockwise. */
  rotateBy(degrees: number, steps?: number): Promise<void>
  /**
   * One finger, in millimetres of touchpad travel — which is how the POINTER
   * is moved, since a touchpad has no absolute addressing. Pointer
   * acceleration sits between this and the pixels the pointer ends up moving,
   * so it aims rather than places: glide hard into a corner first (the
   * compositor clamps, so that lands exactly), then walk out from there.
   */
  glideBy(millimetresX: number, millimetresY: number): Promise<void>
  dispose(): void
}

/**
 * Everything that has to be true before a virtual touchpad can exist, checked
 * up front so a test can skip on an environment difference rather than fail
 * on one. Returns the reason it cannot, or null.
 */
export const virtualTouchpadBlocker = (): string | null => {
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
    next.reject(new Error(`virtual touchpad: ${line}`))
    return
  }
  next.resolve()
}

/**
 * Creates the device and waits for udev to have seen it.
 *
 * Throws {@link VirtualTouchpadUnavailable} when the machine cannot host one,
 * so a test can skip rather than fail on an environment difference — the same
 * contract `createVirtualPointer` has for a compositor without
 * `zwlr_virtual_pointer_manager_v1`.
 */
export const createVirtualTouchpad = async (): Promise<VirtualTouchpad> => {
  const blocker = virtualTouchpadBlocker()
  if (blocker !== null) {
    throw new VirtualTouchpadUnavailable(blocker)
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
        new VirtualTouchpadUnavailable(
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
      reject(new VirtualTouchpadUnavailable(`the uinput helper said: ${line}`))
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
        reject(new Error(`virtual touchpad: \`${command}\` did not finish`))
      }, COMMAND_TIMEOUT_MS)
      pending.push({ resolve, reject, timer })
      child.stdin.write(`${command}\n`)
    })

  return {
    pinchBy: (scale, steps = 20) => send(`pinch ${scale} ${steps}`),
    rotateBy: (degrees, steps = 20) => send(`rotate ${degrees} ${steps}`),
    glideBy: (millimetresX, millimetresY) =>
      send(`glide ${millimetresX} ${millimetresY}`),
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
}
