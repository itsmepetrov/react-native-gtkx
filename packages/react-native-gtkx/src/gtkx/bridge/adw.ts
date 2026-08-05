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
// __GTKX_ADW_AVAILABLE__ (declared ambient just below) is a build-time
// constant the vite preset injects (src/vite/index.ts, see its own doc for
// the full story — .claude/epics/adw-optional/006.md is the regression this
// exists to fix): true only when THIS app's codegen store actually has an
// "adw" entry. The probe below guards on it and, only inside that guard,
// imports @gtkx/gi/adw and @gtkx/jsx/adw as LITERAL specifiers —
// deliberately, unlike a runtime-assembled string. A hidden specifier is
// invisible to Rollup's build graph, which sounds like the safer choice,
// but it is ALSO invisible to everything that graph gives every OTHER gtkx
// import for free: `resolve.dedupe` (RC4-WORKAROUND(runtime-dedupe) in
// docs/gtkx-rc4-notes.md) and `gtkx build`'s own asset pipeline for the
// native addon (`@gtkx/cli`'s `gtkx:native` plugin, which rewrites every
// STATICALLY reachable `@gtkx/native` import onto the single `dist/gtkx.node`
// it emits) — a hidden specifier resolves a SECOND, independent copy from
// node_modules at runtime instead, and two distinct native addons
// double-initialize the gtkx runtime and abort the process
// (`g_log_set_writer_func() called multiple times`, proven with a core dump
// showing both `.node` files mapped into one process). A literal specifier
// gets the exact same static treatment as every other gtkx import; when the
// build-time constant folds to `false` instead, dead-code elimination
// removes the whole guarded body — literal specifiers included — before
// Rollup's graph walk ever starts, so `gtkx:undeclared-library` never
// throws on the plain-GTK profile either.
//
// No module-scope await, anywhere — the one thing that actually changed
// here (.claude/epics/adw-optional/007-sea-tla.md): this file used to
// resolve Adw with a TOP-LEVEL AWAIT (both the #132 guarded literal imports
// and the fallback probe), so every call site below could stay synchronous
// without an explicit wait of its own. That broke `react-native
// build-linux` outright — reproduced empirically in the VM, WITH OR
// WITHOUT --sea/--standalone (all three share the same Metro `bundle()`
// call, `--dev false`): Metro's own minifier (metro-minify-terser, i.e.
// terser) parses each module's compiled factory as a plain SCRIPT, not an
// ES module — `await` is just an ordinary identifier there, not a keyword,
// so "await probeViaDynamicImport()" is a hard syntax error ("Unexpected
// token: name (probeViaDynamicImport)"), independent of the SEA/rolldown
// CJS-format restriction the task file also names (CJS has no TLA either —
// the same file would have failed a second time even past Metro).
//
// Tried and reverted: resolving gi through a synchronous `require()` (via
// `createRequire(import.meta.url)`) instead of a dynamic import — it does
// answer synchronously under vite build/dev and vitest, but
// `import.meta.url` is ITSELF ESM-only syntax, exactly like top-level
// await: Metro's minifier happened not to reject it at minify time (unlike
// `await`), but Node's own parser does, the moment the Metro/SEA host
// actually executes the bundle via `vm.runInThisContext` (which runs the
// whole bundle as a plain SCRIPT, not a module) — "SyntaxError: Cannot use
// 'import.meta' outside a module", reproduced building and running
// examples/hn-app's SEA artifact. Same class of bug as the TLA one this
// file exists to fix, so back to a dynamic import for both gi and jsx —
// their own literal specifiers, unlike ours, are genuinely fine either way
// since Metro/the SEA host never reach this branch at all (see
// fromHostModules below) and every other toolchain is real ESM.
//
// So: a single, ordinary (non-async, non-top-level-await) function starts
// BOTH imports together — Promise.all, exactly like the old probe — the
// moment this module itself finishes evaluating, fire-and-forget (no
// module-scope await to block on this time). No formal ordering guarantee
// versus the old TLA probe's, but starting it as early as this module can
// (not lazily, on the first actual `requireAdwJsx()`/`requireAdwGi()` call)
// gives it a real, if informal, chance to have already settled — verified
// against this package's own gtk test suite, including the one caller with
// the least slack of all: react-native-gtkx/adw's own `adw/index.ts` calls
// `requireAdwJsx()` eagerly, at ITS OWN module scope, the moment it is
// imported (immediately after this file). Under Vite's SSR module runner
// (dev and vitest both), every static import a transformed module has is
// itself an awaited call in that runner, cached or not — so `adw/index.ts`
// evaluating is always at least one module-boundary await after this
// file's own module body, including the Promise.all it starts, finished
// running. tests/gtk/bridge/auxiliary-elements.gtk.test.tsx (imports
// react-native-gtkx/adw) and tests/gtk/adw/* are all green under this.
//
// The Metro/SEA host fast path (fromHostModules, below) takes priority over
// all of this and never touches import() at all: `global.__hostModules` is
// already populated — both gi and jsx together, when present — before the
// run-linux host or the SEA entry's own async wrapper (src/sea/bundle.ts's
// `buildEntrySource`, itself already just an ordinary async FUNCTION, never
// a module-scope await) ever executes the bundle that reaches this file.
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
// redundant resolution attempt Metro's bundler cannot serve anyway (no
// "virtual:gtkx-config" loader hook outside Vite's own pipeline or the
// host's own module.registerHooks).
// Returns undefined (not false) when there is no host indirection in play
// at all — the vite dev/build toolchain, where every spike and example in
// this repo runs — so the caller knows to fall through to the real probe.
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

const hostModulesResult = fromHostModules()

// Skips the probe outright when the vite preset has POSITIVELY told us Adw
// is not in this app's codegen store (see the module doc above for why a
// literal specifier below needs this guard to exist at all). `typeof`, not
// a direct reference: safe on any toolchain that never defines the constant
// (a bare `vitest` "unit" project, or a consumer not using our preset) —
// reads as "undefined", so the guard is skipped and the probe runs for
// real. Only an explicit `false` short-circuits.
declare const __GTKX_ADW_AVAILABLE__: boolean | undefined

let cached: AdwModules | null | undefined

if (hostModulesResult !== undefined) {
  cached = hostModulesResult
} else if (
  typeof __GTKX_ADW_AVAILABLE__ !== "undefined" &&
  !__GTKX_ADW_AVAILABLE__
) {
  cached = null
} else {
  // Fire-and-forget — see the module doc above for why this can no longer
  // be a module-scope `await` and why starting it here, unconditionally,
  // still settles in time for every real caller.
  Promise.all([import("@gtkx/gi/adw"), import("@gtkx/jsx/adw")])
    .then(([gi, jsx]) => {
      cached = { gi: gi as typeof AdwGi, jsx: jsx as typeof AdwJsx }
    })
    .catch(() => {
      cached = null
    })
}

/**
 * True when this app's codegen store actually generated Adwaita bindings —
 * i.e. `"Adw-1"` is in this app's gtkx.config.ts `libraries`. Synchronous
 * from every caller's point of view on the Metro/SEA host and the
 * plain-GTK profile (both resolved above with nothing to await); on vite
 * build/dev and vitest this reads whatever the fire-and-forget probe above
 * has settled to by the time it is called — see the module doc for why
 * that is reliably "already settled" for every real call site in this
 * package, not a formal guarantee.
 */
export const adwAvailable = (): boolean =>
  cached !== null && cached !== undefined

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
