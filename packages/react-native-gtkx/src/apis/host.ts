// Narrow host interfaces backing the react-native compatible API modules.
// The pure modules in this directory receive these capabilities via injection:
// production wiring passes the gtkx adapter (host.gtkx.ts), unit tests pass
// in-memory mocks, so all module logic runs without GTK.

import type { SubscriptionHandle } from "../contracts"

export type ColorSchemeName = "light" | "dark"

// Matches react-native's ScaledSize (Dimensions.get / useWindowDimensions).
export type ScaledSize = {
  width: number
  height: number
  scale: number
  fontScale: number
}

export type AlertButtonStyle = "default" | "cancel" | "destructive"

export type HostAlertButton = {
  id: string
  label: string
  style: AlertButtonStyle
  isPreferred: boolean
}

export type HostAlertRequest = {
  title: string
  message?: string
  buttons: HostAlertButton[]
  cancelable: boolean
}

export interface PlatformHost {
  // Runtime GTK version, e.g. "4.22.4".
  gtkVersion(): string
}

export interface DimensionsHost {
  getWindowMetrics(): ScaledSize
  getScreenMetrics(): ScaledSize
  // Fires whenever the window geometry (or the tracked window itself) may
  // have changed; the module re-reads metrics and dedupes.
  onMetricsChange(notify: () => void): SubscriptionHandle
}

export interface AppearanceHost {
  getColorScheme(): ColorSchemeName
  // null resets to the system preference.
  setColorScheme(scheme: ColorSchemeName | null): void
  onColorSchemeChange(notify: () => void): SubscriptionHandle
}

export interface AppStateHost {
  isActive(): boolean
  onActiveChange(notify: () => void): SubscriptionHandle
}

export interface AlertHost {
  // Resolves with the id of the pressed button, or null when the dialog was
  // dismissed without pressing any of the requested buttons.
  showAlert(request: HostAlertRequest): Promise<string | null>
}

export interface LinkingHost {
  launchUri(uri: string): Promise<void>
}

export type Host = PlatformHost &
  DimensionsHost &
  AppearanceHost &
  AppStateHost &
  AlertHost &
  LinkingHost
