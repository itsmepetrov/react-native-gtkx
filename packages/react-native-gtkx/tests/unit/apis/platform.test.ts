import { describe, expect, it, vi } from "vitest"
import { createPlatform } from "../../../src/apis/platform"

const createHost = (version = "4.22.4") => ({
  gtkVersion: vi.fn(() => version),
})

describe("Platform", () => {
  it("reports linux constants", () => {
    const platform = createPlatform(createHost())
    expect(platform.OS).toBe("linux")
    expect(platform.isTV).toBe(false)
  })

  it("reports isTesting under the test runner", () => {
    const platform = createPlatform(createHost())
    expect(platform.isTesting).toBe(true)
  })

  it("resolves Version lazily from the host", () => {
    const host = createHost("4.20.1")
    const platform = createPlatform(host)
    expect(host.gtkVersion).not.toHaveBeenCalled()
    expect(platform.Version).toBe("4.20.1")
    expect(host.gtkVersion).toHaveBeenCalledTimes(1)
  })

  describe("select", () => {
    const platform = createPlatform(createHost())

    it("prefers linux over native and default", () => {
      expect(platform.select({ linux: "l", native: "n", default: "d" })).toBe(
        "l",
      )
    })

    it("falls back to native before default", () => {
      expect(platform.select({ native: "n", default: "d" })).toBe("n")
      expect(platform.select({ ios: "i", native: "n" })).toBe("n")
    })

    it("falls back to default last", () => {
      expect(platform.select({ ios: "i", default: "d" })).toBe("d")
    })

    it("returns undefined when nothing matches", () => {
      expect(platform.select({ ios: "i", android: "a" })).toBeUndefined()
      expect(platform.select({})).toBeUndefined()
    })

    it("uses key presence, not truthiness", () => {
      expect(
        platform.select<string | undefined>({
          linux: undefined,
          default: "d",
        }),
      ).toBeUndefined()
    })
  })
})
