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
import type { ReactNode } from "react"
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

// REGRESSION. A list whose every cell has ZERO flow height, because each cell
// positions its own row absolutely. That is not a contrived shape: it is how
// `react-native-reanimated-dnd`'s `Sortable` renders — rows are `position:
// absolute` with a per-frame animated `top`, so the FlatList cell around each
// one measures 0 — and how any list that owns its row positions renders. RN
// renders such a list in full; we rendered NOTHING (the whole Music Queue
// screen of examples/reanimated-dnd came up blank against the real library).
//
// Every measured size collapses to 0, so the prefix sums collapse to a single
// point and the window search has nothing to separate the rows by. RN's
// `elementsThatOverlapOffsets` resolves that by treating the FIRST cell's
// start as inclusive, which lands offset 0 on index 0; ours walked past every
// cell whose end was `<= target` — which a zero-length cell at the target
// always is — and landed on the end of the run.
//
// The window is only recomputed on a trigger, so the row count changes after
// the cells have measured: that is the ordering the real screen hits (its
// rows measure, then a scroll or a data change recomputes), and without it
// the stale initial range hides the bug.
it("mounts every row of a list whose cells all have zero flow height", async () => {
  const rows = (items: string[]) => (
    <Root
      width={200}
      height={200}
    >
      <VirtualizedList
        style={{ width: 200, height: 200 }}
        data={items}
        keyExtractor={(item: string) => item}
        estimatedItemSize={44}
        renderItem={({ item }) => (
          <View style={{ position: "absolute", left: 0, top: 0 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>
  )

  let rerender!: (node: ReactNode) => Promise<void>
  await act(async () => {
    ;({ rerender } = await render(rows(["alpha", "beta", "gamma"])))
  })
  await waitForAllocation("alpha")

  await act(async () => {
    await rerender(rows(["alpha", "beta", "gamma", "delta"]))
  })
  await waitForAllocation("alpha")

  // The first rows are the ones the collapsed search dropped; the last is
  // here to catch the mirror-image failure (only the first surviving).
  for (const row of ["alpha", "beta", "gamma", "delta"]) {
    expect(screen.getByText(row)).toBeTruthy()
  }
})
