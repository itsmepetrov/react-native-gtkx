// The plain-GTK profile's color-scheme source — see
// .claude/epics/adw-optional/004.md. Two mechanisms, same as the task:
//
// 1. org.freedesktop.appearance's "color-scheme" key on the XDG desktop
//    portal (org.freedesktop.portal.Settings, over D-Bus) — the
//    cross-desktop standard GNOME, KDE and others implement, with live
//    updates via its SettingChanged signal. This is what makes the plain
//    profile report the real system scheme on KDE too, not just GNOME.
// 2. Gtk.Settings' gtk-application-prefer-dark-theme when the portal never
//    answers (no xdg-desktop-portal running at all, or it timed out) — the
//    only other lever plain GTK has, and also the ONLY thing
//    setPlainColorScheme can honestly write (see its own doc below).
//
// The parsing half (unwrapping the portal's double-boxed variant, mapping
// its uint32 onto "light"/"dark") lives in ./color-scheme-parse instead,
// which has no @gtkx/gi imports at all — this file is the GTK/D-Bus glue
// around it, and is NOT unit-testable on its own (constructing a real
// Gio.DBusProxy needs a real GTK/GLib runtime); see that file's own doc and
// tests/unit/gtkx/color-scheme-parse.test.ts for what actually is.
//
// Deliberately hand-rolled rather than reading GTK's own newer
// Gtk.Settings:gtk-interface-color-scheme (added in GTK 4.16, and itself
// backed by this exact same portal internally): that property does not
// exist before 4.16, silently raising this profile's real minimum past the
// GTK >= 4.10 baseline Alert's Gtk.AlertDialog fallback already commits to,
// and — because it is GTK's own opaque internal client — gives us nothing
// to unit-test if the portal itself can never be reached in this repo's
// headless test session.
import * as Gio from "@gtkx/gi/gio"
import * as GLib from "@gtkx/gi/glib"
import * as Gtk from "@gtkx/gi/gtk"
import type { SubscriptionHandle } from "../../contracts"
import {
  parsePortalReadReply,
  parseSettingChangedValue,
  type ColorScheme,
} from "./color-scheme-parse"

export type { ColorScheme }

const PORTAL_BUS_NAME = "org.freedesktop.portal.Desktop"
const PORTAL_OBJECT_PATH = "/org/freedesktop/portal/desktop"
const PORTAL_SETTINGS_INTERFACE = "org.freedesktop.portal.Settings"
const APPEARANCE_NAMESPACE = "org.freedesktop.appearance"
const COLOR_SCHEME_KEY = "color-scheme"

// Bounded so a session with no portal at all (this repo's own headless-sway
// GTK test session included — see color-scheme-portal.gtk.test.tsx in
// spike/plain-gtk) fails fast instead of riding D-Bus's own ~25s default
// method-call timeout. Generous next to a real portal's actual answer time
// (single-digit milliseconds locally in every manual check during this task).
const PORTAL_TIMEOUT_MSEC = 2000

const settingsDefault = (): Gtk.Settings | null => Gtk.Settings.getDefault()

const effectiveScheme = (): ColorScheme =>
  settingsDefault()?.gtkApplicationPreferDarkTheme ? "dark" : "light"

const applyToGtkSettings = (scheme: ColorScheme): void => {
  const settings = settingsDefault()
  if (settings) {
    // Writing fires notify::gtk-application-prefer-dark-theme (a no-op,
    // GObject-property-setter style, when the value does not actually
    // change) — the ONE signal onPlainColorSchemeChange listens on, so this
    // is also how both setPlainColorScheme and an incoming portal update
    // reach subscribers, with no separate notify path to keep in sync.
    settings.gtkApplicationPreferDarkTheme = scheme === "dark"
  }
}

// null = "follow the system" (this profile's equivalent of Adw's
// ColorScheme.DEFAULT); "light"/"dark" = an explicit local override (this
// profile's equivalent of Adw's FORCE_LIGHT/FORCE_DARK) — same tri-state
// shape as AdwStyleManager's own, so getPlainColorScheme/
// setPlainColorScheme stay consistent with each other exactly the way
// AdwStyleManager already is (see host.gtkx.ts's setColorScheme/
// colorScheme(), which both go through the one manager instance).
let forced: ColorScheme | null = null
// The last value this process actually learned FROM the portal, kept even
// while forced !== null so un-forcing (setPlainColorScheme(null)) can
// re-apply it immediately rather than waiting for the next SettingChanged.
let lastPortalScheme: ColorScheme | null = null

