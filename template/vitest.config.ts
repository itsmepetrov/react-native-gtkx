import { reactNativeGtkxTest } from "react-native-gtkx/vitest"
import { defineConfig } from "vitest/config"

// react-native-gtkx/vitest wires the headless Wayland compositor, the
// react-native alias, Metro-style platform extensions and the React
// act-environment setup — the same recipe react-native-gtkx tests itself
// with. No options needed: the default test glob is `*.gtk.test.{ts,tsx}`.
export default defineConfig(reactNativeGtkxTest())
