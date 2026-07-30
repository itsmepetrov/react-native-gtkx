import { defineConfig } from "vitest/config"

// One vitest entry for the whole repo, split into projects:
// - unit: cross-platform logic tests, run anywhere;
// - gtk: Linux-only component tests under a headless Wayland compositor
//   (packages/react-native-gtkx/vitest.gtk.config.ts) — skipped entirely on
//   other platforms, so a plain `npm test` works both on macOS and in the VM.
// Filter with `vitest run --project unit|gtk`.
export default defineConfig({
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
        ? ["packages/react-native-gtkx/vitest.gtk.config.ts"]
        : []),
    ],
  },
})
