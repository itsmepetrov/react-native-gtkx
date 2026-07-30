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
        ? [
            {
              plugins: [
                // @gtkx/vitest defaults to headless sway with a virtual seat —
                // what the dev image, the VM and CI ship.
                (await import("@gtkx/vitest")).default(),
                // Metro-style platform resolution for inlined RN libraries
                // (@react-navigation resolves .native variants through it,
                // exactly like the app build does).
                (
                  await import("./packages/react-native-gtkx/src/vite/index")
                ).reactNativeGtkx(),
              ],
              // The package root: @gtkx/vitest discovers gtkx.config.ts
              // (applicationId) from here, c12 does not walk up to the repo.
              root: "packages/react-native-gtkx",
              resolve: {
                alias: {
                  // @react-navigation (pulled by the navigation tests)
                  // imports "react-native"; without the app presets' alias
                  // the REAL react-native (Flow sources) would be parsed.
                  // Point it at the package source the tests already use.
                  "react-native": resolve(
                    import.meta.dirname,
                    "packages/react-native-gtkx/src/index.ts",
                  ),
                },
              },
              test: {
                name: "gtk",
                include: ["tests/gtk/**/*.test.{ts,tsx}"],
                setupFiles: ["./tests/gtk/setup.ts"],
                server: {
                  deps: {
                    // Externalized node_modules load through plain Node,
                    // where the "react-native" alias above cannot apply —
                    // inline @react-navigation so its react-native imports
                    // go through the vite resolver.
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
        : []),
    ],
  },
}))
