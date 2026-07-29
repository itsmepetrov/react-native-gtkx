import { render, screen, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { Gtk, Pango } from "../../src/gtkx-bridge/index.js"
import { Root, StyleSheet, Text, View } from "../../src/index.js"

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  card: { height: 100, backgroundColor: "#613583", borderRadius: 8 },
  caption: { fontSize: 13 },
})

it("renders an RN tree with Yoga geometry on real widgets", async () => {
  const onCardLayout = vi.fn()

  await render(
    <Root
      width={400}
      height={300}
    >
      <View style={styles.container}>
        <View
          style={styles.card}
          onLayout={onCardLayout}
        />
        <Text style={styles.caption}>hello from react-native-gtkx</Text>
      </View>
    </Root>,
  )

  await waitFor(() => {
    expect(onCardLayout).toHaveBeenCalled()
  })
  const layout = onCardLayout.mock.calls[0]![0].nativeEvent.layout
  expect(layout).toEqual({ x: 20, y: 20, width: 360, height: 100 })

  const label = screen.getByText(
    "hello from react-native-gtkx",
  ) as unknown as Gtk.Label
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })

  // The card is the first child of the container View's GtkBox and must
  // carry the generated visual CSS class.
  const containerFixed = label.getParent() as Gtk.Fixed
  const card = containerFixed.getFirstChild() as Gtk.Widget
  await waitFor(() => {
    expect(card.getAllocatedWidth()).toBe(360)
    expect(card.getAllocatedHeight()).toBe(100)
  })
  const classes = card.getCssClasses()
  expect(classes.length).toBeGreaterThan(0)
})

it("wraps text via Pango measure and clips with numberOfLines", async () => {
  const LONG =
    "a rather long paragraph that will definitely need several lines when " +
    "constrained to a narrow one hundred and sixty pixel column"

  const wrapped = vi.fn()
  const clipped = vi.fn()

  await render(
    <Root
      width={160}
      height={400}
    >
      <View style={{ alignItems: "flex-start" }}>
        <Text onLayout={wrapped}>{LONG}</Text>
        <Text
          onLayout={clipped}
          numberOfLines={1}
        >
          {LONG}
        </Text>
      </View>
    </Root>,
  )

  await waitFor(() => {
    expect(wrapped).toHaveBeenCalled()
    expect(clipped).toHaveBeenCalled()
  })
  const wrappedHeight = wrapped.mock.calls[0]![0].nativeEvent.layout.height
  const clippedHeight = clipped.mock.calls[0]![0].nativeEvent.layout.height
  expect(wrappedHeight).toBeGreaterThan(clippedHeight * 2)
})

it("labels never allocate wider than their Yoga rect (narrow windows)", async () => {
  const onLayout = vi.fn()
  await render(
    <Root
      width={70}
      height={200}
    >
      <View style={{ width: 60 }}>
        <Text onLayout={onLayout}>непереносимоеоченьдлинноеслово</Text>
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(onLayout).toHaveBeenCalled()
  })
  const label = screen.getByText(
    "непереносимоеоченьдлинноеслово",
  ) as unknown as Gtk.Label
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
    // The layout manager allocates the Yoga rect regardless of the label's
    // longest-word minimum — nothing pushes the layout.
    expect(label.getAllocatedWidth()).toBeLessThanOrEqual(62)
  })
  // RN semantics: no numberOfLines → no ellipsis; the unbreakable word clips
  // to its box (paint clip) instead of drawing over siblings.
  expect(label.getEllipsize()).toBe(Pango.EllipsizeMode.NONE)
  expect(label.getOverflow()).toBe(Gtk.Overflow.HIDDEN)
})

it("numberOfLines keeps the ellipsis opt-in", async () => {
  await render(
    <Root
      width={120}
      height={100}
    >
      <View style={{ width: 100 }}>
        <Text numberOfLines={1}>
          a very long single line that cannot possibly fit
        </Text>
      </View>
    </Root>,
  )
  const label = screen.getByText(
    "a very long single line that cannot possibly fit",
  ) as unknown as Gtk.Label
  await waitFor(() => {
    expect(label.getAllocatedWidth()).toBeGreaterThan(0)
  })
  expect(label.getEllipsize()).toBe(Pango.EllipsizeMode.END)
})
