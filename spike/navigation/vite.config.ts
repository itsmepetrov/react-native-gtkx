import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

// The spike mixes direct @gtkx/* imports (Adw navigation JSX) with
// react-native-gtkx, installed here via file: — two physical copies of the
// gtkx runtime end up in the bundle and the second init aborts GLib
// (g_log_set_writer_func called multiple times). dedupe collapses every
// @gtkx module (and react) onto this project's copy. Finding for the epic:
// the vite preset should ship this dedupe for apps that import @gtkx
// components next to the RN surface.
export default defineConfig({
  plugins: [reactNativeGtkx()],
  resolve: {
    dedupe: [
      "@gtkx/css",
      "@gtkx/gi",
      "@gtkx/jsx",
      "@gtkx/native",
      "@gtkx/react",
      "@gtkx/runtime",
      "react",
    ],
  },
})
