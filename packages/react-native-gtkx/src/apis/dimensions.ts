import type { SubscriptionHandle } from "../contracts.js"
import { createSharedEmitter } from "./emitter.js"
import type { DimensionsHost, ScaledSize } from "./host.js"

export type DimensionKey = "window" | "screen"

export type DimensionsPayload = { window: ScaledSize; screen: ScaledSize }

export type DimensionsChangeHandler = (payload: DimensionsPayload) => void

const sameSize = (a: ScaledSize, b: ScaledSize): boolean =>
  a.width === b.width &&
  a.height === b.height &&
  a.scale === b.scale &&
  a.fontScale === b.fontScale

export const createDimensions = (host: DimensionsHost) => {
  const cache: Record<DimensionKey, ScaledSize | null> = {
    window: null,
    screen: null,
  }

  // Reads through to the host while keeping object identity stable when the
  // values are unchanged (required by the useSyncExternalStore snapshot
  // contract in useWindowDimensions).
  const refresh = (key: DimensionKey): ScaledSize => {
    const next =
      key === "window" ? host.getWindowMetrics() : host.getScreenMetrics()
    const previous = cache[key]
    if (previous && sameSize(previous, next)) {
      return previous
    }
    cache[key] = next
    return next
  }

  const emitter = createSharedEmitter<[DimensionsPayload]>(() => {
    // Prime the cache when going live so the first host event can diff.
    refresh("window")
    refresh("screen")
    const subscription = host.onMetricsChange(() => {
      const previousWindow = cache.window
      const previousScreen = cache.screen
      const window = refresh("window")
      const screen = refresh("screen")
      if (window !== previousWindow || screen !== previousScreen) {
        emitter.emit({ window, screen })
      }
    })
    return () => subscription.remove()
  })

  const get = (key: DimensionKey): ScaledSize => {
    if (key !== "window" && key !== "screen") {
      throw new Error(`Dimensions.get: unknown dimension "${String(key)}"`)
    }
    // While subscribed the cache is kept fresh by host events; when idle we
    // read through to the host on every call.
    if (emitter.hasListeners()) {
      return cache[key] ?? refresh(key)
    }
    return refresh(key)
  }

  // react-native parity escape hatch (RN uses it for bootstrap/tests): merges
  // overrides into the cached values and notifies listeners. The next host
  // read or resize event replaces the override with real metrics.
  const set = (
    dimensions: Partial<Record<DimensionKey, Partial<ScaledSize>>>,
  ): void => {
    let changed = false
    for (const key of ["window", "screen"] as const) {
      const patch = dimensions[key]
      if (!patch) {
        continue
      }
      const base = cache[key] ?? refresh(key)
      const next = { ...base, ...patch }
      if (!sameSize(base, next)) {
        cache[key] = next
        changed = true
      }
    }
    if (changed) {
      const window = cache.window ?? refresh("window")
      const screen = cache.screen ?? refresh("screen")
      emitter.emit({ window, screen })
    }
  }

  const addEventListener = (
    type: "change",
    handler: DimensionsChangeHandler,
  ): SubscriptionHandle => {
    if (type !== "change") {
      throw new Error(
        `Dimensions.addEventListener: unsupported event type "${String(type)}"`,
      )
    }
    return emitter.add(handler)
  }

  return { get, set, addEventListener }
}

export type DimensionsModule = ReturnType<typeof createDimensions>
