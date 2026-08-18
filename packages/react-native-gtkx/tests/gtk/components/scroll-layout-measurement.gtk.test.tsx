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

// Regression for a CI flake (component-gaps/scroll-measurement-flake): this
// component's own layout engine commits a node's rect on the very next
// microtask, but a GtkScrolledWindow only learns its child's real size on
// its own next native allocate — a full frame away, queued rather than
// synchronous. `scrollTo` used to hand `y` straight to
// `Gtk.Adjustment.setValue()`, which clamps to ITS OWN `upper`/`page-size`;
// called before that native catch-up landed (freshly mounted: both still
// 0), the target got clamped right back to the current value, so nothing
// actually changed and `value-changed` never fired — the scroll this call
// promised was dropped with no event at all. Skipping the `waitFor` cushion
// the test above relies on reproduces the drop deterministically (no timing
// hack needed): the engine's rects are already correct at that point, the
// adjustment's are not.
//
// Also covers component-gaps/scroll-width-zero-flake.md, deterministically:
// `scrollTo({ y })` only ever syncs the VERTICAL adjustment's range from the
// engine before setting the value (`syncAdjustmentRange` in
// scroll-view.tsx), so on this same freshly-mounted render the horizontal
// adjustment's page-size is left exactly as stale as `hadjustment` was
// above — 0, because GTK's own native allocate for that axis has not run
// yet. On a quiet machine that native allocate reliably beats the `waitFor`
// cushion the FIRST test above uses, which is why the flake needed CI load
// to show up there; skipping the cushion here reproduces the same read with
// no load and no timing hack, exactly like the drop above.
it("onScroll still fires when scrollTo runs before GTK's own layout catches up", async () => {
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

  // No `waitFor` settling cushion — `scrollTo` right on render()'s heels,
  // which is exactly the window where GTK's real adjustment bounds can
  // still be the freshly-constructed 0/0 default.
  await act(async () => {
    listRef.current!.scrollTo({ y: 80 })
  })

  expect(onScroll).toHaveBeenCalled()
  const { nativeEvent } = onScroll.mock.calls.at(-1)![0]
  expect(nativeEvent.contentOffset.y).toBe(80)
  expect(nativeEvent.layoutMeasurement.width).toBeGreaterThan(0)
})
