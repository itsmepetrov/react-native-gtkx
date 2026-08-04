// Metro preset for the linux out-of-tree platform: wrap the app's Metro
// config with `withLinuxPlatform` and the standard RN toolchain bundles for
// `--platform linux`.
//
// What it does on top of RN defaults (validated by spike/rn-platform):
//
// 1. Adds "linux" to resolver.platforms (`.linux.tsx` extensions and
//    Platform.OS come along with it).
// 2. Redirects `react-native` (and subpaths) to `react-native-gtkx` — the
//    out-of-tree npmPackageName declaration alone does not alias imports
//    for `bundle`, the resolver has to — plus five package substitutions
//    for libraries whose real implementation cannot run here. The rules
//    are data, shared with the vite preset: see ../aliases/index.ts.
// 3. EXTERNALIZES host-side singletons. Unlike react-native-windows, whose
//    native side lives outside the JS bundle by construction, our "native"
//    is Node modules with NAPI bindings (@gtkx/*) plus yoga-layout's WASM —
//    Metro cannot bundle those. react (and its jsx runtimes) must also stay
//    host-side: the reconciler inside @gtkx/react and the app have to share
//    one React instance. Every external resolves to a generated proxy that
//    reads the real module from global.__hostModules — the run-linux host
//    injects them before executing the bundle.
// 4. Proxies Node builtins through the host's require: apps on this
//    platform may use the whole Node API, it is a platform feature.
// 5. Drops InitializeCore (RN's mobile environment polyfills): the runtime
//    environment IS Node, the host provides everything.
import { mkdirSync, writeFileSync } from "node:fs"
import { builtinModules, isBuiltin } from "node:module"
import { join } from "node:path"
// Explicit .js: bare Node loads metro.config.ts and does not guess extensions.
import {
  applyAliases,
  compileAliases,
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

/** Modules the run-linux host provides to the bundle at runtime. */
export const HOST_MODULE_EXTERNALS = [
  "@gtkx/css",
  "@gtkx/gi/adw",
  "@gtkx/gi/gdk",
  "@gtkx/gi/gio",
  "@gtkx/gi/glib",
  "@gtkx/gi/gobject",
  "@gtkx/gi/graphene",
  "@gtkx/gi/gsk",
  "@gtkx/gi/gtk",
  "@gtkx/gi/pango",
  "@gtkx/jsx/adw",
  "@gtkx/jsx/gio",
  "@gtkx/jsx/gtk",
  "@gtkx/react",
  "@gtkx/react/internal",
  "@gtkx/runtime",
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "yoga-layout",
]

// Present in the codegen store only when the app's gtkx.config.ts declares
// "Adw-1" (see .claude/epics/adw-optional/001.md — the plain-GTK profile).
// Still generated a proxy unconditionally, same as every other external
// above (so an app that later adds "Adw-1" needs no Metro config change) —
// but the runner (../runner/host.ts, ../runner/host-dev.ts) must not treat
// EITHER one failing to load as fatal the way it does for the rest of this
// list: that failure is the expected, normal shape of a plain-GTK app, not
// a broken install.
export const OPTIONAL_HOST_MODULE_EXTERNALS = new Set<string>([
  "@gtkx/gi/adw",
  "@gtkx/jsx/adw",
])

export const LINUX_PLATFORM = "linux"

// Structural slices of Metro's config/resolution types: Metro is the app's
// dependency, not ours — depending on its types here would pin versions.
export type MetroResolutionContext = {
  resolveRequest: MetroResolver
}
export type MetroResolution = { type: string; filePath?: string }
export type MetroResolver = (
  context: MetroResolutionContext,
  moduleName: string,
  platform: string | null,
) => MetroResolution

export type MetroLikeConfig = {
  projectRoot?: string
  resolver?: {
    platforms?: readonly string[]
    resolveRequest?: MetroResolver | null
  }
  serializer?: {
    getModulesRunBeforeMainModule?: (entryFilePath: string) => string[]
  }
}

export type LinuxPlatformOptions = {
  /** Extra host-provided modules to keep out of the bundle. */
  externals?: readonly string[]
  /** Proxy directory override (default: node_modules/.react-native-gtkx). */
  proxyDir?: string
  /**
   * Deltas over the preset's package aliases, keyed by package name — a
   * string target, a `{ pattern, replace }` rule, or `false` to drop one of
   * ours so the real package loads. See ../aliases/index.ts and docs/api.md.
   * Invalid entries throw here, while the config is being read.
   */
  aliases?: AliasOverrides
}

const sanitize = (name: string): string => name.replace(/[@/:]/g, "_") + ".js"

const hostModuleProxy = (name: string): string =>
  // The run-linux host guarantees __hostModules before executing the bundle.
  `module.exports = global.__hostModules[${JSON.stringify(name)}]\n`

const builtinProxy = (name: string): string =>
  `module.exports = global.__hostRequire(${JSON.stringify(name)})\n`

// Every proxy is generated eagerly when the config loads: Metro crawls the
// file map before transforming, and files that appear mid-build lose the
// race ("Failed to get the SHA-1"). The builtin list is finite, so the
// whole proxy set can exist up front.
const generateProxies = (dir: string, externals: Set<string>): void => {
  mkdirSync(dir, { recursive: true })
  for (const name of externals) {
    writeFileSync(join(dir, sanitize(name)), hostModuleProxy(name))
  }
  for (const bare of builtinModules) {
    writeFileSync(join(dir, sanitize(bare)), builtinProxy(bare))
    writeFileSync(
      join(dir, sanitize(`node:${bare}`)),
      builtinProxy(`node:${bare}`),
    )
  }
}

export type LinuxPlatformConfig<T extends MetroLikeConfig> = T & {
  resolver: {
    platforms: string[]
    resolveRequest: MetroResolver
  }
  serializer: {
    getModulesRunBeforeMainModule: (entryFilePath: string) => string[]
  }
}

/**
 * Wraps a Metro config (RN's getDefaultConfig output) with everything the
 * linux platform needs. Composes with an existing custom resolveRequest —
 * non-linux platforms fall through to it untouched.
 */
export const withLinuxPlatform = <T extends MetroLikeConfig>(
  config: T,
  options: LinuxPlatformOptions = {},
): LinuxPlatformConfig<T> => {
  const externals = new Set([
    ...HOST_MODULE_EXTERNALS,
    ...(options.externals ?? []),
  ])
  const proxyDir =
    options.proxyDir ??
    join(
      config.projectRoot ?? process.cwd(),
      "node_modules",
      ".react-native-gtkx",
      "metro-externals",
    )
  generateProxies(proxyDir, externals)
  // Throws on an unknown key, an overlapping pattern or an attempt to remove
  // the platform alias — at config load, naming what is valid.
  const aliases = compileAliases(options.aliases)
  const previousResolve = config.resolver?.resolveRequest ?? null

  const fallback: MetroResolver = (context, moduleName, platform) =>
    previousResolve
      ? previousResolve(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform)

  const resolveRequest: MetroResolver = (context, moduleName, platform) => {
    if (platform !== LINUX_PLATFORM) {
      return fallback(context, moduleName, platform)
    }
    if (externals.has(moduleName) || isBuiltin(moduleName)) {
      return {
        type: "sourceFile",
        filePath: join(proxyDir, sanitize(moduleName)),
      }
    }
    // The five package substitutions plus the platform alias, from the table
    // both presets share (../aliases/index.ts). Each rule is anchored to its
    // package name and matches the exact name or a slash-prefixed subpath,
    // with the tail transplanted onto the target — the guard, not just the
    // order, is what keeps `react-native-reanimated-dnd` out of the
    // `react-native-reanimated` rule and the real, unrelated
    // `react-native-worklets-core` out of the `react-native-worklets` one.
    const aliased = applyAliases(aliases, moduleName)
    if (aliased !== null) {
      return fallback(context, aliased, platform)
    }
    return fallback(context, moduleName, platform)
  }

  // The cast: T may carry narrower resolver/serializer types than the ones
  // rebuilt here — the runtime shape is a strict superset of both.
  return {
    ...config,
    resolver: {
      ...config.resolver,
      platforms: [
        ...new Set([...(config.resolver?.platforms ?? []), LINUX_PLATFORM]),
      ],
      resolveRequest,
    },
    serializer: {
      ...config.serializer,
      // RN prepends InitializeCore (Hermes Promise, nativeLoggingHook
      // console...). Our runtime environment IS Node — nothing to
      // initialize inside the bundle.
      getModulesRunBeforeMainModule: () => [],
    },
  } as LinuxPlatformConfig<T>
}
