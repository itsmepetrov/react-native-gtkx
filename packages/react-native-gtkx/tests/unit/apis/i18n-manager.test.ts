import { describe, expect, it, vi } from "vitest"
import { createI18nManager } from "../../../src/apis/i18n-manager"

const createHost = (rtl = false) => ({
  isRTL: vi.fn(() => rtl),
})

describe("I18nManager", () => {
  it("reads isRTL from the host on every access", () => {
    const host = createHost(true)
    const i18n = createI18nManager(host)
    expect(i18n.isRTL).toBe(true)
    expect(i18n.isRTL).toBe(true)
    expect(host.isRTL).toHaveBeenCalledTimes(2)
  })

  it("exposes the RN constants shape", () => {
    const i18n = createI18nManager(createHost(false))
    expect(i18n.getConstants()).toEqual({
      isRTL: false,
      doLeftAndRightSwapInRTL: true,
    })
    expect(i18n.doLeftAndRightSwapInRTL).toBe(true)
  })

  it("accepts the mobile-only writers as no-ops", () => {
    const host = createHost(false)
    const i18n = createI18nManager(host)
    i18n.allowRTL(true)
    i18n.forceRTL(true)
    i18n.swapLeftAndRightInRTL(false)
    // The writers persist a preference on mobile; there is no desktop store,
    // so reads stay whatever the locale says.
    expect(i18n.isRTL).toBe(false)
  })
})
