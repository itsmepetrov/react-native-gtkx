import gtkx from "@gtkx/vitest"
import { defineConfig } from "vitest/config"

// GTK component tests: the @gtkx/vitest plugin boots a headless Wayland
// compositor (sway) per worker. Linux-only — run via `npm run test:gtk`
// in the dev container or CI, not from macOS.
export default defineConfig({
  // RC1-WORKAROUND(vitest-compositor): see docs/gtkx-rc1-vs-main.md
  // rc.1 defaults to weston; the dev image ships sway.
  plugins: [gtkx({ compositor: "sway" })],
  test: {
    name: "gtk",
    include: ["tests/gtk/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/gtk/setup.ts"],
    // Window-resize signal delivery races under parallel workers (each spawns
    // its own compositor); the whole suite takes seconds — run serially.
    fileParallelism: false,
  },
})
