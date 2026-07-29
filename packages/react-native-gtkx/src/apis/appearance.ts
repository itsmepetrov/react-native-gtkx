import type { SubscriptionHandle } from "../contracts.js"
import { createSharedEmitter } from "./emitter.js"
import type { AppearanceHost, ColorSchemeName } from "./host.js"

export type AppearancePreferences = { colorScheme: ColorSchemeName }

export type AppearanceChangeHandler = (
  preferences: AppearancePreferences,
) => void

export const createAppearance = (host: AppearanceHost) => {
  let lastEmitted: ColorSchemeName | null = null

  const emitter = createSharedEmitter<[AppearancePreferences]>(() => {
    lastEmitted = host.getColorScheme()
    const subscription = host.onColorSchemeChange(() => {
      const colorScheme = host.getColorScheme()
      if (colorScheme === lastEmitted) {
        return
      }
      lastEmitted = colorScheme
      emitter.emit({ colorScheme })
    })
    return () => {
      subscription.remove()
      lastEmitted = null
    }
  })

  return {
    // Always resolved to "light" | "dark" (never null): Adwaita reports an
    // effective scheme even while following the system preference.
    getColorScheme: (): ColorSchemeName => host.getColorScheme(),
    // Implemented for real (not a no-op): forces the scheme app-wide through
    // AdwStyleManager (FORCE_LIGHT / FORCE_DARK); null or undefined returns
    // to following the system preference. Listeners fire via the resulting
    // host change notification.
    setColorScheme: (scheme: ColorSchemeName | null | undefined): void => {
      host.setColorScheme(scheme ?? null)
    },
    addChangeListener: (handler: AppearanceChangeHandler): SubscriptionHandle =>
      emitter.add(handler),
  }
}

export type AppearanceModule = ReturnType<typeof createAppearance>
