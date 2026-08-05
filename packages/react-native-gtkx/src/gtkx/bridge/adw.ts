// The ONLY module allowed to import @gtkx/gi/adw and @gtkx/jsx/adw — see
// .claude/epics/adw-optional/001.md. Everything the RN core needs lives in
// ./core instead, with zero Adw imports, so an app whose gtkx.config.ts
// declares `libraries: ["Gtk-4.0"]` alone (no "Adw-1") never reaches either
// specifier: a codegen store generated that way has no "./adw" entry in
// either package's `exports` map AT ALL (empirically verified: neither
// directory even exists on disk), so a STATIC import of either one fails
// the whole build — `gtkx build`'s own "gtkx:undeclared-library" vite
// plugin throws while resolving it, unconditionally, whether or not the
// import is ever reached at runtime.
//
// __GTKX_ADW_AVAILABLE__ (declared ambient just above probeViaDynamicImport
// below) is a build-time constant the vite preset injects (src/vite/index.ts,
// see its own doc for the full story — .claude/epics/adw-optional/006.md is
// the regression this exists to fix): true only when THIS app's codegen
// store actually has an
// "adw" entry. `probeViaDynamicImport` below guards on it and, only inside
// that guard, imports @gtkx/gi/adw and @gtkx/jsx/adw as LITERAL specifiers —
// deliberately, unlike the pre-006 version of this file, which hid them
// behind a runtime-assembled string. A hidden specifier is invisible to
// Rollup's build graph, which sounds like the safer choice, but it is ALSO
// invisible to everything that graph gives every OTHER gtkx import for
// free: `resolve.dedupe` (RC4-WORKAROUND(runtime-dedupe) in
// docs/gtkx-rc4-notes.md) and `gtkx build`'s own asset pipeline for the
// native addon (`@gtkx/cli`'s `gtkx:native` plugin, which rewrites every
// STATICALLY reachable `@gtkx/native` import onto the single `dist/gtkx.node`
// it emits) — a hidden specifier resolves a SECOND, independent copy from
// node_modules at runtime instead, and two distinct native addons
// double-initialize the gtkx runtime and abort the process
// (`g_log_set_writer_func() called multiple times`, proven with a core dump
// showing both `.node` files mapped into one process). A literal specifier
// gets the exact same static treatment as every other gtkx import; when the
// build-time constant folds to `false` instead, esbuild's dead-code
// elimination removes the whole guarded body — literal specifiers included —
// before Rollup's graph walk ever starts, so `gtkx:undeclared-library` never
// throws on the plain-GTK profile either.
//
// This also fixes the other half of the same regression: under `gtkx dev`'s
// SSR module runner, a hidden (`/* @vite-ignore */`, runtime-assembled)
// specifier was invisible to Vite's SSR import interception too, so the
// import ran as a raw Node `import()` instead — and Node's plain ESM loader
// has no idea what to do with the "virtual:gtkx-config" specifier
// @gtkx/jsx/adw resolves internally (`ERR_UNSUPPORTED_ESM_URL_SCHEME`,
// confirmed by instrumenting the catch below before this fix), so the probe
// always failed and Adw looked undeclared even with "Adw-1" in
// gtkx.config.ts. A literal specifier lets Vite's own ssrTransform wrap the
// call, routing it through the SAME plugin pipeline (noExternal, the
// `gtkx:config` virtual-module plugin) every other gtkx/jsx import already
// gets — no separate polyfill, no toolchain-specific branch.
//
// import(), not require(): tried require() first (a specifier behind
// createRequire()) because every call site this file backs — styleManager(),
// showAlert(), <AdwApplicationWindow>, <NavigationStackPage> — used its
// value SYNCHRONOUSLY before this seam existed. It resolves @gtkx/gi/adw
// fine (Node 24 does support require(esm)) but throws
// ERR_UNSUPPORTED_ESM_URL_SCHEME on @gtkx/jsx/adw specifically, for the same
// "virtual:gtkx-config" reason above. Fixed by probing via a top-level-await
// dynamic `import()` instead — resolved long before any component can
// render or any Host function can be called (ES module evaluation of
// anything that imports this file, even transitively, does not complete
// until this settles), which is what lets every call site below stay
// synchronous — with a synchronous fast path through `global.__hostModules`
// when running under the run-linux (Metro) host (which already resolved
// everything, including these two when present, before the bundle runs,
// and never reaches __GTKX_ADW_AVAILABLE__ at all — a vite `define`
// constant, meaningless to Metro's bundler).
import type * as AdwGi from "@gtkx/gi/adw"
import type * as AdwJsx from "@gtkx/jsx/adw"

// Assembled rather than written as one literal: used only as a lookup key
// into global.__hostModules (an object property read, not an import), which
// the run-linux host populates keyed by these exact strings
// (HOST_MODULE_EXTERNALS in src/metro/index.ts). Kept opaque to a plain text
// search for consistency with the rest of this file, not because anything
// would fail resolving it — fromHostModules never imports.
const GI_ADW = ["@gtkx", "gi", "adw"].join("/")
const JSX_ADW = ["@gtkx", "jsx", "adw"].join("/")

type AdwModules = {
  gi: typeof AdwGi
  jsx: typeof AdwJsx
}

type HostModulesGlobal = typeof globalThis & {
  __hostModules?: Record<string, unknown>
}

