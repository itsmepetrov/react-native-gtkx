// Production host adapter: the ONLY module under src/apis/ allowed to import
// the gtkx bridge. Everything GTK-specific lives here; the API modules stay
// pure and receive this object (or a mock in unit tests) via injection.

import type { SubscriptionHandle } from "../contracts"
import {
  Adw,
  colorScheme,
  Gdk,
  Gio,
  Gtk,
  quit,
  styleManager,
  toNumber,
} from "../gtkx/bridge/index"
import type {
  ColorSchemeName,
  Host,
  HostAlertRequest,
  ScaledSize,
} from "./host"

const FALLBACK_METRICS: ScaledSize = {
  width: 0,
  height: 0,
  scale: 1,
  fontScale: 1,
}

const getApplication = (): Gtk.Application | null =>
  Gio.Application.getDefault() as unknown as Gtk.Application | null

const getActiveAppWindow = (): Gtk.Window | null => {
  const app = getApplication()
  if (!app || typeof app.getActiveWindow !== "function") {
    return null
  }
  return app.getActiveWindow() ?? null
}

const windowAt = (model: Gio.ListModel, index: number): Gtk.Window | null =>
  model.getItem(index) as unknown as Gtk.Window | null

// The application's active window if any, otherwise the first toplevel. The
// toplevel fallback covers the test harness, where windows exist without a
// GtkApplication (`Gio.Application.getDefault()` is null there).
// RN's Dimensions("window") means the MAIN window: transient toplevels
// (Modal → modal GtkWindow, dialogs) must never be resolved as "the window" —
// an open modal becomes the active window and would shrink the app viewport
// to the modal size.
const isMainWindow = (window: Gtk.Window): boolean =>
  window.getTransientFor() === null

const resolveWindow = (): Gtk.Window | null => {
  const active = getActiveAppWindow()
  if (active && isMainWindow(active)) {
    return active
  }
  const toplevels = Gtk.Window.getToplevels()
  const count = toNumber(toplevels.getNItems())
  let first: Gtk.Window | null = null
  for (let index = 0; index < count; index += 1) {
    const window = windowAt(toplevels, index)
    if (!window || !isMainWindow(window)) {
      continue
    }
    if (window.isActive()) {
      return window
    }
    first = first ?? window
  }
  return first
}

const isAnyWindowActive = (): boolean => {
  const toplevels = Gtk.Window.getToplevels()
  const count = toNumber(toplevels.getNItems())
  for (let index = 0; index < count; index += 1) {
    if (windowAt(toplevels, index)?.isActive()) {
      return true
    }
  }
  return false
}

const windowMetrics = (): ScaledSize => {
  const window = resolveWindow()
  if (!window) {
    return FALLBACK_METRICS
  }
  // RN's Dimensions("window") is the app viewport: the window CHILD's
  // allocation (the content area under the headerbar), not the window widget
  // size. Falls back to the window size before the first allocation.
  const child = window.getChild()
  const childAllocation = child?.getAllocation()
  const allocatedWidth =
    childAllocation && childAllocation.width > 0
      ? toNumber(childAllocation.width)
      : toNumber(window.getWidth())
  const allocatedHeight =
    childAllocation && childAllocation.height > 0
      ? toNumber(childAllocation.height)
      : toNumber(window.getHeight())
  // Before the first allocation everything reports 0 — fall back to
  // the requested default size (which GTK4 also keeps updated on resize).
  const width =
    allocatedWidth > 0
      ? allocatedWidth
      : Math.max(toNumber(window.defaultWidth ?? 0), 0)
  const height =
    allocatedHeight > 0
      ? allocatedHeight
      : Math.max(toNumber(window.defaultHeight ?? 0), 0)
  return {
    width,
    height,
    scale: toNumber(window.getScaleFactor()),
    fontScale: 1,
  }
}

