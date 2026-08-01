import { fileURLToPath } from "node:url"
import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

// The preset does the two rewrites that make this port possible at all:
// `react-native` → `react-native-gtkx`, and — the load-bearing one here —
// `react-native-reanimated-dnd` → `react-native-gtkx/dnd` plus
// `react-native-gesture-handler` → `react-native-gtkx/gesture-handler`.
// Neither of those packages is installed, and neither ever resolves: the
// source below is upstream's, unedited, and the alias is what makes it build.
//
// The `@/` alias is upstream's own (babel-plugin-module-resolver in its
// babel.config.js) and is reproduced rather than rewritten away, so the
// import lines in the ported screens stay byte-identical to theirs.
export default defineConfig({
  plugins: [reactNativeGtkx()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
