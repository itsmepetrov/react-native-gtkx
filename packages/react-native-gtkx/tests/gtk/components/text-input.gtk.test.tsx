// Intrinsic-size leaves: GtkEntry must measure through the theme and the
// engine must reserve that height (regression for the flex-collapse hunt).
// Plus the multiline branch: GtkTextView with RN semantics.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef } from "react"
import { expect, it, vi } from "vitest"
import {
  GtkEntry,
  measureWidget,
  type Gtk,
} from "../../../src/gtkx/bridge/index"
import { Root, TextInput } from "../../../src/index"

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
  // render()'s own layout settling (@gtkx/testing's flushLayout) runs after
  // its internal act() wrap closes, so the whole call needs act() too.
  await act(async () => {
    await render(
      <Root
        width={400}
        height={300}
      >
        <TextInput onLayout={onLayout} />
      </Root>,
    )
  })
  await waitFor(() => expect(onLayout).toHaveBeenCalled())
  const layout = onLayout.mock.calls.at(-1)![0].nativeEvent.layout
  expect(layout.height).toBeGreaterThan(0)
})

it("multiline renders a TextView sized by the style", async () => {
  const onLayout = vi.fn()
  await render(
    <Root
      width={400}
      height={300}
    >
      <TextInput
        multiline
        style={{ height: 120, width: 300 }}
        onLayout={onLayout}
        testID="ml-box"
      />
    </Root>,
  )
  await waitFor(() => expect(onLayout).toHaveBeenCalled())
  const layout = onLayout.mock.calls.at(-1)![0].nativeEvent.layout
  expect(layout.height).toBe(120)
  expect(layout.width).toBe(300)
})

it("multiline placeholder shows while empty and hides under a value", async () => {
  const ui = (value: string) => (
    <Root
      width={400}
      height={300}
    >
      <TextInput
        multiline
        value={value}
        placeholder="Write something…"
        style={{ height: 100 }}
      />
    </Root>
  )
  const { rerender } = await render(ui(""))
  await waitFor(() => {
    expect(screen.getByText("Write something…")).toBeTruthy()
  })
  // A controlled value reaches the buffer; the placeholder label unmounts.
  await rerender(ui("hello"))
  await waitFor(() => {
    expect(screen.queryByText("Write something…")).toBeNull()
  })
  // Back to empty: the placeholder returns (buffer cleared).
  await rerender(ui(""))
  await waitFor(() => {
    expect(screen.getByText("Write something…")).toBeTruthy()
  })
})

it("multiline fires onChangeText from buffer edits, without echo", async () => {
  const onChangeText = vi.fn()
  await act(async () => {
    await render(
      <Root
        width={400}
        height={300}
      >
        <TextInput
          multiline
          defaultValue="start"
          onChangeText={onChangeText}
          style={{ height: 100 }}
          testID="ml-view"
        />
      </Root>,
    )
  })
  // The initial defaultValue set must NOT fire onChangeText (no echo).
  expect(onChangeText).not.toHaveBeenCalled()
  const view = screen.getByName("ml-view") as unknown as Gtk.TextView
  // setText fires the buffer's "changed" signal synchronously, which calls
  // onChangeText — a native poke outside any React event handler.
  await act(async () => {
    view.getBuffer().setText("typed by hand", -1)
  })
  await waitFor(() => {
    expect(onChangeText).toHaveBeenCalledWith("typed by hand")
  })
})
