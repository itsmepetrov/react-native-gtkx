// Hover fast path (hover-perf epic, task 007): a boundary crossing should
// not cost a setState + render + Yoga + allocate cycle when nothing needs
// to see it as one — see the design note at the top of
// components/pressable.tsx and docs/research/scroll-performance.md.
// Driven through the EventControllerMotion signal directly (the same
// enter/leave GTK itself delivers), not simulated coordinates — that IS
// the mechanism under test, same reasoning as pointer-events.gtk.test.tsx
// uses gtk_widget_pick for pointerEvents.
import { fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { Gtk, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Pressable, Root, Text } from "../../../src/index"

const findMotionController = (
  widget: GtkNs.Widget,
): GtkNs.EventControllerMotion => {
  const controllers = widget.observeControllers()
  for (let i = 0; i < controllers.getNItems(); i += 1) {
    const controller = controllers.getItem(i)
    if (controller instanceof Gtk.EventControllerMotion) {
      return controller
    }
  }
  throw new Error("EventControllerMotion not found")
}

it("hover style swaps a CSS class directly, without a re-render", async () => {
  const onHoverIn = vi.fn()
  const onHoverOut = vi.fn()
  let styleCalls = 0
  const style = ({ hovered }: { hovered: boolean; pressed: boolean }) => {
    styleCalls += 1
    return [{ padding: 10 }, hovered && { backgroundColor: "#ff0000" }]
  }

  await render(
    <Root
      width={300}
      height={200}
    >
      <Pressable
        testID="row"
        style={style}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
      >
        <Text>row</Text>
      </Pressable>
    </Root>,
  )

  const widget = screen.getByName("row") as GtkNs.Widget
  const motion = findMotionController(widget)
  const beforeClasses = widget.getCssClasses()
  const callsAfterMount = styleCalls

  fireEvent(motion, "enter", 5, 5)
  await waitFor(() => {
    expect(onHoverIn).toHaveBeenCalledTimes(1)
  })

  // The class actually changed (the hovered background applied)...
  const hoveredClasses = widget.getCssClasses()
  expect(hoveredClasses).not.toEqual(beforeClasses)
  // ...but no React render happened to get there: `style` was already
  // called (once for the current state, once to precompute the OTHER
  // hover value) during the mount render and never again.
  expect(styleCalls).toBe(callsAfterMount)

  fireEvent(motion, "leave")
  await waitFor(() => {
    expect(onHoverOut).toHaveBeenCalledTimes(1)
  })
  expect(widget.getCssClasses()).toEqual(beforeClasses)
  expect(styleCalls).toBe(callsAfterMount)
})

it("functional children still forces a real render on hover", async () => {
  const onHoverIn = vi.fn()
  await render(
    <Root
      width={300}
      height={200}
    >
      <Pressable
        testID="row"
        onHoverIn={onHoverIn}
      >
        {({ hovered }: { hovered: boolean; pressed: boolean }) => (
          <Text>{hovered ? "hovered" : "idle"}</Text>
        )}
      </Pressable>
    </Root>,
  )

  expect(screen.getByText("idle")).toBeTruthy()
  const widget = screen.getByName("row") as GtkNs.Widget
  const motion = findMotionController(widget)

  fireEvent(motion, "enter", 5, 5)
  await waitFor(() => {
    expect(onHoverIn).toHaveBeenCalledTimes(1)
    expect(screen.getByText("hovered")).toBeTruthy()
  })

  fireEvent(motion, "leave")
  await waitFor(() => {
    expect(screen.getByText("idle")).toBeTruthy()
  })
})

it("a hover style that also changes layout still reflows correctly", async () => {
  await render(
    <Root
      width={300}
      height={200}
    >
      <Pressable
        testID="row"
        style={({ hovered }: { hovered: boolean; pressed: boolean }) => [
          { padding: 10 },
          hovered && { padding: 30 },
        ]}
      >
        <Text>row</Text>
      </Pressable>
    </Root>,
  )

  const widget = screen.getByName("row") as GtkNs.Widget
  const motion = findMotionController(widget)
  const idleHeight = widget.getAllocatedHeight()

  fireEvent(motion, "enter", 5, 5)
  await waitFor(() => {
    expect(widget.getAllocatedHeight()).toBeGreaterThan(idleHeight)
  })

  fireEvent(motion, "leave")
  await waitFor(() => {
    expect(widget.getAllocatedHeight()).toBe(idleHeight)
  })
})

it("hover with a plain (non-function) style still fires callbacks and touches nothing visual", async () => {
  const onHoverIn = vi.fn()
  const onHoverOut = vi.fn()

  await render(
    <Root
      width={300}
      height={200}
    >
      <Pressable
        testID="row"
        style={{ padding: 10 }}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
      >
        <Text>row</Text>
      </Pressable>
    </Root>,
  )

  const widget = screen.getByName("row") as GtkNs.Widget
  const motion = findMotionController(widget)
  const beforeClasses = widget.getCssClasses()

  fireEvent(motion, "enter", 5, 5)
  await waitFor(() => {
    expect(onHoverIn).toHaveBeenCalledTimes(1)
  })
  // Nothing in `style` reads `hovered`, so there is nothing to swap — the
  // widget's classes stay exactly what they were.
  expect(widget.getCssClasses()).toEqual(beforeClasses)

  fireEvent(motion, "leave")
  await waitFor(() => {
    expect(onHoverOut).toHaveBeenCalledTimes(1)
  })
  expect(widget.getCssClasses()).toEqual(beforeClasses)
})
