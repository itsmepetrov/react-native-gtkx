// Layout animations, asserted on geometry GTK itself computed.
//
// The claim under test is the one that needed a new primitive: a widget React
// has ALREADY RECONCILED AWAY keeps being drawn, in the right place, with its
// own children still laid out, until the exit animation ends — and is gone
// afterwards whether or not that animation ever reports an end.
//
// Everything is read back through `computeBounds()` against the stage and
// through `getOpacity()` on the real widget, never through the values this
// layer stored: reading back our own bookkeeping would pass even if nothing
// reached GTK, which is the failure this file exists to rule out.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { expect, it, vi } from "vitest"
import { retainedWidgetCount } from "../../../src/components/widget-retention"
import { Graphene, Gtk } from "../../../src/gtkx/bridge/index"
import { Root, Text, View } from "../../../src/index"
import Animated, {
  createAnimatedComponent,
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
} from "../../../src/reanimated-compat/index"
import { resetLayoutAnimationWarnings } from "../../../src/reanimated-compat/layout-animation-runtime"
import { resetLayoutAnimationComponentWarnings } from "../../../src/reanimated-compat/layout-animation-view"

const ROW_HEIGHT = 40

const settle = (ms = 60): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const widget = (testID: string): Gtk.Widget =>
  screen.getByName(testID) as unknown as Gtk.Widget

const boundsOf = (testID: string): Graphene.Rect => {
  const stage = screen.getByName("stage") as unknown as Gtk.Widget
  const [, rect] = widget(testID).computeBounds(stage) as [
    boolean,
    Graphene.Rect,
  ]
  return rect
}

const yOf = (testID: string): number => Math.round(boundsOf(testID).getY())

type Handles = { setItems: (items: string[]) => void }
let handles: Handles

type RowsProps = {
  initial: string[]
  entering?: Parameters<typeof Animated.View>[0]["entering"]
  exiting?: Parameters<typeof Animated.View>[0]["exiting"]
  layout?: Parameters<typeof Animated.View>[0]["layout"]
}

const Rows = ({ initial, entering, exiting, layout }: RowsProps) => {
  const [items, setItems] = useState(initial)
  // In a commit effect rather than in the body: a render must not write to
  // module state. `setItems` is identity-stable, so once is enough.
  useEffect(() => {
    handles = { setItems }
  }, [setItems])
  return (
    <View
      style={{ width: 200, height: 300 }}
      testID="stage"
    >
      {items.map((id) => (
        <Animated.View
          key={id}
          testID={`row-${id}`}
          entering={entering}
          exiting={exiting}
          layout={layout}
          style={{ width: 120, height: ROW_HEIGHT, backgroundColor: "#62a0ea" }}
        >
          {/* Deliberately placed away from the origin: if retention let the
              container's RnGtkxLayout be detached, GtkBox's own layout would
              take over and put this back at the top-left. */}
          <View
            style={{
              position: "absolute",
              left: 30,
              top: 12,
              width: 20,
              height: 20,
              backgroundColor: "#f6d32d",
            }}
            testID={`inner-${id}`}
          />
        </Animated.View>
      ))}
    </View>
  )
}

const mount = async (props: RowsProps): Promise<void> => {
  await render(
    <Root
      width={200}
      height={300}
    >
      <Rows {...props} />
    </Root>,
  )
  await waitFor(() => {
    expect(boundsOf(`row-${props.initial[0]}`).getHeight()).toBe(ROW_HEIGHT)
  })
}

it("fades a view in as it mounts, on the real widget", async () => {
  await mount({ initial: ["a"], entering: FadeIn.duration(300) })
  // The initial value is written in the same commit that mounts the widget,
  // so it is never drawn at full opacity even for one frame.
  expect(widget("row-a").getOpacity()).toBeLessThan(0.5)

  await settle(450)
  expect(widget("row-a").getOpacity()).toBeCloseTo(1, 2)
})

it("keeps drawing a widget React has removed, then drops it", async () => {
  await mount({ initial: ["a", "b"], exiting: FadeOut.duration(300) })
  const rowB = widget("row-b")
  const yBefore = yOf("row-b")
  expect(yBefore).toBe(ROW_HEIGHT)

  await act(async () => {
    handles.setItems(["a"])
  })
  await settle(40)

  // React is done with it — and it is still on screen, at the position it
  // had, fading.
  expect(rowB.getParent()).not.toBeNull()
  expect(yOf("row-b")).toBe(yBefore)
  expect(rowB.getOpacity()).toBeLessThan(1)
  expect(retainedWidgetCount()).toBe(1)

  // Its own subtree is still laid out by the layout engine rather than by
  // whatever a GtkBox does once its layout manager has been taken away. The
  // MEASUREMENT is the assertion that discriminates, and it is GTK's own:
  // without the retention the container reports 0×0 here (verified by
  // removing it — the same run warns 55 times that it is snapshotting a child
  // "without a current allocation"), because nothing is left to answer for
  // the engine's rect or to allocate the children.
  expect(rowB.measure(Gtk.Orientation.HORIZONTAL, -1)[1]).toBe(120)
  expect(rowB.measure(Gtk.Orientation.VERTICAL, -1)[1]).toBe(ROW_HEIGHT)
  const innerBounds = boundsOf("inner-b")
  expect(Math.round(innerBounds.getX())).toBe(30)
  expect(Math.round(innerBounds.getY())).toBe(yBefore + 12)

  await settle(500)
  expect(rowB.getParent()).toBeNull()
  expect(retainedWidgetCount()).toBe(0)
  expect(() => widget("row-b")).toThrow()
})

