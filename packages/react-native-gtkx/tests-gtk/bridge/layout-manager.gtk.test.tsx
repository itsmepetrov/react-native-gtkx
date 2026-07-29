import { render } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import {
  allocateChild,
  attachRnLayout,
  detachRnLayout,
  GtkBox,
  GtkLabel,
  measureWidget,
  queueResize,
  type Gtk,
} from "../../src/gtkx-bridge/index.js"

const LONG_WORD = "antidisestablishmentarianism-supercalifragilistic"

const flushFrame = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 120))

it("measure() reports the hook size, ignoring children minimums", async () => {
  const boxRef = createRef<Gtk.Box | null>()
  const labelRef = createRef<Gtk.Label | null>()
  await render(
    <GtkBox ref={boxRef}>
      <GtkLabel
        ref={labelRef}
        label={LONG_WORD}
      />
    </GtkBox>,
  )
  const box = boxRef.current!
  const label = labelRef.current!

  attachRnLayout(box, {
    measure: (orientation) => (orientation === "horizontal" ? 220 : 140),
    allocate: () => {
      allocateChild(label, 10, 20, 60, 30)
    },
  })
  queueResize(box)
  await flushFrame()

  const h = measureWidget(box, "horizontal")
  const v = measureWidget(box, "vertical")
  expect(measureWidget(label, "horizontal").minimum).toBeGreaterThan(220)
  expect([h.minimum, h.natural]).toEqual([220, 220])
  expect([v.minimum, v.natural]).toEqual([140, 140])
})

it("allocate() places children at exact rects, including past the boundary", async () => {
  const boxRef = createRef<Gtk.Box | null>()
  const insideRef = createRef<Gtk.Label | null>()
  const overflowRef = createRef<Gtk.Label | null>()
  await render(
    <GtkBox ref={boxRef}>
      <GtkLabel
        ref={insideRef}
        label="in"
      />
      <GtkLabel
        ref={overflowRef}
        label="out"
      />
    </GtkBox>,
  )
  const box = boxRef.current!
  const inside = insideRef.current!
  const overflow = overflowRef.current!

  attachRnLayout(box, {
    measure: (orientation) => (orientation === "horizontal" ? 200 : 100),
    allocate: () => {
      allocateChild(inside, 8, 12, 90, 24)
      // 40px past the container's right edge — must not affect measure.
      allocateChild(overflow, 180, 40, 60, 24)
    },
  })
  queueResize(box)
  await flushFrame()

  const a = inside.getAllocation()
  const o = overflow.getAllocation()
  expect([a.x, a.y, a.width, a.height]).toEqual([8, 12, 90, 24])
  expect([o.x, o.y, o.width, o.height]).toEqual([180, 40, 60, 24])
  const after = measureWidget(box, "horizontal")
  expect([after.minimum, after.natural]).toEqual([200, 200])
})

it("guards double attach and survives detach", async () => {
  const boxRef = createRef<Gtk.Box | null>()
  await render(<GtkBox ref={boxRef} />)
  const box = boxRef.current!

  const hooks = { measure: () => 50, allocate: () => {} }
  attachRnLayout(box, hooks)
  expect(() => attachRnLayout(box, hooks)).toThrow(/already has/)

  detachRnLayout(box)
  // A second detach is a no-op, and re-attach works after detach.
  detachRnLayout(box)
  attachRnLayout(box, hooks)
  queueResize(box)
  await flushFrame()
  expect(measureWidget(box, "horizontal").minimum).toBe(50)
})
