import { useLayoutEffect, type ComponentType, type ReactNode } from "react"
import { warnOnce } from "../style/dev-warning"
import { adwAvailable, requireAdwJsx } from "../gtkx/bridge/adw"
import {
  createRoot,
  Gtk,
  GtkApplication,
  GtkApplicationWindow,
  quit,
} from "../gtkx/bridge/index"
import { Root } from "./root"

type ComponentProvider = () => ComponentType<Record<string, unknown>>

const registry = new Map<string, ComponentProvider>()

// The chrome the running app was started with — read by the navigation
// dev-mode hint (a HeaderBar page under "system" chrome renders a doubled
// titlebar). null until runApplication ran (test harnesses never set it).
let activeChrome: "system" | "content" | null = null
export const getActiveChrome = (): "system" | "content" | null => activeChrome

// One accelerator binding on the GApplication — the shape GtkApplication's
// own `actionAccels` prop takes, restated locally so this file needs
// nothing from @gtkx/react/internal (the "internal" subpath is where the
// real type lives, but nothing else in this package reaches for it).
export type ActionAccel = {
  detailedActionName: string
  accels: string[]
}

export type RunApplicationParams = {
  initialProps?: Record<string, unknown>
  title?: string
  width?: number
  height?: number
  // Window chrome. "system" (default): a GtkApplicationWindow with its own
  // titlebar. "content": an AdwApplicationWindow with NO window titlebar —
  // the app's content provides HeaderBars (navigation apps: the page
  // HeaderBar becomes the titlebar, with the window controls in it).
  // Plain-GTK profile (no "Adw-1" in this app's gtkx.config.ts): "content"
  // falls back to the same GtkApplicationWindow "system" uses — Adw is what
  // makes chrome: "content" work, not just this option — see adwAvailable()
  // in .claude/epics/adw-optional/002.md.
  chrome?: "system" | "content"
  /**
   * GSimpleAction elements registered on the GApplication itself
   * ("app.<name>" — reachable from anywhere, including a Gio.Notification's
   * action buttons, which can only ever target an app-level action).
   *
   * @deprecated Render `<ApplicationActions>` (react-native-gtkx/gtk) inside
   * the app instead. Options render as SIBLINGS of the app tree, so no
   * context of the app's can reach them and the set is fixed for the
   * process's lifetime. Still supported; see docs/api.md.
   */
  applicationActions?: ReactNode
  // Keyboard accelerators bound to actions, at the application level —
  // GtkApplication's own actionAccels prop, unchanged. NOT deprecated with
  // the three ReactNode options below: this is a flat name→keys table with
  // no children and nothing to read from context, and it is deliberately
  // process-wide (an accelerator for an action that is not currently
  // registered simply does nothing). A shortcut that should come and go
  // with a screen is a GtkShortcutController in <WindowControllers>.
  actionAccels?: ActionAccel[]
  /**
   * GSimpleAction elements registered on the window ("win.<name>" — what a
   * HeaderBar button's actionName or a GMenu item usually targets).
   *
   * @deprecated Render `<WindowActions>` (react-native-gtkx/gtk) inside the
   * app instead — it can read the app's context and registers/unregisters
   * with the component that declares it. Still supported; see docs/api.md.
   */
  windowActions?: ReactNode
  /**
   * Event controllers attached to the window itself — a
   * GtkShortcutController scoped to the whole window is the common case.
   *
   * @deprecated Render `<WindowControllers>` (react-native-gtkx/gtk) inside
   * the app instead, for the same reasons as `windowActions`. Still
   * supported; see docs/api.md.
   */
  windowControllers?: ReactNode
  // AdwBreakpoint elements, evaluated against the window's own allocated
  // size. Only meaningful under chrome: "content" WITH Adw actually present
  // (AdwApplicationWindow) — GtkApplicationWindow has no such concept, so
  // this is ignored (with a dev warning) under the default "system" chrome,
  // and equally ignored (with a different dev warning, once) when chrome:
  // "content" was requested but this app has no "Adw-1" declared.
  breakpoints?: ReactNode
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

// chrome "content": the app component IS the window content (a navigation
// container whose pages host their own NestedRoots) — no window-level Yoga
// root in between: the layout root would not allocate foreign GTK children.
const ContentChrome = ({
  App,
  initialProps,
}: {
  App: ComponentType<Record<string, unknown>>
  initialProps: Record<string, unknown>
}) => {
  useLayoutEffect(() => {
    forceEnableAnimations()
  }, [])
  return <App {...initialProps} />
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

    const contentChrome = params.chrome === "content"
    // What chrome: "content" actually gets: AdwApplicationWindow needs Adw
    // itself, so a plain-GTK app (no "Adw-1" in gtkx.config.ts) falls back to
    // exactly the "system" chrome path — same window type, same content
    // wrapper — rather than throwing, per
    // .claude/epics/adw-optional/002.md. The Adw profile is unaffected:
    // adwAvailable() is true there, so useAdwChrome === contentChrome always,
    // and every branch below takes the same route it did before this probe
    // existed.
    const useAdwChrome = contentChrome && adwAvailable()
    activeChrome = useAdwChrome ? "content" : "system"

    if (process.env.NODE_ENV !== "production" && params.breakpoints) {
      if (!contentChrome) {
        console.warn(
          '[react-native-gtkx] breakpoints was passed to runApplication without chrome: "content" — GtkApplicationWindow (the "system" chrome default) has no breakpoints concept, so it is ignored.',
        )
      } else if (!useAdwChrome) {
        // Once, not every run: contentChrome apps in a long-lived dev loop
        // (Fast Refresh) would otherwise re-warn on every reload.
        warnOnce(
          "app-registry:breakpoints-no-adw",
          '[react-native-gtkx] breakpoints was passed to runApplication with chrome: "content", but this app has no "Adw-1" in its gtkx.config.ts `libraries` — falling back to GtkApplicationWindow, which has no breakpoints concept, so it is ignored.',
        )
      }
    }

    const content = useAdwChrome ? (
      <ContentChrome
        App={App}
        initialProps={params.initialProps ?? {}}
      />
    ) : (
      <WindowContent
        App={App}
        initialProps={params.initialProps ?? {}}
        initialWidth={width}
        initialHeight={height}
      />
    )

    // Adw is reached ONLY here, and only when chrome: "content" was actually
    // requested AND this app's codegen store actually has it — chrome:
    // "system" (the default), and a plain-GTK app's chrome: "content", never
    // touch it, which is what lets an app with no Adw-1 declared run at all
    // (see .claude/epics/adw-optional/001.md and 002.md for the fallback).
    const AppWindow = () =>
      useAdwChrome ? (
        (() => {
          const { AdwApplicationWindow } = requireAdwJsx('chrome: "content"')
          return (
            <AdwApplicationWindow
              title={params.title ?? appKey}
              defaultWidth={width}
              defaultHeight={height}
              onCloseRequest={quit}
              actions={params.windowActions}
              controllers={params.windowControllers}
              breakpoints={params.breakpoints}
            >
              {content}
            </AdwApplicationWindow>
          )
        })()
      ) : (
        <GtkApplicationWindow
          title={params.title ?? appKey}
          defaultWidth={width}
          defaultHeight={height}
          onCloseRequest={quit}
          actions={params.windowActions}
          controllers={params.windowControllers}
        >
          {content}
        </GtkApplicationWindow>
      )

    createRoot().render(
      <GtkApplication
        actions={params.applicationActions}
        actionAccels={params.actionAccels}
      >
        <AppWindow />
      </GtkApplication>,
    )
  },
}
