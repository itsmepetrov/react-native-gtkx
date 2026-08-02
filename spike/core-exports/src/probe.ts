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

/** Scroll events the SHEET's own scrollable received. */
export let sheetScrolls = 0
export const sheetScrolled = (): void => {
  sheetScrolls += 1
}

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

  // --- 1b. the sheet's scroll LOCK, which is the path this epic unblocked -
  //
  // While the sheet is collapsed, `useScrollEventsHandlersDefault` holds its
  // scrollable at the top: every scroll event calls Reanimated's `scrollTo`
  // to put it back. That is the real consumer of this surface — a user
  // scrolling the sheet's list while it is down hits it on the first detent
  // — and it is checked in both directions, because "the list did not move"
  // is also what a list with nowhere to scroll looks like. The same list is
  // scrolled again after the sheet is up, and then it MUST move.
  const scrollList = async (
    detents: number,
    kind: "wheel" | "glide",
  ): Promise<void> => {
    const target = await measure("sheet-row-one")
    if (!target) {
      return
    }
    const aim = centreOf(target)
    await step(() => pointer.moveTo(aim.x, aim.y), 120)
    if (kind === "wheel") {
      for (let i = 0; i < detents; i += 1) {
        await step(() => pointer.scrollBy(1), 60)
      }
    } else {
      for (let i = 0; i < detents * 3; i += 1) {
        await step(() => pointer.glideBy(20), 16)
      }
      await step(() => pointer.glideEnd(), 1200)
    }
    await sleep(300)
  }

  // CONTROL: a plain FlatList of the same rows, same injected wheel. Without
  // this, "the sheet's list did not move" cannot be told apart from "the
  // wheel never arrived".
  const svBefore = await measure("sv-row-one")
  report(`sv row one: ${show(svBefore)}`)
  if (svBefore) {
    const aim = centreOf(svBefore)
    await step(() => pointer.moveTo(aim.x, aim.y), 120)
    for (let i = 0; i < 5; i += 1) {
      await step(() => pointer.scrollBy(1), 60)
    }
    await sleep(300)
  }
  const svAfter = await measure("sv-row-one")
  check(
    "CONTROL: a plain ScrollView scrolls under the same injected wheel",
    svBefore !== null && svAfter !== null && svBefore.y - svAfter.y > 20,
    `sv row-one y ${svBefore ? Math.round(svBefore.y) : "?"} -> ${svAfter ? Math.round(svAfter.y) : "?"}`,
  )

  const unstyledBefore = await measure("unstyled-row-one")
  report(`unstyled row one: ${show(unstyledBefore)}`)
  if (unstyledBefore) {
    const aim = centreOf(unstyledBefore)
    await step(() => pointer.moveTo(aim.x, aim.y), 120)
    for (let i = 0; i < 5; i += 1) {
      await step(() => pointer.scrollBy(1), 60)
    }
    await sleep(300)
  }
  const unstyledAfter = await measure("unstyled-row-one")
  // This one used to be a bare FINDING, because it recorded a gap rather than
  // a guarantee: the same list, in the same bounded parent, WITHOUT a style of
  // its own never became a viewport — it grew to its content and emitted no
  // scroll event at all. That is the shape `@gorhom/bottom-sheet` renders its
  // scrollable in, and it is what stopped the sheet's scroll lock below.
  //
  // It is a check now. RN's ScrollView composes `flexGrow: 1, flexShrink: 1`
  // UNDER the app's style, and this platform did not — so the scroller kept
  // its content size instead of shrinking into the parent.
  check(
    "an unstyled scrollable in a bounded parent is a viewport and scrolls",
    unstyledBefore !== null &&
      unstyledAfter !== null &&
      unstyledBefore.y - unstyledAfter.y > 20,
    `unstyled row-one y ${unstyledBefore ? Math.round(unstyledBefore.y) : "?"} -> ${unstyledAfter ? Math.round(unstyledAfter.y) : "?"}`,
  )

  const plainBefore = await measure("plain-row-one")
  report(`plain row one: ${show(plainBefore)}`)
  if (plainBefore) {
    const aim = centreOf(plainBefore)
    await step(() => pointer.moveTo(aim.x, aim.y), 120)
    for (let i = 0; i < 5; i += 1) {
      await step(() => pointer.scrollBy(1), 60)
    }
    await sleep(300)
  }
  const plainAfter = await measure("plain-row-one")
  check(
    "CONTROL: a plain FlatList scrolls under the same injected wheel",
    plainBefore !== null &&
      plainAfter !== null &&
      plainBefore.y - plainAfter.y > 20,
    `plain row-one y ${plainBefore ? Math.round(plainBefore.y) : "?"} -> ${plainAfter ? Math.round(plainAfter.y) : "?"}`,
  )

  // The sheet's own scrollable, under the same wheel and the same glide.
  // `sheetScrolls` counts the scroll events its `onScroll` receives — the
  // lock is driven entirely by those, so the count is the thing to look at
  // and the row's position is only the consequence.
  const lockedBefore = await measure("sheet-row-one")
  report(`sheet row one (collapsed): ${show(lockedBefore)}`)
  await scrollList(5, "wheel")
  await scrollList(4, "glide")
  const lockedAfter = await measure("sheet-row-one")
  report(
    `sheet row-one y ${lockedBefore ? Math.round(lockedBefore.y) : "?"} -> ${
      lockedAfter ? Math.round(lockedAfter.y) : "?"
    }`,
  )
  check(
    "the sheet's own scrollable receives scroll events at all",
    sheetScrolls > 0,
    `sheet list onScroll calls = ${sheetScrolls}` +
      (sheetScrolls === 0
        ? " — its allocated height above equals its CONTENT height, so it is" +
          " still not a viewport. The base style can only make a scroller" +
          " fill a BOUNDED parent, and gorhom's is not bounded here: it" +
          " bounds the list with an animated `height` from useAnimatedStyle" +
          " on its content-mask container (BottomSheetContent), and that" +
          " height is not reaching the Yoga node"
        : ""),
  )
  // The lock itself, in both directions. Both are gated on events having
  // ARRIVED, because a list that cannot move satisfies "held at the top" for
  // free — passing vacuously here is precisely how "the list did not move"
  // gets written down as a lock working, which this probe exists to prevent.
  check(
    "COLLAPSED: the sheet holds its list at the top under a real scroll",
    sheetScrolls > 0 &&
      lockedBefore !== null &&
      lockedAfter !== null &&
      Math.abs(lockedBefore.y - lockedAfter.y) <= 2,
    `sheet row-one y ${lockedBefore ? Math.round(lockedBefore.y) : "?"} -> ${lockedAfter ? Math.round(lockedAfter.y) : "?"}` +
      (sheetScrolls === 0
        ? " — but zero scroll events arrived, so the lock is UNTESTED rather" +
          " than working"
        : ""),
  )

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

  // --- 3. the same list, unlocked ----------------------------------------
  // The control on the lock: identical input, sheet extended, and now the
  // list scrolls. Without this the two checks above are satisfied by a list
  // that never could have moved.
  const freeBefore = await measure("sheet-row-one")
  report(`sheet row one (extended): ${show(freeBefore)}`)
  await scrollList(5, "wheel")
  const freeAfter = await measure("sheet-row-one")
  report(
    `sheet extended, same wheel: row-one y ${
      freeBefore ? Math.round(freeBefore.y) : "?"
    } -> ${freeAfter ? Math.round(freeAfter.y) : "?"}, ` +
      `sheet list onScroll calls = ${sheetScrolls}`,
  )
  check(
    "EXTENDED: the lock releases and the same wheel scrolls the sheet's list",
    freeBefore !== null &&
      freeAfter !== null &&
      freeBefore.y - freeAfter.y > 20,
    `sheet row-one y ${freeBefore ? Math.round(freeBefore.y) : "?"} -> ${freeAfter ? Math.round(freeAfter.y) : "?"}`,
  )

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
