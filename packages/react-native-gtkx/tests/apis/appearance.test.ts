import { describe, expect, it, vi } from "vitest"
import { createAppearance } from "../../src/apis/appearance"
import { createAppearanceMockHost } from "./mock-host"

describe("Appearance", () => {
  it("returns the host color scheme", () => {
    const mock = createAppearanceMockHost("dark")
    const appearance = createAppearance(mock.host)
    expect(appearance.getColorScheme()).toBe("dark")
    mock.setSystemScheme("light")
    expect(appearance.getColorScheme()).toBe("light")
  })

  it("notifies listeners when the theme changes", () => {
    const mock = createAppearanceMockHost("light")
    const appearance = createAppearance(mock.host)
    const handler = vi.fn()
    appearance.addChangeListener(handler)
    mock.setSystemScheme("dark")
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ colorScheme: "dark" })
  })

  it("dedupes host notifications that do not change the scheme", () => {
    const mock = createAppearanceMockHost("light")
    const appearance = createAppearance(mock.host)
    const handler = vi.fn()
    appearance.addChangeListener(handler)
    mock.setSystemScheme("light")
    expect(handler).not.toHaveBeenCalled()
  })

  it("stops notifying after remove(), idempotently", () => {
    const mock = createAppearanceMockHost("light")
    const appearance = createAppearance(mock.host)
    const handler = vi.fn()
    const subscription = appearance.addChangeListener(handler)
    subscription.remove()
    subscription.remove()
    mock.setSystemScheme("dark")
    expect(handler).not.toHaveBeenCalled()
  })

  it("holds a single host subscription only while listeners exist", () => {
    const mock = createAppearanceMockHost()
    const appearance = createAppearance(mock.host)
    expect(mock.notifier.count()).toBe(0)
    const first = appearance.addChangeListener(vi.fn())
    const second = appearance.addChangeListener(vi.fn())
    expect(mock.notifier.count()).toBe(1)
    first.remove()
    second.remove()
    expect(mock.notifier.count()).toBe(0)
  })

  it("delegates setColorScheme to the host, mapping undefined to null", () => {
    const mock = createAppearanceMockHost("light")
    const appearance = createAppearance(mock.host)
    appearance.setColorScheme("dark")
    appearance.setColorScheme("light")
    appearance.setColorScheme(null)
    appearance.setColorScheme(undefined)
    expect(mock.setCalls).toEqual(["dark", "light", null, null])
  })

  it("forcing a scheme through setColorScheme notifies listeners", () => {
    const mock = createAppearanceMockHost("light")
    const appearance = createAppearance(mock.host)
    const handler = vi.fn()
    appearance.addChangeListener(handler)
    appearance.setColorScheme("dark")
    expect(handler).toHaveBeenCalledWith({ colorScheme: "dark" })
  })
})
