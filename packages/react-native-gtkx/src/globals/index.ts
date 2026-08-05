// The global-environment parity seam: values react-native installs at
// startup (Libraries/Core/setUp*.js, plus @react-native/js-polyfills, which
// every Metro RN bundle carries unconditionally) that this platform's own
// runtime — Node — does not provide natively. Both toolchains resolve
// `react-native` to this package (see ../aliases/index.ts), and ./install.ts
// calls every installer below once from the top of ../index.ts, so they run
// before any app code on the vite dev path AND the Metro/run-linux host
// alike — the one place both toolchains share. A later
// requestAnimationFrame/cancelAnimationFrame install belongs in this same
// file, next to these, not in a second module.
//
// Each install is idempotent and guards on the global already existing —
// exactly RN's own polyfillGlobal discipline
// (Libraries/Utilities/PolyfillFunctions.js) — so calling an installer
// twice, or a global already supplied by the toolchain (Metro's
// error-guard.js beats us to ErrorUtils), is a no-op rather than a clobber.
//
// What is deliberately NOT installed here — XMLHttpRequest, FileReader,
// RN-shaped FormData file entries — is documented in docs/api.md; Node
// already provides fetch/Blob/File/FormData/URL/AbortController/
// structuredClone/TextEncoder/atob-btoa/performance/crypto natively, with
// RN-equivalent behaviour for the pure-JS surface these APIs expose.
//
// No import from ../apis/index (the gtkx bridge) on purpose: unit tests
// import these installers directly, the same way ../apis/*'s create*
// factories are tested with a mock host instead of the wired singletons.
// The one installer that needs a real dependency (installAlertGlobal needs
// Alert.alert) takes it as a parameter instead — ./install.ts supplies the
// real one.

type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number }
type RequestIdleCallbackOptions = { timeout?: number }
type IdleCallbackHandle = ReturnType<typeof setTimeout>
type ErrorHandler = (error: unknown, isFatal: boolean) => void

const hasGlobal = (name: string): boolean =>
  typeof (globalThis as Record<string, unknown>)[name] !== "undefined"

const setGlobal = (name: string, value: unknown): void => {
  ;(globalThis as Record<string, unknown>)[name] = value
}

/**
 * The very first thing react-native's own setup chain does
 * (Libraries/Core/setUpGlobals.js, run before anything else in
 * InitializeCore): `global.window = global` and `global.self = global`.
 * Node has neither. This exists for the same reason RN sets it on a
 * platform with no DOM either — an isomorphic library's
 * `typeof window !== "undefined"` check (often used to mean "not a
 * server/SSR context, safe to run browser-shaped init") should read the
 * same way here as on any other RN platform.
 */
export const installWindowAndSelfGlobals = (): void => {
  if (!hasGlobal("window")) {
    setGlobal("window", globalThis)
  }
  if (!hasGlobal("self")) {
    setGlobal("self", globalThis)
  }
}

/**
 * `navigator.product === "ReactNative"` is the ecosystem's standard
 * environment-detection idiom (react-native's own
 * Libraries/Core/setUpNavigator.js). Node >= 21 already ships a minimal
 * `navigator` (userAgent only, no `product`), so this mirrors RN's own
 * fallback exactly rather than assuming a bare object needs creating.
 */
export const installNavigatorProductGlobal = (): void => {
  const nav = (globalThis as Record<string, unknown>).navigator as
    Record<string, unknown> | undefined
  if (nav === undefined) {
    setGlobal("navigator", { product: "ReactNative" })
    return
  }
  if (nav.product !== "ReactNative") {
    Object.defineProperty(nav, "product", {
      value: "ReactNative",
      writable: true,
      configurable: true,
      enumerable: true,
    })
  }
}

/**
 * RN's real requestIdleCallback (Libraries/Core/setUpTimers.js) is a
 * TurboModule with true native idle scheduling. Node has none — this is
 * the standard web-fallback shape (the shape every "requestidlecallback
 * polyfill" package on npm uses): fire on the next macrotask, report a
 * fixed 50ms budget, never report a timeout. Good enough for "runs off
 * this tick, eventually" — not a scheduling primitive. See docs/api.md.
 */
