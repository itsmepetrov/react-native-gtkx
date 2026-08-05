// Integration: Appearance/useColorScheme against the plain-GTK profile's
// fallback (src/gtkx/bridge/color-scheme-portal.ts) — this project's own
// gtkx.config.ts declares no Adw-1, so adwAvailable() is false here and
// host.gtkx.ts routes through getPlainColorScheme/setPlainColorScheme
// instead of AdwStyleManager.
//
// The portal half of that fallback is NOT reachable from this test: @gtkx/
// vitest gives every worker its own private, empty dbus-daemon (see its
// headless-display.js), which never has org.freedesktop.portal.Desktop
// registered — so every test below deterministically exercises the
// Gtk.Settings fallback, never a live portal. That is by design, not a gap
// in coverage: this repo's private headless-sway VM session has no settings
// portal either (a real desktop session does, but is the user's — not
// something this repo's tests may drive or query), so the portal
// READ-and-PARSE logic is covered instead where it can be, with a real
// D-Bus-shaped payload but no live bus: tests/unit/gtkx/color-scheme-parse.test.ts
// in the main package, next to src/gtkx/bridge/color-scheme-parse.ts.
import { Appearance, useColorScheme } from "react-native"
import { Gtk } from "react-native-gtkx/gtk"
import { act, renderHook, waitFor } from "react-native-gtkx/testing"
import { afterEach, expect, it } from "vitest"

afterEach(() => {
  // Same intent as the Adw twin's afterEach: leave the toggle following
  // "the system" going into the next test. With no portal reachable here
  // there is nothing to actually revert TO (see setPlainColorScheme's own
  // doc) — this documents that this call is a deliberate no-op in this
  // environment, not a real reset, so nobody reads intent into it later.
  Appearance.setColorScheme(null)
})

it("reads the effective scheme from Gtk.Settings (no portal in this session)", () => {
  const settings = Gtk.Settings.getDefault()
  const expected = settings?.gtkApplicationPreferDarkTheme ? "dark" : "light"
  expect(Appearance.getColorScheme()).toBe(expected)
})

it("setColorScheme forces the scheme through Gtk.Settings and notifies listeners", async () => {
  const events: string[] = []
  const subscription = Appearance.addChangeListener(({ colorScheme }) => {
    events.push(colorScheme)
  })
  try {
    Appearance.setColorScheme("dark")
    await waitFor(() => {
      expect(Appearance.getColorScheme()).toBe("dark")
      expect(Gtk.Settings.getDefault()?.gtkApplicationPreferDarkTheme).toBe(
        true,
      )
      expect(events).toContain("dark")
    })

    Appearance.setColorScheme("light")
    await waitFor(() => {
      expect(Appearance.getColorScheme()).toBe("light")
      expect(Gtk.Settings.getDefault()?.gtkApplicationPreferDarkTheme).toBe(
        false,
      )
      expect(events).toContain("light")
    })
  } finally {
    subscription.remove()
  }
})

it("useColorScheme follows theme changes without a restart", async () => {
  Appearance.setColorScheme("light")
  const { result, unmount } = await renderHook(() => useColorScheme())
  await waitFor(() => expect(result.current).toBe("light"))

  await act(async () => {
    Appearance.setColorScheme("dark")
  })
  await waitFor(() => expect(result.current).toBe("dark"))
  await unmount()
})
