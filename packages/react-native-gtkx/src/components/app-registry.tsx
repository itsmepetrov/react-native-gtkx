import { useLayoutEffect, useState, type ComponentType } from "react"
import {
  createRoot,
  Gtk,
  GtkApplication,
  GtkApplicationWindow,
  GtkScrolledWindow,
  quit,
} from "../gtkx-bridge/index.js"
import { Root } from "./root.js"
import { useGtkWindowSize } from "./use-window-size.js"

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
  window,
}: {
  App: ComponentType<Record<string, unknown>>
  initialProps: Record<string, unknown>
  initialWidth: number
  initialHeight: number
  window: Gtk.Window | null
}) => {
  // Each window drives its own layout viewport from its own surface — the
  // global Dimensions API stays main-window-only (RN semantics).
  const viewport = useGtkWindowSize(window, {
    width: initialWidth,
    height: initialHeight,
  })

  // Settings need an initialized display, and writing them mid-render is
  // unsafe — apply after the window mounts.
  useLayoutEffect(() => {
    forceEnableAnimations()
  }, [])

  // The scrolled window ONLY decouples the window's minimum size from content
  // size requests (GtkFixed minimums otherwise ratchet the window: grows but
  // never shrinks back). It is deliberately inert as a scroller: content is
  // always exactly viewport-sized and the EXTERNAL policy removes scrollbars
  // and wheel handling entirely — RN semantics, scrolling stays opt-in via
  // <ScrollView>. The systemic replacement is a custom layout manager (PRD
  // branch B).
  return (
    <GtkScrolledWindow
      hscrollbarPolicy={Gtk.PolicyType.EXTERNAL}
      vscrollbarPolicy={Gtk.PolicyType.EXTERNAL}
    >
      <Root
        width={viewport.width}
        height={viewport.height}
      >
        <App {...initialProps} />
      </Root>
    </GtkScrolledWindow>
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

    const AppWindow = () => {
      const [window, setWindow] = useState<Gtk.Window | null>(null)
      return (
        <GtkApplicationWindow
          ref={setWindow}
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
            window={window}
          />
        </GtkApplicationWindow>
      )
    }

    createRoot().render(
      <GtkApplication>
        <AppWindow />
      </GtkApplication>,
    )
  },
}
