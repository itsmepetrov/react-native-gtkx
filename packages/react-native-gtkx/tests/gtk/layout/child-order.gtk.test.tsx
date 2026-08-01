// Reordering keyed siblings has to move them on screen.
//
// It did not, until this file existed. A child chose its Yoga index once, on
// mount, from where the reconciler had put its widget — correct for a child
// that APPEARS mid-list, blind to one that MOVES. React reorders keyed
// siblings by moving the existing fibers: nothing mounts, nothing unmounts,
// so the widgets ended up in the new order while the shadow tree kept the
// old one, and the rects come from the shadow tree. Every list that can be
// sorted, filtered into a different order or dragged into one was affected;
// nothing had exercised it because the only reorderable list in the repo was
// a `GtkListBox`, which does its own layout.
//
// The assertions are about the RECTS, deliberately. The widget order was
// already right — asserting on it would have passed before the fix.
import { act, render, screen } from "@gtkx/testing"
import { useState } from "react"
import { expect, it } from "vitest"
import { type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text, View } from "../../../src/index"

const ROW_HEIGHT = 40

const topOf = (id: string): number => {
  const widget = screen.getByName(`row-${id}`) as GtkNs.Widget
  return widget
    .computeBounds(widget.getRoot() as unknown as GtkNs.Widget)[1]
    .getY()
}

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

const renderRows = async (
  initial: string[],
): Promise<(next: string[]) => Promise<void>> => {
  let apply: ((next: string[]) => void) | undefined
  const Stage = () => {
    const [order, setOrder] = useState(initial)
    apply = setOrder
    return (
      <View testID="container">
        {order.map((id) => (
          <View
            key={id}
            testID={`row-${id}`}
            style={{ height: ROW_HEIGHT }}
          >
            <Text>{id}</Text>
          </View>
        ))}
      </View>
    )
  }
  await act(async () => {
    await render(
      <Root
        width={300}
        height={400}
      >
        <Stage />
      </Root>,
    )
  })
  await settle()
  return async (next: string[]) => {
    await act(async () => {
      apply?.(next)
    })
    await settle()
  }
}

it("moves a child that React reordered, not just the widget under it", async () => {
  const reorder = await renderRows(["a", "b", "c"])
  expect([topOf("a"), topOf("b"), topOf("c")]).toEqual([0, 40, 80])

  await reorder(["b", "a", "c"])
  expect([topOf("a"), topOf("b"), topOf("c")]).toEqual([40, 0, 80])

  // A move to the end, and one back to the front — the two cases a
  // "swap the pair" implementation would get wrong.
  await reorder(["a", "c", "b"])
  expect([topOf("a"), topOf("b"), topOf("c")]).toEqual([0, 80, 40])

  await reorder(["c", "b", "a"])
  expect([topOf("a"), topOf("b"), topOf("c")]).toEqual([80, 40, 0])
})

it("still places a child that is inserted into the middle", async () => {
  // The behaviour the mount-time index was written for, kept honest: the
  // order sync must not regress insertion.
  const reorder = await renderRows(["a", "c"])
  expect([topOf("a"), topOf("c")]).toEqual([0, 40])

  await reorder(["a", "b", "c"])
  expect([topOf("a"), topOf("b"), topOf("c")]).toEqual([0, 40, 80])

  await reorder(["a", "c"])
  expect([topOf("a"), topOf("c")]).toEqual([0, 40])
})
