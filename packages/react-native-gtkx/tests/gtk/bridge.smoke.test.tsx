import { render, screen } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import {
  createTextProbe,
  GtkBox,
  GtkLabel,
  measureWidget,
  toNumber,
  type Gtk,
} from "../../src/gtkx/bridge/index"

it("renders a GtkBox container with a label child", async () => {
  const boxRef = createRef<Gtk.Box | null>()
  const labelRef = createRef<Gtk.Label | null>()

  await render(
    <GtkBox ref={boxRef}>
      <GtkLabel
        ref={labelRef}
        label="bridge smoke"
      />
    </GtkBox>,
  )

  const label = screen.getByText("bridge smoke")
  expect(label).toBeTruthy()
  expect(boxRef.current).not.toBeNull()
  expect(labelRef.current!.getParent()).toBe(boxRef.current)
})

it("measures text through an offscreen probe (Yoga measure contract)", () => {
  const probe = createTextProbe()
  probe.setText("a somewhat longer text that should wrap at narrow widths")

  const unconstrained = measureWidget(probe, "horizontal")
  expect(unconstrained.natural).toBeGreaterThan(0)

  const narrow = measureWidget(probe, "vertical", 120)
  const wide = measureWidget(probe, "vertical", unconstrained.natural)
  expect(narrow.natural).toBeGreaterThan(wide.natural)
})

it("normalizes BigInt FFI values", () => {
  expect(toNumber(42n)).toBe(42)
  expect(toNumber(7)).toBe(7)
})