const screenMetrics = (): ScaledSize => {
  const display = Gdk.Display.getDefault()
  if (!display) {
    return windowMetrics()
  }
  const monitors = display.getMonitors()
  if (toNumber(monitors.getNItems()) === 0) {
    return windowMetrics()
  }
  const monitor = monitors.getItem(0) as unknown as Gdk.Monitor | null
  if (!monitor) {
    return windowMetrics()
  }
  const geometry = monitor.getGeometry()
  return {
    width: toNumber(geometry.width),
    height: toNumber(geometry.height),
    scale: toNumber(monitor.getScaleFactor()),
    fontScale: 1,
  }
}

// GtkNative.getSurface is an interface method merged onto Gtk.Window at
// runtime via mixins; accessed defensively to stay typecheckable either way.
const surfaceOf = (window: Gtk.Window): Gdk.Surface | null => {
  const native = window as unknown as { getSurface?: () => Gdk.Surface | null }
  return typeof native.getSurface === "function"
    ? (native.getSurface() ?? null)
    : null
}

// Tracks the "current" window across creation/destruction/focus moves:
// listens on the given signals of the resolved window (and, when requested,
// its GdkSurface) plus the toplevel list model, re-resolving and re-attaching
// whenever the tracked window may have changed. Modules dedupe, so
// over-notifying is fine.
//
// Why the surface: notify::default-width fires when setDefaultSize() is
// called, i.e. before the compositor actually resizes the surface — the
// allocated size (what Dimensions reports) only changes when the surface
// does. And GdkSurface notify::width/height fires at configure time, still
// before the widget allocation pass, so the "layout" signal is also needed:
// it is emitted during the frame's layout phase and — because GTK's own
// relayout handler is connected first — our handler observes the updated
// allocation. The module dedupes, so early/no-op emissions cost nothing.
const watchWindow = (
  windowSignals: readonly string[],
  surfaceSignals: readonly string[],
  notify: () => void,
): SubscriptionHandle => {
  let window: Gtk.Window | null = null
  let surface: Gdk.Surface | null = null

  const attachWindow = (): void => {
    if (!window) {
      return
    }
    for (const signal of windowSignals) {
      window.on(signal, onSignal)
    }
  }

  const detachWindow = (): void => {
    if (!window) {
      return
    }
    for (const signal of windowSignals) {
      window.off(signal, onSignal)
    }
  }

  const attachSurface = (): void => {
    if (!surface) {
      return
    }
    for (const signal of surfaceSignals) {
      surface.on(signal, onSignal)
    }
  }

  const detachSurface = (): void => {
    if (!surface) {
      return
    }
    for (const signal of surfaceSignals) {
      surface.off(signal, onSignal)
    }
  }

  const syncTargets = (): void => {
    const nextWindow = resolveWindow()
    if (nextWindow !== window) {
      detachWindow()
      window = nextWindow
      attachWindow()
    }
    const nextSurface =
      window && surfaceSignals.length > 0 ? surfaceOf(window) : null
    if (nextSurface !== surface) {
      detachSurface()
      surface = nextSurface
      attachSurface()
    }
  }

  const onSignal = (): void => {
    syncTargets()
    notify()
  }

  const toplevels = Gtk.Window.getToplevels()
  const onToplevelsChanged = (): void => {
    syncTargets()
    notify()
  }
  toplevels.on("items-changed", onToplevelsChanged)
  syncTargets()

  return {
    remove: () => {
      detachWindow()
      detachSurface()
      window = null
      surface = null
      toplevels.off("items-changed", onToplevelsChanged)
    },
  }
}

// realize/map re-run target resolution so the surface listeners attach as
// soon as the surface exists.
const WINDOW_SIZE_SIGNALS = [
  "notify::default-width",
  "notify::default-height",
  "realize",
  "map",
] as const

const SURFACE_SIZE_SIGNALS = [
  "notify::width",
  "notify::height",
  "layout",
] as const

