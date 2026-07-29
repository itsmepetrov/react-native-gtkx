// Systemic guarantee (user-reported): an animating element must never resize
// its container. A wild translate is clamped to the parent rect — the track's
// allocation stays put no matter what value the animation produces.
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

  // Absurd offsets in both directions: the clamp must keep the square inside.
  value.setValue(100000)
  await settle()
  expect(track.getAllocatedWidth()).toBe(baseline)

  value.setValue(-100000)
  await settle()
  expect(track.getAllocatedWidth()).toBe(baseline)

  const square = track.getFirstChild() as Gtk.Widget
  expect(square.getAllocatedWidth()).toBe(40)
})
