import { render, screen } from "@gtkx/testing"
import { createRef, useEffect, useState } from "react"
import { expect, it } from "vitest"
import {
  createTextProbe,
  Gtk,
  GtkBox,
  GtkLabel,
  measureWidget,
  toNumber,
  useSignal,
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

// The whole platform assumes a signal emission runs the handler from the
// LATEST render (every component holds props in its handlers). This states the
// contract on the bridge's own hook; the case that actually catches the rc.2
// freeze is components/list-late-data (it needs a deep tree to reproduce).
it("runs signal handlers from the latest render", async () => {
  const seen: number[] = []
  const adjustment = new Gtk.Adjustment()
  adjustment.setUpper(1000)
  adjustment.setPageSize(100)

  const Subscriber = ({ value }: { value: number }) => {
    useSignal(adjustment, "value-changed", () => {
      seen.push(value)
    })
    return <GtkLabel label={`value ${value}`} />
  }

  const Owner = () => {
    const [value, setValue] = useState(1)
    useEffect(() => {
      setValue(2)
    }, [])
    return (
      <GtkBox>
        <Subscriber value={value} />
      </GtkBox>
    )
  }

  await render(<Owner />)
  await screen.findByText("value 2")
  adjustment.setValue(42)

  expect(seen).toEqual([2])
})
