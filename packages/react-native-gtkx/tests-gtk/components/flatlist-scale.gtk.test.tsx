// The windowed FlatList: only rows around the viewport are mounted. 1000
// rows must mount in window-time (not full-mount time — v1 measured 879ms),
// far rows must NOT exist until scrolled to, and scrollToEnd materializes
// the tail.
import { render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import type { Gtk } from "../../src/gtkx-bridge/index"
import {
  FlatList,
  Root,
  Text,
  View,
  type FlatListHandle,
} from "../../src/index"

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
  const listRef = createRef<FlatListHandle>()
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

it("scrollToIndex with getItemLayout jumps straight to the target row", async () => {
  const data = Array.from({ length: 500 }, (_, i) => `Row #${i + 1}`)
  const listRef = createRef<FlatListHandle>()
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
        getItemLayout={(_d, index) => ({
          length: 40,
          offset: 40 * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={{ height: 40 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>,
  )
  expect(screen.getByText("Row #1")).toBeTruthy()
  expect(screen.queryByText("Row #301")).toBeNull()

  // Index 300 (0-based) is "Row #301"; viewPosition 0 puts its exact offset
  // (300 * 40) at the viewport top.
  listRef.current!.scrollToIndex({ index: 300 })
  await waitFor(() => {
    expect(screen.getByText("Row #301")).toBeTruthy()
  })
  // The jump left the head of the list far outside the mounted window.
  expect(screen.queryByText("Row #1")).toBeNull()
})

it("scrollToIndex without getItemLayout converges via estimates", async () => {
  const data = Array.from({ length: 500 }, (_, i) => `Row #${i + 1}`)
  const listRef = createRef<FlatListHandle>()
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
          <View style={{ height: 30 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>,
  )
  expect(screen.queryByText("Row #301")).toBeNull()

  listRef.current!.scrollToIndex({ index: 300 })
  await waitFor(() => {
    expect(screen.getByText("Row #301")).toBeTruthy()
  })
  expect(screen.queryByText("Row #1")).toBeNull()
})

it("inverted list opens at the data start (visual bottom), like RN", async () => {
  const data = Array.from({ length: 100 }, (_, i) => `Row #${i + 1}`)
  const listRef = createRef<FlatListHandle>()
  await render(
    <Root
      width={400}
      height={600}
    >
      <FlatList
        ref={listRef}
        style={{ height: 500 }}
        data={data}
        inverted
        keyExtractor={(item) => item}
        getItemLayout={(_d, index) => ({
          length: 40,
          offset: 40 * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={{ height: 40 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>,
  )
  // RN contentOffset 0 is the far end where the data STARTS (the chat
  // model: data[0] is the latest message, at the visual bottom). The
  // mirrored projection puts that cell at the end of the raw content.
  await waitFor(() => {
    expect(screen.getByText("Row #1")).toBeTruthy()
    const cell = (screen.getByText("Row #1") as unknown as Gtk.Widget)
      .getParent()!
      .getParent()!
    expect(cell.getAllocation().y).toBe(100 * 40 - 40)
  })
  expect(screen.queryByText("Row #100")).toBeNull()

  // scrollToEnd targets the END of the data — raw offset 0, the visual top.
  listRef.current!.scrollToEnd()
  await waitFor(() => {
    expect(screen.getByText("Row #100")).toBeTruthy()
  })
  expect(screen.queryByText("Row #1")).toBeNull()
})

it("inverted chat stays pinned to the newest message on prepend", async () => {
  // Chat convention: data[0] is the newest message.
  const chat = (count: number) => (
    <Root
      width={400}
      height={600}
    >
      <FlatList
        style={{ height: 500 }}
        data={Array.from({ length: count }, (_, i) => `msg-${count - i}`)}
        inverted
        keyExtractor={(item) => item}
        getItemLayout={(_d, index) => ({
          length: 40,
          offset: 40 * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={{ height: 40 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>
  )
  const { rerender } = await render(chat(50))
  await waitFor(() => {
    expect(screen.getByText("msg-50")).toBeTruthy()
  })
  expect(screen.queryByText("msg-1")).toBeNull()

  // A new message arrives at data[0]: the pinned exposed offset (0) keeps
  // the view at the newest message — it appears WITHOUT any scrolling.
  await rerender(chat(51))
  await waitFor(() => {
    expect(screen.getByText("msg-51")).toBeTruthy()
  })
  expect(screen.queryByText("msg-1")).toBeNull()
})

it("horizontal list windows along x and scrollToIndex targets x", async () => {
  const data = Array.from({ length: 200 }, (_, i) => `Col #${i + 1}`)
  const listRef = createRef<FlatListHandle>()
  await render(
    <Root
      width={400}
      height={600}
    >
      <FlatList
        ref={listRef}
        horizontal
        style={{ height: 80 }}
        data={data}
        keyExtractor={(item) => item}
        getItemLayout={(_d, index) => ({
          length: 60,
          offset: 60 * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={{ width: 60 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>,
  )
  expect(screen.getByText("Col #1")).toBeTruthy()
  expect(screen.queryByText("Col #150")).toBeNull()

  // Index 149 (0-based) is "Col #150".
  listRef.current!.scrollToIndex({ index: 149 })
  await waitFor(() => {
    expect(screen.getByText("Col #150")).toBeTruthy()
  })
  expect(screen.queryByText("Col #1")).toBeNull()
})
