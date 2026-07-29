import type { SubscriptionHandle } from "../contracts.js"
import type { AppStateHost } from "./host.js"

// Desktop windows are either focused or not: the RN "inactive" transitional
// state has no GTK equivalent, so the surface is the active/background pair.
export type AppStateStatus = "active" | "background"

export type AppStateEvent = "change" | "focus" | "blur"

export type AppStateHandler = (state: AppStateStatus) => void

const EVENT_TYPES: readonly AppStateEvent[] = ["change", "focus", "blur"]

export const createAppState = (host: AppStateHost) => {
  type Entry = { type: AppStateEvent; handler: AppStateHandler }

  const entries = new Set<Entry>()
  let hostSubscription: SubscriptionHandle | null = null
  let tracked: AppStateStatus | null = null

  const compute = (): AppStateStatus =>
    host.isActive() ? "active" : "background"

  const onHostChange = (): void => {
    const next = compute()
    if (next === tracked) {
      return
    }
    tracked = next
    for (const entry of [...entries]) {
      if (
        entry.type === "change" ||
        (entry.type === "focus" && next === "active") ||
        (entry.type === "blur" && next === "background")
      ) {
        entry.handler(next)
      }
    }
  }

  const addEventListener = (
    type: AppStateEvent,
    handler: AppStateHandler,
  ): SubscriptionHandle => {
    if (!EVENT_TYPES.includes(type)) {
      throw new Error(
        `AppState.addEventListener: unsupported event type "${String(type)}"`,
      )
    }
    const entry: Entry = { type, handler }
    entries.add(entry)
    if (entries.size === 1) {
      tracked = compute()
      hostSubscription = host.onActiveChange(onHostChange)
    }
    return {
      remove: () => {
        if (!entries.delete(entry)) {
          return
        }
        if (entries.size === 0) {
          hostSubscription?.remove()
          hostSubscription = null
          tracked = null
        }
      },
    }
  }

  return {
    isAvailable: true as const,
    // Event-driven while at least one listener is attached, computed live
    // from the host otherwise.
    get currentState(): AppStateStatus {
      return tracked ?? compute()
    },
    addEventListener,
  }
}

export type AppStateModule = ReturnType<typeof createAppState>
