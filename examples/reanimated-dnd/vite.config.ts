import { fileURLToPath } from "node:url"
import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

// ONE SOURCE, TWO BUILDS. Everything under `src/` is upstream's example app,
// and it is built twice against two different drag-and-drop implementations:
//
//   npm run dev                   the MIRROR — `react-native-gtkx/dnd`, GTK's
//                                 own GtkDragSource/GtkDropTarget
//   DND_IMPL=real npm run dev     the REAL `react-native-reanimated-dnd@2.0.0`
//                                 from npm, running on this platform's
//                                 Reanimated/worklets/gesture-handler compat
//
// The point of the pair is that the source is IDENTICAL. A second copy of the
// app under a second directory would diverge within a week and then prove
// nothing; two configs over one `src/` means every difference that shows up on
// screen is a difference between the two implementations, not between two
// forks of an example. See docs/research/dnd-differential.md for the
// screen-by-screen result.
//
// In the default (mirror) build the preset does the two rewrites that make
// this port possible at all: `react-native` → `react-native-gtkx`, and — the
// load-bearing one here — `react-native-reanimated-dnd` →
// `react-native-gtkx/dnd` plus `react-native-gesture-handler` →
// `react-native-gtkx/gesture-handler`. The source below is upstream's,
// unedited, and the alias is what makes it build.
//
// The `@/` alias is upstream's own (babel-plugin-module-resolver in its
// babel.config.js) and is reproduced rather than rewritten away, so the
// import lines in the ported screens stay byte-identical to theirs.
const useRealLibrary = process.env.DND_IMPL === "real"

export default defineConfig({
  plugins: [
    reactNativeGtkx({
      // The preset's own opt-out (#91), which is what this build is for.
      // `false` drops one entry from the alias table so the REAL package
      // resolves; everything it imports at module scope
      // (`react-native-reanimated`, `react-native-worklets`,
      // `react-native-gesture-handler`, `react-native`) still goes through
      // the preset onto this platform's compat surfaces. That is the whole
      // point of the pair: the real library, this platform's runtime
      // underneath it.
      //
      // Turning a name off also keeps it in `ssr.noExternal`, which matters
      // as much as the alias — `gtkx dev` runs vite with `ssr.external:
      // true`, and a bare specifier vite externalizes is handed to Node
      // before any `resolveId` hook runs. The gallery's Upstream libraries
      // section had
      // to spell both of those out by hand; this is the one-line version.
      aliases: useRealLibrary
        ? { "react-native-reanimated-dnd": false }
        : undefined,
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
