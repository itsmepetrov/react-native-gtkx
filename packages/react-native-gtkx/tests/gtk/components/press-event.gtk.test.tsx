// RN's touch payload on Pressable. Driven through the GestureClick signal
// directly (the same signal GTK delivers), because the coordinates ARE what
// is under test — userEvent.click would only ever press the widget's centre.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Pressable, Root, Text, View } from "../../../src/index"

const findClickController = (widget: GtkNs.Widget): GtkNs.GestureClick => {
  const controllers = widget.observeControllers()
  for (let i = 0; i < controllers.getNItems(); i += 1) {
    const controller = controllers.getItem(i)
    if (controller instanceof Gtk.GestureClick) {
      return controller
    }
  }
  throw new Error("GestureClick not found")
}

it("press events carry RN's shape, with page and location in different spaces", async () => {
  const onPress = vi.fn()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        {/* Offsets the Pressable from the window origin, so pageX/pageY and
            locationX/locationY cannot coincide. */}
        <View style={{ paddingTop: 50, paddingLeft: 30 }}>
          <Pressable onPress={onPress}>
            <Text>tap me</Text>
          </Pressable>
        </View>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("tap me")).toBeTruthy()
  })

  const box = (
    screen.getByText("tap me") as unknown as GtkNs.Widget
  ).getParent()!
  const click = findClickController(box)

  await act(async () => {
    click.emit("pressed", 1, 7, 4)
    click.emit("released", 1, 7, 4)
  })

  expect(onPress).toHaveBeenCalledTimes(1)
  const { nativeEvent } = onPress.mock.calls[0]![0]

  expect(nativeEvent.locationX).toBe(7)
  expect(nativeEvent.locationY).toBe(4)
  // The padding above and to the left has to show up here and nowhere else.
  expect(nativeEvent.pageX).toBeGreaterThanOrEqual(30)
  expect(nativeEvent.pageY).toBeGreaterThanOrEqual(50)

  expect(nativeEvent.identifier).toBe(0)
  expect(typeof nativeEvent.target).toBe("number")
  expect(nativeEvent.force).toBe(0)
  // A mouse is one fabricated touch, RN/react-native-web's convention.
  expect(nativeEvent.touches).toHaveLength(1)
  expect(nativeEvent.changedTouches).toHaveLength(1)
  expect(nativeEvent.changedTouches[0].identifier).toBe(0)
})

it("timestamps advance between two presses", async () => {
  const onPress = vi.fn()

  await act(async () => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <Pressable onPress={onPress}>
          <Text>twice</Text>
        </Pressable>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("twice")).toBeTruthy()
  })

  const box = (
    screen.getByText("twice") as unknown as GtkNs.Widget
  ).getParent()!
  const click = findClickController(box)

  await act(async () => {
    click.emit("pressed", 1, 0, 0)
    click.emit("released", 1, 0, 0)
  })
  await act(async () => {
    click.emit("pressed", 1, 0, 0)
    click.emit("released", 1, 0, 0)
  })

  const first = onPress.mock.calls[0]![0].nativeEvent.timestamp
  const second = onPress.mock.calls[1]![0].nativeEvent.timestamp
  // PanResponder differences these to get velocity: equal timestamps mean a
  // silently zeroed vx/vy, which is exactly the standing react-native-windows
  // New-Architecture bug. A monotonic sub-millisecond clock is the fix, so
  // two presses in the same millisecond must still be ordered.
  expect(second).toBeGreaterThan(first)
})
