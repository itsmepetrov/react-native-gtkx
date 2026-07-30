// DevSettings is a thin bridge over the host↔bundle globals: items land in
// the shared registry (same-title registration replaces, RN semantics) and
// reload proxies to the dev host's hook — silently doing nothing without
// one (release builds).
import { afterEach, expect, test, vi } from "vitest"
import { DevSettings } from "../../../src/apis/dev-settings"

afterEach(() => {
  globalThis.__rnGtkxDevMenuItems = undefined
  globalThis.__rnGtkxDevHost = undefined
})

test("addMenuItem registers items in the shared registry", () => {
  const first = vi.fn()
  const second = vi.fn()
  DevSettings.addMenuItem("Clear cache", first)
  DevSettings.addMenuItem("Log state", second)
  expect(globalThis.__rnGtkxDevMenuItems?.map((item) => item.title)).toEqual([
    "Clear cache",
    "Log state",
  ])
  globalThis.__rnGtkxDevMenuItems?.[1]?.handler()
  expect(second).toHaveBeenCalledOnce()
})

test("registering the same title replaces the handler (RN semantics)", () => {
  const stale = vi.fn()
  const fresh = vi.fn()
  DevSettings.addMenuItem("Clear cache", stale)
  DevSettings.addMenuItem("Clear cache", fresh)
  expect(globalThis.__rnGtkxDevMenuItems).toHaveLength(1)
  globalThis.__rnGtkxDevMenuItems?.[0]?.handler()
  expect(stale).not.toHaveBeenCalled()
  expect(fresh).toHaveBeenCalledOnce()
})

test("reload proxies to the dev host hook", () => {
  const reload = vi.fn()
  globalThis.__rnGtkxDevHost = { reload }
  DevSettings.reload("test reason")
  expect(reload).toHaveBeenCalledWith("test reason")
})

test("reload without a dev host is a silent no-op (release)", () => {
  expect(() => DevSettings.reload()).not.toThrow()
})
