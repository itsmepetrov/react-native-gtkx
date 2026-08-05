import { afterEach, describe, expect, it, vi } from "vitest"
import {
  installAlertGlobal,
  installErrorUtilsGlobal,
  installIdleCallbackGlobals,
  installNavigatorProductGlobal,
  installWindowAndSelfGlobals,
} from "../../../src/globals/index"

type MutableGlobal = Record<string, unknown>
const g = globalThis as MutableGlobal

// Every install below is guarded on "already installed", so each test must
// remove whatever it added — a real Node process already has `navigator`,
// so most of the coverage here is exactly the interesting case: an install
// running against a global that already exists (Node's own), not an empty
// environment no toolchain actually has.
const deleteGlobal = (name: string): void => {
  delete g[name]
}

describe("installWindowAndSelfGlobals", () => {
  afterEach(() => {
    deleteGlobal("window")
    deleteGlobal("self")
  })

  it("sets window and self to globalThis when absent, matching RN's setUpGlobals", () => {
    deleteGlobal("window")
    deleteGlobal("self")
    installWindowAndSelfGlobals()
    expect(g.window).toBe(globalThis)
    expect(g.self).toBe(globalThis)
  })

  it("does not overwrite an existing window or self", () => {
    const existingWindow = {}
    const existingSelf = {}
    g.window = existingWindow
    g.self = existingSelf
    installWindowAndSelfGlobals()
    expect(g.window).toBe(existingWindow)
    expect(g.self).toBe(existingSelf)
  })
})

describe("installNavigatorProductGlobal", () => {
  const original = g.navigator

  afterEach(() => {
    g.navigator = original
  })

  it("creates navigator when it does not exist, matching RN's fallback", () => {
    deleteGlobal("navigator")
    installNavigatorProductGlobal()
    expect((g.navigator as { product: string }).product).toBe("ReactNative")
  })

  it("adds product to an existing navigator without overwriting other fields", () => {
    g.navigator = { userAgent: "Node.js/24" }
    installNavigatorProductGlobal()
    const nav = g.navigator as { product: string; userAgent: string }
    expect(nav.product).toBe("ReactNative")
    expect(nav.userAgent).toBe("Node.js/24")
  })

  it("is idempotent against a navigator that already reports ReactNative", () => {
    g.navigator = { product: "ReactNative" }
    expect(() => {
      installNavigatorProductGlobal()
    }).not.toThrow()
    expect((g.navigator as { product: string }).product).toBe("ReactNative")
  })
})

describe("installIdleCallbackGlobals", () => {
  afterEach(() => {
    deleteGlobal("requestIdleCallback")
    deleteGlobal("cancelIdleCallback")
  })

  it("installs requestIdleCallback and cancelIdleCallback when absent", () => {
    deleteGlobal("requestIdleCallback")
    deleteGlobal("cancelIdleCallback")
    installIdleCallbackGlobals()
    expect(typeof g.requestIdleCallback).toBe("function")
    expect(typeof g.cancelIdleCallback).toBe("function")
  })

  it("invokes the callback with a deadline shaped like the real API", async () => {
    deleteGlobal("requestIdleCallback")
    installIdleCallbackGlobals()
    const requestIdleCallback = g.requestIdleCallback as (
      callback: (deadline: {
        didTimeout: boolean
        timeRemaining: () => number
      }) => void,
    ) => unknown
    await new Promise<void>((resolve) => {
      requestIdleCallback((deadline) => {
        expect(deadline.didTimeout).toBe(false)
        expect(deadline.timeRemaining()).toBeGreaterThanOrEqual(0)
        resolve()
      })
    })
  })

  it("cancelIdleCallback prevents the scheduled callback from firing", async () => {
    deleteGlobal("requestIdleCallback")
    deleteGlobal("cancelIdleCallback")
    installIdleCallbackGlobals()
    const requestIdleCallback = g.requestIdleCallback as (
      callback: () => void,
    ) => unknown
    const cancelIdleCallback = g.cancelIdleCallback as (handle: unknown) => void
    const callback = vi.fn()
    const handle = requestIdleCallback(callback)
    cancelIdleCallback(handle)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(callback).not.toHaveBeenCalled()
  })

  it("does not overwrite an existing requestIdleCallback", () => {
    const existing = (): void => {}
    g.requestIdleCallback = existing
    installIdleCallbackGlobals()
    expect(g.requestIdleCallback).toBe(existing)
  })
})

