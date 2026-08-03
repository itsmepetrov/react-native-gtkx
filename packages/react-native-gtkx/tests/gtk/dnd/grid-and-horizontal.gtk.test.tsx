// Acceptance tests for the three things `dnd/index` gained this round:
// `SortableGrid`, `SortableDirection.Horizontal`, and edge autoscroll —
// driven by a REAL pointer for the same reason dnd.gtk.test.tsx is: a
// `GtkDragSource`/`GtkDropTarget` only fire from GDK's own machinery, not
// from a synthesised signal. See that file for the fuller argument.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useState } from "react"
import { afterEach, expect, it } from "vitest"
import {
  GridOrientation,
  GridStrategy,
  Sortable,
  SortableDirection,
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

const boundsOf = (testID: string) => {
  const widget = screen.getByName(testID) as GtkNs.Widget
  const [ok, bounds] = widget.computeBounds(
    widget.getRoot() as unknown as GtkNs.Widget,
  )
  expect(ok).toBe(true)
  return bounds
}

const centreOf = (testID: string): { x: number; y: number } => {
  const bounds = boundsOf(testID)
  return {
    x: bounds.getX() + bounds.getWidth() / 2,
    y: bounds.getY() + bounds.getHeight() / 2,
  }
}

const leftOf = (testID: string): number => boundsOf(testID).getX()

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
      console.warn(`[grid-and-horizontal] skipped: ${error.message}`)
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

const HorizontalStage = ({ onDrop }: { onDrop: (order: string) => void }) => {
  const [data] = useState<Task[]>([
    { id: "a", title: "a" },
    { id: "b", title: "b" },
    { id: "c", title: "c" },
  ])

  return (
    <Sortable<Task>
      data={data}
      direction={SortableDirection.Horizontal}
      itemWidth={140}
      renderItem={({ item, id, ...rest }: SortableRenderItemProps<Task>) => (
        <SortableItem<Task>
          key={id}
          id={id}
          data={item}
          {...rest}
          style={{ width: 140, height: 140 }}
          testID={`col-${id}`}
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

it("reorders a horizontal Sortable when one column is dragged onto another", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const orders: string[] = []

  await act(async () => {
    await render(
      <Root
        width={700}
        height={300}
      >
        <HorizontalStage onDrop={(order) => orders.push(order)} />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByName("col-a")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByName("col-a") as GtkNs.Widget)
  await settle(150)

  await dragBetween(device, centreOf("col-a"), centreOf("col-c"))

  await waitFor(() => {
    expect(orders).toHaveLength(1)
  })
  // "a" took "c"'s index: settled order is b, c, a — same reorder-by-crossing
  // as the vertical list, just measured on the other axis below.
  expect(orders[0]).toBe("bca")

  await settle(300)
  expect(leftOf("col-b")).toBeLessThan(leftOf("col-c"))
  expect(leftOf("col-c")).toBeLessThan(leftOf("col-a"))
})

type Photo = { id: string; label: string }

const GridStage = ({
  strategy,
  onDrop,
}: {
  strategy: GridStrategy
  onDrop: (order: string) => void
}) => {
  const [data] = useState<Photo[]>([
    { id: "a", label: "a" },
    { id: "b", label: "b" },
    { id: "c", label: "c" },
    { id: "d", label: "d" },
  ])

  return (
    <SortableGrid<Photo>
      data={data}
      dimensions={{ columns: 2, itemWidth: 120, itemHeight: 120 }}
      orientation={GridOrientation.Vertical}
      strategy={strategy}
      renderItem={({
        item,
        id,
        ...rest
      }: SortableGridRenderItemProps<Photo>) => (
        <SortableGridItem<Photo>
          key={id}
          id={id}
          data={item}
          {...rest}
          testID={`cell-${id}`}
          onDrop={(_id, _position, all) =>
            onDrop(
              Object.entries(all ?? {})
                .sort((left, right) => left[1].index - right[1].index)
                .map(([key]) => key)
                .join(""),
            )
          }
        >
          <Text>{item.label}</Text>
        </SortableGridItem>
      )}
    />
  )
}

it("reorders a SortableGrid (Insert strategy) when one cell is dragged onto another", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const orders: string[] = []

  await act(async () => {
    await render(
      <Root
        width={500}
        height={500}
      >
        <GridStage
          strategy={GridStrategy.Insert}
          onDrop={(order) => orders.push(order)}
        />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByName("cell-a")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByName("cell-a") as GtkNs.Widget)
  await settle(150)

  // Grid, columns: 2 — a b / c d. "a" and "c" share a column, so the drag is
  // a straight vertical line — the same single boundary a plain vertical
  // `Sortable` crosses, rather than the four-way corner a diagonal a→d drag
  // would graze. Dragging "a" (index 0) onto "c" (index 2) shifts b up one
  // slot; "a" lands at index 2, "d" is untouched.
  await dragBetween(device, centreOf("cell-a"), centreOf("cell-c"))

  await waitFor(() => {
    expect(orders).toHaveLength(1)
  })
  expect(orders[0]).toBe("bcad")
})

it("trades exactly two cells under GridStrategy.Swap", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const orders: string[] = []

  await act(async () => {
    await render(
      <Root
        width={500}
        height={500}
      >
        <GridStage
          strategy={GridStrategy.Swap}
          onDrop={(order) => orders.push(order)}
        />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByName("cell-a")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByName("cell-a") as GtkNs.Widget)
  await settle(150)

  // Same column-only drag as the Insert test above, for the same reason.
  await dragBetween(device, centreOf("cell-a"), centreOf("cell-c"))

  await waitFor(() => {
    expect(orders).toHaveLength(1)
  })
  // Only a and c trade places; b and d stay exactly where they were.
  expect(orders[0]).toBe("cbad")
})

const TallStage = () => {
  const [data] = useState<Task[]>(
    Array.from({ length: 12 }, (_, index) => ({
      id: `t${index}`,
      title: `Task ${index}`,
    })),
  )

  return (
    <Sortable<Task>
      data={data}
      testID="tall-list"
      renderItem={({ item, id, ...rest }: SortableRenderItemProps<Task>) => (
        <SortableItem<Task>
          key={id}
          id={id}
          data={item}
          {...rest}
          style={{ height: 80 }}
          testID={`row-${id}`}
        >
          <Text>{item.title}</Text>
        </SortableItem>
      )}
    />
  )
}

it("autoscrolls a Sortable toward the bottom edge while a drag lingers there", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }

  await act(async () => {
    // A viewport far shorter than the 12*80=960px of content, so there is
    // real range to scroll and the drag's own row never reaches the bottom
    // edge just by walking down the list.
    await render(
      <Root
        width={400}
        height={260}
      >
        <TallStage />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByName("row-t0")).toBeTruthy()
  })
  await fullscreenWindow(screen.getByName("row-t0") as GtkNs.Widget)
  await settle(150)

  const scrolledWindow = screen.getByName(
    "tall-list",
  ) as unknown as GtkNs.ScrolledWindow
  expect(scrolledWindow.getVadjustment()?.getValue()).toBe(0)

  const from = centreOf("row-t0")
  device.moveTo(from.x, from.y)
  await settle()
  device.press()
  await settle()
  // Walk down to just inside the viewport's bottom edge and hold — this is
  // the edge band `autoscroll.tsx` watches, not a row crossing.
  const bottomEdge = { x: from.x, y: 250 }
  for (let step = 1; step <= 6; step += 1) {
    device.moveTo(
      from.x + ((bottomEdge.x - from.x) * step) / 6,
      from.y + ((bottomEdge.y - from.y) * step) / 6,
    )
    await settle(60)
  }
  // Hold inside the edge band. The tick callback runs on the compositor's own
  // frame clock, which free-runs far faster than 60fps under the headless
  // backend (docs/research/scroll-phases.md), so this is ample real time for
  // the scroll to have moved measurably.
  await settle(400)

  const scrolledPastZero = scrolledWindow.getVadjustment()?.getValue() ?? 0
  expect(scrolledPastZero).toBeGreaterThan(0)

  device.release()
  await settle(200)
})
