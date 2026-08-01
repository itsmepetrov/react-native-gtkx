// Focus on a View and a Pressable — the gap
// docs/research/react-native-first-showcase.md named as "the ring is now
// drawable, but nothing tells a View it is focused".
//
// Focus is driven through the widget itself (`grabFocus`) rather than
// through a synthesised controller signal: `EventControllerFocus` fires from
// GTK's own focus bookkeeping, so making the widget focusable and asking for
// focus is the only way to prove the two halves — the `focusable` prop and
// the callbacks — are actually connected to each other.
import { act, fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Pressable, Root, Text, View } from "../../../src/index"

const widget = (testID: string): GtkNs.Widget =>
  screen.getByName(testID) as GtkNs.Widget

it("a focusable View reports onFocus and onBlur, and a plain one is not in the chain", async () => {
  const onFocus = vi.fn()
  const onBlur = vi.fn()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <View
          testID="focusable"
          focusable
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <View testID="plain" />
        <View
          testID="other"
          focusable
        />
      </Root>,
    )
  })

  // RN's default: a layout box does not join the desktop's Tab order just by
  // existing.
  expect(widget("plain").getFocusable()).toBe(false)
  expect(widget("focusable").getFocusable()).toBe(true)

  await act(async () => {
    widget("focusable").grabFocus()
  })
  await waitFor(() => {
    expect(onFocus).toHaveBeenCalledTimes(1)
  })
  expect(onBlur).not.toHaveBeenCalled()

  await act(async () => {
    widget("other").grabFocus()
  })
  await waitFor(() => {
    expect(onBlur).toHaveBeenCalledTimes(1)
  })
})

it("a Pressable with onPress is focusable by default, and one without is not", async () => {
  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <Pressable
          testID="button"
          onPress={() => {}}
        >
          <Text>press</Text>
        </Pressable>
        <Pressable testID="decoration">
          <Text>hover only</Text>
        </Pressable>
        <Pressable
          testID="opted-out"
          focusable={false}
          onPress={() => {}}
        >
          <Text>not in the tab order</Text>
        </Pressable>
      </Root>,
    )
  })

  // react-native-web's rule: a control you can click should be reachable
  // from the keyboard.
  expect(widget("button").getFocusable()).toBe(true)
  expect(widget("decoration").getFocusable()).toBe(false)
  // And the app can always say otherwise.
  expect(widget("opted-out").getFocusable()).toBe(false)
})

it("reports `focused` through the state callback, so a row can draw the ring", async () => {
  const seen: boolean[] = []

  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <Pressable
          testID="row"
          onPress={() => {}}
          style={({ focused }) => {
            seen.push(focused)
            return focused ? { outlineWidth: 2 } : {}
          }}
        >
          <Text>row</Text>
        </Pressable>
        <Pressable
          testID="elsewhere"
          onPress={() => {}}
        >
          <Text>elsewhere</Text>
        </Pressable>
      </Root>,
    )
  })

  const idle = widget("row").getCssClasses()
  expect(seen.at(-1)).toBe(false)

  await act(async () => {
    widget("row").grabFocus()
  })
  await waitFor(() => {
    expect(seen.at(-1)).toBe(true)
  })
  // The state has to reach the style layer, not just the callback: a focus
  // flag no widget acts on is what the research doc already had.
  expect(widget("row").getCssClasses()).not.toEqual(idle)

  await act(async () => {
    widget("elsewhere").grabFocus()
  })
  await waitFor(() => {
    expect(seen.at(-1)).toBe(false)
  })
})

it("activates a focused Pressable on Enter and on Space, but not on another key", async () => {
  const onPress = vi.fn()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <Pressable
          testID="row"
          onPress={onPress}
        >
          <Text>row</Text>
        </Pressable>
      </Root>,
    )
  })

  const keyController = (): GtkNs.EventControllerKey => {
    const list = widget("row").observeControllers()
    for (let index = 0; index < list.getNItems(); index += 1) {
      const controller = list.getItem(index)
      if (controller instanceof Gtk.EventControllerKey) {
        return controller
      }
    }
    throw new Error("EventControllerKey not found")
  }

  const press = async (keyval: number): Promise<void> => {
    await act(async () => {
      fireEvent(keyController(), "key-pressed", keyval, 0, 0)
    })
  }

  await press(0xff_0d) // Return
  await press(0x20) // space
  expect(onPress).toHaveBeenCalledTimes(2)

  // Anything else has to travel on — swallowing keys from a focused row
  // would break every shortcut in the window above it.
  await press(0xff_51) // Left
  expect(onPress).toHaveBeenCalledTimes(2)

  // The synthesised event is still RN's shape.
  expect(onPress.mock.calls[0]![0].nativeEvent.touches).toHaveLength(1)
})
