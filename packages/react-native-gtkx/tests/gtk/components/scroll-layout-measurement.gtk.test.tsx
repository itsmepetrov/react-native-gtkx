// ScrollEvent.layoutMeasurement — RN's viewport size, which is what "how
// far from the end am I" reads (autoscroll during a drag, custom
// end-reached logic). GTK calls the same quantity the adjustment's page
// size.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it, vi } from "vitest"
import {
  Root,
  ScrollView,
  Text,
  View,
  type ScrollViewHandle,
} from "../../../src/index"

it("onScroll reports the viewport size alongside offset and content size", async () => {
  const onScroll = vi.fn()
  const listRef = createRef<ScrollViewHandle>()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <ScrollView
          ref={listRef}
          style={{ height: 200 }}
          onScroll={onScroll}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <View
              key={i}
              style={{ height: 40 }}
            >
              <Text>{`row-${i}`}</Text>
            </View>
          ))}
        </ScrollView>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("row-0")).toBeTruthy()
  })

  await act(async () => {
    listRef.current!.scrollTo({ y: 80 })
  })

  expect(onScroll).toHaveBeenCalled()
  const { nativeEvent } = onScroll.mock.calls.at(-1)![0]

  expect(nativeEvent.contentOffset.y).toBe(80)
  expect(nativeEvent.layoutMeasurement.height).toBe(200)
  expect(nativeEvent.layoutMeasurement.width).toBeGreaterThan(0)
  // The invariant the field exists for: the viewport is smaller than the
  // content, and offset + viewport is how far down the content we can see.
  expect(nativeEvent.layoutMeasurement.height).toBeLessThan(
    nativeEvent.contentSize.height,
  )
})
