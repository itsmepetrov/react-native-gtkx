import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

// The example dogfoods the preset the same way examples/gallery does:
// sources import "react-native" and the alias + platform extensions
// resolve it to react-native-gtkx.
export default defineConfig({
  plugins: [reactNativeGtkx()],
})
