import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

// The single vitest entry for the whole repo, both projects in one place:
// - unit: cross-platform logic tests, run anywhere;
// - gtk: Linux-only component tests under a headless Wayland compositor;
//   the @gtkx/vitest plugin is imported lazily so non-Linux hosts never
//   load it — a plain `npm test` works both on macOS (unit only) and in
//   the VM (everything).
// Filter with `npm run test:unit` / `npm run test:gtk`.
export default defineConfig(async () => ({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          // Unit tests live anywhere: packages and examples share the
          // tests/unit layout and the same cross-platform project.
          include: [
            "packages/*/tests/unit/**/*.test.ts",
            "packages/*/tests/unit/**/*.test.tsx",
            "examples/*/tests/unit/**/*.test.ts",
            "examples/*/tests/unit/**/*.test.tsx",
          ],
        },
      },
      ...(process.platform === "linux"
        ? await (async () => {
            const rnGtkxVite =
              await import("./packages/react-native-gtkx/src/vite/index")
            const REACT_NATIVE_GTKX_SRC = resolve(
              import.meta.dirname,
              "packages/react-native-gtkx/src",
            )

            // Every bare specifier the platform's OWN alias table
            // (src/aliases/index.ts, `DEFAULT_ALIASES`) rewrites onto one of
            // its own subpaths must resolve, in THIS project, to the same
            // SOURCE TREE every gtk test already reaches `Root`/`View`
            // through (relative imports into `src`) — never through
            // node_modules/react-native-gtkx's `dist` build.
            //
            // Why: `reactNativeGtkx()`'s own resolveId rewrites e.g.
            // "react-native-reanimated" to the bare specifier
            // "react-native-gtkx/reanimated" and hands it to vite's normal
            // resolution, which reads the package's `exports` map — every
            // entry of which points at `./dist/*` (this package ships
            // compiled; see CLAUDE.md). A real third-party library (any
            // genuine npm package, e.g. react-native-reanimated-dnd's
            // `Sortable`) imports these names as BARE specifiers, so it is
            // the only thing in this test suite that ever took that path —
            // every existing gtk test reaches Animated/GestureDetector/etc.
            // through a relative `../../../src/...` import instead, which is
            // why this went unnoticed until a real package was mounted.
            //
            // The result: two separate module instances of this package in
            // ONE test's graph — `src` (via `<Root>`, imported relatively)
            // and `dist` (via the bare-specifier alias route) — each running
            // its own `createContext()` for `HostNodeContext`
            // (components/host-node.ts). `<Root>` provides the `src` copy;
            // anything reached through the alias reads the `dist` copy,
            // which was never provided, so `useHostNode()` throws "must be
            // rendered inside AppRegistry.runApplication() or a <Root>" even
            // though the tree genuinely IS wrapped in one. Reached from a
            // real `Sortable`'s `Animated.createAnimatedComponent(ScrollView)`
            // — see tests/gtk/dnd/_measure-real.gtk.test.tsx.
            //
            // One src entry point per name the alias table declares, so this
            // is a config-time error rather than a silent repeat of the same
            // bug the day a seventh package joins that table.
            const ALIAS_SRC_ENTRY_POINTS: Readonly<Record<string, string>> = {
              "react-native": "index.ts",
              "react-native-svg": "svg-compat/index.ts",
              "react-native-reanimated-dnd": "dnd/index.ts",
              "react-native-reanimated": "reanimated-compat/index.tsx",
              "react-native-worklets": "worklets-compat/index.ts",
              "react-native-gesture-handler":
                "gesture-handler-compat/index.tsx",
            }
            for (const name of Object.keys(rnGtkxVite.DEFAULT_ALIASES)) {
              if (!(name in ALIAS_SRC_ENTRY_POINTS)) {
                throw new Error(
                  `vitest.config.ts: "${name}" was added to the platform's alias table but has no gtk-project ` +
                    "src entry point in ALIAS_SRC_ENTRY_POINTS. Add one — otherwise the gtk project resolves it " +
                    "through node_modules/dist, split from <Root>'s src copy, and every real package that " +
                    "bare-imports it hits the two-copy HostNodeContext bug documented above.",
                )
              }
            }
            const gtkAlias = Object.fromEntries(
              Object.entries(ALIAS_SRC_ENTRY_POINTS).map(
                ([name, entryPoint]) => [
                  name,
                  resolve(REACT_NATIVE_GTKX_SRC, entryPoint),
                ],
              ),
            )

            return [
              {
                plugins: [
                  // @gtkx/vitest defaults to headless sway with a virtual seat —
                  // what the dev image, the VM and CI ship.
                  (await import("@gtkx/vitest")).default(),
                  // Metro-style platform resolution for inlined RN libraries
                  // (@react-navigation resolves .native variants through it,
                  // exactly like the app build does).
                  rnGtkxVite.reactNativeGtkx(),
                ],
                // The package root: @gtkx/vitest discovers gtkx.config.ts
                // (applicationId) from here, c12 does not walk up to the repo.
                root: "packages/react-native-gtkx",
                resolve: {
                  alias: gtkAlias,
                },
                test: {
                  name: "gtk",
                  include: ["tests/gtk/**/*.test.{ts,tsx}"],
                  setupFiles: ["./tests/gtk/setup.ts"],
                  server: {
                    deps: {
                      // Externalized node_modules load through plain Node,
                      // where the aliases above cannot apply — inline
                      // @react-navigation so its react-native imports go
                      // through the vite resolver.
                      inline: [/@react-navigation/],
                    },
                  },
                  // Window-resize signal delivery races under parallel workers
                  // (each spawns its own compositor); the whole suite takes
                  // seconds — run serially.
                  fileParallelism: false,
                },
              },
            ]
          })()
        : []),
    ],
  },
}))
