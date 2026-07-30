// RC2-WORKAROUND(use-signal-stale-handler): see docs/gtkx-rc2-notes.md
// @gtkx/react's useSignal documents that "each emission runs the handler from
// the latest render", and rc.1 delivered that by pinning the handler in a ref
// of its own. rc.2 routes it through React's useEffectEvent instead, and under
// the gtkx reconciler that event ref stops refreshing for components deep in
// the tree: a ScrollView measured at its 8th render still ran the closure
// captured at mount (a plain ref in the same component reported 8, the
// useEffectEvent one reported 1). The consequence is not subtle — the
// mount-time scroll handler windows a VirtualizedList against the data it saw
// at mount, so a list whose rows arrive from a fetch renders EMPTY as soon as
// it is scrolled.
//
// Restore the documented contract at the bridge: keep the latest handler in a
// ref of our own and hand gtkx a stable wrapper (stable so the connection is
// never re-established, which is what its useEffectEvent was for). The ref is
// refreshed in an INSERTION effect — the earliest commit phase, ahead of every
// layout effect, so a signal emitted from one (the list's own scroll
// corrections) already sees the handler from the render being committed.
import { useSignal as useGtkxSignal } from "@gtkx/react"
import { useCallback, useInsertionEffect, useRef } from "react"

type AnyHandler = (...args: unknown[]) => unknown

export const useSignal: typeof useGtkxSignal = (
  object,
  signal,
  handler,
  options,
) => {
  // The handler type is generic in the signal name; the wrapper only forwards
  // arguments, so it crosses that boundary as an untyped callable.
  const latest = useRef<AnyHandler>(() => undefined)
  useInsertionEffect(() => {
    latest.current = handler as unknown as AnyHandler
  })
  const stable = useCallback<AnyHandler>(
    (...args) => latest.current(...args),
    [],
  )
  useGtkxSignal(object, signal, stable as unknown as typeof handler, options)
}
