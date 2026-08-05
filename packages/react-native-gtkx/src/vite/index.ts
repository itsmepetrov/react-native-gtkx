// react-native-gtkx/vite — makes a gtkx project React Native compatible.
// The gtkx CLI (dev and build) starts vite with an inline config that never
// sets `configFile: false`, so vite picks up the project's vite.config.ts
// from the root and merges it beneath the CLI config; this preset plugs in
// there as a single plugin.
//
// vite loads the config's imported packages with BARE Node, so this subpath
// (like ./metro and ./runner) must not contain EXTENSIONLESS relative imports
// — the pure resolution helpers live here rather than in a sibling module,
// and the one import that does cross a file boundary spells out its `.js`.
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, extname, isAbsolute, resolve } from "node:path"
import type { Plugin } from "vite"
import {
  applyAliases,
  compileAliases,
  DEFAULT_ALIAS_TABLE,
  type AliasOverrides,
} from "../aliases/index.js"

// Re-exported so an app configuring `aliases` never has to reach past the
// preset subpath it already imports.
export {
  CONFIGURABLE_ALIASES,
  DEFAULT_ALIASES,
  PLATFORM_ALIAS,
} from "../aliases/index.js"
export type {
  AliasOverride,
  AliasOverrides,
  AliasPattern,
  AliasTable,
  CompiledAlias,
} from "../aliases/index.js"

// --- pure resolution logic (unit-tested directly) -----------------------

/** Options shared by the preset factory and the pure resolver helpers. */
export type PlatformResolutionOptions = {
  /** Platform suffix priority, most specific first. Default: ["linux", "native"]. */
  platforms?: readonly string[]
  /** Source extensions tried for every platform suffix. Default: ["tsx", "ts", "jsx", "js"]. */
  extensions?: readonly string[]
}

/** Predicate the plugin injects as fs.existsSync; tests inject fakes. */
export type FileExists = (filePath: string) => boolean

export const DEFAULT_PLATFORMS: readonly string[] = ["linux", "native"]
export const DEFAULT_EXTENSIONS: readonly string[] = ["tsx", "ts", "jsx", "js"]

const REACT_NATIVE_GTKX = "react-native-gtkx"

/**
 * Applies the DEFAULT alias table (../aliases/index.ts) to one specifier:
 * `react-native` and its subpaths onto `react-native-gtkx`, and the five
 * package substitutions onto their compat subpaths. Returns null for every
 * other specifier, including `react-native-gtkx` itself.
 *
 * Exported for tests and for apps driving vite by hand. The plugin does NOT
 * call it — the plugin resolves through the table its own `aliases` option
 * produced, so an app's deltas apply.
 */
export const rewriteReactNativeImport = (source: string): string | null =>
  applyAliases(DEFAULT_ALIAS_TABLE, source)

/** Splits a vite specifier into its path part and its `?query` suffix. */
export const splitQuery = (
  source: string,
): { specifier: string; query: string } => {
  const index = source.indexOf("?")
  if (index === -1) {
    return { specifier: source, query: "" }
  }
  return { specifier: source.slice(0, index), query: source.slice(index) }
}

const isRelative = (specifier: string): boolean =>
  specifier.startsWith("./") || specifier.startsWith("../")

/**
 * Ordered platform suffixes, platform-major: every extension of the first
 * platform is tried before any extension of the next one
 * (`.linux.tsx`, `.linux.ts`, …, `.native.tsx`, …).
 */
export const platformSuffixes = (
  options: PlatformResolutionOptions = {},
): string[] => {
  const platforms = options.platforms ?? DEFAULT_PLATFORMS
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS
  return platforms.flatMap((platform) =>
    extensions.map((extension) => `.${platform}.${extension}`),
  )
}

/**
 * Candidate file paths for an extensionless base path, in priority order:
 * direct platform files first, then platform index files of a directory —
 * mirroring Metro, which exhausts file resolution before directory resolution.
 * The base file itself is not a candidate: when no platform file exists the
 * plugin bails out and the default resolver picks the base module.
 */
