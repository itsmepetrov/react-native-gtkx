// Integration: Appearance against the real AdwStyleManager. Forcing a scheme
// via Appearance.setColorScheme flips notify::dark, which must reach both the
// listener API and the useColorScheme hook without a restart.

import { act, render, renderHook, screen, waitFor } from "@gtkx/testing"
import { afterEach, expect, it } from "vitest"
import { Appearance, useColorScheme } from "../../../src/apis/index"
import { styleManager, type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, Text } from "../../../src/index"

afterEach(() => {
  // Return to following the system preference.
  Appearance.setColorScheme(null)
})

// Rec. 709 luma of the widget's computed CSS foreground color. Adwaita's
// light and dark stylesheets sit at the extremes of this scale (near-black
// text on light, near-white on dark), so the midpoint separates them with
// room to spare and without hard-coding either palette's exact values.
const foregroundLuma = (widget: GtkNs.Widget): number => {
  const color = widget.getColor()
  return 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue
}

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

// The regression guard for dropping the GtkSettings duplication: the host
// used to write gtk-application-prefer-dark-theme alongside the style
// manager, on the theory that a GtkApplication (rather than AdwApplication)
// might not get restyled by Adwaita. Nothing asserted that, so nothing could
// tell whether it was doing any work — and libadwaita ignores the setting
// anyway. This test asserts the thing that theory was worried about: real
// widgets pick up the new palette from AdwStyleManager alone.
it("forcing a scheme restyles real widgets, not just the property", async () => {
  await render(
    <Root
      width={200}
      height={100}
    >
      <Text>themed</Text>
    </Root>,
  )
  const label = screen.getByText("themed") as unknown as GtkNs.Widget

  await act(async () => {
    Appearance.setColorScheme("dark")
  })
  await waitFor(() => expect(foregroundLuma(label)).toBeGreaterThan(0.5))

  await act(async () => {
    Appearance.setColorScheme("light")
  })
  await waitFor(() => expect(foregroundLuma(label)).toBeLessThan(0.5))
})
