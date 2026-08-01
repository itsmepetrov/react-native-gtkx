// react-native-gtkx/vite — makes a gtkx project React Native compatible.
// The gtkx CLI (dev and build) starts vite with an inline config that never
// sets `configFile: false`, so vite picks up the project's vite.config.ts
// from the root and merges it beneath the CLI config; this preset plugs in
// there as a single plugin.
//
// Single self-contained file on purpose: vite loads the config's imported
// packages with BARE Node, so this subpath (like ./metro and ./runner) must
// not contain extensionless relative imports — the pure resolution helpers
// live here rather than in a sibling module.
import { existsSync } from "node:fs"
import { dirname, extname, isAbsolute, resolve } from "node:path"
import type { Plugin } from "vite"

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

const REACT_NATIVE = "react-native"
const REACT_NATIVE_GTKX = "react-native-gtkx"
const REACT_NATIVE_SVG = "react-native-svg"
const REACT_NATIVE_GTKX_SVG = "react-native-gtkx/svg"
const REANIMATED_DND = "react-native-reanimated-dnd"
const REACT_NATIVE_GTKX_DND = "react-native-gtkx/dnd"
const GESTURE_HANDLER = "react-native-gesture-handler"
const GTKX_GESTURE_HANDLER = "react-native-gtkx/gesture-handler"

/**
 * Maps `react-native` (and its subpaths) to `react-native-gtkx`,
 * `react-native-svg` to the `react-native-gtkx/svg` compat subpath (see
 * src/svg-compat/index.ts) and `react-native-reanimated-dnd` to
 * `react-native-gtkx/dnd` (see src/dnd/index.ts) — same rationale, same
 * exact-match-or-slash-prefix guard so a lookalike package name
 * (`react-native-svg-icons`, the same shape of trap `react-native-web` is
 * for the plain `react-native` case below) is never aliased by accident.
 * Returns null for every other specifier, including `react-native-gtkx`
 * itself.
 *
 * The drag-and-drop alias is load-bearing rather than convenient:
 * `react-native-reanimated-dnd` cannot run here at all, so without it every
 * app with drag-and-drop rewrites its imports to add a Linux build.
 */
export const rewriteReactNativeImport = (source: string): string | null => {
  if (source === REACT_NATIVE) {
    return REACT_NATIVE_GTKX
  }
  if (source.startsWith(`${REACT_NATIVE}/`)) {
    return `${REACT_NATIVE_GTKX}${source.slice(REACT_NATIVE.length)}`
  }
  if (source === REACT_NATIVE_SVG) {
    return REACT_NATIVE_GTKX_SVG
  }
  if (source.startsWith(`${REACT_NATIVE_SVG}/`)) {
    return `${REACT_NATIVE_GTKX_SVG}${source.slice(REACT_NATIVE_SVG.length)}`
  }
  if (source === REANIMATED_DND) {
    return REACT_NATIVE_GTKX_DND
  }
  if (source.startsWith(`${REANIMATED_DND}/`)) {
    return `${REACT_NATIVE_GTKX_DND}${source.slice(REANIMATED_DND.length)}`
  }
  if (source === GESTURE_HANDLER) {
    return GTKX_GESTURE_HANDLER
  }
  if (source.startsWith(`${GESTURE_HANDLER}/`)) {
    return `${GTKX_GESTURE_HANDLER}${source.slice(GESTURE_HANDLER.length)}`
  }
  return null
}

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

export type ReactNativeGtkxOptions = PlatformResolutionOptions

/**
 * Vite plugin: aliases `react-native` (and subpaths) to `react-native-gtkx`
 * and resolves Metro-style platform extensions
 * (`.linux.tsx` → `.native.tsx` → base) for extensionless imports.
 */
export const reactNativeGtkx = (
  options: ReactNativeGtkxOptions = {},
): Plugin => ({
  name: "react-native-gtkx:preset",
  // Before vite's own resolver and the gtkx CLI plugins: the alias must win
  // over node resolution and platform files must win over the base file.
  enforce: "pre",

  config: () => ({
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
      // @react-navigation must go through the pipeline too: it imports
      // "react-native", and an externalized copy resolves that to the real
      // Flow package (SyntaxError: Unexpected token 'typeof') instead of
      // our alias. Only bites on the dev path — a production build inlines
      // everything anyway.
      noExternal: ["react-native-gtkx", "react-native", /^@react-navigation\//],
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
    const aliased = rewriteReactNativeImport(source)
    if (aliased !== null) {
      const resolved = await this.resolve(aliased, importer, { skipSelf: true })
      return resolved ?? aliased
    }
    return resolvePlatformSpecifier(source, importer, existsSync, options)
  },
})

export default reactNativeGtkx
