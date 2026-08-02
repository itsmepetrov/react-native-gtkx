// The scripted half of the probe: a REAL pointer, injected into the running
// window, driving the two libraries the way a user would.
//
// The rule the gesture epic paid for and this probe inherits: a Wayland
// pointer is addressed by POSITION, never by focus. Aiming at a widget and
// seeing something happen proves only that something happened somewhere, so
// every run also asserts that a zone the pointer never visited stayed silent
// — `control` in App.tsx, which reports if it is ever touched.
//
// Coordinates come from `measureInWindow` on the real handles rather than
// from constants: the window is fullscreened by the compositor (see
// run-headless.sh), so window coordinates and output coordinates coincide,
// and a measured rect is the GTK allocation rather than a number this file
// made up. The first check asserts that coincidence instead of assuming it.
import type { MeasureHandle } from "react-native"
import { createVirtualPointer } from "../../../packages/react-native-gtkx/tests/gtk/support/virtual-pointer"

/** Matches the resolution run-headless.sh gives the headless output. */
const OUTPUT = { width: 1024, height: 768 }

const zones = new Map<string, MeasureHandle>()

/** Called from App.tsx's refs — the probe measures what the app rendered. */
export const registerZone = (
  name: string,
  handle: MeasureHandle | null,
): void => {
  if (handle) {
    zones.set(name, handle)
  } else {
    zones.delete(name)
  }
}

export const report = (message: string): void => {
  console.log(`[core-exports] ${message}`)
}

// The negative control's counter. A Wayland pointer is addressed by position:
// nothing above proves the injection went where it was aimed unless a zone it
// never visited can be shown to have received nothing.
let controlTouches = 0

export const controlTouched = (): void => {
  controlTouches += 1
  report("CONTROL TOUCHED — the injection missed its target")
}

let failures = 0

const check = (label: string, condition: boolean, detail: string): void => {
  if (!condition) {
    failures += 1
  }
  report(`${condition ? "PASS" : "FAIL"} ${label} — ${detail}`)
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

type Rect = { x: number; y: number; width: number; height: number }

const measure = async (name: string): Promise<Rect | null> => {
  const handle = zones.get(name)
  if (!handle) {
    return null
  }
  return new Promise<Rect | null>((resolve) => {
    let settled = false
    handle.measureInWindow((x, y, width, height) => {
      settled = true
      resolve({ x, y, width, height })
    })
    setTimeout(() => {
      if (!settled) {
        resolve(null)
      }
    }, 200)
  })
}

const centreOf = (rect: Rect): { x: number; y: number } => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
})

const show = (rect: Rect | null): string =>
  rect
    ? `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
    : "missing"

export const runPointerProbe = async (): Promise<void> => {
  // The tree has to be mounted and laid out before anything can be measured.
  await sleep(2500)

  report(`zones=${[...zones.keys()].sort().join(" ")}`)

  // Every coordinate below is a window coordinate injected as an OUTPUT
  // coordinate, so the two have to be the same rectangle. If the compositor
  // did not fullscreen the window, nothing after this line means anything.
  const columns = await measure("columns")
  check(
    "the window fills the output, so window coordinates are output coordinates",
    columns !== null && columns.x === 0 && columns.width === OUTPUT.width,
    `columns rect = ${show(columns)}, output = ${OUTPUT.width}x${OUTPUT.height}`,
  )

  const pointer = await createVirtualPointer(OUTPUT)
  const step = async (action: () => void, settleMs = 45): Promise<void> => {
    action()
    await sleep(settleMs)
  }

  // --- 1. drag a row of the draggable list -------------------------------
  const rowA = await measure("row-a")
  const rowC = await measure("row-c")
  report(`rows: a=${show(rowA)} c=${show(rowC)}`)
  if (rowA && rowC) {
    const from = centreOf(rowA)
    const to = centreOf(rowC)
    await step(() => pointer.moveTo(from.x, from.y))
    // Past Pressable's long-press delay, which is what `drag` is bound to.
    await step(() => pointer.press(), 800)
    for (let i = 1; i <= 12; i += 1) {
      await step(() => {
        pointer.moveTo(from.x, from.y + ((to.y - from.y) * i) / 12)
      })
    }
    await step(() => pointer.release(), 600)
    const movedA = await measure("row-a")
    check(
      "the dragged row changed place",
      movedA !== null &&
        rowA !== null &&
        Math.round(movedA.y) !== Math.round(rowA.y),
      `row-a y ${rowA ? Math.round(rowA.y) : "?"} -> ${movedA ? Math.round(movedA.y) : "?"}`,
    )
  } else {
    check("the draggable list rendered rows", false, "row-a / row-c missing")
  }

  // --- 2. drag the bottom sheet open -------------------------------------
  const handle = await measure("sheet-handle")
  report(`sheet handle: ${show(handle)}`)
  if (handle) {
    const grab = centreOf(handle)
    await step(() => pointer.moveTo(grab.x, grab.y))
    await step(() => pointer.press(), 150)
    for (let i = 1; i <= 16; i += 1) {
      await step(() => pointer.moveTo(grab.x, grab.y - i * 18))
    }
    await step(() => pointer.release(), 900)
    const moved = await measure("sheet-handle")
    check(
      "the sheet moved up under the drag",
      moved !== null && Math.round(moved.y) < Math.round(handle.y) - 20,
      `handle y ${Math.round(handle.y)} -> ${moved ? Math.round(moved.y) : "?"}`,
    )
  } else {
    check("the bottom sheet rendered its handle", false, "sheet-handle missing")
  }

  check(
    "NEGATIVE CONTROL: the zone the pointer never visited saw nothing",
    controlTouches === 0,
    `control touch events = ${controlTouches}`,
  )

  pointer.dispose()
  // Held open so the driving script's last screenshot catches the END state
  // — the reordered list and the raised sheet — rather than an empty output.
  await sleep(2500)

  report(failures === 0 ? "DONE all checks passed" : `DONE ${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}
