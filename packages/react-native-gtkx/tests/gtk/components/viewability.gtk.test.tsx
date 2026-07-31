// Viewability callbacks on the windowed list core: onViewableItemsChanged
// driven purely by prefix-sum math (no widget queries), minimumViewTime
// gating via JS timers, and the short-list onEndReached fast path.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it, vi } from "vitest"
import type { ViewToken } from "../../../src/components/flat-list"
import {
  FlatList,
  Root,
  Text,
  View,
  type FlatListHandle,
} from "../../../src/index"

type ViewabilityInfo = {
  viewableItems: ViewToken<string>[]
  changed: ViewToken<string>[]
}

const latest = (infos: ViewabilityInfo[]): ViewabilityInfo =>
  infos[infos.length - 1]!

const rowLayout = (
  _data: readonly string[],
  index: number,
): { length: number; offset: number; index: number } => ({
  length: 40,
  offset: 40 * index,
  index,
})

it("reports viewable rows at 50% threshold and updates after a scroll", async () => {
  const data = Array.from({ length: 20 }, (_, i) => `vrow-${i}`)
  const listRef = createRef<FlatListHandle>()
  const infos: ViewabilityInfo[] = []

  // render()'s own layout settling runs after its internal act() wrap
  // closes, so the whole call needs act() too (same as the scroll below).
  await act(async () => {
    await render(
      <Root
        width={400}
        height={400}
      >
        <FlatList
          ref={listRef}
          style={{ height: 200 }}
          data={data}
          keyExtractor={(item) => item}
          getItemLayout={rowLayout}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          onViewableItemsChanged={(info) => infos.push(info)}
          renderItem={({ item }) => (
            <View style={{ height: 40 }}>
              <Text>{item}</Text>
            </View>
          )}
        />
      </Root>,
    )
  })

  // Viewport 200 over 40px rows: rows 0..4 are (at least half) visible.
  await waitFor(() => {
    expect(latest(infos).viewableItems.map((token) => token.index)).toEqual([
      0, 1, 2, 3, 4,
    ])
  })

  // scrollTo sets the adjustment's value directly, firing value-changed
  // synchronously into the viewability computation — a native poke outside
  // any React event handler.
  await act(async () => {
    listRef.current!.scrollTo({ y: 400 })
  })
  // The window [400, 600] covers exactly rows 10..14.
  await waitFor(() => {
    expect(latest(infos).viewableItems.map((token) => token.index)).toEqual([
      10, 11, 12, 13, 14,
    ])
  })
  expect(latest(infos).viewableItems.map((token) => token.key)).toEqual([
    "vrow-10",
    "vrow-11",
    "vrow-12",
    "vrow-13",
    "vrow-14",
  ])
  // The transition reported the departure of row 0 with isViewable false.
  expect(
    infos.some((info) =>
      info.changed.some((token) => token.index === 0 && !token.isViewable),
    ),
  ).toBe(true)
})

it("withholds viewability until minimumViewTime of continuous visibility", async () => {
  const data = Array.from({ length: 20 }, (_, i) => `mrow-${i}`)
  const listRef = createRef<FlatListHandle>()
  const infos: ViewabilityInfo[] = []

  await act(async () => {
    await render(
      <Root
        width={400}
        height={400}
      >
        <FlatList
          ref={listRef}
          style={{ height: 200 }}
          data={data}
          keyExtractor={(item) => item}
          getItemLayout={rowLayout}
          viewabilityConfig={{ minimumViewTime: 300 }}
          onViewableItemsChanged={(info) => infos.push(info)}
          renderItem={({ item }) => (
            <View style={{ height: 40 }}>
              <Text>{item}</Text>
            </View>
          )}
        />
      </Root>,
    )
  })

  // The initial rows mature only after 300ms of continuous visibility —
  // genuinely async (minimumViewTime gating via a real timer), left to
  // waitFor rather than forced.
  await waitFor(
    () => {
      expect(latest(infos).viewableItems.map((token) => token.index)).toEqual([
        0, 1, 2, 3, 4,
      ])
    },
    { timeout: 2000 },
  )

  await act(async () => {
    listRef.current!.scrollTo({ y: 400 })
  })
  // Scrolling OUT is reported immediately (no min-view-time on the way out).
  await waitFor(() => {
    expect(
      latest(infos).viewableItems.map((token) => token.index),
    ).not.toContain(0)
  })
  // The rows that just scrolled in are still pending their 300ms: no info so
  // far may have reported row 10 as viewable.
  expect(
    infos.some((info) =>
      info.viewableItems.some((token) => token.index === 10),
    ),
  ).toBe(false)

  await waitFor(
    () => {
      expect(latest(infos).viewableItems.map((token) => token.index)).toEqual([
        10, 11, 12, 13, 14,
      ])
    },
    { timeout: 2000 },
  )
})

it("fires onEndReached once for content shorter than the viewport", async () => {
  const data = ["short-a", "short-b", "short-c"]
  const onEndReached = vi.fn()
  const ui = () => (
    <Root
      width={400}
      height={400}
    >
      <FlatList
        style={{ height: 300 }}
        data={data}
        keyExtractor={(item) => item}
        getItemLayout={rowLayout}
        onEndReached={onEndReached}
        renderItem={({ item }) => (
          <View style={{ height: 40 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>
  )

  const { rerender } = await act(async () => render(ui()))
  // 3 rows × 40 = 120 < viewport 300: the end is reached without scrolling.
  await waitFor(() => {
    expect(onEndReached).toHaveBeenCalledTimes(1)
  })

  await act(async () => {
    await rerender(ui())
  })
  expect(screen.getByText("short-c")).toBeTruthy()
  // Same data, same extent: the once-per-extent gate holds.
  expect(onEndReached).toHaveBeenCalledTimes(1)
})
