import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

// The probe dogfoods the preset exactly as an app would, against a codegen
// store that only ever saw "Gtk-4.0" — see gtkx.config.ts.
export default defineConfig({
  plugins: [reactNativeGtkx()],
  build: { minify: false, sourcemap: true },
})
