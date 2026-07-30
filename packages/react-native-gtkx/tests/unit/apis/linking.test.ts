import { describe, expect, it, vi } from "vitest"
import { createLinking } from "../../../src/apis/linking"

const createLinkingMockHost = () => ({
  launchUri: vi.fn(() => Promise.resolve()),
})

describe("Linking", () => {
  describe("canOpenURL", () => {
    const linking = createLinking(createLinkingMockHost())

    it.each([
      ["http://example.com", true],
      ["https://example.com/path?q=1", true],
      ["HTTPS://EXAMPLE.COM", true],
      ["mailto:user@example.com", true],
      ["file:///home/user/doc.pdf", true],
      ["tel:+1234567890", false],
      ["ftp://example.com", false],
      ["sms:12345", false],
      ["example.com", false],
      ["not a url", false],
      ["", false],
    ])("resolves %j -> %s", async (url, expected) => {
      await expect(linking.canOpenURL(url)).resolves.toBe(expected)
    })

    it("rejects non-string input", async () => {
      await expect(linking.canOpenURL(42 as never)).rejects.toThrow(
        /must be a string/,
      )
    })
  })

  describe("openURL", () => {
    it("delegates to the host launcher", async () => {
      const host = createLinkingMockHost()
      const linking = createLinking(host)
      await expect(linking.openURL("https://example.com")).resolves.toBe(
        undefined,
      )
      expect(host.launchUri).toHaveBeenCalledWith("https://example.com")
    })

    it("rejects empty or non-string urls without touching the host", async () => {
      const host = createLinkingMockHost()
      const linking = createLinking(host)
      await expect(linking.openURL("")).rejects.toThrow(/non-empty string/)
      await expect(linking.openURL(null as never)).rejects.toThrow(
        /non-empty string/,
      )
      expect(host.launchUri).not.toHaveBeenCalled()
    })

    it("propagates host failures", async () => {
      const host = {
        launchUri: vi.fn(() => Promise.reject(new Error("no handler"))),
      }
      const linking = createLinking(host)
      await expect(linking.openURL("https://example.com")).rejects.toThrow(
        "no handler",
      )
    })
  })

  it("getInitialURL resolves to null", async () => {
    const linking = createLinking(createLinkingMockHost())
    await expect(linking.getInitialURL()).resolves.toBeNull()
  })
})
