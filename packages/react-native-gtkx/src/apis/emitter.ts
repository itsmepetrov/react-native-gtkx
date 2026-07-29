import type { SubscriptionHandle } from "../contracts.js"

type Teardown = () => void

// Shared listener registry behind every addEventListener/addChangeListener.
// Leak policy (documented across the API modules): the upstream host
// subscription is attached lazily when the first listener arrives and torn
// down when the last listener is removed, so idle modules hold no GTK signal
// connections. remove() is idempotent and a removed handler is never invoked
// again (emit iterates over a snapshot).
export const createSharedEmitter = <Args extends unknown[]>(
  onActive?: () => Teardown,
) => {
  const listeners = new Set<{ handler: (...args: Args) => void }>()
  let teardown: Teardown | null = null

  const add = (handler: (...args: Args) => void): SubscriptionHandle => {
    const entry = { handler }
    listeners.add(entry)
    if (listeners.size === 1 && onActive) {
      teardown = onActive()
    }
    return {
      remove: () => {
        if (!listeners.delete(entry)) {
          return
        }
        if (listeners.size === 0 && teardown) {
          teardown()
          teardown = null
        }
      },
    }
  }

  const emit = (...args: Args): void => {
    for (const entry of [...listeners]) {
      entry.handler(...args)
    }
  }

  return { add, emit, hasListeners: () => listeners.size > 0 }
}
