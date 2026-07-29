// Integration: Platform against the real GTK runtime.

import { expect, it } from "vitest"
import { Linking, Platform } from "../../src/apis/index.js"

it("exposes the GTK runtime version", () => {
  expect(Platform.OS).toBe("linux")
  expect(Platform.Version).toMatch(/^4\.\d+\.\d+$/)
  expect(Platform.isTV).toBe(false)
})

it("select prefers linux on this platform", () => {
  expect(Platform.select({ linux: "l", native: "n", default: "d" })).toBe("l")
  expect(Platform.select({ ios: "i", native: "n", default: "d" })).toBe("n")
})

it("Linking answers the canOpenURL matrix without a portal round-trip", async () => {
  await expect(Linking.canOpenURL("https://example.com")).resolves.toBe(true)
  await expect(Linking.canOpenURL("mailto:a@b.c")).resolves.toBe(true)
  await expect(Linking.canOpenURL("file:///tmp/x")).resolves.toBe(true)
  await expect(Linking.canOpenURL("tel:123")).resolves.toBe(false)
  await expect(Linking.getInitialURL()).resolves.toBeNull()
})
