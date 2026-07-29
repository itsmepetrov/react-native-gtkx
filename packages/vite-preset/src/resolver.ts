// Pure resolution logic behind the vite plugin: alias matching for the
// react-native specifier and Metro-style platform extension candidates.
// Kept free of vite imports and side effects so it can be unit-tested directly.

import { dirname, extname, isAbsolute, resolve } from "node:path"

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

/**
 * Maps `react-native` (and its subpaths) to `react-native-gtkx`.
 * Returns null for every other specifier, including `react-native-gtkx`
 * itself and lookalikes such as `react-native-web`.
 */
export const rewriteReactNativeImport = (source: string): string | null => {
  if (source === REACT_NATIVE) {
    return REACT_NATIVE_GTKX
  }
  if (source.startsWith(`${REACT_NATIVE}/`)) {
    return `${REACT_NATIVE_GTKX}${source.slice(REACT_NATIVE.length)}`
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

/**
 * Metro platform-extension resolution for a single import:
 * only extensionless relative (or absolute) specifiers participate; the first
 * existing candidate wins; the `?query` suffix is carried over. Returns null
 * when the import is out of scope or no platform file exists, handing the
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
  if (extname(specifier) !== "") {
    return null
  }
  const base = isAbsolute(specifier)
    ? specifier
    : resolve(dirname(splitQuery(importer).specifier), specifier)
  for (const candidate of platformCandidates(base, options)) {
    if (exists(candidate)) {
      return candidate + query
    }
  }
  return null
}