export const installIdleCallbackGlobals = (): void => {
  if (!hasGlobal("requestIdleCallback")) {
    setGlobal(
      "requestIdleCallback",
      (
        callback: (deadline: IdleDeadline) => void,
        options?: RequestIdleCallbackOptions,
      ): IdleCallbackHandle => {
        const start = Date.now()
        return setTimeout(() => {
          callback({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
          })
        }, options?.timeout ?? 1)
      },
    )
  }
  if (!hasGlobal("cancelIdleCallback")) {
    setGlobal("cancelIdleCallback", (handle: IdleCallbackHandle): void => {
      clearTimeout(handle)
    })
  }
}

/**
 * RN's global.alert (Libraries/Core/setUpAlert.js) forwards to
 * Alert.alert('Alert', text). Dependency-injected so unit tests exercise it
 * without pulling in the gtkx bridge (see ../apis/index.ts) — installGlobals
 * below does the real wiring.
 */
export const installAlertGlobal = (
  alert: (title: string, message?: string) => void,
): void => {
  if (hasGlobal("alert")) {
    return
  }
  setGlobal("alert", (text: unknown): void => {
    alert("Alert", String(text))
  })
}

/**
 * RN's own setUpErrorHandling.js requires `global.ErrorUtils` to already
 * exist — on a real RN app it does, installed by @react-native/js-polyfills'
 * error-guard.js, which @react-native/metro-config's getDefaultConfig
 * prepends to EVERY Metro bundle unconditionally (independent of, and not
 * disabled by, this platform's own `getModulesRunBeforeMainModule: () =>
 * []`). Confirmed empirically (rn-globals-audit): the Metro/run-linux host
 * already has ErrorUtils, the vite path does not — this closes that gap so
 * both toolchains agree. A faithful port of the real polyfill: a default
 * handler that rethrows, exactly react-native's un-hooked behaviour.
 */
export const installErrorUtilsGlobal = (): void => {
  if (hasGlobal("ErrorUtils")) {
    return
  }
  let inGuard = 0
  let globalHandler: ErrorHandler = (error) => {
    throw error
  }
  // Mirrors react-native's own loose `Fn<Args, Return> = (...Args) => Return`
  // (Libraries/vendor/core/ErrorUtils.js): a guard wraps ANY function.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyFn = (...args: any[]) => unknown
  const ErrorUtils = {
    setGlobalHandler(handler: ErrorHandler): void {
      globalHandler = handler
    },
    getGlobalHandler(): ErrorHandler {
      return globalHandler
    },
    reportError(error: unknown): void {
      globalHandler(error, false)
    },
    reportFatalError(error: unknown): void {
      globalHandler(error, true)
    },
    applyWithGuard<TFn extends AnyFn>(
      fn: TFn,
      context?: unknown,
      args?: Parameters<TFn>,
    ): ReturnType<TFn> | null {
      try {
        inGuard += 1
        return fn.apply(context, args ?? []) as ReturnType<TFn>
      } catch (error) {
        ErrorUtils.reportError(error)
        return null
      } finally {
        inGuard -= 1
      }
    },
    applyWithGuardIfNeeded<TFn extends AnyFn>(
      fn: TFn,
      context?: unknown,
      args?: Parameters<TFn>,
    ): ReturnType<TFn> | null {
      if (ErrorUtils.inGuard()) {
        return fn.apply(context, args ?? []) as ReturnType<TFn>
      }
      return ErrorUtils.applyWithGuard(fn, context, args)
    },
    inGuard(): boolean {
      return inGuard > 0
    },
    // react-native's real `guard` also takes a debugging `name` label; this
    // port has no crash reporter to hand it to, so it is dropped rather than
    // kept and ignored.
    guard<TFn extends AnyFn>(
      fn: TFn,
    ): ((...args: Parameters<TFn>) => ReturnType<TFn> | null) | null {
      if (typeof fn !== "function") {
        return null
      }
      return (...args: Parameters<TFn>): ReturnType<TFn> | null =>
        ErrorUtils.applyWithGuard(fn, undefined, args)
    },
  }
  setGlobal("ErrorUtils", ErrorUtils)
}