const WINDOW_ACTIVE_SIGNALS = ["notify::is-active"] as const

const gtkVersion = (): string =>
  `${toNumber(Gtk.getMajorVersion())}.${toNumber(Gtk.getMinorVersion())}.${toNumber(Gtk.getMicroVersion())}`

const setColorScheme = (scheme: ColorSchemeName | null): void => {
  const manager = styleManager()
  if (scheme === "dark") {
    manager.setColorScheme(Adw.ColorScheme.FORCE_DARK)
  } else if (scheme === "light") {
    manager.setColorScheme(Adw.ColorScheme.FORCE_LIGHT)
  } else {
    manager.setColorScheme(Adw.ColorScheme.DEFAULT)
  }
  // Our apps are GtkApplication (not AdwApplication), so Adwaita may not
  // restyle widgets: duplicate the request through the classic GTK setting,
  // which the theme always honors.
  const settings = Gtk.Settings.getDefault()
  if (settings) {
    if (scheme === null) {
      settings.resetProperty("gtk-application-prefer-dark-theme")
    } else {
      settings.gtkApplicationPreferDarkTheme = scheme === "dark"
    }
  }
}

const onColorSchemeChange = (notify: () => void): SubscriptionHandle => {
  const manager = styleManager()
  const listener = (): void => notify()
  manager.on("notify::dark", listener)
  return { remove: () => manager.off("notify::dark", listener) }
}

const showAlert = async (request: HostAlertRequest): Promise<string | null> => {
  const dialog = new Adw.AlertDialog()
  dialog.setHeading(request.title)
  if (request.message !== undefined && request.message.length > 0) {
    dialog.setBody(request.message)
  }
  let closeResponse: string | null = null
  for (const button of request.buttons) {
    dialog.addResponse(button.id, button.label)
    if (button.style === "destructive") {
      dialog.setResponseAppearance(
        button.id,
        Adw.ResponseAppearance.DESTRUCTIVE,
      )
    }
    if (button.isPreferred) {
      dialog.setResponseAppearance(button.id, Adw.ResponseAppearance.SUGGESTED)
      dialog.setDefaultResponse(button.id)
    }
    if (button.style === "cancel") {
      closeResponse = button.id
    }
  }
  if (closeResponse !== null) {
    // Esc / close maps onto the cancel button, like RN's cancel semantics.
    dialog.setCloseResponse(closeResponse)
  } else if (!request.cancelable) {
    // No cancel button and not cancelable: block Esc-dismissal. Responses
    // still close the dialog (they bypass the can-close guard).
    dialog.setCanClose(false)
  }
  const response = await dialog.choose(resolveWindow())
  // Anything that is not one of our buttons (e.g. the built-in "close"
  // response) is a dismissal.
  return request.buttons.some((button) => button.id === response)
    ? response
    : null
}

const launchUri = async (uri: string): Promise<void> => {
  const launcher = new Gtk.UriLauncher({ uri })
  // Promisified by the gi codegen; rejects with the GError on failure.
  await launcher.launch(resolveWindow())
}

// The default widget direction is GTK's read of the locale text direction.
const isRTL = (): boolean => {
  try {
    return Gtk.Widget.getDefaultDirection() === Gtk.TextDirection.RTL
  } catch {
    return false
  }
}

export const gtkxHost: Host = {
  gtkVersion,
  getWindowMetrics: windowMetrics,
  getScreenMetrics: screenMetrics,
  onMetricsChange: (notify) =>
    watchWindow(WINDOW_SIZE_SIGNALS, SURFACE_SIZE_SIGNALS, notify),
  getColorScheme: () => colorScheme(),
  setColorScheme,
  onColorSchemeChange,
  isActive: isAnyWindowActive,
  onActiveChange: (notify) => watchWindow(WINDOW_ACTIVE_SIGNALS, [], notify),
  showAlert,
  launchUri,
  isRTL,
  exitApp: () => quit(),
}
