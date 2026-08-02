// `LogBox` is accepted and ignored, and the test that says something is the
// one about the CONSOLE: RN's `ignoreLogs` filters an overlay and has never
// filtered console output, so this platform having no overlay costs nothing
// observable. A future implementation that started swallowing warnings would
// be the deviation, and this is what would catch it.
import { describe, expect, it, vi } from "vitest"
import { LogBox } from "../../../src/apis/log-box"

describe("LogBox", () => {
  it("ignoreLogs does not filter the console — RN's does not either", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    LogBox.ignoreLogs(["VirtualizedLists should never be nested"])
    console.warn(
      "VirtualizedLists should never be nested inside plain ScrollViews",
    )
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it("ignoreAllLogs does not filter the console either", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    LogBox.ignoreAllLogs()
    console.warn("still here")
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it("takes the shapes callers use at startup without throwing", () => {
    expect(() => {
      LogBox.ignoreLogs(["a string", /and a regexp/])
      LogBox.ignoreAllLogs(false)
      LogBox.install()
      LogBox.uninstall()
    }).not.toThrow()
  })
})
