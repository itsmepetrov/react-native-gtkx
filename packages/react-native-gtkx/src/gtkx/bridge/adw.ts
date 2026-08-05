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
// Both are therefore loaded through a COMPUTED specifier (never a string
// literal written directly into an import()/require() call) — the same
// reason @gtkx/codegen's own readBuiltinElements defers ITS optional
// imports with `/* @vite-ignore */`: a bundler's import-analysis
// (Vite/Rolldown here) resolves every specifier it can see textually in an
// import call, static or dynamic; a specifier assembled at runtime is
// invisible to it, so resolution is left to whatever is actually running
// this code.
//
// import(), not require(): tried require() first (a computed specifier
// behind createRequire()) because every call site this file backs —
// styleManager(), showAlert(), <AdwApplicationWindow>, <NavigationStackPage>
// — used its value SYNCHRONOUSLY before this seam existed. It resolves
// @gtkx/gi/adw fine (Node 24 does support require(esm)) but throws
// ERR_UNSUPPORTED_ESM_URL_SCHEME on @gtkx/jsx/adw specifically: gtkx's own
// JSX modules resolve a "virtual:gtkx-config" specifier internally, which
// only a bundler's loader (Vite, or the run-linux host's own
// module.registerHooks) understands — Node's plain module resolution does
// not know what a "virtual:" URL is. So this probes once, asynchronously,
// via top-level await — resolved long before any component can render or
// any Host function can be called (ES module evaluation of anything that
// imports this file, even transitively, does not complete until this
// settles), which is what lets every call site below stay synchronous.
import type * as AdwGi from "@gtkx/gi/adw"
import type * as AdwJsx from "@gtkx/jsx/adw"

// Assembled rather than written as one literal, so neither a text search
// nor a bundler's static import graph finds "@gtkx/gi/adw" or
// "@gtkx/jsx/adw" as a plain specifier anywhere in this file.
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

const probeViaDynamicImport = async (): Promise<AdwModules | null> => {
  try {
    const [gi, jsx] = await Promise.all([
      import(/* @vite-ignore */ GI_ADW),
      import(/* @vite-ignore */ JSX_ADW),
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
  "docs/api.md (the plain-GTK profile). Fallbacks for the plain profile are " +
  "a separate, later change; today this throws rather than silently doing " +
  "nothing."

/** The repo's loud named throw for a feature that reached for Adw and found
 *  none — every Adw-dependent call site in the seam funnels through this,
 *  so the message is the same whether it is Alert, Appearance, chrome:
 *  "content", NavigationStack or react-native-gtkx/adw itself asking. */
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
