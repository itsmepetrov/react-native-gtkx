// React Native content inside a GTK WIDGET — its children and its slots.
//
// A widget hands out rectangles two ways: as ordinary children (a content
// area) and as SLOTS, properties that take a widget (`sheet`, `bottomBar`,
// `titleWidget`). Which way a given area arrives is gtkx's business and moves
// between releases — rc.3 took the `content`/`child` props off single-child
// widgets and made that content a child — and it has never had anything to do
// with layout. Both are GTK-tree moves only: in the REACT tree the content
// stays where it was written, so before the boundary it kept seeing the
// ENCLOSING layout root. It then laid itself out against the window's
// viewport while GTK handed it the widget's own rectangle — laid out in one
// box, drawn in another, and stealing flex space from a tree it was never in.
// Silently.
//
// What is pinned down here, in the order it matters:
//   1. a filling content area gives its React Native content the WIDGET's
//      rectangle (not the window's, not the content's own);
//   2. a hugging slot gives its content the CONTENT's size — the same widget
//      needs both, which is why the platform does not guess;
//   3. a raw GTK widget in a slot is still handed over bare, with no wrapper;
//   4. content with no root fails with a message naming where it landed —
//      for a slot AND for a child, since rc.3 turns one into the other.
import { render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it, vi } from "vitest"
import { Root } from "../../../src/components/root"
import {
  AdwBottomSheet,
  AdwHeaderBar,
  AdwWindowTitle,
} from "../../../src/adw/index"
import { IntrinsicContent, SlotContent } from "../../../src/common/index"
import type { Adw as AdwNs } from "../../../src/gtkx/bridge/adw"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"

const lastLayout = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.at(-1)![0].nativeEvent.layout as {
    x: number
    y: number
    width: number
    height: number
  }

const ROOT_WIDTH = 400
const ROOT_HEIGHT = 320

it("gives a filling content area's React Native content the widget's own size", async () => {
  const onLayout = vi.fn()
  await render(
    <Root
      width={ROOT_WIDTH}
      height={ROOT_HEIGHT}
    >
      <AdwBottomSheet style={{ flex: 1 }}>
        <SlotContent>
          <View
            style={{ flex: 1 }}
            onLayout={onLayout}
          />
        </SlotContent>
      </AdwBottomSheet>
    </Root>,
  )

  await waitFor(() => {
    expect(onLayout).toHaveBeenCalled()
    const layout = lastLayout(onLayout)
    // The widget's rectangle, not a natural size and not an edge-anchored
    // sliver: the sheet fills the root, so its content area is the root's
    // area minus whatever the sheet reserves for itself.
    expect(layout.width).toBe(ROOT_WIDTH)
    expect(layout.height).toBeGreaterThan(ROOT_HEIGHT / 2)
  })
})

it("gives a hugging slot's React Native content its own content size", async () => {
  await render(
    <Root
      width={ROOT_WIDTH}
      height={ROOT_HEIGHT}
    >
      <AdwBottomSheet
        style={{ flex: 1 }}
        bottomBar={
          <IntrinsicContent>
            <View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text>bar content</Text>
            </View>
          </IntrinsicContent>
        }
      >
        <SlotContent>
          <View style={{ flex: 1 }} />
        </SlotContent>
      </AdwBottomSheet>
    </Root>,
  )

  await waitFor(() => {
    const label = screen.getByText("bar content") as GtkNs.Label
    const allocation = label.getAllocation()
    // Real, and nowhere near the widget's full height: a bottom bar is sized
    // by what it holds. A filling root here collapses the bar to nothing —
    // the same widget wanting both answers is what proves fill-vs-hug cannot
    // be inferred from the property.
    expect(allocation.width).toBeGreaterThan(10)
    expect(allocation.height).toBeGreaterThan(5)
    expect(allocation.height).toBeLessThan(ROOT_HEIGHT / 2)
  })
})

it("hands a raw GTK widget to a slot bare, with no layout wrapper", async () => {
  const barRef = createRef<AdwNs.HeaderBar | null>()
  const titleRef = createRef<AdwNs.WindowTitle | null>()
  await render(
    <Root
      width={ROOT_WIDTH}
      height={ROOT_HEIGHT}
    >
      <AdwHeaderBar
        ref={barRef}
        titleWidget={
          <AdwWindowTitle
            ref={titleRef}
            title="slot title"
          />
        }
      />
    </Root>,
  )

  await waitFor(() => {
    expect(titleRef.current).toBeTruthy()
    // The window title IS the header bar's title widget. A layout root — or
    // even a bare wrapper box — between them would be a structural change
    // Adwaita's own chrome notices, so the boundary adds no widget at all:
    // it is two context providers and nothing else.
    expect(barRef.current!.getTitleWidget()).toBe(titleRef.current)
  })
})

it("names the widget and the slot when slot content arrives without a root", async () => {
  await expect(
    render(
      <Root
        width={ROOT_WIDTH}
        height={ROOT_HEIGHT}
      >
        <AdwBottomSheet
          style={{ flex: 1 }}
          bottomBar={<View style={{ flex: 1 }} />}
        />
      </Root>,
    ),
  ).rejects.toThrow(/AdwBottomSheet's `bottomBar` slot/)
})

it("names the widget when child content arrives without a root", async () => {
  // rc.3 moved content areas from a `content` prop to an ordinary child, so
  // the child path is now the one the defect arrives through most often. It
  // used to render — wrongly and silently — against the enclosing window.
  await expect(
    render(
      <Root
        width={ROOT_WIDTH}
        height={ROOT_HEIGHT}
      >
        <AdwBottomSheet style={{ flex: 1 }}>
          <View style={{ flex: 1 }} />
        </AdwBottomSheet>
      </Root>,
    ),
  ).rejects.toThrow(/AdwBottomSheet, as its child/)
})
