// Interactive components: signal-level behavior of Switch, TextInput and
// dynamic FlatList data, driven through fireEvent — the widget contract
// itself, independent of pointer geometry.
import { act, fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { useState } from "react"
import { expect, it, vi } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  FlatList,
  Pressable,
  Root,
  Switch,
  Text,
  TextInput,
  View,
} from "../../../src/index"

const findController = <T,>(
  widget: GtkNs.Widget,
  matches: (controller: unknown) => controller is T,
): T => {
  const controllers = widget.observeControllers()
  for (let i = 0; i < controllers.getNItems(); i += 1) {
    const controller = controllers.getItem(i)
    if (matches(controller)) {
      return controller
    }
  }
  throw new Error("controller not found")
}

it("Switch reports the change but stays prop-controlled", async () => {
  const onValueChange = vi.fn()
  await render(
    <Root
      width={300}
      height={200}
    >
      <View style={{ alignItems: "flex-start" }}>
        <Switch
          value={false}
          onValueChange={onValueChange}
        />
      </View>
    </Root>,
  )

  const widget = (await screen.findByRole(
    Gtk.AccessibleRole.SWITCH,
  )) as GtkNs.Switch
  fireEvent(widget, "state-set", true)

  await waitFor(() => {
    expect(onValueChange).toHaveBeenCalledWith(true)
  })
  // Controlled semantics: the prop did not change, so neither may the widget.
  expect(widget.getActive()).toBe(false)
})

it("TextInput delivers text changes from the widget", async () => {
  const onChangeText = vi.fn()
  // render()'s own layout settling runs after its internal act() wrap
  // closes, so the whole call needs act() too (same as entry.setText below
  // — SingleLineTextInput's measureFromWidget remeasure-on-"map" effect
  // lands here, not in the changed-signal handler).
  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <TextInput
          defaultValue=""
          onChangeText={onChangeText}
        />
      </Root>,
    )
  })

  const entry = (await screen.findByRole(
    Gtk.AccessibleRole.TEXT_BOX,
  )) as GtkNs.Entry
  // setText fires GtkEntry's "changed" signal synchronously, which calls
  // onChangeText — a native poke outside any React event handler.
  await act(async () => {
    entry.setText("привет")
  })

  await waitFor(() => {
    expect(onChangeText).toHaveBeenCalledWith("привет")
  })
})

it("FlatList renders appended rows in order", async () => {
  const data = ["Row #1", "Row #2"]
  const list = (items: string[]) => (
    <Root
      width={300}
      height={300}
    >
      <FlatList
        style={{ height: 250 }}
        data={items}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <Text>{item}</Text>}
      />
    </Root>
  )

  // render()'s own layout settling runs after its internal act() wrap
  // closes, so the whole call needs act() too (same as the rerender below).
  const { rerender } = await act(async () => render(list(data)))
  expect(screen.getByText("Row #2")).toBeTruthy()

  await act(async () => {
    await rerender(list([...data, "Row #3"]))
  })
  const added = screen.getByText("Row #3") as GtkNs.Label
  expect(added).toBeTruthy()
  await waitFor(() => {
    expect(added.getAllocatedHeight()).toBeGreaterThan(0)
  })
})

it("Pressable fires onPress through its click gesture", async () => {
  const onPress = vi.fn()
  await render(
    <Root
      width={300}
      height={200}
    >
      <View style={{ alignItems: "flex-start" }}>
        <Pressable
          onPress={onPress}
          style={{ padding: 10 }}
        >
          <Text>tap me</Text>
        </Pressable>
      </View>
    </Root>,
  )

  const label = screen.getByText("tap me") as GtkNs.Label
  const pressableFixed = label.getParent() as GtkNs.Fixed
  const gesture = findController(
    pressableFixed,
    (c): c is GtkNs.GestureClick => c instanceof Gtk.GestureClick,
  )
  fireEvent(gesture, "pressed", 1, 5, 5)
  fireEvent(gesture, "released", 1, 5, 5)

  await waitFor(() => {
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

it("clearButtonMode shows GtkEntry's own clear icon and empties the field", async () => {
  const onChangeText = vi.fn()
  const Controlled = () => {
    const [value, setValue] = useState("hello")
    return (
      <TextInput
        value={value}
        clearButtonMode="always"
        onChangeText={(text) => {
          setValue(text)
          onChangeText(text)
        }}
      />
    )
  }
  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <Controlled />
      </Root>,
    )
  })

  const entry = (await screen.findByRole(
    Gtk.AccessibleRole.TEXT_BOX,
  )) as GtkNs.Entry
  // The affordance is the entry's own secondary icon — nothing beside it.
  await waitFor(() => {
    expect(entry.secondaryIconName).toBe("edit-clear-symbolic")
  })

  fireEvent(entry, "icon-release", Gtk.EntryIconPosition.SECONDARY)
  await waitFor(() => {
    expect(onChangeText).toHaveBeenCalledWith("")
    expect(entry.getText()).toBe("")
    // Empty field: nothing left to clear, so the icon goes away.
    expect(entry.secondaryIconName).toBeNull()
  })
})
