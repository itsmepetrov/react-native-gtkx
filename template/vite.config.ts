import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

// `gtkx dev` and `gtkx build` run vite themselves and pick this file up
// automatically; the preset adds the react-native alias and Metro-style
// platform extensions (.linux.* → .native.* → base).
export default defineConfig({
  plugins: [reactNativeGtkx()],
})
