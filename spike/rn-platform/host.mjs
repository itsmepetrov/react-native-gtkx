// Node+GTK host: what the productized `run-linux` runner will do.
//
// 1. Load host-side singletons (@gtkx/*, react, yoga) and publish them on
//    global.__hostModules — the Metro bundle's externalized proxies read
//    from there.
// 2. Execute the Metro bundle. The entry itself calls
//    AppRegistry.runApplication (see index.js), which opens the GTK window;
//    the NAPI runtime keeps the process alive with the GLib main loop.
//
// Resolution invariant: react MUST be the exact instance the reconciler
// inside @gtkx/react sees, so 'react' is resolved FROM @gtkx/react's real
// location, and @gtkx/* are resolved from the react-native-gtkx package —
// not from this spike directory.
import { readFileSync, realpathSync } from "node:fs"
import { createRequire, registerHooks } from "node:module"
import { pathToFileURL } from "node:url"
import vm from "node:vm"

const packageRoot = realpathSync(
  new URL("./node_modules/react-native-gtkx", import.meta.url),
)
const fromPackage = createRequire(packageRoot + "/package.json")
const fromGtkxReact = createRequire(fromPackage.resolve("@gtkx/react"))

// @gtkx/react imports `virtual:gtkx-config` — in the vite path the gtkx CLI
// plugin serves it (JSX metadata re-export + resolved applicationId, see
// @gtkx/config renderConfigModule). Bare Node needs a loader hook doing the
// same. The fake file URL anchors inside the package so the re-exported
// bare specifier resolves through the normal node_modules walk.
const { loadConfig } = await import(
  pathToFileURL(fromPackage.resolve("@gtkx/config")).href
)
const gtkxConfig = await loadConfig(process.cwd())
const configModuleUrl = pathToFileURL(
  packageRoot + "/__virtual-gtkx-config.mjs",
).href
const configModuleSource = [
  `export * from "@gtkx/jsx/metadata";`,
  `export const applicationId = ${JSON.stringify(gtkxConfig.applicationId)};`,
].join("\n")
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "virtual:gtkx-config") {
      return { url: configModuleUrl, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url === configModuleUrl) {
      return { format: "module", source: configModuleSource, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

const resolveExternal = (name) =>
  name === "react" || name.startsWith("react/")
    ? fromGtkxReact.resolve(name)
    : fromPackage.resolve(name)

// import() handles both ESM and CJS; merge a `default` for Babel's
// default-import interop when the module has none of its own.
const load = async (name) => {
  const namespace = await import(pathToFileURL(resolveExternal(name)).href)
  const merged = { __esModule: true, ...namespace }
  if (!("default" in namespace)) {
    merged.default = namespace
  }
  return merged
}

const EXTERNALS = [
  "@gtkx/css",
  "@gtkx/gi/adw",
  "@gtkx/gi/gdk",
  "@gtkx/gi/gio",
  "@gtkx/gi/glib",
  "@gtkx/gi/graphene",
  "@gtkx/gi/gsk",
  "@gtkx/gi/gtk",
  "@gtkx/gi/pango",
  "@gtkx/jsx/gtk",
  "@gtkx/react",
  "@gtkx/runtime",
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "yoga-layout",
]

globalThis.__hostModules = {}
for (const name of EXTERNALS) {
  globalThis.__hostModules[name] = await load(name)
}
// Node builtin proxies resolve lazily through the host's own require.
globalThis.__hostRequire = createRequire(import.meta.url)

const bundlePath = process.argv[2] ?? "dist/main.jsbundle"
const source = readFileSync(bundlePath, "utf8")
vm.runInThisContext(source, { filename: bundlePath })
