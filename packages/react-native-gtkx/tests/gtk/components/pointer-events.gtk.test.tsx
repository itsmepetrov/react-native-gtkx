// pointerEvents over GTK picking, asserted through gtk_widget_pick — the
// exact routine real input goes through (rc.1 ships no virtual seat, so
// events cannot be synthesized at coordinates; pick() IS the semantics).
// Stage: a full-size "under" layer, an "overlay" View on top with a child;
// picks at (150,150) hit the overlay's empty area, (40,40) the child.
import { render, screen, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import { Gtk } from "../../../src/gtkx/bridge/index"
import { Root, View, type ViewProps } from "../../../src/index"

const stage = (mode?: ViewProps["pointerEvents"], styleMode?: boolean) => (
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
      <View
        pointerEvents={styleMode ? undefined : mode}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 200,
          height: 200,
          ...(styleMode ? { pointerEvents: mode } : null),
        }}
        testID="overlay"
      >
        <View
          style={{
            position: "absolute",
            left: 20,
            top: 20,
            width: 60,
            height: 60,
          }}
          testID="overlay-child"
        />
      </View>
    </View>
  </Root>
)

const pickName = (x: number, y: number): string | null => {
  const root = screen.getByName("stage") as unknown as Gtk.Widget
  const picked = root.pick(x, y, Gtk.PickFlags.DEFAULT)
  return picked?.getName() ?? null
}

const waitForStage = async (): Promise<void> => {
  await waitFor(() => {
    expect(pickName(150, 150)).not.toBeNull()
  })
}

it("auto: the overlay and its children are pick targets", async () => {
  await render(stage("auto"))
  await waitForStage()
  expect(pickName(150, 150)).toBe("overlay")
  expect(pickName(40, 40)).toBe("overlay-child")
  expect(pickName(250, 250)).toBe("under")
})

it("none: the whole subtree is transparent", async () => {
  await render(stage("none"))
  await waitForStage()
  expect(pickName(150, 150)).toBe("under")
  expect(pickName(40, 40)).toBe("under")
})

it("box-none: the box passes through, children stay pickable", async () => {
  await render(stage("box-none"))
  await waitForStage()
  expect(pickName(150, 150)).toBe("under")
  expect(pickName(40, 40)).toBe("overlay-child")
})

it("box-only: the box is the target, children are not", async () => {
  await render(stage("box-only"))
  await waitForStage()
  expect(pickName(150, 150)).toBe("overlay")
  expect(pickName(40, 40)).toBe("overlay")
})

it("style.pointerEvents works and dynamic changes apply and restore", async () => {
  const { rerender } = await render(stage("none", true))
  await waitForStage()
  expect(pickName(40, 40)).toBe("under")
  // Flip through box-only and back to auto: children must be restored.
  await rerender(stage("box-only", true))
  await waitFor(() => {
    expect(pickName(40, 40)).toBe("overlay")
  })
  await rerender(stage("auto", true))
  await waitFor(() => {
    expect(pickName(40, 40)).toBe("overlay-child")
  })
})
