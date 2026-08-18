// The Node+GTK host: executes a Metro jsbundle built for the linux
// platform. Spawned by the run-linux command as
// `node dist/runner/host.js <bundle>`; the bundle's externalized proxies
// (see ../metro) read the modules injected here.
//
// This file must stay runnable under BARE Node: no extensionless relative
// imports — only builtins, bare dependency specifiers and the package
// self-reference (resolved through the exports map).
import { readFileSync } from "node:fs"
import { createRequire, registerHooks } from "node:module"
import { pathToFileURL } from "node:url"
import vm from "node:vm"
import {
  HOST_MODULE_EXTERNALS,
  OPTIONAL_HOST_MODULE_EXTERNALS,
} from "react-native-gtkx/metro"

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

// Resolution anchors. @gtkx/* and @gtkx/config resolve as THIS package's
// dependencies; react resolves FROM @gtkx/react's real location — the
// reconciler and the app must share one React instance, and anchoring at
// the app could pick up a second copy installed by npm peer auto-install.
const fromPackage = createRequire(import.meta.url)
const fromGtkxReact = createRequire(fromPackage.resolve("@gtkx/react"))

const resolveExternal = (name: string): string =>
  name === "react" || name.startsWith("react/")
    ? fromGtkxReact.resolve(name)
    : fromPackage.resolve(name)

// import() handles both ESM and CJS; merge a `default` for Babel's
// default-import interop when the module has none of its own.
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

// @gtkx/react imports `virtual:gtkx-config` — JSX metadata plus the values
// resolved from gtkx.config.ts (applicationId for the GApplication, the
// userEventSignals suppressed during commits and the elements config the
// reconciler registry is primed with). In the vite path the gtkx CLI plugin
// serves it; replicate it with a loader hook, mirroring @gtkx/config's own
// renderConfigModule. The fake module URL is anchored inside this package so
// the re-exported bare specifier resolves through node_modules.
const CONFIG_REQUIRED =
  "gtkx.config.ts with an applicationId is required in the app root " +
  '(export default defineConfig({ applicationId: "...", libraries: [...] })).'
const { createConfigLoader } = await import("@gtkx/config/internal")
// The loader validates the config, so a missing or malformed one throws.
// rc.3 turned the loader from a bare function into `{ load, resolve }`;
// `resolve` is the runtime projection this module needs.
const gtkxConfig = await createConfigLoader()
  .resolve(process.cwd())
  .catch((error: unknown) => fail(`${CONFIG_REQUIRED}\n${String(error)}`))
if (!gtkxConfig.applicationId) {
  fail(CONFIG_REQUIRED)
}
// A behaviors module would have to be bundled and merged through
// @gtkx/react/config; the react-native surface owns element behaviors, so no
// app declares one — refuse rather than silently drop it.
if (gtkxConfig.elements !== null) {
  fail(
    "gtkx.config.ts `elements.behaviors` is not supported on the linux " +
      "platform — react-native-gtkx owns element behaviors.",
  )
}
const configModuleUrl = new URL("./__virtual-gtkx-config.mjs", import.meta.url)
  .href
const lazyElements = Object.fromEntries(
  gtkxConfig.lazyElements.map((type) => [type, { isLazy: true }]),
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

globalThis.__hostModules = {}
for (const name of HOST_MODULE_EXTERNALS) {
  try {
    globalThis.__hostModules[name] = await load(name)
  } catch (error) {
    if (OPTIONAL_HOST_MODULE_EXTERNALS.has(name)) {
      // Expected and fine: this app's gtkx.config.ts never declared the GIR
      // library this module binds (e.g. "Adw-1" — the plain-GTK profile,
      // see .claude/epics/adw-optional/001.md). Left unset in
      // __hostModules; a feature that actually needs it throws its own
      // named error when it is reached, not here at startup.
      continue
    }
    fail(
      `failed to load host module "${name}" — is the codegen store in ` +
        `place (npx gtkx codegen) and GTK4/libadwaita installed?\n${String(error)}`,
    )
  }
}
// Node builtin proxies resolve lazily through the host's own require.
globalThis.__hostRequire = createRequire(import.meta.url)

const bundlePath = process.argv[2]
if (!bundlePath) {
  fail("usage: node host.js <path/to/main.jsbundle>")
}
let source: string
try {
  source = readFileSync(bundlePath!, "utf8")
} catch {
  fail(`bundle not found at ${bundlePath} — run react-native run-linux.`)
  throw new Error("unreachable")
}
// 1.2-WORKAROUND(gtk-application-argv): @gtkx/react's <GtkApplication>
// now builds the GApplication's own command line from
// `process.argv.slice(2)` (components/application.js, `runApplication`'s
// new argv parameter) and hands anything left over to GLib's local
// command-line handling, which treats stray positionals as files to
// open. This process's OWN positional argv[2] is our bundle path, not a
// user-facing argument — left in place it reaches GApplication as a
// "file" no app declares G_APPLICATION_HANDLES_OPEN for
// ("GLib-GIO-CRITICAL: This application can not open files"), and the
// window never activates. Truncate before the bundle (which mounts
// <GtkApplication> from an effect, so this always runs first) sees it.
// Removal condition: @gtkx/react exposes a way to pass runApplication's
// argv explicitly (an `argv` prop on <GtkApplication>, or an
// options object) instead of always reading process.argv itself.
process.argv.length = 2
// The entry calls AppRegistry.runApplication itself (the react-native-web
// pattern); the GLib main loop keeps the process alive afterwards.
vm.runInThisContext(source, { filename: bundlePath })
