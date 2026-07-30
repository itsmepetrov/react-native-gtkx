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
    `Node ${process.version} lacks module.registerHooks — the linux host needs Node >= 24.`,
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

// --- virtual:gtkx-config (same mechanism and same module shape as the
// release host — see host.ts for why each export is needed).
const CONFIG_REQUIRED =
  "gtkx.config.ts with an applicationId is required in the app root " +
  '(export default defineConfig({ applicationId: "...", libraries: [...] })).'
const { createConfigLoader } = await import(
  pathToFileURL(fromPackage.resolve("@gtkx/config/internal")).href
)
const gtkxConfig = await createConfigLoader()(process.cwd()).catch(
  (error: unknown) => fail(`${CONFIG_REQUIRED}\n${String(error)}`),
)
if (!gtkxConfig.applicationId) {
  fail(CONFIG_REQUIRED)
}
if (gtkxConfig.elements !== null) {
  fail(
    "gtkx.config.ts `elements.behaviors` is not supported on the linux " +
      "platform — react-native-gtkx owns element behaviors.",
  )
}
const configModuleUrl = new URL("./__virtual-gtkx-config.mjs", import.meta.url)
  .href
const lazyElements = Object.fromEntries(
  gtkxConfig.lazyElements.map((type: string) => [type, { lazy: true }]),
)
const configModuleSource = [
  `export * from "@gtkx/jsx/metadata";`,
  `export const applicationId = ${JSON.stringify(gtkxConfig.applicationId)};`,
  `export const userEventSignals = ${JSON.stringify(gtkxConfig.userEventSignals)};`,
  `export const elements = ${JSON.stringify(lazyElements)};`,
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

// --- Dev Menu (Ctrl+Shift+D, the react-native-windows precedent).
// Installed before the bundle runs so DevSettings.reload works from app
// code; the key controller attaches once the app window exists.
const requestReload = (reason?: string): never => {
  console.warn(
    `[react-native-gtkx] reload requested${reason ? ` (${reason})` : ""} — restarting`,
  )
  return process.exit(65)
}
globalThis.__rnGtkxDevHost = { reload: requestReload }

// Structural slices of the GTK wrappers the menu touches — the host talks
// to codegen namespaces through __hostModules, untyped by design.
type DevMenuWindow = { addController(controller: unknown): void }
type DevMenuDialog = {
  setHeading(heading: string): void
  setBody(body: string): void
  addResponse(id: string, label: string): void
  setResponseAppearance(id: string, appearance: unknown): void
  setDefaultResponse(id: string): void
  setCloseResponse(id: string): void
  choose(parent: DevMenuWindow): Promise<string>
}

const installDevMenu = (): void => {
  const gtk = globalThis.__hostModules["@gtkx/gi/gtk"] as {
    EventControllerKey: new () => {
      on(signal: string, handler: (...args: unknown[]) => unknown): void
    }
  }
  const gdk = globalThis.__hostModules["@gtkx/gi/gdk"] as {
    ModifierType: { CONTROL_MASK: number; SHIFT_MASK: number }
  }
  const adw = globalThis.__hostModules["@gtkx/gi/adw"] as {
    AlertDialog: new () => DevMenuDialog
    ResponseAppearance: { SUGGESTED: unknown }
  }
  const gio = globalThis.__hostModules["@gtkx/gi/gio"] as {
    Application: {
      getDefault():
        { getActiveWindow?: () => DevMenuWindow | null } | null | undefined
    }
  }
  // GDK keysyms for latin letters equal their ASCII codes.
  const KEY_UPPER_D = 0x44
  const KEY_LOWER_D = 0x64

  let menuOpen = false
  const openDevMenu = async (window: DevMenuWindow): Promise<void> => {
    if (menuOpen) {
      return
    }
    menuOpen = true
    try {
      const items = globalThis.__rnGtkxDevMenuItems ?? []
      const dialog = new adw.AlertDialog()
      dialog.setHeading("React Native Dev Menu")
      dialog.setBody(bundleUrl!)
      dialog.addResponse("cancel", "Cancel")
      items.forEach((item, index) => {
        dialog.addResponse(`custom-${index}`, item.title)
      })
      dialog.addResponse("reload", "Reload")
      dialog.setResponseAppearance("reload", adw.ResponseAppearance.SUGGESTED)
      dialog.setDefaultResponse("reload")
      dialog.setCloseResponse("cancel")
      const response = await dialog.choose(window)
      if (response === "reload") {
        requestReload()
      }
      const custom = /^custom-(\d+)$/.exec(response)
      if (custom) {
        items[Number(custom[1])]?.handler()
      }
    } catch (error) {
      console.error(`[react-native-gtkx] dev menu failed: ${String(error)}`)
    } finally {
      menuOpen = false
    }
  }

  const attach = (): void => {
    const window = gio.Application.getDefault()?.getActiveWindow?.()
    if (!window) {
      // The bundle opens the window asynchronously (application activate).
      setTimeout(attach, 200)
      return
    }
    const controller = new gtk.EventControllerKey()
    controller.on("key-pressed", (keyval, _keycode, state) => {
      const modifiers = state as number
      const wanted =
        (modifiers & gdk.ModifierType.CONTROL_MASK) !== 0 &&
        (modifiers & gdk.ModifierType.SHIFT_MASK) !== 0 &&
        (keyval === KEY_UPPER_D || keyval === KEY_LOWER_D)
      if (wanted) {
        void openDevMenu(window)
        return true
      }
      return false
    })
    window.addController(controller)
    console.warn("[react-native-gtkx] dev menu ready (Ctrl+Shift+D)")
  }
  attach()
}

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
installDevMenu()

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
