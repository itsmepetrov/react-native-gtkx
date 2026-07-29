import { useSyncExternalStore } from "react"
import type { AppearanceModule } from "./appearance.js"
import type { DimensionsModule } from "./dimensions.js"
import type { ColorSchemeName, ScaledSize } from "./host.js"

export type ExternalStore<T> = {
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => T
}

// The store pairs are exported separately so unit tests can exercise the
// useSyncExternalStore contract (subscribe/getSnapshot/identity) directly,
// without rendering React components.

export const createWindowDimensionsStore = (
  dimensions: DimensionsModule,
): ExternalStore<ScaledSize> => ({
  subscribe: (onStoreChange) => {
    const subscription = dimensions.addEventListener("change", onStoreChange)
    return () => subscription.remove()
  },
  getSnapshot: () => dimensions.get("window"),
})

export const createColorSchemeStore = (
  appearance: AppearanceModule,
): ExternalStore<ColorSchemeName> => ({
  subscribe: (onStoreChange) => {
    const subscription = appearance.addChangeListener(onStoreChange)
    return () => subscription.remove()
  },
  getSnapshot: () => appearance.getColorScheme(),
})

export const createUseWindowDimensions = (dimensions: DimensionsModule) => {
  const store = createWindowDimensionsStore(dimensions)
  const useWindowDimensions = (): ScaledSize =>
    useSyncExternalStore(store.subscribe, store.getSnapshot)
  return useWindowDimensions
}

export const createUseColorScheme = (appearance: AppearanceModule) => {
  const store = createColorSchemeStore(appearance)
  const useColorScheme = (): ColorSchemeName =>
    useSyncExternalStore(store.subscribe, store.getSnapshot)
  return useColorScheme
}
