// The acceptance tests for `react-native-gtkx/dnd`, driven by a REAL pointer.
//
// Why a real pointer and not a synthesised signal, restated because it is the
// whole reason these tests are worth having: `GtkDragSource` produces a drag
// only when GDK's own machinery starts one from a genuine button press and
// motion past the drag threshold, and `GtkDropTarget` fires only on a drop
// GDK routed to it BY POSITION. Emitting `prepare` by hand would assert that
// our JSX reached the controller and nothing about whether a user can drag.
// So this drives `zwlr_virtual_pointer_v1` on the worker's own compositor
// (support/virtual-pointer.ts) and lets the whole stack run.
//
// A Wayland pointer is addressed by POSITION, not focus — so every test here
// also asserts that the drop zones the pointer did not visit stayed silent.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useState } from "react"
import { afterEach, expect, it } from "vitest"
import {
  Draggable,
  Droppable,
  DropProvider,
  Sortable,
  SortableItem,
  type SortableRenderItemProps,
} from "../../../src/dnd/index"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text, View } from "../../../src/index"
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

/** Fullscreens the harness window so window coordinates and output
 *  coordinates coincide — sway floats and centres windows by default, and a
 *  centred window would make every measured point wrong by an unknown
 *  offset. */
const fullscreenWindow = async (anyWidget: GtkNs.Widget): Promise<void> => {
  const root = anyWidget.getRoot()
  if (root instanceof Gtk.Window) {
    root.fullscreen()
  }
  await settle()
}

const centreOf = (testID: string): { x: number; y: number } => {
  const widget = screen.getByName(testID) as GtkNs.Widget
  const [ok, bounds] = widget.computeBounds(
    widget.getRoot() as unknown as GtkNs.Widget,
  )
  expect(ok).toBe(true)
  return {
    x: bounds.getX() + bounds.getWidth() / 2,
    y: bounds.getY() + bounds.getHeight() / 2,
  }
}

