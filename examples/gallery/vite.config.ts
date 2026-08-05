import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig, type Plugin } from "vite"

// The gallery dogfoods the preset: sources import "react-native" and the
// alias + platform extensions resolve it to react-native-gtkx.
//
// The first two things below exist for the four `src/sections/upstream-*.tsx`
// screens, and removing either silently changes what they prove rather than
// breaking them loudly. Every other section resolves through the preset alone.
//
// Those four are the opposite of `examples/reanimated-dnd` and of the `dnd`
// section here, both of which run against `react-native-gtkx/dnd` through the
// preset's rewrite, so the real package never loads. They prove what happens
// when it DOES — `react-native-reanimated-dnd@2.0.0` (Upstream drop zones,
// Upstream sortables), `react-native-drawer-layout@4.2.9` (Upstream drawer)
// and `@gorhom/bottom-sheet@5.2.14` (Upstream bottom sheet) are installed
// here for real, on top of this platform's Reanimated, worklets and
// gesture-handler compat surfaces.
//
// `react-native-sortables@1.10.0` is the odd one out and has NO screen: it is
// installed and wired the same way (see `sortablesHapticsAreANoop` and its
// `ssr.noExternal` entry below), builds and mounts with those two fixes, but
// a THIRD, structural gap stops it before a pointer ever reaches it — its
// per-item reflow animates a `{x, y}` position as one `withTiming` call, and
// this platform's `withTiming` animates finite numbers only (docs/api.md,
// "Animated values"). Kept wired anyway so a future revisit — if that
// restriction is ever lifted — does not redo this recon from scratch.
//
// See docs/research/upstream-libraries.md for the full measurement.

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

/**
 * `react-native-sortables` ships its optional haptics backend as a platform
 * pair: `integrations/haptics/adapters/index.js`, a plain no-op, next to
 * `index.native.js`, which eagerly imports three real-device haptics
 * backends (`react-native-pulsar`, `expo-haptics`,
 * `react-native-haptic-feedback`) and reads `NativeModules` /
 * `TurboModuleRegistry` off `react-native` at module scope. This preset's
 * own platform resolution (`.linux` → `.native` → base) is Metro's rule,
 * applied correctly — there is no `.linux` file, so `.native` wins, the same
 * turn the drawer-layout case above takes. The difference is what sits on
 * the other side this time: upstream ships a real desktop-safe fallback (the
 * no-op base file) and this preset's own rule walks straight past it, onto a
 * file that assumes a mobile Turbo Module registry.
 *
 * Confirmed by building WITHOUT this plugin: this platform exports neither
 * symbol, so the build fails immediately with two errors —
 * `"NativeModules" is not exported by react-native-gtkx` (from
 * `react-native-haptic-feedback.js`) and the same for `TurboModuleRegistry`
 * (from `pulsar.js`) — plus a THIRD, `[REQUIRE_TLA]`: the optional
 * `react-native-haptic-feedback` dependency really is in `node_modules`
 * (`optionalDependencies` still installs unless a platform constraint
 * fails), and its `require("react-native")` collides with a transitive
 * top-level await (`yoga-layout`) elsewhere in the same graph. All three
 * disappear together once the `.native` file is out of the bundle, because
 * none of the three real backends is reachable from anywhere else.
 *
 * `this.resolve` cannot fix this the way the drawer-layout plugin does:
 * asking for the same base name just re-enters this preset's own platform
 * substitution and lands back on `.native`. So this one resolves the
 * concrete no-op file directly — bypassing platform resolution for this one
 * import — scoped to importers inside this package's haptics integration.
 */
const sortablesHapticsAreANoop = (): Plugin => ({
  name: "example:sortables-haptics-noop",
  enforce: "pre",
  resolveId(source, importer) {
    if (
      source === "../adapters" &&
      importer?.includes("react-native-sortables") &&
      importer.includes("integrations/haptics")
    ) {
      const base = resolve(dirname(importer), "../adapters/index")
      const candidate = ["js", "ts", "tsx"]
        .map((ext) => `${base}.${ext}`)
        .find((path) => existsSync(path))
      if (candidate) {
        return candidate
      }
    }
    return null
  },
})

export default defineConfig({
  plugins: [
    drawerLayoutUsesRealGestures(),
    sortablesHapticsAreANoop(),
    reactNativeGtkx({
      // Drop ONE of the preset's six package aliases, for this project only.
      // `react-native-reanimated-dnd` 2.0.0 really runs here, so the two
      // "Upstream drop zones" / "Upstream sortables" sections ask for it
      // instead of the `react-native-gtkx/dnd` mirror every other section
      // gets.
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
    // dependency straight to Node. Both of these import `react-native` at
    // module scope, and an externalized copy resolves that to the REAL
    // react-native — a Flow codebase Node cannot parse. Keeping them inside
    // the pipeline is what lets the preset's alias reach their imports. The
    // preset does this for every name in the alias table itself, so
    // `react-native-reanimated-dnd` needs no entry here even though its
    // alias is off. `react-native-sortables` is not in the table at all —
    // it is never aliased, only its own `react-native`/`react-native-
    // reanimated`/`react-native-gesture-handler` imports are — so it needs
    // the same explicit entry the other two get.
    noExternal: [
      "react-native-drawer-layout",
      "@gorhom/bottom-sheet",
      "react-native-sortables",
    ],
  },
})
