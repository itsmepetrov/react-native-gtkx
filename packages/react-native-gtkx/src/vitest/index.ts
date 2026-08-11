// react-native-gtkx/vitest — the vitest recipe this repo's own test suite
// runs on (see vitest.config.ts's "gtk" project), packaged for a consumer
// app: the @gtkx/vitest headless-compositor plugin, the react-native-gtkx
// vite preset (react-native alias + Metro-style platform extensions), a
// default inline-deps list for RN libraries that import "react-native"
// themselves, and the React act-environment setup.
//
// Self-contained like ./vite, ./metro and ./runner: a consumer's
// vitest.config.ts is loaded the same way vite.config.ts is (vite's config
// loader bundles only the user's own relative import graph; node_modules
// imports stay bare specifiers, resolved afterwards by plain Node ESM) — so
// this file must not contain extensionless relative imports. The one
// relative import below carries an explicit ".js" extension, which a real
// sibling file on disk resolves under plain Node without any bundler.
import { fileURLToPath, URL } from "node:url"
import type { PluginOptions as GtkxPluginOptions } from "@gtkx/vitest"
import type { Plugin } from "vite"
import type { UserWorkspaceConfig } from "vitest/config"
import { reactNativeGtkx, type ReactNativeGtkxOptions } from "../vite/index.js"

/**
 * Options accepted by {@link reactNativeGtkxTest}. Every field is optional
 * and falls back to the recipe this repo's own test suite runs on.
 */
export type ReactNativeGtkxTestOptions = {
  /** Vitest project name. Default: "gtk". */
  name?: string
  /** Test file glob(s), relative to the project root. Default: `["**\/*.gtk.test.{ts,tsx}"]`. */
  include?: string[]
  /** Headless compositor size/compositor, forwarded to @gtkx/vitest's plugin. */
  headless?: GtkxPluginOptions
  /** Metro-style platform resolution options, forwarded to the vite preset. */
  platform?: ReactNativeGtkxOptions
  /**
   * Extra `server.deps.inline` patterns, merged after the default
   * (`/@react-navigation/`). Needed for any node_modules library that
   * itself imports "react-native" — Vitest externalizes node_modules code
   * by default, a path the react-native alias cannot reach.
   */
  inlineDeps?: (string | RegExp)[]
  /** Extra setup files, run after the built-in React act-environment setup. */
  setupFiles?: string[]
  /**
   * Run this project's test files serially. Default: false — window-resize
   * signal delivery races when several per-worker headless compositors run
   * at once (see docs/gtkx-1.0-notes.md); the suite this recipe is proven
   * on takes seconds, so serial execution is the cheap fix. Override once a
   * suite is large enough for parallelism to matter more than that race.
   */
  fileParallelism?: boolean
}

const DEFAULT_INCLUDE = ["**/*.gtk.test.{ts,tsx}"]
const DEFAULT_INLINE_DEPS: (string | RegExp)[] = [/@react-navigation/]
const SETUP_FILE = fileURLToPath(new URL("./setup.js", import.meta.url))

/**
 * A ready Vitest project config for react-native-gtkx component tests: the
 * headless Wayland compositor, the react-native alias and platform
 * extensions, and the React act-environment setup — the same recipe this
 * repo's own suite runs on. Use the result as a whole config
 * (`defineConfig(reactNativeGtkxTest())`) or as one entry of
 * `test.projects` alongside a portable "unit" project.
 *
 * Requires a headless Wayland compositor on PATH (`sway` by default —
 * `apt install sway xwayland dbus`, see docs/guide/toolchains.md) and
 * `gtkx codegen` to have already generated the project's `@gtkx/gi`
 * bindings — a bare `vitest run` does not trigger codegen itself, unlike
 * `gtkx dev`/`gtkx build`. A missing compositor or codegen store fails with
 * a readable error (e.g. `Cannot find the "sway" executable on PATH`), not
 * a hang.
 */
export const reactNativeGtkxTest = async (
  options: ReactNativeGtkxTestOptions = {},
): Promise<UserWorkspaceConfig> => {
  const gtkx = (await import("@gtkx/vitest")).default
  const plugins: Plugin[] = [
    gtkx(options.headless),
    reactNativeGtkx(options.platform),
  ]
  return {
    plugins,
    test: {
      name: options.name ?? "gtk",
      include: options.include ?? DEFAULT_INCLUDE,
      setupFiles: [SETUP_FILE, ...(options.setupFiles ?? [])],
      server: {
        deps: {
          inline: [...DEFAULT_INLINE_DEPS, ...(options.inlineDeps ?? [])],
        },
      },
      fileParallelism: options.fileParallelism ?? false,
    },
  }
}

export default reactNativeGtkxTest
