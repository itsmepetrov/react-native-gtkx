// RC3-WORKAROUND(use-signal-stale-handler): see docs/gtkx-rc3-notes.md
// @gtkx/react's useSignal documents that "each emission runs the handler from
// the latest render", and rc.1 delivered that by pinning the handler in a ref
// of its own. rc.3 routes it through React's useEffectEvent instead, and
// react-reconciler@0.33.0 only refreshes useEffectEvent in
// commitBeforeMutationEffects for `case 0` (FunctionComponent) — `case 11`
// (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed.
// Any useEffectEvent inside a memo or forwardRef component is pinned to its
// mount closure permanently; this has nothing to do with useSignal
// specifically (confirmed upstream: gtkx-org/gtkx#467) — plain
// useEffectEvent called from an Effect fails identically. It reproduced for
// us because our ScrollView is a forwardRef (components/scroll-view.tsx) with
// the useSignal calls inside it; tree depth was a coincidence, not the
// trigger. The consequence is not subtle — the mount-time scroll handler
// windows a VirtualizedList against the data it saw at mount, so a list
// whose rows arrive from a fetch renders EMPTY as soon as it is scrolled.
//
// Restore the documented contract at the bridge: keep the latest handler in a
// ref of our own and hand gtkx a stable wrapper (stable so the connection is
// never re-established, which is what its useEffectEvent was for). The ref is
// refreshed in an INSERTION effect — the earliest commit phase, ahead of every
// layout effect, so a signal emitted from one (the list's own scroll
// corrections) already sees the handler from the render being committed.
// React fixed the refresh on the 19.3 line (moved into
// commitMutationEffectsOnFiber, covering `case 0/11/14/15` ahead of child
// traversal), but there is no stable 0.34.x gtkx release yet and the React
// canaries pin an exact prerelease peer, so this wrapper stays until a
// stable React 19.3 ships — not "when useSignal is fixed" (see gtkx#467).
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
