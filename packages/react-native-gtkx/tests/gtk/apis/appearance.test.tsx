// Integration: Appearance against the real AdwStyleManager. Forcing a scheme
// via Appearance.setColorScheme flips notify::dark, which must reach both the
// listener API and the useColorScheme hook without a restart.

import { act, renderHook, waitFor } from "@gtkx/testing"
import { afterEach, expect, it } from "vitest"
import { Appearance, useColorScheme } from "../../../src/apis/index"
import { styleManager } from "../../../src/gtkx/bridge/index"

afterEach(() => {
  // Return to following the system preference.
  Appearance.setColorScheme(null)
})

it("reads the effective Adwaita color scheme", () => {
  const expected = styleManager().getDark() ? "dark" : "light"
  expect(Appearance.getColorScheme()).toBe(expected)
})

it("setColorScheme forces the scheme and notifies listeners", async () => {
  const events: string[] = []
  const subscription = Appearance.addChangeListener(({ colorScheme }) => {
    events.push(colorScheme)
  })
  try {
    Appearance.setColorScheme("dark")
    await waitFor(() => {
      expect(Appearance.getColorScheme()).toBe("dark")
      expect(events).toContain("dark")
    })

    Appearance.setColorScheme("light")
    await waitFor(() => {
      expect(Appearance.getColorScheme()).toBe("light")
      expect(events).toContain("light")
    })
  } finally {
    subscription.remove()
  }
})

it("useColorScheme follows theme changes without a restart", async () => {
  // setColorScheme sets AdwStyleManager's property directly, which fires
  // notify::dark synchronously into the hook's listener — before the hook
  // even mounts here, so nothing to flush yet.
  Appearance.setColorScheme("light")
  const { result, unmount } = await renderHook(() => useColorScheme())
  await waitFor(() => expect(result.current).toBe("light"))

  // Same native property write, now with the hook mounted and listening —
  // a poke outside any React event handler, so it needs act() to flush the
  // resulting setState before the read below.
  await act(async () => {
    Appearance.setColorScheme("dark")
  })
  await waitFor(() => expect(result.current).toBe("dark"))
  await unmount()
})
