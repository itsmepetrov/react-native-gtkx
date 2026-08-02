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
        // examples/upstream-libraries, which installs it).
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
        // RC3-WORKAROUND(runtime-dedupe): see docs/gtkx-rc3-notes.md
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
    }),

    async resolveId(source, importer) {
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
  }
}

export default reactNativeGtkx
