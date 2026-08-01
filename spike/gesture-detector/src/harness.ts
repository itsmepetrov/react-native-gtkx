// Shared plumbing for the three probes: real pointer injection, a window
// whose coordinates mean something, and PASS/FAIL lines the driving script
// can grep.
//
// The pointer is the same `zwlr_virtual_pointer_v1` client the GTK test
// suite uses (`tests/gtk/support/virtual-pointer.ts`), imported rather than
// copied — a second hand-rolled Wayland client would be a second thing to
// get wrong. It opens its own connection to the compositor this process is
// already displaying on, so the app injects into itself.
//
// The hard-won rule it exists to respect: a Wayland pointer is addressed by
// POSITION, not by focus. Aiming at a widget proves nothing unless a widget
// that was NOT aimed at is asserted to have stayed silent, so every probe
// here carries a negative control.
import type { Gtk } from "react-native-gtkx/gtk"
import { createVirtualPointer } from "../../../packages/react-native-gtkx/tests/gtk/support/virtual-pointer"

/** Matches the resolution run-headless.sh gives the headless output. */
export const OUTPUT = { width: 1024, height: 768 }

export const log = (marker: string, message: string): void => {
  console.log(`[${marker}] ${message}`)
}

let failures = 0

export const check = (
  marker: string,
  label: string,
  condition: boolean,
  detail: string,
): void => {
  if (!condition) {
    failures += 1
  }
  log(marker, `${condition ? "PASS" : "FAIL"} ${label} — ${detail}`)
}

export const finish = (marker: string): void => {
  log(
    marker,
    failures === 0 ? "DONE all checks passed" : `DONE ${failures} FAILED`,
  )
  // The driving script greps for the marker lines; the exit code is what a
  // CI job would read.
  process.exitCode = failures === 0 ? 0 : 1
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Fullscreens the toplevel so window coordinates and output coordinates
 * coincide. sway floats and centres windows by default, and a centred
 * window makes every injected coordinate wrong by an unknown offset.
 */
export const fullscreen = async (
  marker: string,
  anyWidget: Gtk.Widget,
): Promise<void> => {
  const root = anyWidget.getRoot() as Gtk.Window | null
  if (root === null) {
    throw new Error("the widget is not in a window yet")
  }
  root.present()
  root.fullscreen()
  for (let attempt = 0; attempt < 60 && !root.isActive(); attempt += 1) {
    await sleep(50)
  }
  // Not fatal on its own: what the wait is really for is "no other window is
  // on top of this one", and this compositor is private to this invocation,
  // so there is nothing else to be on top. The assertions that follow are
  // guarded by their own negative controls either way.
  log(marker, `window active=${root.isActive()} fullscreen wait done`)
  await sleep(300)
}

export type Rect = { x: number; y: number; width: number; height: number }

/** A widget's rect in window coordinates — real GTK allocation, not a stored value. */
export const rectOf = (widget: Gtk.Widget): Rect => {
  const root = widget.getRoot() as unknown as Gtk.Widget
  const [ok, bounds] = widget.computeBounds(root)
  if (!ok) {
    throw new Error("the widget has no computable bounds")
  }
  return {
    x: bounds.getX(),
    y: bounds.getY(),
    width: bounds.getWidth(),
    height: bounds.getHeight(),
  }
}

export const centreOf = (widget: Gtk.Widget): { x: number; y: number } => {
  const rect = rectOf(widget)
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export type Pointer = Awaited<ReturnType<typeof createVirtualPointer>>

export const openPointer = async (): Promise<Pointer> =>
  createVirtualPointer(OUTPUT)

/**
 * One injected step, with a settle. GTK processes the GdkEvent on the main
 * loop this same process is running, so the await is what lets it in.
 */
export const step = async (
  pointer: Pointer,
  action: () => void,
  settleMs = 45,
): Promise<void> => {
  action()
  await sleep(settleMs)
}