export const platformCandidates = (
  base: string,
  options: PlatformResolutionOptions = {},
): string[] => {
  const suffixes = platformSuffixes(options)
  return [
    ...suffixes.map((suffix) => `${base}${suffix}`),
    ...suffixes.map((suffix) => `${base}/index${suffix}`),
  ]
}

// Source extensions Metro strips before trying platform variants: an
// import of "./useLinking.js" (the TS-ESM style react-navigation and most
// compiled RN libraries use) must still find useLinking.native.tsx /
// useLinking.native.js — Metro resolves the BASE name platform-first, the
// literal file is only the fallback.
const STRIPPABLE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"])

/**
 * Metro platform-extension resolution for a single import: relative (or
 * absolute) specifiers that are extensionless — or carry a strippable
 * source extension — try platform candidates first; the first existing
 * candidate wins; the `?query` suffix is carried over. Returns null when
 * the import is out of scope or no platform file exists, handing the
 * import back to the default resolver.
 */
export const resolvePlatformSpecifier = (
  source: string,
  importer: string | undefined,
  exists: FileExists,
  options: PlatformResolutionOptions = {},
): string | null => {
  if (importer === undefined || source.startsWith("\0")) {
    return null
  }
  const { specifier, query } = splitQuery(source)
  if (!isRelative(specifier) && !isAbsolute(specifier)) {
    return null
  }
  const extension = extname(specifier)
  if (extension !== "" && !STRIPPABLE_EXTENSIONS.has(extension)) {
    return null
  }
  const withExtension = isAbsolute(specifier)
    ? specifier
    : resolve(dirname(splitQuery(importer).specifier), specifier)
  const base =
    extension === "" ? withExtension : withExtension.slice(0, -extension.length)
  for (const candidate of platformCandidates(base, options)) {
    if (exists(candidate)) {
      return candidate + query
    }
  }
  return null
}

// The bridge's Adw probe (gtkx/bridge/adw.ts) needs to know, AT BUILD TIME,
// whether this app's codegen store actually generated Adwaita bindings —
// see the epic's own regression notes (.claude/epics/adw-optional/006). A
// runtime-only check (a bare specifier assembled from string parts, so
// Rollup's build-time graph walk never reaches it) is invisible to the
// STATIC machinery every other gtkx import gets for free: `resolve.dedupe`
// (RC4-WORKAROUND(runtime-dedupe) above) and `gtkx build`'s own asset
// pipeline for the native addon (`@gtkx/cli`'s `gtkx:native` plugin, which
// rewrites every STATICALLY reachable `@gtkx/native` import onto the single
// `dist/gtkx.node` it emits) both only ever see specifiers Rollup's graph
// walk actually visits. A second, independently-resolved copy of the native
// addon double-initializes the gtkx runtime and aborts the process
// (`g_log_set_writer_func() called multiple times`) — the exact failure
// `runtime-dedupe` exists for, reached through a path dedupe cannot see.
//
// The fix: make the specifier a literal wherever Adw genuinely exists, so
// it gets the SAME static treatment as every other gtkx import — and prune
// it entirely wherever it does not, so `gtkx:undeclared-library` never
// throws on the plain-GTK profile. `__GTKX_ADW_AVAILABLE__` is that lever:
// a `define`d boolean CONSTANT (like `__DEV__` above), true only when this
// app's OWN codegen store actually has an "adw" entry. The bridge guards
// its probe on it; when the guard folds to a literal `false`, esbuild's
// dead-code elimination removes the whole probe body — literal specifiers
// and all — before Rollup's build ever walks the module graph, so the
// undeclared-library plugin never sees them either.
//
// require.resolve, not a static/dynamic import: this file is a vite CONFIG
// module (not part of the app's own bundle), so nothing here is subject to
// the eslint bridge fence or Rollup's build-time graph at all — it is a
// plain Node path lookup, run once while vite starts, mirroring exactly
// what `gtkx:undeclared-library`'s own resolveId does with `this.resolve`.
const hasAdwStore = (root: string): boolean => {
  try {
    createRequire(resolve(root, "package.json")).resolve(
      ["@gtkx", "gi", "adw"].join("/"),
    )
    return true
  } catch {
    return false
  }
}

