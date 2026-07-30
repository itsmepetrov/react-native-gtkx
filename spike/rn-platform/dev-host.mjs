// Dev-mode spike host: fetch the DEV bundle from a running Metro dev
// server, execute it, subscribe to HMR updates and let react-refresh
// re-render through the @gtkx/react reconciler (state preserved).
//
// The division of labor (verified against metro-runtime sources):
// - metro-runtime's dev require does the per-module $RefreshReg$ scoping,
//   registers exports after every factory and applies hot updates
//   (global.__accept) — IF the host provides global.__ReactRefresh;
// - metro-runtime's HMRClient (reused verbatim) speaks the /hot websocket
//   protocol and evals update snippets;
// - the host only injects react-refresh BEFORE anything React-ish loads
//   and provides performFullRefresh (here: exit 65 — a supervisor
//   restarts; the product command owns that loop).
import { realpathSync } from "node:fs"
import { createRequire, registerHooks } from "node:module"
import { pathToFileURL } from "node:url"
import vm from "node:vm"

const SERVER = process.env.METRO_SERVER ?? "http://127.0.0.1:8081"
const BUNDLE_URL = `${SERVER}/index.bundle?platform=linux&dev=true&minify=false`

const fail = (message) => {
  console.error(`[dev-host] ${message}`)
  process.exit(1)
}

// React (and the reconciler) must run their DEV builds for react-refresh.
process.env.NODE_ENV = process.env.NODE_ENV ?? "development"

const fromApp = createRequire(import.meta.url)
const packageRoot = realpathSync(
  new URL("./node_modules/react-native-gtkx", import.meta.url),
)
const fromPackage = createRequire(packageRoot + "/package.json")
const fromGtkxReact = createRequire(fromPackage.resolve("@gtkx/react"))

// --- react-refresh: inject BEFORE @gtkx/react (the reconciler registers
// into the patched devtools hook when it loads).
const RefreshRuntime = fromApp("react-refresh/runtime")
RefreshRuntime.injectIntoGlobalHook(globalThis)
globalThis.$RefreshReg$ = () => {}
globalThis.$RefreshSig$ = () => (type) => type
globalThis.__ReactRefresh = {
  ...RefreshRuntime,
  performFullRefresh(reason) {
    console.warn(
      `[dev-host] full refresh requested (${reason}) — exiting for supervisor restart`,
    )
    process.exit(65)
  },
}

// --- virtual:gtkx-config (same as the release host).
const { loadConfig } = await import(
  pathToFileURL(fromPackage.resolve("@gtkx/config")).href
)
const { config: gtkxConfig } = await loadConfig(process.cwd())
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
      return {
        format: "module",
        source: configModuleSource,
        shortCircuit: true,
      }
    }
    return nextLoad(url, context)
  },
})

// --- host modules (same interop merging as the release host).
const resolveExternal = (name) =>
  name === "react" || name.startsWith("react/")
    ? fromGtkxReact.resolve(name)
    : fromPackage.resolve(name)
const load = async (name) => {
  const namespace = await import(pathToFileURL(resolveExternal(name)).href)
  const merged = { __esModule: true, ...namespace }
  if (!("default" in namespace)) {
    merged.default = namespace
  }
  return merged
}
const { HOST_MODULE_EXTERNALS } = await import(
  pathToFileURL(fromPackage.resolve("react-native-gtkx/metro")).href
)
globalThis.__hostModules = {}
for (const name of HOST_MODULE_EXTERNALS) {
  globalThis.__hostModules[name] = await load(name)
}
globalThis.__hostRequire = fromApp

// --- fetch and run the dev bundle.
let response
try {
  response = await fetch(BUNDLE_URL)
} catch {
  fail(
    `Metro dev server is not reachable at ${SERVER} — run npx react-native start.`,
  )
}
if (!response.ok) {
  fail(
    `Metro returned ${response.status} for the dev bundle:\n${await response.text()}`,
  )
}
vm.runInThisContext(await response.text(), { filename: BUNDLE_URL })
console.warn("[dev-host] dev bundle running, connecting to HMR…")

// --- HMR: metro-runtime's own client over the global WebSocket (Node 22+).
const HMRClient = fromApp("metro-runtime/src/modules/HMRClient")
const client = new HMRClient(`${SERVER.replace(/^http/, "ws")}/hot`)
client.send(
  JSON.stringify({ type: "register-entrypoints", entryPoints: [BUNDLE_URL] }),
)
client.enable()
client.on("update-done", () => {
  console.warn("[dev-host] hot update applied")
})
client.on("error", (body) => {
  console.error(
    `[dev-host] Metro error: ${body?.type ?? "unknown"}\n${body?.message ?? ""}`,
  )
})
client.on("close", () => {
  console.warn("[dev-host] HMR socket closed")
})
