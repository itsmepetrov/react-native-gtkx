import { render, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import { getStoredRect, setStoredRect } from "../../src/components/rect-store"
import {
  allocateChild,
  attachRnLayout,
  createTextProbe,
  GtkBox,
  GtkLabel,
  measureWidget,
  queueResize,
  type Gtk,
  type RnLayoutOrientation,
} from "../../src/gtkx-bridge/index"
import { LayoutEngine, type LayoutNode } from "../../src/layout/index"
import type { Rect } from "../../src/contracts"

// Mirrors what useRnContainer + the commit path do in components.
const wireContainer = (widget: Gtk.Widget, node: LayoutNode): void => {
  attachRnLayout(widget, {
    measure: (orientation: RnLayoutOrientation) => {
      const rect = node.getRect()
      return Math.round(
        (orientation === "horizontal" ? rect?.width : rect?.height) ?? 0,
      )
    },
    allocate: () => {
      let child = widget.getFirstChild()
      while (child) {
        const rect = getStoredRect(child)
        if (rect) {
          allocateChild(child, rect.x, rect.y, rect.width, rect.height)
        }
        child = child.getNextSibling()
      }
    },
  })
}

const wireCommit = (
  node: LayoutNode,
  ref: { current: Gtk.Widget | null },
): void => {
  node.setCommit((rect: Rect) => {
    const widget = ref.current
    if (widget) {
      setStoredRect(widget, rect)
      queueResize(widget)
    }
  })
}

it("engine rects drive real allocations through RnGtkxLayout", async () => {
  const engine = new LayoutEngine({ width: 400, height: 300 })
  const rootRef = createRef<Gtk.Box | null>()
  const cardRef = createRef<Gtk.Box | null>()
  const labelRef = createRef<Gtk.Label | null>()

  const card = engine.createNode()
  const label = engine.createNode()
  engine.root.insertChild(card, 0)
  card.insertChild(label, 0)

  engine.root.setStyle({ padding: 20 })
  card.setStyle({ flexDirection: "row", padding: 10, height: 100 })

  const probe = createTextProbe()
  probe.setText("layout engine text")
  label.setMeasureFn((width, widthMode) => {
    const natural = measureWidget(probe, "horizontal").natural
    const used = widthMode === "undefined" ? natural : Math.min(natural, width)
    return {
      width: used,
      height: measureWidget(probe, "vertical", used).natural,
    }
  })

  await render(
    <GtkBox ref={rootRef}>
      <GtkBox ref={cardRef}>
        <GtkLabel
          ref={labelRef}
          label="layout engine text"
        />
      </GtkBox>
    </GtkBox>,
  )

  // Wire the manager + commit path exactly like the components do.
  wireContainer(rootRef.current!, engine.root)
  wireContainer(cardRef.current!, card)
  wireCommit(card, cardRef)
  wireCommit(label, labelRef)

  engine.flushSync()

  const cardRect = card.getRect()
  expect(cardRect).not.toBeNull()
  expect(cardRect!.x).toBe(20)
  expect(cardRect!.y).toBe(20)
  expect(cardRect!.width).toBe(360)
  expect(cardRect!.height).toBe(100)

  const labelRect = label.getRect()
  expect(labelRect).not.toBeNull()
  expect(labelRect!.x).toBe(10)
  expect(labelRect!.y).toBe(10)
  expect(labelRect!.width).toBeGreaterThan(0)

  // Real GTK allocation must match the engine's rect. GTK applies size
  // requests during its layout phase, so poll instead of racing the frame.
  await waitFor(() => {
    expect(cardRef.current!.getAllocatedWidth()).toBe(360)
    expect(cardRef.current!.getAllocatedHeight()).toBe(100)
  })

  // Viewport change (window resize path) reflows and recommits.
  engine.setViewport({ width: 600, height: 300 })
  engine.flushSync()
  expect(card.getRect()!.width).toBe(560)
  await waitFor(() => {
    expect(cardRef.current!.getAllocatedWidth()).toBe(560)
  })

  engine.dispose()
})
