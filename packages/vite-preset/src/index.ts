// @react-native-gtkx/vite-preset — makes a gtkx project React Native
// compatible. The gtkx CLI (dev and build) starts vite with an inline config
// that never sets `configFile: false`, so vite picks up the project's
// vite.config.ts from the root and merges it beneath the CLI config; this
// preset plugs in there as a single plugin.

import { existsSync } from "node:fs"
import type { Plugin } from "vite"
import {
  resolvePlatformSpecifier,
  rewriteReactNativeImport,
  type PlatformResolutionOptions,
} from "./resolver.js"

export {
  DEFAULT_EXTENSIONS,
  DEFAULT_PLATFORMS,
  platformCandidates,
  platformSuffixes,
  resolvePlatformSpecifier,
  rewriteReactNativeImport,
  splitQuery,
  type FileExists,
  type PlatformResolutionOptions,
} from "./resolver.js"

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
      // `gtkx dev` runs vite with ssr.external: true, which would hand the
      // TypeScript sources of react-native-gtkx straight to node. Keep the
      // package inside the vite pipeline; noExternal wins over external: true.
      noExternal: ["react-native-gtkx"],
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
