// Strategy (see epic.md task 004): no pixel readback. Mount through the real
// reconciler, then call the root widget's own snapshot() method directly
// against a fresh Gtk.Snapshot.new() — deterministic, no frame-clock wait —
// and spy on the Gsk append/push/save/transform calls it makes. This
// exercises the actual bridge draw path (svg-node.ts), not just descriptor
// storage.
import { render, screen, waitFor } from "@gtkx/testing"
import { describe, expect, it, vi } from "vitest"
import {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Svg,
} from "../../../src/components/svg/index"
import {
  getSvgNodeDescriptor,
  Gsk,
  Gtk,
  type Gdk,
} from "../../../src/gtkx/bridge/index"
import { Animated, Root } from "../../../src/index"

type WidgetWithSnapshot = Gtk.Widget & {
  snapshot(snapshot: Gtk.Snapshot): void
}

const getWidget = (testID: string): Gtk.Widget =>
  screen.getByName(testID) as unknown as Gtk.Widget

// Renders the root's real snapshot() vfunc method against a fresh
// Gtk.Snapshot, so tests can assert on the exact Gsk calls it makes.
const paint = (widget: Gtk.Widget): Gtk.Snapshot => {
  const snapshot = Gtk.Snapshot.new()
  ;(widget as WidgetWithSnapshot).snapshot(snapshot)
  return snapshot
}

const isRed = (rgba: Gdk.RGBA): boolean =>
  rgba.red === 1 && rgba.green === 0 && rgba.blue === 0 && rgba.alpha === 1