it("closes the gap immediately while the exiting widget draws over it", async () => {
  // An exiting view must not hold its space: its Yoga node leaves the tree in
  // the same commit React removed it, so the row below moves up at once.
  // `exiting={FadeOut}` — the bare class, not an instance — is the other half
  // of the call surface, and it has to work unconfigured.
  await mount({ initial: ["a", "b", "c"], exiting: FadeOut })
  expect(yOf("row-c")).toBe(ROW_HEIGHT * 2)

  await act(async () => {
    handles.setItems(["a", "c"])
  })
  await settle(40)

  expect(yOf("row-c")).toBe(ROW_HEIGHT)
  expect(yOf("row-b")).toBe(ROW_HEIGHT)

  await settle(500)
  expect(retainedWidgetCount()).toBe(0)
})

it("drops a retained widget on the fallback timer when the animation outlives it", async () => {
  // The criterion the primitive exists to meet: a missing (here, a very late)
  // animation end must not leak a widget. This spring is deliberately slow
  // enough that it is still running when the fallback — which is armed from
  // the builder's DECLARED length — fires.
  await mount({
    initial: ["a", "b"],
    exiting: FadeOut.springify().damping(1).stiffness(1).mass(60),
  })
  const rowB = widget("row-b")

  await act(async () => {
    handles.setItems(["a"])
  })
  await settle(60)
  expect(retainedWidgetCount()).toBe(1)
  expect(rowB.getOpacity()).toBeGreaterThan(0.5)

  // FadeOut with no `.duration()` declares 300 ms; the fallback is that plus
  // its margin, and nothing else is going to release this one.
  await settle(1100)
  expect(retainedWidgetCount()).toBe(0)
  expect(rowB.getParent()).toBeNull()
})

it("walks a reordered row from where it was to where the engine put it", async () => {
  await mount({
    initial: ["a", "b", "c"],
    layout: LinearTransition.duration(300).easing(Easing.linear),
  })
  expect(yOf("row-c")).toBe(ROW_HEIGHT * 2)

  await act(async () => {
    handles.setItems(["c", "a", "b"])
  })
  await settle(40)

  // A keyed move mounts nothing and unmounts nothing: the widget order
  // changed, syncChildOrder put the shadow tree back into it, and the new
  // rect started a transition FROM the old position rather than snapping.
  const early = yOf("row-c")
  expect(early).toBeGreaterThan(ROW_HEIGHT)
  expect(early).toBeLessThanOrEqual(ROW_HEIGHT * 2)

  await settle(500)
  expect(yOf("row-c")).toBe(0)
  expect(yOf("row-a")).toBe(ROW_HEIGHT)
  expect(yOf("row-b")).toBe(ROW_HEIGHT * 2)
})

it("lands a keyed reorder in the right order while a sibling is being retained", async () => {
  // The two mechanisms in the same commit: `b` leaves (and is held on screen
  // with no Yoga node), `c` and `a` swap. syncChildOrder walks the container's
  // WIDGETS, so a retained widget it can no longer map to a node has to be
  // skipped rather than counted — otherwise the shadow tree is re-sorted
  // against a partial view and the rows land somewhere else entirely.
  await mount({
    initial: ["a", "b", "c"],
    exiting: FadeOut.duration(300),
    layout: LinearTransition.duration(120).easing(Easing.linear),
  })

  await act(async () => {
    handles.setItems(["c", "a"])
  })
  await settle(400)

  expect(yOf("row-c")).toBe(0)
  expect(yOf("row-a")).toBe(ROW_HEIGHT)
  expect(retainedWidgetCount()).toBe(0)
  expect(() => widget("row-b")).toThrow()

  // …and the container still lays out what is left, so a later mount lands
  // where the engine says rather than where a stale order would put it.
  await act(async () => {
    handles.setItems(["c", "a", "d"])
  })
  await settle(200)
  expect(yOf("row-d")).toBe(ROW_HEIGHT * 2)
})

it("names a property a layout animation cannot drive, once", async () => {
  // The failure this repo refuses is the silent one. A keyframe value that is
  // not a number cannot be interpolated by a numeric animation, and dropping
  // it would be "compiled, ran, did nothing".
  resetLayoutAnimationWarnings()
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

  await mount({
    initial: ["a"],
    entering: new Keyframe({
      0: { opacity: 0, backgroundColor: "#ff0000" },
      100: { opacity: 1, backgroundColor: "#00ff00" },
    }).duration(200),
  })
  await settle(300)

  expect(warn).toHaveBeenCalledTimes(1)
  expect(String(warn.mock.calls[0]?.[0])).toContain("backgroundColor")
  // …and the numeric half of the same keyframe still ran.
  expect(widget("row-a").getOpacity()).toBeCloseTo(1, 2)
  warn.mockRestore()
})

it("says so by name when there is no widget to animate", async () => {
  resetLayoutAnimationComponentWarnings()
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

  const Bare = () => <Text>unreachable</Text>
  const AnimatedBare = createAnimatedComponent(Bare)

  await render(
    <Root
      width={200}
      height={100}
    >
      <View style={{ width: 200, height: 100 }}>
        <AnimatedBare entering={FadeIn} />
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(warn).toHaveBeenCalled()
  })
  expect(String(warn.mock.calls[0]?.[0])).toContain("Bare")
  warn.mockRestore()
})

it("runs a Keyframe track on the real widget", async () => {
  await mount({
    initial: ["a"],
    entering: new Keyframe({
      0: { opacity: 0 },
      50: { opacity: 0.4 },
      100: { opacity: 1 },
    }).duration(300),
  })
  expect(widget("row-a").getOpacity()).toBeLessThan(0.2)

  await settle(450)
  expect(widget("row-a").getOpacity()).toBeCloseTo(1, 2)
})
