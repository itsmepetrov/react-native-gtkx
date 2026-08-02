// A scrollable with NO style of its own, inside a bounded parent, must become
// a viewport — the parent's height is the viewport and the content scrolls
// inside it.
//
// This is RN's `styles.baseVertical` on the scroller (`flexGrow: 1,
// flexShrink: 1`, composed UNDER the app's style in ScrollView.js). Without
// the shrink half a flex item keeps its content size — RN's Yoga config
// defaults flexShrink to 0 — so the scroller outgrows the parent and its
// scroll range is empty. Libraries hand their scrollable down unstyled and
// let the host size it (`@gorhom/bottom-sheet` is the one that found this),
// so "no style" is not an edge case, it is the common shape.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it, vi } from "vitest"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  FlatList,
  Root,
  ScrollView,
  Text,
  View,
  type FlatListHandle,
  type ScrollViewHandle,
} from "../../../src/index"

const ROWS = Array.from({ length: 18 }, (_, i) => `row-${i}`)
const ROW_HEIGHT = 44
const VIEWPORT = 130

const waitForAllocation = async (label: string): Promise<void> => {
  await waitFor(() => {
    const widget = screen.getByText(label) as unknown as GtkNs.Widget
    expect(widget.getAllocatedWidth()).toBeGreaterThan(0)
  })
}

it("an unstyled FlatList adopts its bounded parent's height and scrolls", async () => {
  const onScroll = vi.fn()
  const onLayout = vi.fn()
  const listRef = createRef<FlatListHandle>()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={400}
      >
        <View style={{ height: VIEWPORT }}>
          <FlatList
            ref={listRef}
            data={ROWS}
            keyExtractor={(item: string) => item}
            getItemLayout={(_data, index) => ({
              length: ROW_HEIGHT,
              offset: ROW_HEIGHT * index,
              index,
            })}
            onLayout={onLayout}
            onScroll={onScroll}
            renderItem={({ item }: { item: string }) => (
              <View style={{ height: ROW_HEIGHT }}>
                <Text>{item}</Text>
              </View>
            )}
          />
        </View>
      </Root>,
    )
  })
  await waitForAllocation("row-0")

  // The gap itself: the list used to lay out at its full content height
  // (18 * 44 = 792) and clip against the parent, leaving nothing to scroll.
  await waitFor(() => {
    expect(onLayout).toHaveBeenCalled()
    const last = onLayout.mock.calls.at(-1)![0]
    expect(last.nativeEvent.layout.height).toBe(VIEWPORT)
  })

  await act(async () => {
    listRef.current!.scrollToOffset({ offset: 120 })
  })

  expect(onScroll).toHaveBeenCalled()
  const { nativeEvent } = onScroll.mock.calls.at(-1)![0]
  expect(nativeEvent.contentOffset.y).toBe(120)
  expect(nativeEvent.layoutMeasurement.height).toBe(VIEWPORT)
  expect(nativeEvent.contentSize.height).toBeGreaterThan(VIEWPORT)
})

it("an unstyled ScrollView adopts its bounded parent's height and scrolls", async () => {
  const onScroll = vi.fn()
  const onLayout = vi.fn()
  const scrollRef = createRef<ScrollViewHandle>()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={400}
      >
        <View style={{ height: VIEWPORT }}>
          <ScrollView
            ref={scrollRef}
            onLayout={onLayout}
            onScroll={onScroll}
          >
            {ROWS.map((item) => (
              <View
                key={item}
                style={{ height: ROW_HEIGHT }}
              >
                <Text>{item}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Root>,
    )
  })
  await waitForAllocation("row-0")

  await waitFor(() => {
    expect(onLayout).toHaveBeenCalled()
    const last = onLayout.mock.calls.at(-1)![0]
    expect(last.nativeEvent.layout.height).toBe(VIEWPORT)
  })

  await act(async () => {
    scrollRef.current!.scrollTo({ y: 120 })
  })

  expect(onScroll).toHaveBeenCalled()
  const { nativeEvent } = onScroll.mock.calls.at(-1)![0]
  expect(nativeEvent.contentOffset.y).toBe(120)
  expect(nativeEvent.layoutMeasurement.height).toBe(VIEWPORT)
})

it("the app's own style still wins over the base — RN composes base first", async () => {
  const onLayout = vi.fn()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={400}
      >
        <View style={{ height: 300 }}>
          {/* flexGrow: 0 against a base of 1, and an explicit height that a
              flexShrink of 1 would eat if the base outranked the app. */}
          <ScrollView style={{ height: 90, flexGrow: 0 }}>
            {ROWS.map((item) => (
              <View
                key={item}
                style={{ height: ROW_HEIGHT }}
              >
                <Text>{`styled-${item}`}</Text>
              </View>
            ))}
          </ScrollView>
          <View
            style={{ height: 40 }}
            onLayout={onLayout}
          >
            <Text>sibling</Text>
          </View>
        </View>
      </Root>,
    )
  })
  await waitForAllocation("styled-row-0")

  // The scroller kept its 90 and did not grow into the spare 170, so the
  // sibling still sits directly under it.
  await waitFor(() => {
    expect(onLayout).toHaveBeenCalled()
    const last = onLayout.mock.calls.at(-1)![0]
    expect(last.nativeEvent.layout.y).toBe(90)
  })
})
