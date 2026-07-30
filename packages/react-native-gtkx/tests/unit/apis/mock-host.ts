// In-memory host doubles for the API module unit tests. No gtkx imports here:
// these tests must run on machines without the generated GI bindings.

import type {
  AppearanceHost,
  AppStateHost,
  ColorSchemeName,
  DimensionsHost,
  ScaledSize,
} from "../../../src/apis/host"
import type { SubscriptionHandle } from "../../../src/contracts"

export const createManualNotifier = () => {
  const listeners = new Set<() => void>()
  return {
    subscribe: (notify: () => void): SubscriptionHandle => {
      listeners.add(notify)
      return { remove: () => listeners.delete(notify) }
    },
    fire: (): void => {
      for (const listener of [...listeners]) {
        listener()
      }
    },
    count: (): number => listeners.size,
  }
}

export type ManualNotifier = ReturnType<typeof createManualNotifier>

export const size = (width: number, height: number): ScaledSize => ({
  width,
  height,
  scale: 1,
  fontScale: 1,
})

export const createDimensionsMockHost = (
  initialWindow: ScaledSize = size(800, 600),
  initialScreen: ScaledSize = size(1920, 1080),
) => {
  const notifier = createManualNotifier()
  const state = { window: { ...initialWindow }, screen: { ...initialScreen } }
  const host: DimensionsHost = {
    // Fresh objects on every read: the module must handle unstable identity.
    getWindowMetrics: () => ({ ...state.window }),
    getScreenMetrics: () => ({ ...state.screen }),
    onMetricsChange: notifier.subscribe,
  }
  return {
    host,
    notifier,
    resize: (patch: Partial<ScaledSize>): void => {
      Object.assign(state.window, patch)
      notifier.fire()
    },
    setScreen: (patch: Partial<ScaledSize>): void => {
      Object.assign(state.screen, patch)
      notifier.fire()
    },
  }
}

export const createAppearanceMockHost = (
  initial: ColorSchemeName = "light",
) => {
  const notifier = createManualNotifier()
  const state = { scheme: initial, forced: null as ColorSchemeName | null }
  const setCalls: (ColorSchemeName | null)[] = []
  const host: AppearanceHost = {
    getColorScheme: () => state.scheme,
    setColorScheme: (scheme) => {
      setCalls.push(scheme)
      state.forced = scheme
      if (scheme !== null && scheme !== state.scheme) {
        state.scheme = scheme
        notifier.fire()
      }
    },
    onColorSchemeChange: notifier.subscribe,
  }
  return {
    host,
    notifier,
    setCalls,
    setSystemScheme: (scheme: ColorSchemeName): void => {
      state.scheme = scheme
      notifier.fire()
    },
  }
}

export const createAppStateMockHost = (initialActive = true) => {
  const notifier = createManualNotifier()
  const state = { active: initialActive }
  const host: AppStateHost = {
    isActive: () => state.active,
    onActiveChange: notifier.subscribe,
  }
  return {
    host,
    notifier,
    setActive: (active: boolean): void => {
      state.active = active
      notifier.fire()
    },
  }
}
