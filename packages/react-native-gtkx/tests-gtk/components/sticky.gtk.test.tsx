// stickyHeaderIndices: the RN model — the child stays in flow, and while
// scrolled past a pinned copy renders as the last content child (paint order
// puts it on top) at the viewport top via the Animated fast path.
import { render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import type { Gtk } from "../../src/gtkx-bridge/index"
import {
  Root,
  ScrollView,
  Text,
  View,
  type ScrollViewHandle,
} from "../../src/index"

it("stickyHeaderIndices pins the header while scrolled past", async () => {
  const listRef = createRef<ScrollViewHandle>()
  await render(
    <Root
      width={300}
      height={200}
    >
      <ScrollView
        ref={listRef}
        style={{ height: 200 }}
        stickyHeaderIndices={[0]}
      >
        <View style={{ height: 30, backgroundColor: "#1c71d8" }}>
          <Text>HEAD</Text>
        </View>
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
  await waitFor(() => {
    expect(screen.getByText("row-0")).toBeTruthy()
  })

  listRef.current!.scrollTo({ y: 200 })
  await waitFor(() => {
    expect((screen.getAllByText("HEAD") as unknown[]).length).toBe(2)
  })

  // One instance stays in flow at content-Y 0, the pinned copy sits at the
  // viewport top == scroll offset (200).
  await waitFor(() => {
    const cells = (screen.getAllByText("HEAD") as unknown as Gtk.Widget[]).map(
      (label) => label.getParent()!.getParent()!.getAllocation().y,
    )
    expect(cells.sort((a, b) => a - b)).toEqual([0, 200])
  })
})
