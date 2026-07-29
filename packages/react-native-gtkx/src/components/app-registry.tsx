import { useLayoutEffect, type ComponentType } from "react"
import {
  createRoot,
  Gtk,
  GtkApplication,
  GtkApplicationWindow,
  quit,
} from "../gtkx-bridge/index.js"
import { Root } from "./root.js"

type ComponentProvider = () => ComponentType<Record<string, unknown>>

const registry = new Map<string, ComponentProvider>()

export type RunApplicationParams = {
  initialProps?: Record<string, unknown>
  title?: string
  width?: number
  height?: number
}

// RN parity: system "reduce animations" hints never auto-stop RN animations
// (ActivityIndicator keeps spinning; honoring reduce-motion is an explicit
// opt-in via AccessibilityInfo). Our Animated runs on GLib timers and already
// ignores the hint, so GTK-internal animations (GtkSpinner, switch slides)
// must behave the same — otherwise e.g. GNOME under software rendering
// reports enable-animations=false through the settings portal and spinners
// freeze while Animated keeps moving.
let animationsForced = false
const forceEnableAnimations = (): void => {
  if (animationsForced) {
    return
  }
  const settings = Gtk.Settings.getDefault()
  if (!settings) {
    return
  }
  animationsForced = true
  // Application-set GtkSettings values outrank the desktop backend, so a
  // later portal update cannot flip this back.
  settings.gtkEnableAnimations = true
}

const WindowContent = ({
  App,
  initialProps,
  initialWidth,
  initialHeight,
}: {
  App: ComponentType<Record<string, unknown>>
  initialProps: Record<string, unknown>
  initialWidth: number
  initialHeight: number
}) => {
  // Settings need an initialized display, and writing them mid-render is
  // unsafe — apply after the window mounts.
  useLayoutEffect(() => {
    forceEnableAnimations()
  }, [])

  // The Root is the window's direct child: RnGtkxLayout reports a zero
  // minimum (the window shrinks freely — no ratchet) and adopts the actual
  // content-area allocation as the layout viewport. No scrollable wrapper
  // means a window can never scroll its own root — RN semantics, scrolling
  // stays opt-in via <ScrollView>.
  return (
    <Root
      width={initialWidth}
      height={initialHeight}
      followAllocation
    >
      <App {...initialProps} />
    </Root>
  )
}

export const AppRegistry = {
  registerComponent(appKey: string, provider: ComponentProvider): string {
    registry.set(appKey, provider)
    return appKey
  },

  getAppKeys(): string[] {
    return [...registry.keys()]
  },

  runApplication(appKey: string, params: RunApplicationParams = {}): void {
    const provider = registry.get(appKey)
    if (!provider) {
      throw new Error(
        `AppRegistry: no component registered for "${appKey}". ` +
          `Registered: ${[...registry.keys()].join(", ") || "(none)"}`,
      )
    }
    const App = provider()
    const width = params.width ?? 800
    const height = params.height ?? 600

    const AppWindow = () => (
      <GtkApplicationWindow
        title={params.title ?? appKey}
        defaultWidth={width}
        defaultHeight={height}
        onCloseRequest={quit}
      >
        <WindowContent
          App={App}
          initialProps={params.initialProps ?? {}}
          initialWidth={width}
          initialHeight={height}
        />
      </GtkApplicationWindow>
    )

    createRoot().render(
      <GtkApplication>
        <AppWindow />
      </GtkApplication>,
    )
  },
}
