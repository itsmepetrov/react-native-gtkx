// `Controllers` is the door onto GTK behaviour from a component written in
// React Native, so three things have to be true: the controller reaches the
// enclosing view's widget, it reaches the RIGHT one when views are nested,
// and it goes away when the declaring component unmounts. A leaked
// controller is the failure mode that would only surface as a phantom drop
// target three screens later.
import { act, render, screen } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"
import { Controllers } from "../../../src/gtk/index"
import {
  Gdk,
  GObject,
  Gtk,
  GtkDropTarget,
  type Gtk as GtkNs,
} from "../../../src/gtkx/bridge/index"
import { Pressable, Root, Text, View } from "../../../src/index"

const dropTargetsOn = (widget: GtkNs.Widget): number => {
  const list = widget.observeControllers()
  let found = 0
  for (let index = 0; index < list.getNItems(); index += 1) {
    if (list.getItem(index) instanceof Gtk.DropTarget) {
      found += 1
    }
  }
  return found
}

const AnyDropTarget = () => (
  <GtkDropTarget
    actions={Gdk.DragAction.MOVE}
    types={[GObject.TYPE_STRING]}
    onDrop={() => true}
  />
)

it("attaches a controller to the widget of the enclosing View", async () => {
  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <View testID="target">
          <Controllers>
            <AnyDropTarget />
          </Controllers>
          <Text>row</Text>
        </View>
      </Root>,
    )
  })

  expect(dropTargetsOn(screen.getByName("target") as GtkNs.Widget)).toBe(1)
})

it("attaches to the NEAREST enclosing view, not the outermost one", async () => {
  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <View testID="outer">
          <Pressable
            testID="inner"
            onPress={() => {}}
          >
            <Controllers>
              <AnyDropTarget />
            </Controllers>
            <Text>row</Text>
          </Pressable>
        </View>
      </Root>,
    )
  })

  expect(dropTargetsOn(screen.getByName("inner") as GtkNs.Widget)).toBe(1)
  // The half that proves it resolved a host rather than walking to the root.
  expect(dropTargetsOn(screen.getByName("outer") as GtkNs.Widget)).toBe(0)
})

it("removes the controller when the declaring component unmounts", async () => {
  // Published from an effect rather than during render: assigning to an outer
  // binding while rendering is a side effect, and the lint rule that says so
  // is right even in a test.
  const control: { detach?: () => void } = {}

  const Stage = () => {
    const [attached, set] = useState(true)
    useEffect(() => {
      control.detach = () => set(false)
    }, [])
    return (
      <View testID="target">
        {attached ? (
          <Controllers>
            <AnyDropTarget />
          </Controllers>
        ) : null}
        <Text>row</Text>
      </View>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <Stage />
      </Root>,
    )
  })

  const target = screen.getByName("target") as GtkNs.Widget
  expect(dropTargetsOn(target)).toBe(1)

  await act(async () => {
    control.detach?.()
  })
  expect(dropTargetsOn(target)).toBe(0)
})
