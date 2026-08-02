import { createRequire } from "node:module"
import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig, type Plugin } from "vite"

// This example is the opposite of `examples/reanimated-dnd`. That one proves
// the MIRROR: unedited upstream source, with the presets rewriting
// `react-native-reanimated-dnd` onto `react-native-gtkx/dnd` so the real
// package never loads. This one proves what happens when it DOES load —
// both `react-native-reanimated-dnd@2.0.0` and
// `react-native-drawer-layout@4.2.9` are installed here for real, and both
// run on top of this platform's Reanimated, worklets and gesture-handler
// compat surfaces.
//
// See docs/research/upstream-libraries.md for what that measured.

const require = createRequire(import.meta.url)

/**
 * Undoes ONE of the preset's package aliases, for this project only.
 *
 * The preset rewrites `react-native-reanimated-dnd` onto
 * `react-native-gtkx/dnd`, and it does so in a `resolveId` hook. Vite runs
 * `resolve.alias` before every `enforce: "pre"` plugin, so an entry here wins
 * — the specifier is already an absolute path by the time the preset sees it,
 * and `rewriteReactNativeImport` ignores anything that is not the bare name.
 *
 * Only the -dnd package is un-aliased. Everything it imports at module scope
 * (`react-native-reanimated`, `react-native-worklets`,
 * `react-native-gesture-handler`, `react-native`) still goes through the
 * preset onto this platform's compat surfaces, which is the whole point:
 * the real library, this platform's runtime underneath it.
 */
const realPackage = (name: string) => ({
  find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  replacement: require.resolve(name),
})

/**
 * `react-native-drawer-layout` picks its gesture implementation with a
 * platform file, and the set it ships is `.ios`, `.android`, and a plain
 * fallback — there is no `.native`. So Metro-style resolution for ANY
 * out-of-tree platform (linux here, and equally win32 or macos) lands on the
 * fallback, `views/GestureHandler.js`, whose `GestureDetector` renders its
 * children and whose `Gesture` is literally `undefined`. `Drawer.native.tsx`
 * guards that with `Gesture?.Pan()`, so the drawer still renders, still
 * animates from the `open` prop — and cannot be dragged, silently.
 *
 * That is the failure mode this repo cares most about (docs/research/
 * gestures.md: "compiled, ran, and did nothing"), so this plugin points the
 * import at `GestureHandlerNative`, the module `.ios`/`.android` re-export,
 * which takes the real `react-native-gesture-handler` — and therefore this
 * platform's compat surface. Scoped to importers inside that package so it
 * cannot catch a `./GestureHandler` of the app's own.
 */
const drawerLayoutUsesRealGestures = (): Plugin => ({
  name: "example:drawer-layout-native-gestures",
  enforce: "pre",
  resolveId(source, importer) {
    if (
      source === "./GestureHandler" &&
      importer?.includes("react-native-drawer-layout")
    ) {
      return this.resolve("./GestureHandlerNative", importer, {
        skipSelf: true,
      })
    }
    return null
  },
})

export default defineConfig({
  plugins: [drawerLayoutUsesRealGestures(), reactNativeGtkx()],
  resolve: {
    alias: [realPackage("react-native-reanimated-dnd")],
  },
  ssr: {
    // `gtkx dev` runs vite with `ssr.external: true`, which hands every bare
    // dependency straight to Node. Both packages import `react-native` at
    // module scope, and an externalized copy resolves that to the REAL
    // react-native — a Flow codebase Node cannot parse. Keeping them inside
    // the pipeline is what lets the preset's alias reach their imports.
    noExternal: ["react-native-drawer-layout", "react-native-reanimated-dnd"],
  },
})