// The two raw specifiers every Adw-dependent file in the bridge imports as a
// LITERAL (gtkx/bridge/adw.ts's own probe, gtkx/bridge/adw-namespace.ts,
// gtkx/bridge/widgets.generated.adw.ts) — needed as literals so `gtkx
// build`'s real Rollup graph gives them the same static treatment as every
// other gtkx import (see the doc above and .claude/epics/adw-optional/006.md).
// That literal-ness has a cost `gtkx build` never pays but `gtkx dev` and
// vitest do: both run every file through Vite's SSR module runner, which
// resolves every import() call it can find in a file's text — including one
// inside a dead `if (__GTKX_ADW_AVAILABLE__ === false)` branch — as part of
// loading that FILE, before any of the file's own code (the runtime guard,
// the try/catch around it) ever executes. `esbuild`'s dead-code elimination
// is what makes the literal safe for `gtkx build`, and it is a real BUNDLE
// optimization, not something the dev server or vitest's request-based
// transform ever performs — so on a store with no "Adw-1" declared, every
// one of those three files failed to even LOAD (a raw "'./adw' is not
// exported" resolver error out of Vite's own builtin:vite-resolve, not any
// message this package writes), which took the ENTIRE package down with it:
// gtkx/bridge/adw.ts is an ordinary dependency of apis/host.gtkx.ts,
// components/app-registry.tsx and common/navigation-stack.tsx, so nothing
// that reaches any of those — which is most of the surface — could load
// either. Found writing .claude/epics/adw-optional/005.md's own guard
// tests: spike/plain-gtk's PRE-EXISTING alert/appearance GTK tests (003.md,
// 004.md) failed the exact same way.
//
// Fixed the same way `gtkx:undeclared-library` itself is a resolveId hook,
// not a source change: intercept these two specifiers HERE, before Vite's
// own resolver (or gtkx's) ever sees them, whenever this app's store
// genuinely lacks Adw — resolving them to a tiny virtual module that THROWS
// ONLY WHEN ACTUALLY EVALUATED (i.e. lazily, exactly when something really
// awaits the dynamic import, or — for the two eager importers above — when
// something actually loads react-native-gtkx/adw). That is late enough for
// gtkx/bridge/adw.ts's own `try { ... } catch { return null }` to catch it
// as a genuine rejected promise, same as it always could for a specifier
// Node's own loader could not find; for the two EAGER importers, it turns
// what used to be a generic third-party resolver error into this package's
// own named, actionable throw (the ONE message text below, since neither
// eager importer has a call-site "feature" name available to it the way
// requireAdwGi/requireAdwJsx's callers do — see gtkx/bridge/adw.ts). When
// the store DOES have Adw, `hasAdwStore` is true and this hook falls
// through to real resolution, unchanged: `gtkx build`'s dedupe and native-
// asset rewrite still see a real, literal specifier.
const ADW_ONLY_SPECIFIERS = new Set(["@gtkx/gi/adw", "@gtkx/jsx/adw"])
const ADW_UNAVAILABLE_PREFIX = "\0gtkx-adw-unavailable:"
const adwUnavailableMessage = (specifier: string): string =>
  `[react-native-gtkx] "${specifier}" requires "Adw-1" in this app's ` +
  "gtkx.config.ts `libraries` — see docs/api.md (the plain-GTK profile) " +
  "for what needs Adw unconditionally and what falls back without it."

// --- the vite plugin ----------------------------------------------------