// The run-linux (Metro) host already resolved every external — including
// these two, when the app declared "Adw-1" — into global.__hostModules
// BEFORE the bundle ever runs (see src/runner/host.ts) — synchronously, as
// far as this module is concerned, and the authoritative answer on that
// toolchain: reading it directly is both correct and avoids a second,
// redundant dynamic import attempt Metro's bundler cannot serve anyway
// (no "virtual:gtkx-config" loader hook outside Vite's own pipeline).
// Returns undefined (not false) when there is no host indirection in play
// at all — the vite dev/build toolchain, where every spike and example in
// this repo runs — so the caller knows to fall through to a real probe.
const fromHostModules = (): AdwModules | null | undefined => {
  const hostModules = (globalThis as HostModulesGlobal).__hostModules
  if (!hostModules) {
    return undefined
  }
  const gi = hostModules[GI_ADW]
  const jsx = hostModules[JSX_ADW]
  return gi && jsx
    ? { gi: gi as typeof AdwGi, jsx: jsx as typeof AdwJsx }
    : null
}

// Skips the probe outright when the vite preset has POSITIVELY told us Adw
// is not in this app's codegen store (see the module doc above for why a
// literal specifier below needs this guard to exist at all). `typeof`, not
// a direct reference: safe on any toolchain that never defines the constant
// (vitest, a consumer not using our preset) — reads as "undefined", so the
// guard is skipped and the probe runs for real, same as before this file
// started folding it. Only an explicit `false` short-circuits.
declare const __GTKX_ADW_AVAILABLE__: boolean | undefined
const probeViaDynamicImport = async (): Promise<AdwModules | null> => {
  if (
    typeof __GTKX_ADW_AVAILABLE__ !== "undefined" &&
    !__GTKX_ADW_AVAILABLE__
  ) {
    return null
  }
  try {
    const [gi, jsx] = await Promise.all([
      import("@gtkx/gi/adw"),
      import("@gtkx/jsx/adw"),
    ])
    return { gi: gi as typeof AdwGi, jsx: jsx as typeof AdwJsx }
  } catch {
    return null
  }
}

const hostModulesResult = fromHostModules()
// Only actually awaits (and only actually imports) when NOT running under
// the Metro host — see fromHostModules' doc.
const cached: AdwModules | null =
  hostModulesResult !== undefined
    ? hostModulesResult
    : await probeViaDynamicImport()

/**
 * True when this app's codegen store actually generated Adwaita bindings —
 * i.e. `"Adw-1"` is in this app's gtkx.config.ts `libraries`. Already
 * resolved by the time any application code can call this (see the module
 * doc above) — synchronous from every caller's point of view.
 */
export const adwAvailable = (): boolean => cached !== null

const NOT_AVAILABLE =
  ' requires "Adw-1" in this app\'s gtkx.config.ts `libraries` — see ' +
  "docs/api.md (the plain-GTK profile) for what needs Adw unconditionally " +
  "and what falls back without it."

/** The repo's loud named throw for a feature that reached for Adw and found
 *  none. Every Adw-dependent call site in the seam funnels through this, but
 *  most no longer reach it in practice: Alert, Appearance and chrome:
 *  "content" all check `adwAvailable()` themselves first and take a
 *  plain-GTK fallback instead (see .claude/epics/adw-optional/002.md,
 *  003.md, 004.md) — this throw is what is left for the features with no
 *  fallback at all (NavigationStack, react-native-gtkx/adw's own
 *  AdwBreakpoint family). */
const requireAdw = (feature: string): AdwModules => {
  if (!cached) {
    throw new Error(`[react-native-gtkx] ${feature}${NOT_AVAILABLE}`)
  }
  return cached
}

/** The real `@gtkx/gi/adw` namespace (enums, GObject classes — `Adw.StyleManager`,
 *  `Adw.ColorScheme`, `Adw.ResponseAppearance`, ...), or the loud throw above. */
export const requireAdwGi = (feature: string): typeof AdwGi =>
  requireAdw(feature).gi

/** The real `@gtkx/jsx/adw` namespace (raw JSX elements — `AdwApplicationWindow`,
 *  `AdwNavigationView`, `AdwNavigationPage`, ...), or the loud throw above. */
export const requireAdwJsx = (feature: string): typeof AdwJsx =>
  requireAdw(feature).jsx

// Type-only (erased at build — no runtime import, so this costs nothing on
// the plain profile): re-exported so a consumer like common/navigation-stack.tsx
// can spell `Ref<Adw.NavigationView | null>` without importing @gtkx/gi/adw
// itself, which the eslint fence (no @gtkx/* outside src/gtkx/bridge/**)
// would refuse anyway.
export type { AdwGi as Adw }

export type ColorScheme = "light" | "dark"

// Folded in from the pre-seam ./theme.ts: both are pure Adw, both were only
// ever called from apis/host.gtkx.ts, and keeping them as their own
// (formerly eagerly-imported) file would just move the eager `import * as
// Adw` problem one hop over instead of removing it.
export const styleManager = (): AdwGi.StyleManager =>
  requireAdwGi("Appearance").StyleManager.getDefault()

// The Appearance API subscribes to notify::dark on the style manager.
export const colorScheme = (): ColorScheme =>
  styleManager().getDark() ? "dark" : "light"