describe("installAlertGlobal", () => {
  afterEach(() => {
    deleteGlobal("alert")
  })

  it("forwards global.alert(text) to Alert.alert('Alert', text)", () => {
    deleteGlobal("alert")
    const alert = vi.fn()
    installAlertGlobal(alert)
    ;(g.alert as (text: unknown) => void)("hello")
    expect(alert).toHaveBeenCalledWith("Alert", "hello")
  })

  it("stringifies a non-string argument, like react-native's own", () => {
    deleteGlobal("alert")
    const alert = vi.fn()
    installAlertGlobal(alert)
    ;(g.alert as (text: unknown) => void)(42)
    expect(alert).toHaveBeenCalledWith("Alert", "42")
  })

  it("does not overwrite an existing global.alert", () => {
    const existing = (): void => {}
    g.alert = existing
    installAlertGlobal(vi.fn())
    expect(g.alert).toBe(existing)
  })
})

describe("installErrorUtilsGlobal", () => {
  afterEach(() => {
    deleteGlobal("ErrorUtils")
  })

  it("installs ErrorUtils when absent", () => {
    deleteGlobal("ErrorUtils")
    installErrorUtilsGlobal()
    expect(typeof g.ErrorUtils).toBe("object")
  })

  it("rethrows through the default handler, unhooked react-native behaviour", () => {
    deleteGlobal("ErrorUtils")
    installErrorUtilsGlobal()
    const ErrorUtils = g.ErrorUtils as {
      reportError: (error: unknown) => void
    }
    expect(() => {
      ErrorUtils.reportError(new Error("boom"))
    }).toThrow("boom")
  })

  it("setGlobalHandler replaces the default rethrow", () => {
    deleteGlobal("ErrorUtils")
    installErrorUtilsGlobal()
    const ErrorUtils = g.ErrorUtils as {
      setGlobalHandler: (
        handler: (error: unknown, isFatal: boolean) => void,
      ) => void
      reportFatalError: (error: unknown) => void
    }
    const handler = vi.fn()
    ErrorUtils.setGlobalHandler(handler)
    const error = new Error("fatal")
    ErrorUtils.reportFatalError(error)
    expect(handler).toHaveBeenCalledWith(error, true)
  })

  it("applyWithGuard runs the function and reports a thrown error instead of throwing", () => {
    deleteGlobal("ErrorUtils")
    installErrorUtilsGlobal()
    const ErrorUtils = g.ErrorUtils as {
      setGlobalHandler: (
        handler: (error: unknown, isFatal: boolean) => void,
      ) => void
      applyWithGuard: <T>(fn: () => T) => T | null
    }
    const handler = vi.fn()
    ErrorUtils.setGlobalHandler(handler)
    const result = ErrorUtils.applyWithGuard(() => {
      throw new Error("guarded")
    })
    expect(result).toBeNull()
    expect(handler).toHaveBeenCalledWith(expect.any(Error), false)
  })

  it("applyWithGuard returns the function's result when it does not throw", () => {
    deleteGlobal("ErrorUtils")
    installErrorUtilsGlobal()
    const ErrorUtils = g.ErrorUtils as {
      applyWithGuard: <T>(fn: () => T) => T | null
    }
    expect(ErrorUtils.applyWithGuard(() => 42)).toBe(42)
  })

  it("guard wraps a function so it never throws across the boundary", () => {
    deleteGlobal("ErrorUtils")
    installErrorUtilsGlobal()
    const ErrorUtils = g.ErrorUtils as {
      setGlobalHandler: (
        handler: (error: unknown, isFatal: boolean) => void,
      ) => void
      guard: <T extends (...args: never[]) => unknown>(
        fn: T,
      ) => ((...args: Parameters<T>) => ReturnType<T> | null) | null
    }
    const handler = vi.fn()
    ErrorUtils.setGlobalHandler(handler)
    const guarded = ErrorUtils.guard(() => {
      throw new Error("inside guard")
    })
    expect(guarded).not.toBeNull()
    expect(guarded?.()).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("does not overwrite an existing ErrorUtils (Metro's own error-guard.js)", () => {
    const existing = { setGlobalHandler: vi.fn() }
    g.ErrorUtils = existing
    installErrorUtilsGlobal()
    expect(g.ErrorUtils).toBe(existing)
  })
})