describe("<Svg> rendering", () => {
  it("mounts as an allocated widget and appends a fill for a plain shape", async () => {
    const onLayout = vi.fn()
    await render(
      <Root
        width={200}
        height={200}
      >
        <Svg
          testID="svg"
          width={100}
          height={100}
          viewBox="0 0 100 100"
          onLayout={onLayout}
        >
          <Circle
            cx={50}
            cy={50}
            r={40}
            fill="red"
          />
        </Svg>
      </Root>,
    )
    await waitFor(() => expect(onLayout).toHaveBeenCalled())

    const widget = getWidget("svg")
    const snapshot = paint(widget)
    const appendFill = vi.spyOn(snapshot, "appendFill")
    // Re-run with the spy attached — snapshot() reads live state each call.
    ;(widget as WidgetWithSnapshot).snapshot(snapshot)

    expect(appendFill).toHaveBeenCalledTimes(1)
    const [path, fillRule, color] = appendFill.mock.calls[0]!
    expect(path.isEmpty()).toBe(false)
    expect(fillRule).toBe(Gsk.FillRule.WINDING)
    expect(isRed(color)).toBe(true)
  })

  it("fill=none paints nothing", async () => {
    await render(
      <Root
        width={100}
        height={100}
      >
        <Svg
          testID="svg"
          width={100}
          height={100}
        >
          <Rect
            x={0}
            y={0}
            width={50}
            height={50}
            fill="none"
            stroke="none"
          />
        </Svg>
      </Root>,
    )
    const widget = getWidget("svg")
    const snapshot = paint(widget)
    const appendFill = vi.spyOn(snapshot, "appendFill")
    const appendStroke = vi.spyOn(snapshot, "appendStroke")
    ;(widget as WidgetWithSnapshot).snapshot(snapshot)
    expect(appendFill).not.toHaveBeenCalled()
    expect(appendStroke).not.toHaveBeenCalled()
  })

  it("every basic shape parses to a non-empty Gsk.Path", async () => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <Svg
          testID="svg"
          width={200}
          height={200}
        >
          <Rect
            x={0}
            y={0}
            width={20}
            height={10}
            rx={2}
          />
          <Circle
            cx={10}
            cy={10}
            r={5}
          />
          <Ellipse
            cx={10}
            cy={10}
            rx={5}
            ry={3}
          />
          <Line
            x1={0}
            y1={0}
            x2={10}
            y2={10}
            stroke="black"
          />
          <Polygon points="0,0 10,0 5,10" />
          <Polyline points="0,0 10,0 5,10" />
          <Path d="M0 0 L10 10 Z" />
        </Svg>
      </Root>,
    )
    const svgWidget = getWidget("svg")
    let child = svgWidget.getFirstChild()
    let count = 0
    while (child) {
      const descriptor = getSvgNodeDescriptor(child)
      expect(descriptor?.kind).toBe("shape")
      if (descriptor?.kind === "shape") {
        expect(descriptor.path).not.toBeNull()
        expect(descriptor.path?.isEmpty()).toBe(false)
      }
      count += 1
      child = child.getNextSibling()
    }
    expect(count).toBe(7)
  })

  it("<G> applies its transform around its children (save/translate/rotate/restore)", async () => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <Svg
          testID="svg"
          width={200}
          height={200}
        >
          <G transform="translate(10,20) rotate(45)">
            <Rect
              x={0}
              y={0}
              width={10}
              height={10}
              fill="blue"
            />
          </G>
        </Svg>
      </Root>,
    )
    const widget = getWidget("svg")
    const snapshot = paint(widget)
    const save = vi.spyOn(snapshot, "save")
    const restore = vi.spyOn(snapshot, "restore")
    const translate = vi.spyOn(snapshot, "translate")
    const rotate = vi.spyOn(snapshot, "rotate")
    ;(widget as WidgetWithSnapshot).snapshot(snapshot)

    // At least the root's own save/restore plus <G>'s.
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(save.mock.calls.length).toBe(restore.mock.calls.length)
    expect(
      translate.mock.calls.some(([point]) => point.x === 10 && point.y === 20),
    ).toBe(true)
    expect(rotate.mock.calls.some(([angle]) => angle === 45)).toBe(true)
  })

  it("viewBox + default preserveAspectRatio (xMidYMid meet) letterboxes", async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <Svg
          testID="svg"
          width={200}
          height={200}
          viewBox="0 0 100 100"
        >
          <Rect
            x={0}
            y={0}
            width={10}
            height={10}
          />
        </Svg>
      </Root>,
    )
    const widget = getWidget("svg")
    const snapshot = paint(widget)
    const scale = vi.spyOn(snapshot, "scale")
    const translate = vi.spyOn(snapshot, "translate")
    ;(widget as WidgetWithSnapshot).snapshot(snapshot)

    // 200x200 viewport, 100x100 viewBox: uniform scale 2, no slack on
    // either axis (square in, square out) — translate stays (0, 0).
    expect(scale).toHaveBeenCalledWith(2, 2)
    expect(
      translate.mock.calls.some(([point]) => point.x === 0 && point.y === 0),
    ).toBe(true)
  })

  // The gradient really paints: the stops reach Gsk with their authored
  // offsets and colors, and the geometry resolves against the shape's own
  // bounding box. (Until gtkx 1.0.0-rc.3 this asserted the opposite —
  // constructing a Gsk.ColorStop threw in the native addon, so a gradient
  // degraded to "paint nothing". Fixed upstream in gtkx-org/gtkx#473.)
  it("fill=url(#id) paints a linear gradient with the authored stops", async () => {
    await render(
      <Root
        width={100}
        height={100}
      >
        <Svg
          testID="svg"
          width={100}
          height={100}
        >
          <Defs>
            <LinearGradient
              id="grad"
              x1={0}
              y1={0}
              x2={1}
              y2={0}
            >
              <Stop
                offset={0}
                stopColor="red"
              />
              <Stop
                offset={1}
                stopColor="blue"
              />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={100}
            height={50}
            fill="url(#grad)"
          />
        </Svg>
      </Root>,
    )
    const widget = getWidget("svg")
    const snapshot = paint(widget)
    const pushFill = vi.spyOn(snapshot, "pushFill")
    const appendFill = vi.spyOn(snapshot, "appendFill")
    const appendLinearGradient = vi.spyOn(snapshot, "appendLinearGradient")
    const pop = vi.spyOn(snapshot, "pop")
    expect(() =>
      (widget as WidgetWithSnapshot).snapshot(snapshot),
    ).not.toThrow()

    // A gradient fill is the gradient node, not a flat appendFill.
    expect(appendFill).not.toHaveBeenCalled()
    expect(pushFill).toHaveBeenCalledTimes(1)
    expect(pop).toHaveBeenCalled()
    expect(appendLinearGradient).toHaveBeenCalledTimes(1)

    const [bounds, start, end, stops] = appendLinearGradient.mock.calls[0]!
    // The 100x50 rect's own bounds, and objectBoundingBox coordinates
    // (x1,y1)=(0,0) → (x2,y2)=(1,0) resolved against them.
    expect(bounds.size.width).toBeCloseTo(100)
    expect(bounds.size.height).toBeCloseTo(50)
    expect(start.x).toBeCloseTo(0)
    expect(start.y).toBeCloseTo(0)
    expect(end.x).toBeCloseTo(100)
    expect(end.y).toBeCloseTo(0)

    // The colors survive the trip into Gsk — the whole point of the fix.
    expect(stops).toHaveLength(2)
    expect(stops[0]!.offset).toBeCloseTo(0)
    expect(isRed(stops[0]!.color)).toBe(true)
    expect(stops[1]!.offset).toBeCloseTo(1)
    expect(stops[1]!.color.blue).toBeCloseTo(1)
    expect(stops[1]!.color.red).toBeCloseTo(0)
    expect(stops[1]!.color.alpha).toBeCloseTo(1)
  })

  it("fill=url(#missing) paints nothing rather than throwing", async () => {
    await render(
      <Root
        width={100}
        height={100}
      >
        <Svg
          testID="svg"
          width={100}
          height={100}
        >
          <Rect
            x={0}
            y={0}
            width={10}
            height={10}
            fill="url(#nope)"
          />
        </Svg>
      </Root>,
    )
    const widget = getWidget("svg")
    const snapshot = paint(widget)
    const appendFill = vi.spyOn(snapshot, "appendFill")
    expect(() =>
      (widget as WidgetWithSnapshot).snapshot(snapshot),
    ).not.toThrow()
    expect(appendFill).not.toHaveBeenCalled()
  })

  it("radial gradient reference paints with its stops too", async () => {
    await render(
      <Root
        width={100}
        height={100}
      >
        <Svg
          testID="svg"
          width={100}
          height={100}
        >
          <Defs>
            <RadialGradient id="rg">
              <Stop
                offset={0}
                stopColor="white"
              />
              <Stop
                offset={1}
                stopColor="black"
              />
            </RadialGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={80}
            height={40}
            fill="url(#rg)"
          />
        </Svg>
      </Root>,
    )
    const widget = getWidget("svg")
    const snapshot = paint(widget)
    const appendRadialGradient = vi.spyOn(snapshot, "appendRadialGradient")
    expect(() =>
      (widget as WidgetWithSnapshot).snapshot(snapshot),
    ).not.toThrow()
    expect(appendRadialGradient).toHaveBeenCalledTimes(1)

    // (bounds, center, hradius, vradius, start, end, stops)
    const [bounds, , , , , , stops] = appendRadialGradient.mock.calls[0]!
    expect(bounds.size.width).toBeCloseTo(80)
    expect(bounds.size.height).toBeCloseTo(40)
    expect(stops).toHaveLength(2)
    expect(stops[0]!.color.red).toBeCloseTo(1)
    expect(stops[0]!.color.green).toBeCloseTo(1)
    expect(stops[1]!.color.red).toBeCloseTo(0)
    expect(stops[1]!.color.green).toBeCloseTo(0)
  })
})

