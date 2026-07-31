// Upstream guard for gtkx#467: react-reconciler@0.33.0 refreshes
// useEffectEvent in commitBeforeMutationEffects only for `case 0`
// (FunctionComponent) — `case 11` (ForwardRef) and `case 15`
// (SimpleMemoComponent) fall through unrefreshed, so a useEffectEvent inside
// a memo/forwardRef component is pinned to its mount closure forever
// (confirmed upstream by @eugeniodepalo). It has nothing to do with
// useSignal specifically, and nothing to do with an async parent-driven
// update as such — an earlier version of this guard used a plain function
// Child and a `waitFor(() => expect(true).toBe(true))` that resolved on its
// first check, before the 20ms timer had fired; instrumented, the child had
// rendered exactly once and the handler correctly saw the mount value, so
// that guard never actually exercised the defect. Wrapping the Child in
// `memo` reproduces it every time, regardless of whether the update that
// feeds it is sync or async.
//
// Our bridge wraps useSignal to restore the documented contract
// (src/gtkx/bridge/use-signal.ts); this test calls gtkx's hook DIRECTLY on a
// memoized component, so it keeps failing until upstream ships a stable
// React 19.3. When it starts passing, the wrapper and its
// RC2-WORKAROUND(use-signal-stale-handler) row can go.
import * as Gtk from "@gtkx/gi/gtk"
import { GtkBox, GtkLabel } from "@gtkx/jsx/gtk"
import { useSignal } from "@gtkx/react"
import { render, screen, waitFor } from "@gtkx/testing"
import { memo, useEffect, useState } from "react"
import { expect, it } from "vitest"

it.fails(
  "gtkx#467: useSignal freezes on the mount closure inside a memo component",
  async () => {
    const seen: number[] = []
    const source = new Gtk.Adjustment()

    const Child = memo(function Child({ count }: { count: number }) {
      useSignal(source, "value-changed", () => seen.push(count))
      return <GtkLabel label={`count ${count}`} />
    })

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
    // Wait for the update to actually land (Child re-rendered with 40) before
    // emitting — a no-op waitFor here is exactly what let the earlier guard
    // pass for the wrong reason.
    await screen.findByText("count 40")
    source.emit("value-changed")
    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen.at(-1)).toBe(40)
  },
)
