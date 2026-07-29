// Intrinsic-size leaves: GtkEntry must measure through the theme and the
// engine must reserve that height (regression for the flex-collapse hunt).
import { render, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it, vi } from "vitest"
import { GtkEntry, measureWidget, type Gtk } from "../../src/gtkx-bridge/index"
import { Root, TextInput } from "../../src/index"

it("reports GtkEntry natural sizes", async () => {
  const ref = createRef<Gtk.Entry | null>()
  await render(<GtkEntry ref={ref} />)
  const entry = ref.current!

  const h = measureWidget(entry, "horizontal")
  const vUnconstrained = measureWidget(entry, "vertical")
  expect(h.natural).toBeGreaterThan(0)
  expect(vUnconstrained.natural).toBeGreaterThan(0)
})

it("TextInput gets a measured height in the engine", async () => {
  const onLayout = vi.fn()
  await render(
    <Root
      width={400}
      height={300}
    >
      <TextInput onLayout={onLayout} />
    </Root>,
  )
  await waitFor(() => expect(onLayout).toHaveBeenCalled())
  const layout = onLayout.mock.calls.at(-1)![0].nativeEvent.layout
  expect(layout.height).toBeGreaterThan(0)
})
