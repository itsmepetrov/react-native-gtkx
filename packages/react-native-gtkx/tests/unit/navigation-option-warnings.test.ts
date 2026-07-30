import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  resetIgnoredOptionWarnings,
  warnIgnoredOptions,
} from "../../src/navigation/option-warnings"

const SUPPORTED: ReadonlySet<string> = new Set(["title", "headerShown"])

describe("warnIgnoredOptions", () => {
  beforeEach(() => {
    resetIgnoredOptionWarnings()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("warns once per navigator and key with a verdict", () => {
    warnIgnoredOptions("stack", { presentation: "modal" }, SUPPORTED)
    warnIgnoredOptions("stack", { presentation: "modal" }, SUPPORTED)
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain("Adw.Dialog")
  })

  it("stays silent for supported keys", () => {
    warnIgnoredOptions("stack", { title: "x", headerShown: false }, SUPPORTED)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("falls back to a generic verdict for unknown keys", () => {
    warnIgnoredOptions("stack", { somethingCustom: 1 }, SUPPORTED)
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain(
      "not supported by this navigator",
    )
  })

  it("dedupes per navigator kind, not globally", () => {
    warnIgnoredOptions("stack", { presentation: "modal" }, SUPPORTED)
    warnIgnoredOptions("sidebar", { presentation: "modal" }, SUPPORTED)
    expect(console.warn).toHaveBeenCalledTimes(2)
  })
})
