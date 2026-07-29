// SectionList sticky section headers on the windowed core: the active
// header's REAL cell stays mounted even when its own offset leaves the
// render window, pins to the (floored) scroll offset, and hands off to the
// next section's header.
import { render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import type { Gtk } from "../../src/gtkx-bridge/index"
import {
  Root,
  SectionList,
  Text,
  View,
  type FlatListHandle,
} from "../../src/index"

const slotOf = (text: string): Gtk.Widget =>
  (screen.getByText(text) as unknown as Gtk.Widget).getParent()!.getParent()!

it("pins the active section header and hands off to the next", async () => {
  const listRef = createRef<FlatListHandle>()
  await render(
    <Root
      width={300}
      height={220}
    >
      <SectionList
        ref={listRef}
        style={{ height: 200 }}
        estimatedItemSize={40}
        windowSize={1}
        sections={[
          {
            title: "SEC-A",
            data: Array.from({ length: 10 }, (_, i) => `a-${i}`),
          },
          {
            title: "SEC-B",
            data: Array.from({ length: 10 }, (_, i) => `b-${i}`),
          },
        ]}
        renderSectionHeader={({ section }) => (
          <View style={{ height: 30, backgroundColor: "#1c71d8" }}>
            <Text>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={{ height: 40 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByText("a-0")).toBeTruthy()
  })

  // Deep into section A: its header offset (0) is far above the narrow
  // window, yet the cell stays mounted and pinned at the scroll offset.
  listRef.current!.scrollTo({ y: 300 })
  await waitFor(() => {
    expect(screen.getByText("SEC-A")).toBeTruthy()
    expect(slotOf("SEC-A").getAllocation().y).toBe(300)
  })

  // Into section B: its header takes over the pin.
  listRef.current!.scrollTo({ y: 600 })
  await waitFor(() => {
    expect(screen.getByText("SEC-B")).toBeTruthy()
    expect(slotOf("SEC-B").getAllocation().y).toBe(600)
  })
})