const topOf = (testID: string): number => {
  const widget = screen.getByName(testID) as GtkNs.Widget
  return widget
    .computeBounds(widget.getRoot() as unknown as GtkNs.Widget)[1]
    .getY()
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
      console.warn(`[dnd] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

/** Press at `from`, walk to `to` in six steps, release. Six because GDK
 *  starts a drag only after the pointer has travelled past its threshold with
 *  a button held, and a drop target needs at least one motion inside itself
 *  to become current. */
const dragBetween = async (
  device: VirtualPointer,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  device.moveTo(from.x, from.y)
  await settle()
  device.press()
  await settle()
  for (let step = 1; step <= 6; step += 1) {
    device.moveTo(
      from.x + ((to.x - from.x) * step) / 6,
      from.y + ((to.y - from.y) * step) / 6,
    )
    await settle(60)
  }
  device.release()
  await settle(150)
}

type Task = { id: string; title: string }

const BOX = { height: 140, borderWidth: 1 } as const

it("carries a Draggable's data into the Droppable the pointer released over", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const intoInbox: Task[] = []
  // The negative control: a second zone the pointer never enters. Without it
  // a drop that fired on EVERY registered target would pass the test.
  const intoArchive: Task[] = []
  const states: string[] = []

  await act(async () => {
    await render(
      <Root
        width={700}
        height={620}
      >
        <DropProvider>
          <Droppable<Task>
            droppableId="inbox"
            onDrop={(task) => intoInbox.push(task)}
            style={BOX}
            testID="inbox"
          >
            <Text>Inbox</Text>
          </Droppable>
          <Droppable<Task>
            droppableId="archive"
            onDrop={(task) => intoArchive.push(task)}
            style={BOX}
            testID="archive"
          >
            <Text>Archive</Text>
          </Droppable>
          <Draggable<Task>
            data={{ id: "t1", title: "Write it down" }}
            draggableId="t1"
            onStateChange={(state) => states.push(state)}
            style={BOX}
            testID="card"
          >
            <Text>Write it down</Text>
          </Draggable>
        </DropProvider>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("Inbox")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByName("card") as GtkNs.Widget)
  // `Controllers` attaches one commit after mount by design (see
  // gtk/controllers.tsx), and the drag source waits one more for a handle
  // that may never register (see dnd/draggable.tsx) — let both land.
  await settle(150)

  await dragBetween(device, centreOf("card"), centreOf("inbox"))

  await waitFor(() => {
    expect(intoInbox).toHaveLength(1)
  })
  // The data made the round trip: only the id crosses GDK, and the provider's
  // registry turns it back into the object (see dnd/payload.ts).
  expect(intoInbox[0]).toEqual({ id: "t1", title: "Write it down" })
  // The zone the pointer never visited heard nothing.
  expect(intoArchive).toEqual([])
  // IDLE on mount, DRAGGING on drag-begin, DROPPED because a target took it.
  expect(states).toEqual(["IDLE", "DRAGGING", "DROPPED"])
})

it("refuses a drop into a zone that is already at capacity", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const drops: string[] = []

  const Stage = () => (
    <DropProvider>
      <Droppable<Task>
        droppableId="single"
        capacity={1}
        onDrop={(task) => drops.push(task.id)}
        style={BOX}
        testID="single"
      >
        <Text>One only</Text>
      </Droppable>
      <Draggable<Task>
        data={{ id: "first", title: "First" }}
        draggableId="first"
        style={BOX}
        testID="first"
      >
        <Text>First</Text>
      </Draggable>
      <Draggable<Task>
        data={{ id: "second", title: "Second" }}
        draggableId="second"
        style={BOX}
        testID="second"
      >
        <Text>Second</Text>
      </Draggable>
    </DropProvider>
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
    expect(screen.getByText("One only")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByName("single") as GtkNs.Widget)
  await settle(150)

  await dragBetween(device, centreOf("first"), centreOf("single"))
  await waitFor(() => {
    expect(drops).toEqual(["first"])
  })

  // Same gesture, same zone, now full. GDK is told to refuse in `::accept`,
  // so this is not "the handler ignored it" — the drop never happens.
  await dragBetween(device, centreOf("second"), centreOf("single"))
  await settle(200)
  expect(drops).toEqual(["first"])
})

const SortableStage = ({ onDrop }: { onDrop: (order: string) => void }) => {
  const [data] = useState<Task[]>([
    { id: "a", title: "Task a" },
    { id: "b", title: "Task b" },
    { id: "c", title: "Task c" },
  ])

  return (
    <Sortable<Task>
      data={data}
      // Upstream's own documented call shape: destructure what you need,
      // forward the rest opaquely. This compiling unchanged is the point of
      // the whole mirror.
      renderItem={({ item, id, ...rest }: SortableRenderItemProps<Task>) => (
        <SortableItem<Task>
          key={id}
          id={id}
          data={item}
          {...rest}
          style={{ height: 140 }}
          testID={`row-${id}`}
        >
          <Text>{item.title}</Text>
        </SortableItem>
      )}
      onDrop={(_id, _position, all) =>
        onDrop(
          Object.entries(all ?? {})
            .sort((left, right) => left[1] - right[1])
            .map(([key]) => key)
            .join(""),
        )
      }
    />
  )
}

it("reorders a Sortable when one row is dragged onto another", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const orders: string[] = []

  await act(async () => {
    await render(
      <Root
        width={600}
        height={620}
      >
        <SortableStage onDrop={(order) => orders.push(order)} />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("Task a")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByName("row-a") as GtkNs.Widget)
  await settle(150)

  await dragBetween(device, centreOf("row-a"), centreOf("row-c"))

  await waitFor(() => {
    expect(orders).toHaveLength(1)
  })
  // "a" took "c"'s index, so the settled order is b, c, a.
  expect(orders[0]).toBe("bca")

  await settle(300)
  // And it reached the screen. Asserting the callback alone would pass while
  // the rows redrew exactly where they started — see
  // tests/gtk/layout/child-order.gtk.test.tsx for the bug that was.
  expect(topOf("row-b")).toBeLessThan(topOf("row-c"))
  expect(topOf("row-c")).toBeLessThan(topOf("row-a"))
})

it("attaches no drag source to a Draggable that is disabled", async () => {
  await act(async () => {
    await render(
      <Root
        width={400}
        height={300}
      >
        <DropProvider>
          <Draggable<Task>
            data={{ id: "x", title: "x" }}
            dragDisabled
            testID="inert"
          >
            <View />
          </Draggable>
        </DropProvider>
      </Root>,
    )
  })
  await settle(150)

  // `dragDisabled` removes the controller rather than swallowing the drag in
  // a handler: a widget that looks draggable to GDK but refuses every drag is
  // worse than one that was never a source.
  const controllers = (
    screen.getByName("inert") as GtkNs.Widget
  ).observeControllers()
  let dragSources = 0
  for (let index = 0; index < controllers.getNItems(); index += 1) {
    if (controllers.getItem(index) instanceof Gtk.DragSource) {
      dragSources += 1
    }
  }
  expect(dragSources).toBe(0)
})
