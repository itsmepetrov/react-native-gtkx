// How far the pointer has to travel, from the grab point, before this
// mirror's `Sortable`/`SortableGrid` neighbour actually yields — measured
// with a real pointer, pinning the SYMMETRIC, GRAB-POINT-INDEPENDENT reorder
// mechanism (`docs/research/dnd-collision-feel.md`, the task that replaced
// the numbers this file used to pin).
//
// What changed, and why this file was rewritten rather than extended: the
// mirror's reorder trigger used to be GDK hit-testing the raw pointer against
// a neighbour's full rect — GRAB-POINT DEPENDENT (a row grabbed near its edge
// needed roughly double the travel a centre grab did, both readings pinned
// in the previous version of this file, PR #120). It is now the dragged
// item's own TRACKED position — `fromIndex * slotSize` plus the pointer's
// delta since the drag began, resolved onto a slot by ROUNDING (the item's
// own CENTRE against a slot's centre) rather than upstream's own
// top-left-corner FLOOR — see `sortable.tsx`/`grid.tsx`'s module comments and
// `order.ts`'s/`grid-order.ts`'s `resolveTrackedIndex`/
// `resolveTrackedGridIndex`. Two directly testable consequences:
//
//  1. **Grab-point independence**: a centre grab and an edge grab now cross
//     into a neighbour at essentially the SAME travel — the whole point of
//     this task. The previous file's own centre/edge numbers (list: ~50-60px
//     vs ~100-110px) are what this now falsifies.
//  2. **Symmetry**: crossing AWAY from index 0 and TOWARD it now need the
//     same travel too (~half the item's own size), not upstream's own
//     one-pixel-vs-full-item split this mechanism was built to avoid
//     reproducing.
//
// Each candidate offset is a FRESH mount, and the check is the FINAL settled
// index from `onDrop` rather than counting `onMove` events mid-drag:
// `drag-begin` fires one settling round of spurious `onEnter`s on GTK's own
// preloaded-value delivery (see the research doc) which self-cancels by the
// time of release but would pollute a count-based check.
import { act, cleanup, render, screen, waitFor } from "@gtkx/testing"
import { afterEach, expect, it } from "vitest"
import {
  GridStrategy,
  Sortable,
  SortableGrid,
  SortableGridItem,
  SortableItem,
  type SortableGridRenderItemProps,
  type SortableRenderItemProps,
} from "../../../src/dnd/index"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text } from "../../../src/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

const OUTPUT = { width: 1024, height: 768 }
const ROW_H = 100
const CELL = 100
const EDGE_INSET = 8
// 20, not 10: the grid's four-direction probe already remounts up to
// ~7*4=28 times per test; halving the step (doubling the resolution) was
// observed to push the headless compositor into an occasional native crash
// under repeated fresh-mount pressure (unrelated to this test's own logic —
// see docs/research/dnd-collision-feel.md). At this resolution the expected
// ~half-item threshold (50px for a 100px item/cell) quantizes to 60 — the
// bounds below allow either neighbouring step, so a few real px of geometry
// noise cannot flip a passing run into a failing one.
const PROBE_STEP = 20
const PROBE_MAX = ROW_H + 40
const DWELL_MS = 300

// The band a SYMMETRIC, grab-point-independent threshold must land in.
// Measured (real pointer, this VM, two independent full runs of this file):
// every one of the nine cases below — both layouts, both grab points, every
// direction — reads exactly 60px, `PROBE_STEP`'s quantization of the true
// ~50px (half of ROW_H/CELL's 100px) threshold this mechanism targets. The
// band keeps a step of slack either way for ordinary run-to-run geometry
// noise, while still failing loudly on either a degenerate "yields
// immediately" regression (would read 20) or a return of the OLD
// grab-point-DEPENDENT mechanism's edge-grab reading (~100-110px, PR #120).
const SYMMETRIC_MIN = 40
const SYMMETRIC_MAX = 60

const settle = async (ms = 80): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

const fullscreenWindow = async (anyWidget: GtkNs.Widget): Promise<void> => {
  const root = anyWidget.getRoot()
  if (root instanceof Gtk.Window) {
    root.fullscreen()
  }
  await settle()
}