describe("<Svg> + Animated", () => {
  it("Animated.Value drives geometry and redraw without a React render", async () => {
    const radius = new Animated.Value(10)
    await render(
      <Root
        width={100}
        height={100}
      >
        <Svg
          testID="svg"
          width={100}
          height={100}
        >
          <Circle
            cx={50}
            cy={50}
            r={radius}
            fill="green"
          />
        </Svg>
      </Root>,
    )
    const svgWidget = getWidget("svg")
    const circleWidget = svgWidget.getFirstChild()!
    const queueDraw = vi.spyOn(svgWidget, "queueDraw")

    const before = getSvgNodeDescriptor(circleWidget)
    expect(before?.kind).toBe("shape")
    const boundsBefore =
      before?.kind === "shape" ? before.path?.getBounds() : undefined
    expect(boundsBefore?.[1].size.width).toBeCloseTo(20, 5) // 2 * r(10)

    // Synchronous, outside any React act()/render — proves the channel is
    // queueDraw, not a React re-render (see epic.md).
    radius.setValue(30)

    expect(queueDraw).toHaveBeenCalled()
    const after = getSvgNodeDescriptor(circleWidget)
    const boundsAfter =
      after?.kind === "shape" ? after.path?.getBounds() : undefined
    expect(boundsAfter?.[1].size.width).toBeCloseTo(60, 5) // 2 * r(30)
  })

  it("unmounting a shape removes its Animated listener (no leak)", async () => {
    const opacity = new Animated.Value(1)
    const { unmount } = await render(
      <Root
        width={100}
        height={100}
      >
        <Svg
          testID="svg"
          width={100}
          height={100}
        >
          <Circle
            cx={10}
            cy={10}
            r={5}
            opacity={opacity}
          />
        </Svg>
      </Root>,
    )
    unmount()
    // @ts-expect-error -- reaching into the private listener map is the only
    // way to observe "no leak" without exposing new public API for it.
    expect(opacity._listeners.size).toBe(0)
  })
})
