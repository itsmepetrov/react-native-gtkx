// @gtkx/react imports the bare specifier "virtual:gtkx-config" for JSX
// metadata plus the app's applicationId/userEventSignals/lazy elements.
// runner/host.ts resolves it at every process start through a loader hook
// (registerHooks), reading gtkx.config.ts from the current working
// directory. A SEA has no "app root" to read a config file from at
// runtime — there is no cwd convention once the app is a single file
// copied anywhere — so this bakes the same values in at BUILD time
// instead, the same way the vite path already does (its CLI plugin serves
// virtual:gtkx-config from the build-time config, never a runtime read).
//
// Deliberately duplicated validation logic rather than shared with
// host.ts: see host-dev.ts's header comment for why the hosts in this
// package are self-contained twins rather than sharing relative imports —
// this is a third twin, for the same reason (host.ts must keep resolving
// its config at runtime for ordinary `run-linux`/installed-app use; this
// one resolves it once, at bundle time, for the SEA artifact only).
import { join } from "node:path"
import { createConfigLoader } from "@gtkx/config/internal"
import type { Plugin } from "rolldown"

export const CONFIG_REQUIRED =
  "gtkx.config.ts with an applicationId is required in the app root " +
  '(export default defineConfig({ applicationId: "...", libraries: [...] })).'

/**
 * Loads and validates the app's gtkx.config.ts, returning the source of a
 * virtual:gtkx-config module with the resolved values baked in as literals.
 */
export const buildGtkxConfigModule = async (
  appRoot: string,
): Promise<string> => {
  const loader = createConfigLoader()
  const config = await loader(appRoot).catch((error: unknown) => {
    throw new Error(`${CONFIG_REQUIRED}\n${String(error)}`)
  })
  if (!config.applicationId) {
    throw new Error(CONFIG_REQUIRED)
  }
  // A behaviors module would have to be bundled and merged through
  // @gtkx/react/config; the react-native surface owns element behaviors,
  // so no app declares one — refuse rather than silently drop it (mirrors
  // host.ts's runtime check).
  if (config.elements !== null) {
    throw new Error(
      "gtkx.config.ts `elements.behaviors` is not supported on the linux " +
        "platform — react-native-gtkx owns element behaviors.",
    )
  }
  const lazyElements = Object.fromEntries(
    config.lazyElements.map((type) => [type, { lazy: true }]),
  )
  return [
    `export * from "@gtkx/jsx/metadata";`,
    `export const applicationId = ${JSON.stringify(config.applicationId)};`,
    `export const userEventSignals = ${JSON.stringify(config.userEventSignals)};`,
    `export const elements = ${JSON.stringify(lazyElements)};`,
  ].join("\n")
}

/**
 * Resolves the bare "virtual:gtkx-config" specifier @gtkx/react imports to
 * the module source built by {@link buildGtkxConfigModule}, so the bundler
 * can inline it like any other static import — no runtime loader hook
 * needed.
 *
 * The module is given an id inside `appRoot` rather than a `\0`-prefixed
 * virtual one because it re-exports "@gtkx/jsx/metadata": that bare
 * specifier needs a real directory to resolve from.
 */
export const virtualConfigModulePlugin = (
  moduleSource: string,
  appRoot: string,
): Plugin => {
  const configId = join(appRoot, "__gtkx-sea-config.js")
  return {
    name: "gtkx-virtual-config",
    resolveId: (source) => (source === "virtual:gtkx-config" ? configId : null),
    load: (id) => (id === configId ? moduleSource : null),
  }
}
