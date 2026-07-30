// The DEV host: fetch the dev bundle from a Metro dev server, execute it,
// subscribe to HMR updates and let react-refresh re-render through the
// @gtkx/react reconciler with component state preserved. Spawned by
// `run-linux --dev` as `node dist/runner/host-dev.js <bundle-url>`; exits
// with code 65 when a full refresh is required — the supervisor restarts.
//
// Division of labor (validated by spike/rn-platform, FINDINGS-dev.md):
// metro-runtime's dev require scopes the react-refresh registration per
// module and applies hot updates once global.__ReactRefresh exists; its
// HMRClient speaks the /hot websocket protocol verbatim over Node's
// global WebSocket. This file only adds the dev pieces on top of the
// release host (./host.ts — deliberately self-contained twins: both must
// stay runnable under bare Node, so they cannot share a relative
// extensionless import).
import { createRequire, registerHooks } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import vm from "node:vm"
import { HOST_MODULE_EXTERNALS } from "react-native-gtkx/metro"

type HostModule = Record<string, unknown>

const fail = (message: string): never => {
  console.error(`[react-native-gtkx] ${message}`)
  process.exit(1)
}

if (typeof registerHooks !== "function") {
  fail(
    `Node ${process.version} lacks module.registerHooks — the linux host needs Node >= 22.15.`,
  )
}

// react and the reconciler must run their DEV builds for react-refresh.
process.env.NODE_ENV = process.env.NODE_ENV ?? "development"

const bundleUrl = process.argv[2]
if (!bundleUrl) {
  fail("usage: node host-dev.js <metro-dev-bundle-url>")
}

// Resolution anchors: react-refresh and metro-runtime ship with the APP's
// react-native; @gtkx/* resolve as this package's dependencies; react must
// be the exact instance the reconciler sees (see host.ts).
const fromApp = createRequire(join(process.cwd(), "package.json"))
const fromPackage = createRequire(import.meta.url)
const fromGtkxReact = createRequire(fromPackage.resolve("@gtkx/react"))

// --- react-refresh: inject BEFORE @gtkx/react loads (the reconciler
// registers into the patched devtools hook).
const RefreshRuntime = fromApp("react-refresh/runtime") as Record<
  string,
  unknown
> & { injectIntoGlobalHook(target: unknown): void }
RefreshRuntime.injectIntoGlobalHook(globalThis)
globalThis.$RefreshReg$ = () => {}
globalThis.$RefreshSig$ = () => (type: unknown) => type
globalThis.__ReactRefresh = {
  ...RefreshRuntime,
  performFullRefresh(reason: string) {
    console.warn(
      `[react-native-gtkx] full refresh required (${reason}) — restarting`,
    )
    process.exit(65)
  },
}

// --- virtual:gtkx-config (same mechanism as the release host).
const { loadConfig } = await import(
  pathToFileURL(fromPackage.resolve("@gtkx/config")).href
)
const { config: gtkxConfig } = await loadConfig(process.cwd())
if (!gtkxConfig.applicationId) {
  fail(
    "gtkx.config.ts with an applicationId is required in the app root " +
      '(export default defineConfig({ applicationId: "...", libraries: [...] })).',
  )
}
const configModuleUrl = new URL("./__virtual-gtkx-config.mjs", import.meta.url)
  .href
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
const resolveExternal = (name: string): string =>
  name === "react" || name.startsWith("react/")
    ? fromGtkxReact.resolve(name)
    : fromPackage.resolve(name)

const load = async (name: string): Promise<HostModule> => {
  const namespace: HostModule = await import(
    pathToFileURL(resolveExternal(name)).href
  )
  const merged: HostModule = { __esModule: true, ...namespace }
  if (!("default" in namespace)) {
    merged.default = namespace
  }
  return merged
}

globalThis.__hostModules = {}
for (const name of HOST_MODULE_EXTERNALS) {
  try {
    globalThis.__hostModules[name] = await load(name)
  } catch (error) {
    fail(
      `failed to load host module "${name}" — is the codegen store in ` +
        `place (npx gtkx codegen) and GTK4/libadwaita installed?\n${String(error)}`,
    )
  }
}
globalThis.__hostRequire = createRequire(import.meta.url)

// --- fetch and run the dev bundle.
let response: Response
try {
  response = await fetch(bundleUrl!)
} catch {
  fail(`Metro dev server is not reachable (${bundleUrl}).`)
  throw new Error("unreachable")
}
if (!response.ok) {
  fail(
    `Metro returned ${response.status} for the dev bundle:\n${await response.text()}`,
  )
}
vm.runInThisContext(await response.text(), { filename: bundleUrl })

// --- HMR: metro-runtime's own client (ships with react-native).
type HmrErrorBody = { type?: string; message?: string }
type HmrClient = {
  send(message: string): void
  enable(): void
  on(event: string, listener: (body?: HmrErrorBody) => void): void
}
const HMRClient = fromApp("metro-runtime/src/modules/HMRClient") as new (
  url: string,
) => HmrClient
const client = new HMRClient(
  bundleUrl!.replace(/^http/, "ws").replace(/\/[^/]*$/, "/hot"),
)
client.send(
  JSON.stringify({ type: "register-entrypoints", entryPoints: [bundleUrl] }),
)
client.enable()
client.on("update-done", () => {
  console.warn("[react-native-gtkx] hot update applied")
})
client.on("error", (body) => {
  console.error(
    `[react-native-gtkx] Metro error (${body?.type ?? "unknown"}):\n${body?.message ?? ""}`,
  )
})
client.on("close", () => {
  console.warn(
    "[react-native-gtkx] HMR connection closed (the window keeps running without hot updates)",
  )
})
