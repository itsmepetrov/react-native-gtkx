// Systemic guarantee (user-reported): an animating element must never resize
// its container. Since branch B the guarantee comes from the layout manager
// itself (measure ignores children), so the translate is UNCLAMPED — the
// widget honestly allocates past the boundary (RN paint-overflow) while every
// ancestor stays put.
import { render, screen, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import type { Gtk } from "../../src/gtkx-bridge/index.js"
import { Animated, Root, Text, View } from "../../src/index.js"

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 50)
  })

it("animated translate cannot inflate its container", async () => {
  const value = new Animated.Value(0)

  await render(
    <Root
      width={300}
      height={200}
    >
      <View style={{ height: 40 }}>
        <Animated.View
          style={{
            width: 40,
            height: 40,
            backgroundColor: "#26a269",
            transform: [{ translateX: value }],
          }}
        />
        <Text>track-marker</Text>
      </View>
    </Root>,
  )

  const marker = screen.getByText("track-marker") as unknown as Gtk.Label
  const track = marker.getParent() as Gtk.Fixed
  await waitFor(() => {
    expect(track.getAllocatedWidth()).toBeGreaterThan(0)
  })
  const baseline = track.getAllocatedWidth()
  expect(baseline).toBeLessThanOrEqual(300)

  // Absurd offsets in both directions: ancestors must not move by a pixel.
  value.setValue(100000)
  await settle()
  expect(track.getAllocatedWidth()).toBe(baseline)

  value.setValue(-100000)
  await settle()
  expect(track.getAllocatedWidth()).toBe(baseline)

  const square = track.getFirstChild() as Gtk.Widget
  expect(square.getAllocatedWidth()).toBe(40)
})

it("animated translate allocates past the boundary (paint-overflow)", async () => {
  const value = new Animated.Value(0)
  const NEIGHBOR_X = 120

  await render(
    <Root
      width={300}
      height={200}
    >
      <View style={{ height: 40, flexDirection: "row" }}>
        <Animated.View
          style={{
            width: 40,
            height: 40,
            backgroundColor: "#26a269",
            transform: [{ translateX: value }],
          }}
        />
        <View style={{ width: 40, height: 40, marginLeft: NEIGHBOR_X - 40 }}>
          <Text>neighbor-marker</Text>
        </View>
      </View>
    </Root>,
  )

  const marker = screen.getByText("neighbor-marker") as unknown as Gtk.Label
  const neighbor = marker.getParent() as Gtk.Widget
  const row = neighbor.getParent() as Gtk.Widget
  const square = row.getFirstChild() as Gtk.Widget
  await waitFor(() => {
    expect(square.getAllocatedWidth()).toBe(40)
  })
  const rowBaseline = row.getAllocatedWidth()
  const neighborBaseline = neighbor.getAllocation().x

  // Push the square 40px past the row's right edge: it must honestly land
  // there (allocation > row width) while the row and the neighbor stay put.
  value.setValue(300)
  await settle()
  const allocation = square.getAllocation()
  expect(allocation.x).toBe(300)
  expect(allocation.x + allocation.width).toBeGreaterThan(rowBaseline)
  expect(row.getAllocatedWidth()).toBe(rowBaseline)
  expect(neighbor.getAllocation().x).toBe(neighborBaseline)
})