const applySystemUpdate = (scheme: ColorScheme): void => {
  lastPortalScheme = scheme
  if (forced === null) {
    applyToGtkSettings(scheme)
  }
}

let probeStarted = false

// One-time, synchronous, memoized — mirrors gtkx/bridge/adw.ts's own
// probe-once cached shape. Synchronous (not a dynamic import/async probe
// like adw.ts's) because getPlainColorScheme must answer synchronously on
// every call per the Host contract (AppearanceHost.getColorScheme is not a
// Promise) — this is the one place that pays the D-Bus round trip, once,
// bounded by PORTAL_TIMEOUT_MSEC, the first time appearance is actually
// touched (not at module load, so an app that never reads/writes
// Appearance never pays for it at all).
const ensurePortalProbed = (): void => {
  if (probeStarted) {
    return
  }
  probeStarted = true
  try {
    const proxy = Gio.DBusProxy.newForBusSync(
      Gio.BusType.SESSION,
      // Skips the constructor's own synchronous property-cache GetAll call
      // (the Settings portal interface has none we care about) — without
      // this, construction itself can block on bus activation before ever
      // reaching the bounded callSync below.
      Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES,
      null,
      PORTAL_BUS_NAME,
      PORTAL_OBJECT_PATH,
      PORTAL_SETTINGS_INTERFACE,
      null,
    )
    const reply = proxy.callSync(
      "Read",
      GLib.Variant.newTuple([
        GLib.Variant.newString(APPEARANCE_NAMESPACE),
        GLib.Variant.newString(COLOR_SCHEME_KEY),
      ]),
      Gio.DBusCallFlags.NONE,
      PORTAL_TIMEOUT_MSEC,
      null,
    )
    applySystemUpdate(parsePortalReadReply(reply.getChildValue(0)))
    proxy.on("g-signal", (_sender, signalName, parameters) => {
      if (signalName !== "SettingChanged") {
        return
      }
      const namespace = parameters.getChildValue(0).getString()[0]
      const key = parameters.getChildValue(1).getString()[0]
      if (namespace !== APPEARANCE_NAMESPACE || key !== COLOR_SCHEME_KEY) {
        return
      }
      applySystemUpdate(parseSettingChangedValue(parameters.getChildValue(2)))
    })
  } catch {
    // No session bus, no portal owning org.freedesktop.portal.Desktop, or
    // it didn't answer inside PORTAL_TIMEOUT_MSEC — Gtk.Settings' own
    // current value (its GTK/theme default, absent anything else to set it)
    // is the only honest source left. Not retried: matches adwAvailable()'s
    // own probe-once verdict, and a portal that is not there at process
    // start is not expected to appear mid-session either.
  }
}

/** Always "light" | "dark" — see the module doc for how it is sourced. */
export const getPlainColorScheme = (): ColorScheme => {
  ensurePortalProbed()
  return effectiveScheme()
}

/**
 * The plain profile's setColorScheme. What Adw's setColorScheme forces is
 * already only ever an app-local override — AdwStyleManager is per-process,
 * never a system-wide write — so writing Gtk.Settings'
 * gtk-application-prefer-dark-theme here (also strictly app-local: it never
 * reaches outside this process either) is not a lesser feature, just the
 * plain-GTK lever that does the same job. There is no honest way to make
 * this profile change the DESKTOP's own preference — no portal write API
 * exists (the portal is read + notify only, by design) — so "local-only" is
 * the whole story, not a fallback for a system-wide write that almost
 * worked.
 *
 * null ("follow the system") re-applies the last value actually observed
 * from the portal, if any. With no portal reachable at all there is no
 * other system source to revert to, so it is a deliberate no-op — staying
 * at whatever the toggle already reads rather than guessing a default.
 */
export const setPlainColorScheme = (scheme: ColorScheme | null): void => {
  ensurePortalProbed()
  forced = scheme
  applyToGtkSettings(scheme ?? lastPortalScheme ?? effectiveScheme())
}

let settingsListenerAttached = false
const listeners = new Set<() => void>()

const attachSettingsListener = (): void => {
  if (settingsListenerAttached) {
    return
  }
  const settings = settingsDefault()
  if (!settings) {
    return
  }
  settingsListenerAttached = true
  settings.on("notify::gtk-application-prefer-dark-theme", () => {
    for (const listener of listeners) {
      listener()
    }
  })
}

export const onPlainColorSchemeChange = (
  notify: () => void,
): SubscriptionHandle => {
  ensurePortalProbed()
  attachSettingsListener()
  listeners.add(notify)
  return { remove: () => listeners.delete(notify) }
}
