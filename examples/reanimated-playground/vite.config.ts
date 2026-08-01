import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

// Nothing app-specific here, and that is the point of the example: the preset
// rewrites both of the bare package names this app imports — the platform for
// one, the Reanimated surface for the other — so no source file mentions
// react-native-gtkx at all.
export default defineConfig({
  plugins: [reactNativeGtkx()],
})
