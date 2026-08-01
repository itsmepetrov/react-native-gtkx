import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

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
