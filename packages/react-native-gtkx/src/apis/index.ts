// Production wiring: singleton API modules bound to the gtkx host, exported
// under their react-native names. Unit tests use the create* factories with a
// mock host instead of importing this file (it pulls in the gtkx bridge).

import { createAlert } from "./alert.js"
import { createAppState } from "./app-state.js"
import { createAppearance } from "./appearance.js"
import { createDimensions } from "./dimensions.js"
import { createUseColorScheme, createUseWindowDimensions } from "./hooks.js"
import { gtkxHost } from "./host.gtkx.js"
import { createLinking } from "./linking.js"
import { createPlatform } from "./platform.js"

export const Platform = createPlatform(gtkxHost)
export const Dimensions = createDimensions(gtkxHost)
export const Appearance = createAppearance(gtkxHost)
export const AppState = createAppState(gtkxHost)
export const Alert = createAlert(gtkxHost)
export const Linking = createLinking(gtkxHost)

export const useWindowDimensions = createUseWindowDimensions(Dimensions)
export const useColorScheme = createUseColorScheme(Appearance)

export type { AlertButton, AlertOptions } from "./alert.js"
export type { AppStateEvent, AppStateStatus } from "./app-state.js"
export type { AppearancePreferences } from "./appearance.js"
export type { DimensionKey, DimensionsPayload } from "./dimensions.js"
export type { AlertButtonStyle, ColorSchemeName, ScaledSize } from "./host.js"
export type { PlatformSelectSpec } from "./platform.js"
