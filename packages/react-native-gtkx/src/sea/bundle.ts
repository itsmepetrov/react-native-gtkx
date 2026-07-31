// Bundles a Metro-built react-native-gtkx app (main.jsbundle) into a
// single CJS file suitable for Node's --experimental-sea-config, undoing
// exactly the externalization HOST_MODULE_EXTERNALS performs at Metro
// build time.
//
// Design, and where this follows/diverges from gtkx's own tutorial
// (gtkx-org/gtkx examples/tutorial/scripts/bundle.ts and
// bundle-postject.ts — read before any of this was written):
//
// - Bundling mechanics (bundle → single minified CJS file) and the
//   SEA/postject pipeline itself (./assemble.ts) follow the tutorial
//   closely. The bundler is rolldown rather than the tutorial's esbuild —
//   NOT a preference: rolldown is vite's own engine (vite 8 depends on it
//   outright, esbuild is only an optional peer there), and vite is a hard
//   dependency of @gtkx/cli, which is a hard dependency of this package.
//   So rolldown is already installed for every consumer, and esbuild would
//   have been the one genuinely new bundler in the tree.
// - Native addon: the tutorial's shim assumes the addon file sits BESIDE
//   the built executable (require resolved from
//   dirname(process.execPath)). That is two files, not one — the actual
//   central design decision this epic exists to make — so this diverges:
//   the addon is embedded IN the artifact (as a SEA asset, or as a base64
//   literal for the --standalone .cjs) and extracted to a per-user cache
//   directory on first run. See ./native-shim.ts's header for the full
//   reasoning.
// - Metro's externals: the tutorial has no equivalent problem, its source
//   is already a single vite/rollup bundle. Metro deliberately
//   externalizes @gtkx/*, react and yoga-layout (../metro/index.ts,
//   HOST_MODULE_EXTERNALS) so main.jsbundle expects
//   globalThis.__hostModules/__hostRequire to exist before it runs (see
//   ../runner/host.ts). This module is a third host implementation
//   (host.ts and host-dev.ts are the other two — see host-dev.ts's header
//   for why they don't share code) that builds those globals from real,
//   STATICALLY imported modules — every name in HOST_MODULE_EXTERNALS
//   becomes a literal `import * as` statement in the generated entry — so
//   the bundler can inline them instead of the app needing a runtime
//   node_modules to dynamically load them from. gtkx.config.ts is also
//   resolved once here, at bundle time (see ./gtkx-config-module.ts).
//
// Not attempted here: the vite path. Investigated, not a drop-in of this
// same technique — see docs/getting-started.md's "Shipping an app"
// section for the concrete blocker found empirically while building this:
// the vite bundle loads the native addon through a DYNAMICALLY obtained
// require (`createRequire(import.meta.url)("./gtkx.node")`), which a
// bundler does not intercept the way it intercepts a static import
// (verified: the resolve hook never fires for it), and which is unlikely
// to resolve at all once running from inside a real SEA blob, where
// import.meta.url no longer points at a file with real siblings on disk.
import { mkdirSync, readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { rolldown } from "rolldown"
import { HOST_MODULE_EXTERNALS } from "../metro/index.js"
import {
  buildGtkxConfigModule,
  virtualConfigModulePlugin,
} from "./gtkx-config-module.js"
import {
  NATIVE_ASSET_KEY,
  nativeAddonShimPlugin,
  type NativeAddonSource,
} from "./native-shim.js"
import { reactAnchorPlugin } from "./react-anchor-plugin.js"

export type MetroSeaBundleOptions = {
  /** The app root — where gtkx.config.ts lives and package.json resolves
   * HOST_MODULE_EXTERNALS' bare specifiers (react, @gtkx/*, ...) from. */
  appRoot: string
  /** Path to the release jsbundle produced by `build-linux`. */
  jsbundlePath: string
  /** Where to write the bundled CJS entry (e.g. dist/bundle.cjs). */
  outFile: string
  /** Where the native addon's bytes come from at runtime — "sea-asset"
   * for a real single executable, "inline" for a self-contained .cjs run
   * by a system Node (default: "sea-asset"). */
  nativeAddonSource?: NativeAddonSource
}

export type NativeAddonAsset = {
  /** Absolute path to the platform's @gtkx/native-<platform>-<libc>.node
   * that npm installed for this machine. */
  path: string
  /** The SEA asset key it must be embedded under. */
  key: string
}

/**
 * Locates the ONE native addon file npm installed for this machine.
 * @gtkx/native picks exactly one optionalDependency per platform/libc at
 * install time (see @gtkx/native/index.js's NAPI-RS-generated loader) —
 * failing loudly on anything other than exactly one match matters here:
 * silently picking the wrong one would embed an addon for the wrong
 * architecture with no error until the app actually launches.
 */
export const resolveNativeAddon = (appRoot: string): NativeAddonAsset => {
  const appRequire = createRequire(join(appRoot, "package.json"))
  const nativePackageJson = appRequire.resolve("@gtkx/native/package.json")
  // .../node_modules/@gtkx/native/package.json -> .../node_modules/@gtkx
  const scopeDir = dirname(dirname(nativePackageJson))
  const candidates = readdirSync(scopeDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("native-"))
    .flatMap((entry) => {
      const dir = join(scopeDir, entry.name)
      return readdirSync(dir)
        .filter((file) => file.endsWith(".node"))
        .map((file) => join(dir, file))
    })
  const [first, ...rest] = candidates
  if (!first || rest.length > 0) {
    throw new Error(
      `expected exactly one @gtkx/native-*/*.node under ${scopeDir}, found ` +
        `${candidates.length} (${candidates.join(", ") || "none"}) — ` +
        "reinstall targeting a single platform.",
    )
  }
  return { path: first, key: NATIVE_ASSET_KEY }
}

/**
 * Builds the synthetic SEA entry source: every HOST_MODULE_EXTERNALS name
 * loaded through a dynamic `import()` (mirroring runner/host.ts's own
 * `load()`, which does the same against a real node_modules at runtime),
 * assembled into globalThis.__hostModules, then the jsbundle text executed
 * the same way host.ts does.
 *
 * Dynamic import, not static, throughout: a Node SEA's main script is
 * CommonJS only — confirmed empirically, Node 24 executes the embedded
 * main as CJS regardless of a "type": "module" field in sea-config.json
 * or an .mjs extension — and top-level await is a hard error under a "cjs"
 * output format REGARDLESS of whether the module is reached via a static
 * or dynamic import (the restriction is format-wide, not per-module —
 * verified: switching yoga-layout's static import to a dynamic one alone
 * did not clear the error). yoga-layout's own entry point has exactly this
 * top-level await (it loads its WASM binary asynchronously — see
 * node_modules/yoga-layout/dist/src/index.js: `const Yoga =
 * wrapAssembly(await loadYoga())` at module scope). The actual fix: import
 * "yoga-layout/load" instead, which exports the same `await`, just inside
 * an async FUNCTION (`export async function loadYoga()`), not at the
 * file's top level — bundleable, and awaited here like everything else.
 */
export const buildEntrySource = (jsbundlePath: string): string => {
  const jsbundleSource = readFileSync(jsbundlePath, "utf8")
  const loadLines = HOST_MODULE_EXTERNALS.map((name) => {
    if (name === "yoga-layout") {
      return [
        `  {`,
        `    const { loadYoga, ...rest } = await import("yoga-layout/load");`,
        `    hostModules["yoga-layout"] = __interopHostModule({ ...rest, default: await loadYoga() });`,
        `  }`,
      ].join("\n")
    }
    return `  hostModules[${JSON.stringify(name)}] = __interopHostModule(await import(${JSON.stringify(name)}));`
  })
  return [
    `async function __gtkxSeaMain() {`,
    // Mirrors runner/host.ts's `load()` interop: import() handles both ESM
    // and CJS, merge a `default` for Babel's default-import interop when
    // the module has none of its own.
    `  const __interopHostModule = (ns) => {`,
    `    const merged = Object.assign({ __esModule: true }, ns);`,
    `    if (!("default" in ns)) merged.default = ns;`,
    `    return merged;`,
    `  };`,
    `  const hostModules = {};`,
    ...loadLines,
    `  globalThis.__hostModules = hostModules;`,
    // Node builtin proxies resolve lazily through the host's own require —
    // real here, no createRequire indirection needed (see host.ts for why
    // it needs one: this file's import.meta.url is never used for
    // anything relative, only require() of bare/builtin specifiers).
    `  globalThis.__hostRequire = require;`,
    `  require("node:vm").runInThisContext(${JSON.stringify(jsbundleSource)}, { filename: ${JSON.stringify(jsbundlePath)} });`,
    `}`,
    `__gtkxSeaMain().catch((error) => { console.error(error); process.exitCode = 1; });`,
  ].join("\n")
}

/**
 * Produces `outFile`, a single CJS file with the jsbundle, its
 * HOST_MODULE_EXTERNALS and gtkx.config.ts's resolved values all inlined,
 * and the native addon import redirected to the SEA-asset extraction
 * shim. Returns the native addon that must be embedded as a SEA asset
 * under {@link NativeAddonAsset.key} for the result to run.
 */
export const bundleMetroSea = async (
  options: MetroSeaBundleOptions,
): Promise<NativeAddonAsset> => {
  const { appRoot, jsbundlePath, outFile } = options
  const nativeAddonSource = options.nativeAddonSource ?? "sea-asset"
  const configModuleSource = await buildGtkxConfigModule(appRoot)
  const nativeAddon = resolveNativeAddon(appRoot)
  const entrySource = buildEntrySource(jsbundlePath)

  mkdirSync(dirname(outFile), { recursive: true })

  // The entry is given a path inside appRoot that does not exist on disk,
  // rather than a `\0`-prefixed virtual id: every bare specifier it
  // imports (react, @gtkx/*, yoga-layout) must resolve from the app's own
  // node_modules, and a real directory is what makes that happen.
  const entryId = join(appRoot, "__gtkx-sea-entry.js")

  const bundle = await rolldown({
    input: entryId,
    cwd: appRoot,
    platform: "node",
    plugins: [
      {
        name: "gtkx-sea-entry",
        resolveId: (source) => (source === entryId ? entryId : null),
        load: (id) => (id === entryId ? entrySource : null),
      },
      reactAnchorPlugin(appRoot),
      nativeAddonShimPlugin({
        specifier: "@gtkx/native",
        appRoot,
        source: nativeAddonSource,
        assetKey: nativeAddon.key,
        addonBytes:
          nativeAddonSource === "inline"
            ? readFileSync(nativeAddon.path)
            : undefined,
      }),
      virtualConfigModulePlugin(configModuleSource, appRoot),
    ],
  })
  try {
    await bundle.write({
      file: outFile,
      format: "cjs",
      minify: true,
      // Every HOST_MODULE_EXTERNALS name is reached through a dynamic
      // import; without this each one becomes its own chunk and the
      // "single file" the whole build exists to produce is a directory.
      codeSplitting: false,
    })
  } finally {
    await bundle.close()
  }

  return nativeAddon
}
