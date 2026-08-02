import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig, type Plugin } from "vite"

// The gallery dogfoods the preset: sources import "react-native" and the
// alias + platform extensions resolve it to react-native-gtkx.
//
// The two things below exist for ONE section, `src/sections/upstream.tsx`,
// and removing either silently changes what that section proves rather than
// breaking it loudly. Every other section resolves through the preset alone.
//
// That section is the opposite of `examples/reanimated-dnd` and of the `dnd`
// section here, both of which run against `react-native-gtkx/dnd` through the
// preset's rewrite, so the real package never loads. `upstream` proves what
// happens when it DOES — both `react-native-reanimated-dnd@2.0.0` and
// `react-native-drawer-layout@4.2.9` are installed here for real, and both run
// on top of this platform's Reanimated, worklets and gesture-handler compat
// surfaces.
//
// See docs/research/upstream-libraries.md for what that measured.

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
 * cannot catch a `./GestureHandler` of the gallery's own.
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
  plugins: [
    drawerLayoutUsesRealGestures(),
    reactNativeGtkx({
      // Drop ONE of the preset's six package aliases, for this project only.
      // `react-native-reanimated-dnd` 2.0.0 really runs here, so the
      // "Upstream libraries" section asks for it instead of the
      // `react-native-gtkx/dnd` mirror every other section gets.
      //
      // A delta, not a replacement list: everything the library imports at
      // module scope (`react-native-reanimated`, `react-native-worklets`,
      // `react-native-gesture-handler`, `react-native`) still goes through
      // the preset onto this platform's compat surfaces, which is the whole
      // point — the real library, this platform's runtime underneath it. The
      // preset also keeps the un-aliased package inside vite's own pipeline,
      // so its `react-native` imports still reach the platform alias.
      //
      // See docs/api.md, "Configuring the package aliases".
      aliases: { "react-native-reanimated-dnd": false },
    }),
  ],
  ssr: {
    // `gtkx dev` runs vite with `ssr.external: true`, which hands every bare
    // dependency straight to Node. `react-native-drawer-layout` imports
    // `react-native` at module scope, and an externalized copy resolves that
    // to the REAL react-native — a Flow codebase Node cannot parse. Keeping
    // it inside the pipeline is what lets the preset's alias reach its
    // imports. The preset does this for every name in the alias table
    // itself, so `react-native-reanimated-dnd` needs no entry here even
    // though its alias is off.
    noExternal: ["react-native-drawer-layout"],
  },
})
