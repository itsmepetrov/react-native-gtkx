import { defineConfig } from "vite"

// Portability proof for the profile demo: src/main.tsx mounts the very same
// examples/profile/src/App.tsx that the GTK build renders. The alias below is
// the entire "platform switch" — App's `import ... from "react-native"`
// resolves to react-native-web here and to react-native-gtkx in the native
// build (via react-native-gtkx/vite). The cross-package source import
// works out of the box: vite's dev-server fs allowlist defaults to the
// monorepo workspace root.
export default defineConfig({
  resolve: {
    alias: {
      "react-native": "react-native-web",
    },
  },
})