export type ReactNativeGtkxOptions = PlatformResolutionOptions & {
  /**
   * Deltas over the preset's package aliases, keyed by package name — a
   * string target, a `{ pattern, replace }` rule, or `false` to drop one of
   * ours so the real package loads. Identical semantics to the Metro
   * preset's option of the same name: both compile the same table.
   * Invalid entries throw here, while the config is being read.
   */
  aliases?: AliasOverrides
}

/**
 * Vite plugin: aliases `react-native` (and subpaths) to `react-native-gtkx`
 * and resolves Metro-style platform extensions
 * (`.linux.tsx` → `.native.tsx` → base) for extensionless imports.
 */
export const reactNativeGtkx = (
  options: ReactNativeGtkxOptions = {},
): Plugin => {
  // Throws on an unknown key, an overlapping pattern or an attempt to remove
  // the platform alias — at config load, naming what is valid.
  const aliases = compileAliases(options.aliases)
  return {
    name: "react-native-gtkx:preset",
    // Before vite's own resolver and the gtkx CLI plugins: the alias must win
    // over node resolution and platform files must win over the base file.
    enforce: "pre",

    config: (_config, env) => ({
      // `__DEV__` is part of the react-native runtime contract, not a Metro
      // detail: RN's own modules branch on it and so does every library
      // written against them (`@gorhom/bottom-sheet`'s logger and four of its
      // components read it at module scope). The Metro path gets it from the
      // app's stock RN preset; nothing supplied it on the vite path, so a
      // library that reads it crashed the bundle at startup with
      // "ReferenceError: __DEV__ is not defined" — found by building
      // spike/core-exports rather than by reading anything.
      //
      // vite's mode is the honest source: `gtkx dev` builds in development,
      // `gtkx build` in production, which is exactly the distinction RN draws.
      define: {
        __DEV__: JSON.stringify(env.mode !== "production"),
        // See hasAdwStore's doc above — process.cwd(), not _config.root:
        // `gtkx dev`/`gtkx build` always run from the app's own directory
        // (root defaults there too), and this must be resolvable before the
        // rest of the merged config is settled.
        __GTKX_ADW_AVAILABLE__: JSON.stringify(hasAdwStore(process.cwd())),
      },
      ssr: {
        // `gtkx dev` runs vite with ssr.external: true, which would hand
        // react-native-gtkx straight to node. Keep the package inside the
        // vite pipeline; noExternal wins over external: true.
        //
        // "react-native" must be listed too: with ssr.external: true vite
        // externalizes a bare import BEFORE the plugin pipeline whenever the
        // package resolves natively — and the real react-native (a Flow
        // codebase Node cannot parse) exists in RN monorepos. noExternal
        // forces the full plugin resolution, where the alias rewrites the
        // import to react-native-gtkx.
        // "react-native-reanimated" for the same reason as "react-native": an
        // app that also ships iOS/Android keeps the real package installed, it
        // resolves natively, and ssr.external: true would hand Node a codebase
        // built around a Babel plugin and a worklet runtime before the alias
        // ever gets a chance to rewrite the import.
        // "react-native-worklets" is the same case one package over — it is
        // where that worklet runtime actually lives since Reanimated 4.
        //
        // The rule those are instances of, stated once so the next alias does
        // not have to rediscover it: EVERY package name in the alias table must
        // be listed here. An alias is a resolveId hook, and a bare specifier
        // that vite externalizes never reaches one — so on the dev path the
        // alias silently loses to whatever is installed under the real name.
        // That is not hypothetical: an app that also ships iOS and Android has
        // all of them in node_modules, which is the case the alias exists to
        // serve. `react-native-gesture-handler` proved it — this list once held
        // three of the six names, its real package loaded, and it failed on an
        // extensionless internal import Node cannot resolve (found by running
        // the gallery's upstream-libraries section, which installs it).
        //
        // So the list is DERIVED rather than written out: it is exactly the
        // table's package names, and a name can no longer go missing from one
        // of the two places it has to appear.
        //
        // `aliases.names` includes the packages an app turned OFF with `false`,
        // deliberately. Dropping an alias means the REAL package loads, and the
        // real package imports `react-native` at module scope — an import that
        // only reaches the platform alias if Node never gets the package first.
        // Un-aliasing a package is therefore a reason to keep it inside the
        // pipeline, not a reason to let it out.
        noExternal: [
          REACT_NATIVE_GTKX,
          ...aliases.names,
          // @react-navigation is not aliased, but must go through the pipeline
          // too: it imports `react-native`, and an externalized copy resolves
          // that to the real Flow package (SyntaxError: Unexpected token
          // 'typeof') instead of our alias. Only bites on the dev path — a
          // production build inlines everything anyway.
          /^@react-navigation\//,
        ],
      },
      resolve: {
        // RC4-WORKAROUND(runtime-dedupe): see docs/gtkx-rc4-notes.md
        // The gtkx runtime and react are single-instance hosts: when the app
        // and react-native-gtkx resolve them from different node_modules
        // (file:-installed package, nested installs), two bundled copies
        // double-init the runtime and GLib aborts. dedupe pins every copy to
        // the project's own resolution.
        dedupe: [
          "@gtkx/css",
          "@gtkx/gi",
          "@gtkx/jsx",
          "@gtkx/native",
          "@gtkx/react",
          "@gtkx/runtime",
          // react-navigation is context-based: two bundled copies of core
          // fail with "couldn't find a navigation context".
          "@react-navigation/core",
          "@react-navigation/native",
          "react",
        ],
      },
      build: {
        rolldownOptions: {
          output: {
            // A literal, code-split dynamic import (the Adw seam,
            // gtkx/bridge/adw.ts — see its own doc and 006 above) lands its
            // chunk under the Rolldown default `assets/[name]-[hash].js`
            // UNLESS told otherwise. `@gtkx/cli`'s own `gtkx:native` plugin
            // rewrites every reachable `@gtkx/native` import into
            // `require("./gtkx.node")` — a path RELATIVE TO WHATEVER FILE
            // THE REWRITE LANDS IN, correct only when that file sits next to
            // the emitted `dist/gtkx.node` asset. The entry chunk is pinned
            // there already (`entryFileNames: "bundle.js"`, set by
            // `@gtkx/cli`'s own builder); a chunk placed one level down in
            // `assets/` breaks the SAME relative path
            // ("Cannot find module './gtkx.node'" — reproduced building
            // examples/gallery with the Adw seam's dynamic import made
            // literal). Keeping every chunk in `dist/` alongside the entry
            // and the addon sidesteps the mismatch instead of guessing at
            // gtkx's own relative-path assumption.
            chunkFileNames: "[name]-[hash].js",
          },
        },
      },
    }),

    async resolveId(source, importer) {
      // See ADW_ONLY_SPECIFIERS' own doc above: on a store with no "Adw-1",
      // resolving either of these for real fails the whole file that
      // imports them, before that file's own code (a runtime guard, a
      // try/catch) ever runs. Checked first, ahead of the alias table below
      // (neither specifier is in it).
      if (ADW_ONLY_SPECIFIERS.has(source) && !hasAdwStore(process.cwd())) {
        return ADW_UNAVAILABLE_PREFIX + source
      }
      // The app's table, not the default one: a package dropped with `false`
      // falls through to vite's own resolution and the real package loads.
      const aliased = applyAliases(aliases, source)
      if (aliased !== null) {
        const resolved = await this.resolve(aliased, importer, {
          skipSelf: true,
        })
        return resolved ?? aliased
      }
      return resolvePlatformSpecifier(source, importer, existsSync, options)
    },

    load(id) {
      if (!id.startsWith(ADW_UNAVAILABLE_PREFIX)) {
        return null
      }
      const specifier = id.slice(ADW_UNAVAILABLE_PREFIX.length)
      return `throw new Error(${JSON.stringify(adwUnavailableMessage(specifier))})`
    },
  }
}

export default reactNativeGtkx
