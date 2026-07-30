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
          include: [
            "packages/*/tests/unit/**/*.test.ts",
            "packages/*/tests/unit/**/*.test.tsx",
          ],
        },
      },
      ...(process.platform === "linux"
        ? [
            {
              // RC1-WORKAROUND(vitest-compositor): rc.1 defaults to weston;
              // the dev image and the VM ship sway.
              plugins: [
                (await import("@gtkx/vitest")).default({ compositor: "sway" }),
              ],
              // The package root: @gtkx/vitest discovers gtkx.config.ts
              // (applicationId) from here, c12 does not walk up to the repo.
              root: "packages/react-native-gtkx",
              test: {
                name: "gtk",
                include: ["tests/gtk/**/*.test.{ts,tsx}"],
                setupFiles: ["./tests/gtk/setup.ts"],
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
