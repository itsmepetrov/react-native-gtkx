import { render, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import {
  createTextProbe,
  GtkFixed,
  GtkLabel,
  measureWidget,
  moveChild,
  type Gtk,
} from "../../src/gtkx-bridge/index.js"
import { LayoutEngine } from "../../src/layout/index.js"
import type { Rect } from "../../src/contracts.js"

it("engine rects drive real GtkFixed allocations", async () => {
  const engine = new LayoutEngine({ width: 400, height: 300 })
  const rootRef = createRef<Gtk.Fixed | null>()
  const cardRef = createRef<Gtk.Fixed | null>()
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
    <GtkFixed
      ref={rootRef}
      widthRequest={400}
      heightRequest={300}
    >
      <GtkFixed ref={cardRef}>
        <GtkLabel
          ref={labelRef}
          label="layout engine text"
        />
      </GtkFixed>
    </GtkFixed>,
  )

  // Wire the commit path exactly like components (006) will do it.
  card.setCommit((rect: Rect) => {
    const widget = cardRef.current
    if (widget && rootRef.current) {
      widget.setSizeRequest(rect.width, rect.height)
      moveChild(rootRef.current, widget, rect.x, rect.y)
    }
  })
  label.setCommit((rect: Rect) => {
    const widget = labelRef.current
    if (widget && cardRef.current) {
      widget.setSizeRequest(rect.width, rect.height)
      moveChild(cardRef.current, widget, rect.x, rect.y)
    }
  })

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
