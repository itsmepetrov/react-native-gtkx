// `hitSlop` and `pressRetentionOffset`: the two props that make a target
// forgiving of a pointer that is not exactly where the user meant it.
//
// They are one feature from opposite ends. hitSlop can only be a PICKING
// change — a press outside a widget is never delivered to it at all, so no
// amount of JS could implement it — and is asserted through
// `gtk_widget_pick`, the routine real input goes through. Drift after the
// press is the opposite: GtkGestureClick keeps an implicit grab for the
// whole press, so `released` arrives wherever the pointer ended up and the
// decision is entirely ours. That half is driven with a real pointer,
// because "press here, release over there" is the behaviour and a
// synthesized release would just be the assertion written twice.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { afterEach, expect, it, vi } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Pressable, Root, Text, View } from "../../../src/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

const OUTPUT = { width: 1024, height: 768 }

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

let pointer: VirtualPointer | null = null

afterEach(() => {
  pointer?.dispose()
  pointer = null
})

const withPointer = async (): Promise<VirtualPointer | null> => {
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      console.warn(`[pressable-hit-area] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

const pickName = (x: number, y: number): string | null => {
  const stage = screen.getByName("stage") as unknown as GtkNs.Widget
  return stage.pick(x, y, Gtk.PickFlags.DEFAULT)?.getName() ?? null
}

it("hitSlop makes a small target pickable outside its own bounds", async () => {
  await render(
    <Root
      width={300}
      height={300}
    >
      <View
        style={{ width: 300, height: 300 }}
        testID="stage"
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 300,
            height: 300,
          }}
          testID="under"
        />
        <Pressable
          hitSlop={12}
          testID="target"
          style={{
            position: "absolute",
            left: 100,
            top: 100,
            width: 40,
            height: 40,
          }}
        />
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(pickName(120, 120)).toBe("target")
  })

  // Eight pixels outside every edge: inside the slop, so still the target.
  expect(pickName(92, 120)).toBe("target")
  expect(pickName(147, 120)).toBe("target")
  expect(pickName(120, 92)).toBe("target")
  expect(pickName(120, 147)).toBe("target")
  // Twenty is past it, and the layer underneath gets the press back.
  expect(pickName(78, 120)).toBe("under")
  expect(pickName(120, 161)).toBe("under")
})

it("without hitSlop the bounds are exactly the bounds", async () => {
  await render(
    <Root
      width={300}
      height={300}
    >
      <View
        style={{ width: 300, height: 300 }}
        testID="stage"
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 300,
            height: 300,
          }}
          testID="under"
        />
        <Pressable
          testID="target"
          style={{
            position: "absolute",
            left: 100,
            top: 100,
            width: 40,
            height: 40,
          }}
        />
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(pickName(120, 120)).toBe("target")
  })
  expect(pickName(92, 120)).toBe("under")
  expect(pickName(147, 120)).toBe("under")
})

const dragStage = async (
  props: Record<string, unknown>,
  handlers: { onPress: () => void; onPressOut: () => void },
): Promise<GtkNs.Window> => {
  await act(async () => {
    await render(
      <Root
        width={600}
        height={400}
      >
        <View style={{ flexDirection: "row" }}>
          <Pressable
            {...props}
            {...handlers}
            style={{ width: 120, height: 120 }}
          >
            <Text>btn</Text>
          </Pressable>
          <View style={{ width: 400, height: 120 }}>
            <Text>elsewhere</Text>
          </View>
        </View>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("btn")).toBeTruthy()
  })
  const root = (screen.getByText("btn") as unknown as GtkNs.Widget).getRoot()
  if (!(root instanceof Gtk.Window)) {
    throw new Error("no toplevel")
  }
  root.present()
  root.fullscreen()
  await waitFor(() => {
    expect(root.isActive()).toBe(true)
  })
  await settle()
  return root
}

it("does not activate when the pointer is released far outside", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const onPress = vi.fn()
  const onPressOut = vi.fn()
  await dragStage({}, { onPress, onPressOut })

  device.moveTo(40, 40)
  await settle()
  device.press()
  await settle()
  device.moveTo(400, 300)
  await settle()
  device.release()
  await settle()

  // Pressing a button and dragging away to change your mind is how every
  // toolkit works, GTK's own GtkButton included — it checks whether the
  // pointer is still inside before activating. GtkGestureClick does not do
  // that for us: it reports the release from wherever the implicit grab
  // ended, and this used to fire onPress from three hundred pixels away.
  expect(onPress).not.toHaveBeenCalled()
  // The press still ENDED, and RN reports that either way.
  await waitFor(() => {
    expect(onPressOut).toHaveBeenCalledTimes(1)
  })
})

it("still activates when the pointer only drifts inside the retention offset", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const onPress = vi.fn()
  const onPressOut = vi.fn()
  await dragStage({}, { onPress, onPressOut })

  device.moveTo(60, 60)
  await settle()
  device.press()
  await settle()
  // Ten pixels past the 120 px edge — outside the button, inside RN's
  // default press rect, which is deliberately generous because a finger
  // rolls off a target far more easily than a mouse slips.
  device.moveTo(130, 60)
  await settle()
  device.release()
  await settle()

  await waitFor(() => {
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

it("honours a pressRetentionOffset of zero", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  const onPress = vi.fn()
  const onPressOut = vi.fn()
  await dragStage({ pressRetentionOffset: 0 }, { onPress, onPressOut })

  device.moveTo(60, 60)
  await settle()
  device.press()
  await settle()
  device.moveTo(130, 60)
  await settle()
  device.release()
  await settle()

  await waitFor(() => {
    expect(onPressOut).toHaveBeenCalledTimes(1)
  })
  expect(onPress).not.toHaveBeenCalled()
})
