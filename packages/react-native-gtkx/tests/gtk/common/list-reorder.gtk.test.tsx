// The acceptance test for the whole epic: rows written in React Native,
// dragged by a REAL pointer, reordering.
//
// Why a real pointer and not a synthesised signal. GTK drag-and-drop is not
// a gesture whose callbacks can be poked — `GtkDragSource` only produces a
// drag when GDK's own drag machinery starts one from a genuine button press
// and motion past the drag threshold, and `GtkDropTarget` only fires on a
// drop that GDK routed to it by POSITION. Emitting "prepare" by hand would
// assert that our JSX reached the controller and nothing about whether a
// user can drag a row. So this drives `zwlr_virtual_pointer_v1` on the
// worker's own compositor (support/virtual-pointer.ts, from the same change
// that closed the compositor -> GDK -> GtkGesture hop) and lets the whole
// stack run.
//
// This is the bar #33 set for the widget-built rows, met by rows that are
// `View`, `Pressable` and `Text`.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useState } from "react"
import { afterEach, expect, it } from "vitest"
import { List, ListRow, rowPosition } from "../../../src/common/index"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root } from "../../../src/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

// Matches @gtkx/vitest's DEFAULT_HEADLESS_SIZE.
const OUTPUT = { width: 1024, height: 768 }

const settle = async (ms = 80): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/**
 * Fullscreens the harness window so window coordinates and output
 * coordinates coincide — sway floats and centres windows by default, and a
 * centred window would make every measured point wrong by an unknown offset.
 */
const fullscreenWindow = async (anyWidget: GtkNs.Widget): Promise<void> => {
  const root = anyWidget.getRoot()
  if (root instanceof Gtk.Window) {
    root.fullscreen()
  }
  await settle()
}

const centreOf = (testID: string): { x: number; y: number } => {
  const row = screen.getByName(testID) as GtkNs.Widget
  const [ok, bounds] = row.computeBounds(
    row.getRoot() as unknown as GtkNs.Widget,
  )
  expect(ok).toBe(true)
  return {
    x: bounds.getX() + bounds.getWidth() / 2,
    y: bounds.getY() + bounds.getHeight() / 2,
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
      console.warn(`[list-reorder] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

const Stage = ({
  onReorder,
}: {
  onReorder: (dragged: string, target: string) => void
}) => {
  const [order, setOrder] = useState(["a", "b", "c"])
  return (
    <List
      onReorder={(dragged, target) => {
        onReorder(dragged, target)
        setOrder((current) => {
          const without = current.filter((id) => id !== dragged)
          const at = without.indexOf(target)
          return [...without.slice(0, at), dragged, ...without.slice(at)]
        })
      }}
    >
      {order.map((id, index) => (
        <ListRow
          key={id}
          testID={`row-${id}`}
          title={`Task ${id}`}
          reorderId={id}
          position={rowPosition(index, order.length)}
          onPress={() => {}}
          // Big enough that a drag between two of them clears GTK's drag
          // threshold with room to spare.
          style={{ height: 120 }}
        />
      ))}
    </List>
  )
}

it("reorders rows written in React Native, dragged by a real pointer", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const reorders: [string, string][] = []

  await act(async () => {
    await render(
      <Root
        width={600}
        height={500}
      >
        <Stage
          onReorder={(dragged, target) => reorders.push([dragged, target])}
        />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("Task a")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByName("row-a") as GtkNs.Widget)
  // `Controllers` attaches one commit after mount by design (see
  // gtk/controllers.tsx) — let that commit land before aiming at it.
  await settle()

  const from = centreOf("row-a")
  const to = centreOf("row-c")

  device.moveTo(from.x, from.y)
  await settle()
  device.press()
  await settle()
  // Several intermediate motions: GDK starts a drag only after the pointer
  // has travelled past its threshold while a button is held, and the drop
  // target needs at least one motion inside itself to become current.
  for (let step = 1; step <= 6; step += 1) {
    device.moveTo(
      from.x + ((to.x - from.x) * step) / 6,
      from.y + ((to.y - from.y) * step) / 6,
    )
    await settle(60)
  }
  device.release()
  await settle(150)

  await waitFor(() => {
    expect(reorders).toHaveLength(1)
  })
  // The half that proves aiming rather than luck: the ids are the two rows
  // the pointer actually started and finished over.
  expect(reorders[0]).toEqual(["a", "c"])

  await settle(300)
  const topOf = (testID: string): number => {
    const row = screen.getByName(testID) as GtkNs.Widget
    return row.computeBounds(row.getRoot() as unknown as GtkNs.Widget)[1].getY()
  }
  // And the state change reached the screen: "a" is now where "b" was, which
  // is what a reorder IS. Asserting the callback alone would have passed
  // while the rows redrew exactly where they started (see
  // tests/gtk/layout/child-order.gtk.test.tsx for the bug that was).
  expect(topOf("row-b")).toBeLessThan(topOf("row-a"))
  expect(topOf("row-a")).toBeLessThan(topOf("row-c"))
})

it("attaches no drag controllers to a list that declares no onReorder", async () => {
  await act(async () => {
    await render(
      <Root
        width={400}
        height={300}
      >
        <List>
          <ListRow
            testID="row"
            title="Task"
            reorderId="a"
            position="only"
            onPress={() => {}}
          />
        </List>
      </Root>,
    )
  })
  await settle()

  // A `reorderId` with nothing to report to cannot mean anything, and a row
  // that offers a drag the list will not honour is worse than one that does
  // not offer it.
  const controllers = (
    screen.getByName("row") as GtkNs.Widget
  ).observeControllers()
  let dragSources = 0
  for (let index = 0; index < controllers.getNItems(); index += 1) {
    if (controllers.getItem(index) instanceof Gtk.DragSource) {
      dragSources += 1
    }
  }
  expect(dragSources).toBe(0)
})
