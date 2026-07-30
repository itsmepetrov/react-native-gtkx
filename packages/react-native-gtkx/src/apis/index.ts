// Production wiring: singleton API modules bound to the gtkx host, exported
// under their react-native names. Unit tests use the create* factories with a
// mock host instead of importing this file (it pulls in the gtkx bridge).

import { createAlert } from "./alert"
import { createAppState } from "./app-state"
import { createAppearance } from "./appearance"
import { createDimensions } from "./dimensions"
import { createUseColorScheme, createUseWindowDimensions } from "./hooks"
import { gtkxHost } from "./host.gtkx"
import { createLinking } from "./linking"
import { createPlatform } from "./platform"

export const Platform = createPlatform(gtkxHost)
export const Dimensions = createDimensions(gtkxHost)
export const Appearance = createAppearance(gtkxHost)
export const AppState = createAppState(gtkxHost)
export const Alert = createAlert(gtkxHost)
export const Linking = createLinking(gtkxHost)
export { DevSettings } from "./dev-settings"

export const useWindowDimensions = createUseWindowDimensions(Dimensions)
export const useColorScheme = createUseColorScheme(Appearance)

export type { AlertButton, AlertOptions } from "./alert"
export type { AppStateEvent, AppStateStatus } from "./app-state"
export type { AppearancePreferences } from "./appearance"
export type { DimensionKey, DimensionsPayload } from "./dimensions"
export type { AlertButtonStyle, ColorSchemeName, ScaledSize } from "./host"
export type { PlatformSelectSpec } from "./platform"
