// stickyHeaderIndices, the RN model: the REAL child is translated to the
// viewport top (no duplicate — one instance, external margins travel), and
// while pinned its slot is reordered to be the last content child so it
// paints above the rows (GTK sibling order is the z-order).
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import type { Gtk } from "../../../src/gtkx/bridge/index"
import {
  Root,
  ScrollView,
  Text,
  View,
  type ScrollViewHandle,
} from "../../../src/index"

it("stickyHeaderIndices pins the real header and restores it", async () => {
  const listRef = createRef<ScrollViewHandle>()
  // render()'s own layout settling runs after its internal act() wrap
  // closes, so the whole call needs act() too (same as the scrolls below).
  await act(async () => {
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
  })
  await waitFor(() => {
    expect(screen.getByText("row-0")).toBeTruthy()
  })

  // Text → header View box → StickySlot box (child of the content box).
  const slotOf = (): Gtk.Widget =>
    (screen.getByText("HEAD") as unknown as Gtk.Widget)
      .getParent()!
      .getParent()!

  // scrollTo sets the adjustment's value directly, firing value-changed
  // synchronously into the sticky-header slot calculation — a native poke
  // outside any React event handler.
  await act(async () => {
    listRef.current!.scrollTo({ y: 200 })
  })
  await waitFor(() => {
    // ONE instance, translated to the scroll offset.
    expect((screen.getAllByText("HEAD") as unknown[]).length).toBe(1)
    expect(slotOf().getAllocation().y).toBe(200)
  })
  // Pinned slot paints last (on top of the rows). Codegen wrappers are not
  // identity-stable, so compare geometry: the last child is the 30px header
  // at the scroll offset, not a 40px row.
  const content = slotOf().getParent()!
  const last = content.getLastChild()!.getAllocation()
  expect([last.y, last.height]).toEqual([200, 30])

  await act(async () => {
    listRef.current!.scrollTo({ y: 0 })
  })
  await waitFor(() => {
    expect(slotOf().getAllocation().y).toBe(0)
  })
  // A header at y=0 stays active at scrollTop 0 (record.y <= scrollTop):
  // it simply sits at its own position with a zero offset, still on top.
  const back = content.getLastChild()!.getAllocation()
  expect([back.y, back.height]).toEqual([0, 30])
})