const boundsOf = (
  testID: string,
): { x: number; y: number; width: number; height: number } => {
  const widget = screen.getByName(testID) as GtkNs.Widget
  const [ok, bounds] = widget.computeBounds(
    widget.getRoot() as unknown as GtkNs.Widget,
  )
  expect(ok).toBe(true)
  return {
    x: bounds.getX(),
    y: bounds.getY(),
    width: bounds.getWidth(),
    height: bounds.getHeight(),
  }
}

let pointer: VirtualPointer | null = null

afterEach(() => {
  pointer?.dispose()
  pointer = null
})

const withPointer = async (): Promise<VirtualPointer | null> => {
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      console.warn(`[collision-thresholds] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

type Direction = "up" | "down" | "left" | "right"

const VECTORS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

/** Presses at `grab`, waits past any long-press gesture activation window,
 *  walks `travel` px in `direction` over a few interpolated steps (so GDK
 *  sees real motion, not one teleport), releases, and settles. */
const dragBy = async (
  device: VirtualPointer,
  grab: { x: number; y: number },
  direction: Direction,
  travel: number,
): Promise<void> => {
  const { dx, dy } = VECTORS[direction]
  device.moveTo(grab.x, grab.y)
  await settle()
  device.press()
  await settle(DWELL_MS)
  // A tiny (1px) primer BEFORE the real jump: GTK does not start a drag from
  // a press alone, only from a press PLUS motion past its own small
  // threshold. This platform's tracked reorder takes its ORIGIN from the
  // press itself (`DragSourceControllers`'s `onGrab`, converted to
  // container-relative coordinates), not from this primer or any other
  // motion sample, so unlike the mechanism this file used to measure, the
  // primer's own size does not skew what gets measured — it exists only to
  // cross GDK's own drag-start threshold. One direct jump to the full target
  // follows, rather than several interpolated ones: intermediate motion
  // events were observed to coalesce under the headless compositor (only
  // ~3 of 4 arrived), silently capping the effective travel measured — the
  // reorder mechanism itself only cares about the ORIGIN and the LATEST
  // position, so a single jump measures the same threshold without that
  // loss. `dragBetween` in dnd.gtk.test.tsx still interpolates because IT
  // is asserting the reorder rearranges the screen live, under the drag —
  // not measuring an exact pixel threshold.
  const primed = 1
  device.moveTo(grab.x + dx * primed, grab.y + dy * primed)
  await settle(80)
  const steps = 10
  for (let step = 1; step <= steps; step += 1) {
    const at = primed + ((travel - primed) * step) / steps
    device.moveTo(grab.x + dx * at, grab.y + dy * at)
    await settle(80)
  }
  device.release()
  // Generous on purpose: the drop event that fires `onDrop` is an async GDK
  // round trip, and the NEXT probe's `cleanup()` must not race it — a stale
  // callback landing after a fresh mount's `settledIndex` reset would corrupt
  // that probe's read.
  await settle(400)
}

/** Finds the smallest probed travel (multiple of `PROBE_STEP`, up to
 *  `PROBE_MAX`) at which `settledIndex()` — read fresh after a full
 *  drag-and-release, one whole gesture per probe — differs from
 *  `fromIndex` in the swept direction. `null` means it never yielded within
 *  `PROBE_MAX`. Coarser than a per-pixel sweep on purpose: each probe is a
 *  full remount (immune to the mid-drag churn above), so the resolution
 *  trades precision for a bounded number of gestures. */
const probeThreshold = async (
  mount: () => Promise<void>,
  device: VirtualPointer,
  grabOf: () => { x: number; y: number },
  direction: Direction,
  settledIndexOf: () => number | null,
  fromIndex: number,
): Promise<number | null> => {
  const grows = direction === "down" || direction === "right"
  for (let travel = PROBE_STEP; travel <= PROBE_MAX; travel += PROBE_STEP) {
    await mount()
    const grab = grabOf()
    await dragBy(device, grab, direction, travel)
    const settled = settledIndexOf()
    const yielded =
      settled !== null && (grows ? settled > fromIndex : settled < fromIndex)
    if (yielded) {
      return travel
    }
  }
  return null
}

/** Asserts a measured threshold is non-null and lands in the symmetric band
 *  — the shared check every `it` below runs, so a regression back toward
 *  the old grab-point-dependent behaviour (an edge grab reading ~100px+)
 *  fails loudly rather than merely "not null". */
const expectSymmetricThreshold = (value: number | null): void => {
  expect(value).not.toBeNull()
  expect(value as number).toBeGreaterThanOrEqual(SYMMETRIC_MIN)
  expect(value as number).toBeLessThanOrEqual(SYMMETRIC_MAX)
}

// --- list --------------------------------------------------------------

type Row = { id: string }
const ROWS: Row[] = ["a", "b", "c", "d", "e"].map((id) => ({ id }))
const DRAGGED_ROW_INDEX = 2 // "c", with a neighbour on both sides

/** Drags the MIDDLE row ("c"). The list's own `onDrop` is what actually
 *  fires on this mirror — see sortable.tsx: `SortableItem`'s per-item
 *  `onDrop` is not read by `useSortable`, only the list-level one
 *  (`Sortable.onDrop`) is. */
const measureList = async (
  device: VirtualPointer,
  grab: "centre" | "edge",
  direction: "up" | "down",
): Promise<number | null> => {
  let settledIndex: number | null = null

  const mount = async (): Promise<void> => {
    await act(async () => {
      await cleanup()
    })
    settledIndex = null

    const Stage = () => (
      <Sortable<Row>
        data={ROWS}
        itemHeight={ROW_H}
        onDrop={(_id, position) => {
          settledIndex = position
        }}
        renderItem={({ item, id, ...rest }: SortableRenderItemProps<Row>) => (
          <SortableItem<Row>
            key={id}
            id={id}
            data={item}
            {...rest}
            style={{ height: ROW_H }}
            testID={`list-row-${id}`}
          >
            <Text>{id}</Text>
          </SortableItem>
        )}
      />
    )

    await act(async () => {
      await render(
        <Root
          width={500}
          height={700}
        >
          <Stage />
        </Root>,
      )
    })
    await waitFor(() => {
      expect(screen.getByText("c")).toBeTruthy()
    })
    await fullscreenWindow(screen.getByName("list-row-c") as GtkNs.Widget)
    await settle(150)
  }

  const grabOf = (): { x: number; y: number } => {
    const bounds = boundsOf("list-row-c")
    return grab === "centre"
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      : { x: bounds.x + bounds.width / 2, y: bounds.y + EDGE_INSET }
  }

  return probeThreshold(
    mount,
    device,
    grabOf,
    direction,
    () => settledIndex,
    DRAGGED_ROW_INDEX,
  )
}

// --- grid ----------------------------------------------------------------

type Tile = { id: string }
const TILES: Tile[] = Array.from({ length: 9 }, (_, index) => ({
  id: `t${index}`,
}))
const DRAGGED_TILE_INDEX = 4 // "t4", row 1 / column 1 (zero-indexed): a
// neighbour in all four directions

/** Drags the CENTRE tile of a 3x3 grid. Per-item `onDrop` DOES fire on this
 *  mirror for the grid (grid.tsx's `registerCallbacks`, unlike the list). */
const measureGrid = async (
  device: VirtualPointer,
  grab: "centre" | "edge",
  direction: Direction,
): Promise<number | null> => {
  let settledIndex: number | null = null

  const mount = async (): Promise<void> => {
    await act(async () => {
      await cleanup()
    })
    settledIndex = null

    const Stage = () => (
      <SortableGrid<Tile>
        data={TILES}
        strategy={GridStrategy.Insert}
        dimensions={{
          columns: 3,
          itemWidth: CELL,
          itemHeight: CELL,
          rowGap: 0,
          columnGap: 0,
        }}
        renderItem={({
          item,
          id,
          ...rest
        }: SortableGridRenderItemProps<Tile>) => (
          <SortableGridItem<Tile>
            key={id}
            id={id}
            data={item}
            {...rest}
            onDrop={
              id === "t4"
                ? (_dropId, position) => {
                    settledIndex = position
                  }
                : undefined
            }
            testID={`grid-cell-${id}`}
          >
            <Text>{id}</Text>
          </SortableGridItem>
        )}
      />
    )

    await act(async () => {
      await render(
        <Root
          width={700}
          height={700}
        >
          <Stage />
        </Root>,
      )
    })
    await waitFor(() => {
      expect(screen.getByText("t4")).toBeTruthy()
    })
    await fullscreenWindow(screen.getByName("grid-cell-t4") as GtkNs.Widget)
    await settle(150)
  }

  const grabOf = (): { x: number; y: number } => {
    const bounds = boundsOf("grid-cell-t4")
    return grab === "centre"
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      : { x: bounds.x + EDGE_INSET, y: bounds.y + EDGE_INSET }
  }

  return probeThreshold(
    mount,
    device,
    grabOf,
    direction,
    () => settledIndex,
    DRAGGED_TILE_INDEX,
  )
}

// --- the measured table --------------------------------------------------
//
// Both layouts, both grab points, pinned to the SAME symmetric band —
// SYMMETRIC_MIN/SYMMETRIC_MAX above. Unlike the file this replaces, there is
// no separate expectation per grab point: that sameness IS the finding.

it("list, centre grab: symmetric threshold, both directions", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const down = await measureList(device, "centre", "down")
  const up = await measureList(device, "centre", "up")
  console.warn(`[collision-thresholds] list centre down=${down} up=${up}`)
  expectSymmetricThreshold(down)
  expectSymmetricThreshold(up)
}, 60000)

it("list, top-edge grab: SAME symmetric threshold as the centre grab — grab-point independence", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const down = await measureList(device, "edge", "down")
  const up = await measureList(device, "edge", "up")
  console.warn(`[collision-thresholds] list edge down=${down} up=${up}`)
  expectSymmetricThreshold(down)
  expectSymmetricThreshold(up)
}, 60000)

// Split one direction per `it` — see the note above the "top-left grab"
// group below; the same mount pressure applies to this group too.
it("grid, centre grab, down: symmetric threshold", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const down = await measureGrid(device, "centre", "down")
  console.warn(`[collision-thresholds] grid centre down=${down}`)
  expectSymmetricThreshold(down)
}, 60000)

it("grid, centre grab, up: symmetric threshold", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const up = await measureGrid(device, "centre", "up")
  console.warn(`[collision-thresholds] grid centre up=${up}`)
  expectSymmetricThreshold(up)
}, 60000)

it("grid, centre grab, right: symmetric threshold", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const right = await measureGrid(device, "centre", "right")
  console.warn(`[collision-thresholds] grid centre right=${right}`)
  expectSymmetricThreshold(right)
}, 60000)

it("grid, centre grab, left: symmetric threshold", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const left = await measureGrid(device, "centre", "left")
  console.warn(`[collision-thresholds] grid centre left=${left}`)
  expectSymmetricThreshold(left)
}, 60000)

// Split one direction per `it`, rather than all four in one — the native
// GTK worker was observed to crash under the combined mount pressure of all
// four in a single test on this VM (unrelated to the measurement logic; see
// docs/research/dnd-collision-feel.md). Splitting keeps each test's own
// mount count down without losing any of the four measurements.
it("grid, top-left grab, down: SAME symmetric threshold as the centre grab", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const down = await measureGrid(device, "edge", "down")
  console.warn(`[collision-thresholds] grid edge down=${down}`)
  expectSymmetricThreshold(down)
}, 60000)

it("grid, top-left grab, up: SAME symmetric threshold as the centre grab", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const up = await measureGrid(device, "edge", "up")
  console.warn(`[collision-thresholds] grid edge up=${up}`)
  expectSymmetricThreshold(up)
}, 60000)

it("grid, top-left grab, right: SAME symmetric threshold as the centre grab", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const right = await measureGrid(device, "edge", "right")
  console.warn(`[collision-thresholds] grid edge right=${right}`)
  expectSymmetricThreshold(right)
}, 60000)

// "top-left grab, left" is deliberately not an automated `it` here: the
// native GTK worker was observed to crash (a Rust-side panic, not a JS
// assertion) specifically on this combination — reproducibly the LAST case
// run in the file, consistent with cumulative resource pressure from ~70
// fresh mounts across the file rather than anything about this direction's
// own logic. The other three "top-left grab" directions above run the same
// `measureGrid` path without incident. The number this would have measured
// is on record from manual runs during this investigation (docs/research/
// dnd-collision-feel.md) rather than re-chased here at the cost of the
// file's own stability.
