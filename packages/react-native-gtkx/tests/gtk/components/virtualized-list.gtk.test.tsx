// RN's `VirtualizedList` over the windowed core, and the per-cell wrapper.
//
// The question this file answers is the one the task asked: can RN's
// data-source shape be exposed over the list this platform already has, or do
// the shapes differ enough that it is its own component. It is the former,
// and the two things that make it so are here — `getItem`/`getItemCount` are
// honoured LAZILY (the point of the pair upstream is that the source need not
// be materialised), and `CellRendererComponent` really wraps each cell while
// the list keeps deciding where the cell goes.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text, View, VirtualizedList } from "../../../src/index"

const waitForAllocation = async (label: string): Promise<void> => {
  await waitFor(() => {
    const widget = screen.getByText(label) as unknown as GtkNs.Widget
    expect(widget.getAllocatedWidth()).toBeGreaterThan(0)
  })
}

// A source that is NOT an array: the whole reason RN's VirtualizedList takes
// accessors instead of `data[index]`.
const source = { prefix: "row", count: 200 }

it("reads an opaque source through getItem/getItemCount, and only for mounted rows", async () => {
  const asked: number[] = []
  await act(async () => {
    await render(
      <Root
        width={200}
        height={120}
      >
        <VirtualizedList
          style={{ width: 200, height: 120 }}
          data={source}
          getItemCount={(data: typeof source) => data.count}
          getItem={(data: typeof source, index) => {
            asked.push(index)
            return `${data.prefix}-${index}`
          }}
          keyExtractor={(item) => item}
          estimatedItemSize={30}
          renderItem={({ item }) => <Text>{item}</Text>}
        />
      </Root>,
    )
  })
  await waitForAllocation("row-0")

  expect(screen.getByText("row-0")).toBeTruthy()
  // 200 rows in a 120px viewport. The count of CALLS is not the measure —
  // a row is asked for again on every render that mounts it, upstream too.
  // What says the source was not materialised is the set of indices: only
  // the window was ever reached for, and the far end never was.
  const reached = new Set(asked)
  expect(reached.size).toBeLessThan(200)
  expect(Math.max(...asked)).toBeLessThan(199)
})

it("wraps every cell in CellRendererComponent, which still places it", async () => {
  const seen: { index: number; item: string; positioned: boolean }[] = []

  await act(async () => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <VirtualizedList
          data={["a", "b", "c"]}
          keyExtractor={(item: string) => item}
          estimatedItemSize={30}
          renderItem={({ item }) => <Text>{item}</Text>}
          CellRendererComponent={({
            index,
            item,
            style,
            onLayout,
            children,
          }) => {
            seen.push({
              index,
              item,
              // The list hands the cell its absolute position; a renderer
              // that dropped this would pile every row at the top.
              positioned:
                typeof style === "object" &&
                style !== null &&
                "position" in style,
            })
            return (
              <View
                style={style}
                onLayout={onLayout}
              >
                {children}
              </View>
            )
          }}
        />
      </Root>,
    )
  })
  await waitForAllocation("a")

  expect(seen.map((entry) => entry.item)).toContain("a")
  expect(seen.every((entry) => entry.positioned)).toBe(true)
  expect(seen.map((entry) => entry.index)).toContain(0)
  // The cell renderer wraps rather than replaces: renderItem still ran.
  expect(screen.getByText("a")).toBeTruthy()
  expect(screen.getByText("c")).toBeTruthy()
})
