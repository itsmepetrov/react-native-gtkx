// The windowed FlatList: only rows around the viewport are mounted. 1000
// rows must mount in window-time (not full-mount time — v1 measured 879ms),
// far rows must NOT exist until scrolled to, and scrollToEnd materializes
// the tail.
import { render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import type { Gtk } from "../../src/gtkx-bridge/index.js"
import {
  FlatList,
  Root,
  Text,
  View,
  type ScrollViewHandle,
} from "../../src/index.js"

const childCount = (widget: Gtk.Widget): number => {
  let count = 0
  let child = widget.getFirstChild()
  while (child) {
    count += 1
    child = child.getNextSibling()
  }
  return count
}

it("mounts a 1000-row FlatList as a window and reaches the tail on scroll", async () => {
  const data = Array.from({ length: 1000 }, (_, i) => `Row #${i + 1}`)
  const listRef = createRef<ScrollViewHandle>()
  const started = performance.now()

  await render(
    <Root
      width={400}
      height={600}
    >
      <FlatList
        ref={listRef}
        style={{ height: 500 }}
        data={data}
        keyExtractor={(item) => item}
        estimatedItemSize={30}
        renderItem={({ item }) => (
          <View style={{ padding: 4 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>,
  )

  const elapsed = Math.round(performance.now() - started)
  console.warn(`FLATLIST-1000 windowed mount: ${elapsed}ms`)

  expect(screen.getByText("Row #1")).toBeTruthy()
  // Far rows are not mounted at all — that is the virtualization.
  expect(screen.queryByText("Row #500")).toBeNull()
  expect(screen.queryByText("Row #1000")).toBeNull()

  listRef.current!.scrollToEnd()
  await waitFor(() => {
    expect(screen.getByText("Row #1000")).toBeTruthy()
  })
  expect(elapsed).toBeLessThan(5000)
})

it("keeps live widgets bounded by the window", async () => {
  const data = Array.from({ length: 1000 }, (_, i) => `Item ${i + 1}`)
  await render(
    <Root
      width={400}
      height={600}
    >
      <FlatList
        style={{ height: 500 }}
        data={data}
        keyExtractor={(item) => item}
        estimatedItemSize={30}
        renderItem={({ item }) => <Text>{item}</Text>}
      />
    </Root>,
  )
  const label = screen.getByText("Item 1") as unknown as Gtk.Widget
  const content = label.getParent()!.getParent()!
  expect(childCount(content)).toBeLessThan(60)
})

it("keyExtractor identity survives reordering", async () => {
  const dataAsc = ["alpha-row", "beta-row", "gamma-row"]
  const ui = (items: string[]) => (
    <Root
      width={300}
      height={300}
    >
      <FlatList
        style={{ height: 200 }}
        data={items}
        keyExtractor={(item) => item}
        getItemLayout={(_d, index) => ({
          length: 40,
          offset: 40 * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={{ height: 36 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>
  )
  const { rerender } = await render(ui(dataAsc))
  const cellOf = (text: string): Gtk.Widget =>
    (screen.getByText(text) as unknown as Gtk.Widget).getParent()!.getParent()!

  await waitFor(() => {
    expect(cellOf("alpha-row").getAllocation().y).toBe(0)
  })

  await rerender(ui([...dataAsc].reverse()))
  await waitFor(() => {
    expect(cellOf("gamma-row").getAllocation().y).toBe(0)
    expect(cellOf("alpha-row").getAllocation().y).toBe(80)
  })
})
