import { render, screen } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it } from "vitest"
import {
  createTextProbe,
  GtkFixed,
  GtkLabel,
  measureWidget,
  moveChild,
  toNumber,
  type Gtk,
} from "../src/gtkx-bridge/index.js"

it("renders a GtkFixed with a label and positions it imperatively", async () => {
  const fixedRef = createRef<Gtk.Fixed | null>()
  const labelRef = createRef<Gtk.Label | null>()

  await render(
    <GtkFixed
      ref={fixedRef}
      widthRequest={200}
      heightRequest={120}
    >
      <GtkLabel
        ref={labelRef}
        label="bridge smoke"
      />
    </GtkFixed>,
  )

  const label = screen.getByText("bridge smoke")
  expect(label).toBeTruthy()

  const fixed = fixedRef.current
  expect(fixed).not.toBeNull()
  moveChild(fixed!, labelRef.current!, 40, 25)
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
