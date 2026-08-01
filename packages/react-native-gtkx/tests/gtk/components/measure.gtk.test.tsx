// RN's imperative geometry on a View ref. The interesting cases are not
// "does it return the width" but the two coordinate spaces: measure()'s
// x/y are parent-relative while pageX/pageY are window-relative, and both
// have to stay right when the view is inside a scrolled viewport (GTK
// folds the scroll offset into the child's transform, so compute_point is
// what has to account for it — nothing here adds the offset by hand).
//
// Every test here has to wait for a non-zero ALLOCATION before measuring,
// not merely for the label to appear. `measure`/`measureInWindow` go
// through gtk_widget_compute_point(), which walks the allocated transform
// chain, and a widget that is realized and mapped but not yet allocated
// still carries an identity transform — compute_point succeeds and returns
// the point unchanged, so a window coordinate silently comes back as a
// local one. The layout phase runs on a later frame-clock tick than the
// commit, and under load that tick lands after the measurement. This is the
// same race that broke press-event.gtk.test.tsx on main; it reached these
// tests too, as `expected 0 to be greater than or equal to 15`.
//
// Waiting on the allocated SIZE rather than on the position is deliberate:
// GTK sets a widget's size and its transform in one gtk_widget_allocate()
// call and allocation runs top-down, so the chain up to the root is placed
// by the time the size is non-zero — and the assertions below stay able to
// fail.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  Root,
  ScrollView,
  Text,
  View,
  type ScrollViewHandle,
  type ViewHandle,
} from "../../../src/index"

const waitForAllocation = async (label: string): Promise<void> => {
  await waitFor(() => {
    const widget = screen.getByText(label) as unknown as GtkNs.Widget
    expect(widget.getAllocatedWidth()).toBeGreaterThan(0)
  })
}

it("measure reports parent-relative x/y and window-relative pageX/pageY", async () => {
  const inner = createRef<ViewHandle>()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        <View style={{ paddingTop: 40, paddingLeft: 25 }}>
          <View style={{ paddingTop: 10, paddingLeft: 5 }}>
            <View
              ref={inner}
              style={{ width: 60, height: 20 }}
            >
              <Text>inner</Text>
            </View>
          </View>
        </View>
      </Root>,
    )
  })
  await waitForAllocation("inner")

  let measured: {
    x: number
    y: number
    width: number
    height: number
    pageX: number
    pageY: number
  } | null = null
  inner.current!.measure((x, y, width, height, pageX, pageY) => {
    measured = { x, y, width, height, pageX, pageY }
  })
  expect(measured).not.toBeNull()
  const box = measured!

  expect(box.width).toBe(60)
  expect(box.height).toBe(20)
  // Parent-relative: the inner padding only.
  expect(box.x).toBe(5)
  expect(box.y).toBe(10)
  // Window-relative: both paddings accumulate. The point is that page
  // coordinates are STRICTLY further along than the local ones — the two
  // spaces are genuinely different, which is the bug this guards against.
  expect(box.pageX).toBeGreaterThanOrEqual(box.x + 25)
  expect(box.pageY).toBeGreaterThanOrEqual(box.y + 40)
})

it("measureInWindow reports window coordinates and the layout size", async () => {
  const box = createRef<ViewHandle>()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        <View style={{ paddingTop: 30, paddingLeft: 15 }}>
          <View
            ref={box}
            style={{ width: 80, height: 40 }}
          >
            <Text>box</Text>
          </View>
        </View>
      </Root>,
    )
  })
  await waitForAllocation("box")

  let result: {
    x: number
    y: number
    width: number
    height: number
  } | null = null
  box.current!.measureInWindow((x, y, width, height) => {
    result = { x, y, width, height }
  })
  expect(result).not.toBeNull()
  const inWindow = result!
  expect(inWindow.width).toBe(80)
  expect(inWindow.height).toBe(40)
  expect(inWindow.x).toBeGreaterThanOrEqual(15)
  expect(inWindow.y).toBeGreaterThanOrEqual(30)
})

it("measureLayout reports the offset between two views", async () => {
  const outer = createRef<ViewHandle>()
  const inner = createRef<ViewHandle>()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        <View
          ref={outer}
          style={{ paddingTop: 20, paddingLeft: 10 }}
        >
          <View style={{ paddingTop: 7, paddingLeft: 3 }}>
            <View
              ref={inner}
              style={{ width: 50, height: 15 }}
            >
              <Text>leaf</Text>
            </View>
          </View>
        </View>
      </Root>,
    )
  })
  await waitForAllocation("leaf")

  let layout: {
    left: number
    top: number
    width: number
    height: number
  } | null = null
  inner.current!.measureLayout(outer.current!, (left, top, width, height) => {
    layout = { left, top, width, height }
  })
  expect(layout).not.toBeNull()
  const relative = layout!
  // Both padding levels, in the ancestor's space — not the immediate
  // parent's, which is what measure() would have given.
  expect(relative.left).toBe(13)
  expect(relative.top).toBe(27)
  expect(relative.width).toBe(50)
  expect(relative.height).toBe(15)
})

it("measureInWindow follows the content when the ScrollView scrolls", async () => {
  const listRef = createRef<ScrollViewHandle>()
  const row = createRef<ViewHandle>()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={200}
      >
        <ScrollView
          ref={listRef}
          style={{ height: 200 }}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <View
              key={i}
              ref={i === 5 ? row : undefined}
              style={{ height: 40 }}
            >
              <Text>{`row-${i}`}</Text>
            </View>
          ))}
        </ScrollView>
      </Root>,
    )
  })
  await waitForAllocation("row-0")

  const windowY = (): number => {
    let value: number | null = null
    row.current!.measureInWindow((_x, y) => {
      value = y
    })
    expect(value).not.toBeNull()
    return value!
  }

  const before = windowY()
  await act(async () => {
    listRef.current!.scrollTo({ y: 120 })
  })

  // The Yoga rect never moved — only the viewport's transform did. If
  // measureInWindow read the layout rect instead of computing a point, this
  // is where it would silently report the unscrolled position.
  expect(windowY()).toBeCloseTo(before - 120, 0)
})
