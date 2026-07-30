// Upstream guard for gtkx#467: @gtkx/react's useSignal keeps the handler from
// the first render when the state it closes over lives in a parent AND is
// updated asynchronously after mount — the shape of rows arriving from a
// fetch. Our bridge wraps useSignal to restore the documented contract
// (src/gtkx/bridge/use-signal.ts); this test calls gtkx's hook DIRECTLY, so it
// keeps failing until upstream fixes it. When it starts passing, the wrapper
// and its RC2-WORKAROUND row can go.
//
// Cases that do NOT reproduce (checked, so the trigger is precise): state
// owned by the signal component itself; the same parent/prop shape with
// synchronous updates; the object produced by a getter each render; emission
// from an insertion effect; nesting depth alone.
import * as Gtk from "@gtkx/gi/gtk"
import { GtkBox, GtkLabel } from "@gtkx/jsx/gtk"
import { useSignal } from "@gtkx/react"
import { render, waitFor } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"

it.fails(
  "gtkx#467: useSignal freezes on async parent-driven state",
  async () => {
    const seen: number[] = []
    const source = new Gtk.Adjustment()

    const Child = ({ count }: { count: number }) => {
      useSignal(source, "value-changed", () => seen.push(count))
      return <GtkLabel label={`count ${count}`} />
    }

    const Parent = () => {
      const [count, setCount] = useState(0)
      useEffect(() => {
        const id = setTimeout(() => setCount(40), 20)
        return () => clearTimeout(id)
      }, [])
      return (
        <GtkBox>
          <Child count={count} />
        </GtkBox>
      )
    }

    await render(<Parent />)
    await waitFor(() => expect(true).toBe(true), { timeout: 200 })
    source.emit("value-changed")
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen.at(-1)).toBe(40)
  },
)
