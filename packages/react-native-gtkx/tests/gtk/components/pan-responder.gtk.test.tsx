// PanResponder end to end: RN's own vendored file, spread onto a View,
// driven through the GtkGestureDrag the responder system attaches.
//
// userEvent.drag emits drag-begin/update/end on the named widget's own
// GestureDrag controllers — which is exactly why the event source is a
// gesture per responder-declaring View rather than one raw tap on the
// toplevel (docs/research/gestures.md).
import { act, render, screen, userEvent, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { PanResponder, Root, Text, View } from "../../../src/index"
import type { PanResponderGestureState } from "../../../src/index"

const viewFor = (label: string): GtkNs.Widget =>
  (screen.getByText(label) as unknown as GtkNs.Widget).getParent()!

it("a pan drives PanResponder's gestureState from a real drag", async () => {
  const moves: PanResponderGestureState[] = []
  const onGrant = vi.fn()
  const onRelease = vi.fn()

  const Draggable = () => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (_event, gestureState) => {
        onGrant({ x0: gestureState.x0, y0: gestureState.y0 })
      },
      onPanResponderMove: (_event, gestureState) => {
        moves.push({ ...gestureState })
      },
      onPanResponderRelease: (_event, gestureState) => {
        onRelease({ dx: gestureState.dx, dy: gestureState.dy })
      },
    })
    return (
      <View
        {...responder.panHandlers}
        style={{ width: 120, height: 60 }}
      >
        <Text>handle</Text>
      </View>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        <Draggable />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("handle")).toBeTruthy()
  })

  await act(async () => {
    await userEvent.drag(viewFor("handle"), 60, 24, { steps: 4 })
  })

  expect(onGrant).toHaveBeenCalledTimes(1)
  expect(moves.length).toBeGreaterThan(0)

  // dx/dy accumulate to the full drag, and the release sees the total.
  const last = moves.at(-1)!
  expect(last.dx).toBeCloseTo(60, 0)
  expect(last.dy).toBeCloseTo(24, 0)
  expect(onRelease).toHaveBeenCalledWith({
    dx: expect.closeTo(60, 0),
    dy: expect.closeTo(24, 0),
  })
})

it("reports a non-zero velocity, which needs a real clock", async () => {
  const moves: PanResponderGestureState[] = []

  const Draggable = () => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gestureState) => {
        moves.push({ ...gestureState })
      },
    })
    return (
      <View
        {...responder.panHandlers}
        style={{ width: 120, height: 60 }}
      >
        <Text>velocity</Text>
      </View>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        <Draggable />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("velocity")).toBeTruthy()
  })

  await act(async () => {
    await userEvent.drag(viewFor("velocity"), 100, 0, { steps: 5 })
  })

  // The FIRST move always computes vx against _accountsForMovesUpTo === 0,
  // so its dt is the whole absolute timestamp and vx is ~0 — that is RN's
  // own behaviour, not a defect. Later moves are the real test: a coarse or
  // non-monotonic clock makes consecutive timestamps compare equal and
  // silently zeroes velocity (the standing react-native-windows bug).
  const later = moves.slice(1)
  expect(later.length).toBeGreaterThan(0)
  expect(later.every((state) => Number.isFinite(state.vx))).toBe(true)
  expect(later.some((state) => state.vx > 0)).toBe(true)
})

it("a nested view claims over its ancestor, and the ancestor is not asked", async () => {
  const order: string[] = []

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        <View
          onStartShouldSetResponder={() => {
            order.push("outer")
            return true
          }}
          style={{ padding: 20 }}
        >
          <View
            onStartShouldSetResponder={() => {
              order.push("inner")
              return true
            }}
            onResponderGrant={() => {
              order.push("inner:grant")
            }}
            style={{ width: 80, height: 40 }}
          >
            <Text>inner</Text>
          </View>
        </View>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("inner")).toBeTruthy()
  })

  await act(async () => {
    await userEvent.drag(viewFor("inner"), 10, 0, { steps: 2 })
  })

  // Deepest wins on bubble, and the outer view is never consulted.
  expect(order).toEqual(["inner", "inner:grant"])
})

it("touch props fire regardless of who holds the responder", async () => {
  const onTouchStart = vi.fn()
  const onTouchMove = vi.fn()
  const onTouchEnd = vi.fn()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        <View
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ width: 100, height: 50 }}
        >
          <Text>touched</Text>
        </View>
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByText("touched")).toBeTruthy()
  })

  await act(async () => {
    await userEvent.drag(viewFor("touched"), 20, 10, { steps: 2 })
  })

  // Nobody ever claimed the responder here — these are the plain view-config
  // touch events, which in RN are independent of the negotiation.
  expect(onTouchStart).toHaveBeenCalledTimes(1)
  expect(onTouchMove).toHaveBeenCalledTimes(2)
  expect(onTouchEnd).toHaveBeenCalledTimes(1)
  expect(onTouchStart.mock.calls[0]![0].nativeEvent.touches).toHaveLength(1)
  expect(onTouchEnd.mock.calls[0]![0].nativeEvent.touches).toHaveLength(0)
})
