// Upstream regression guard for gtkx#467, fixed in gtkx 1.2.1.
// react-reconciler@0.33.0 refreshes useEffectEvent in
// commitBeforeMutationEffects only for `case 0` (FunctionComponent) —
// `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fell through
// unrefreshed, so a useEffectEvent inside a memo/forwardRef component was
// pinned to its mount closure forever (confirmed upstream by
// @eugeniodepalo). It had nothing to do with useSignal specifically, and
// nothing to do with an async parent-driven update as such — an earlier
// version of this guard used a plain function Child and a
// `waitFor(() => expect(true).toBe(true))` that resolved on its first
// check, before the 20ms timer had fired; instrumented, the child had
// rendered exactly once and the handler correctly saw the mount value, so
// that guard never actually exercised the defect. Wrapping the Child in
// `memo` reproduces the shape every time, regardless of whether the update
// that feeds it is sync or async.
//
// gtkx 1.2.1's own changelog: "Fixed useSignal running the handler captured
// on the first render for every emission inside a component wrapped in memo
// or forwardRef... The hook built on React 19.2's useEffectEvent, which does
// not pick up the updated function through those wrappers; the handler is
// now held in a ref written from useInsertionEffect" — confirmed by reading
// the installed 1.2.2 source directly: @gtkx/react's useSignal
// (hooks/use-signal.ts) no longer imports useEffectEvent at all, and instead
// calls the package's own useLatestRef (hooks/use-latest-ref.ts), which is
// exactly the useRef-plus-useInsertionEffect pattern our bridge wrapper used
// to restore by hand. react-reconciler stayed at 0.33.0 and react stayed on
// ^19.2 (installed 1.2.2 tree, confirmed) — gtkx fixed this on its own
// rather than waiting for a stable React 19.3, so the workaround this test
// used to justify (formerly src/gtkx/bridge/use-signal.ts, retired — see
// "Fixed in 1.2.1" in docs/gtkx-1.2-notes.md) is gone: the bridge now
// re-exports gtkx's useSignal directly. This test still calls gtkx's hook
// DIRECTLY on a memoized component — it is the regression guard that keeps
// this passing.
import * as Gtk from "@gtkx/gi/gtk"
import { GtkBox, GtkLabel } from "@gtkx/jsx/gtk"
import { useSignal } from "@gtkx/react"
import { render, screen, waitFor } from "@gtkx/testing"
import { memo, useEffect, useState } from "react"
import { expect, it } from "vitest"

it("gtkx#467: useSignal picks up the latest render inside a memo component", async () => {
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
  // emitting — a no-op waitFor here is exactly what let an earlier version
  // of this guard pass for the wrong reason.
  await screen.findByText("count 40")
  source.emit("value-changed")
  await waitFor(() => expect(seen.length).toBeGreaterThan(0))
  expect(seen.at(-1)).toBe(40)
})
