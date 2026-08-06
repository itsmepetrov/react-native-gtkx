# Installation

react-native-gtkx renders the React Native API as native GTK4/Adwaita
widgets on Linux. Portable code only ever imports `react-native`; reach
for `react-native-gtkx/gtk` and `react-native-gtkx/adw` for a GTK/Adwaita
widget the portable API has no concept of — a real `GtkListBox` row, an
`AdwHeaderBar`, an `Adw.NavigationView` stack. Raw `@gtkx/*` imports are
the last resort, for the handful of things neither subpath re-exports.

There are two ways to get a project running: start fresh from the
Linux-first template, or add the `linux` platform to an existing React
Native app that already has `ios`/`android`. Both end up on the same
published package; [Toolchains](toolchains.md) covers which one to reach
for.

## Prerequisites

- Linux (x64/arm64, glibc), GTK4 ≥ 4.20, libadwaita ≥ 1.8 — Ubuntu 26.04+
  or Fedora 43+ satisfy both out of the box;
- Node.js ≥ 24;
- development headers for codegen: `sudo apt install libgtk-4-dev
libadwaita-1-dev` (Ubuntu; the equivalent `-devel` packages on other
  distributions).

Running without libadwaita is also supported — see [Running without
libadwaita](plain-gtk.md) for what that changes.

## New project from the template

```bash
npx degit itsmepetrov/react-native-gtkx/template my-app
cd my-app
npm install
npm run dev        # a window opens, Fast Refresh applies edits live
```

Production build:

```bash
npm run build       # single bundle: dist/bundle.js
npm start            # node dist/bundle.js
```

Measured in a clean Ubuntu 26.04 container, system dependencies
preinstalled: 63 seconds from `npm install` to a window on screen.

The template's `vite.config.ts` wires the `react-native-gtkx/vite` preset
(the `react-native` → `react-native-gtkx` alias, Metro-style platform
extensions); `gtkx dev`/`gtkx build` pick it up automatically. Its
`tsconfig.json` maps the `"react-native"` specifier through `paths` so
editor types resolve too. The default entry is `src/index.tsx`, and
`Comp.tsx` next to `Comp.linux.tsx` builds the Linux variant for an
extensionless `import { Comp } from "./Comp"` — `Platform.select({ linux:
…, native: …, default: … })` works exactly as it does in React Native and
is tree-shaken out of the production build.

## Add Linux to an existing React Native app

Linux is an [out-of-tree
platform](https://reactnative.dev/docs/out-of-tree-platforms) — the same
model react-native-windows and react-native-macos use. An app that
already has `ios/` and `android/` keeps them, keeps its Metro/Babel
toolchain, and gains one more target. Four steps:

1. **Install the platform package:**

   ```bash
   npm install react-native-gtkx
   ```

   Its own `react-native.config.js` declares the `linux` platform and the
   `run-linux` command — nothing to declare app-side.

2. **Wrap the Metro config** (`metro.config.js`):

   ```js
   const { getDefaultConfig } = require("@react-native/metro-config")
   const { withLinuxPlatform } = require("react-native-gtkx/metro")

   module.exports = withLinuxPlatform(getDefaultConfig(__dirname))
   ```

   This adds the platform (`.linux.tsx` extensions, `Platform.OS ===
"linux"`), redirects `react-native` imports to the platform package, and
   keeps host-side modules (the GTK bindings, `react`, `yoga-layout`) out
   of the bundle — Metro cannot bundle native addons, and the reconciler
   needs to share one `react` instance with the app. Babel stays
   completely stock.

3. **Add `gtkx.config.ts`** with the GTK application id:

   ```ts
   import { defineConfig } from "@gtkx/config"

   export default defineConfig({
     libraries: ["Gtk-4.0", "Adw-1"],
     applicationId: "com.example.myapp",
   })
   ```

4. **Start the app from the entry** — on desktop the entry launches the
   app itself, the same pattern react-native-web uses for
   `index.web.js`:

   ```js
   // index.js, after AppRegistry.registerComponent(...)
   if (Platform.OS === "linux") {
     AppRegistry.runApplication(appName, {
       title: "My App",
       width: 800,
       height: 600,
     })
   }
   ```

That's the whole integration — see [Your first app](first-app.md) for
running it. `examples/rn-app` in the repository is a complete cli-init
app with all three platforms wired this way.

A stock `@react-native-community/cli init` project's `App.tsx` renders
`<NewAppScreen>` from `@react-native/new-app-screen`, which reaches into
`react-native/Libraries/Core/Devtools/openURLInBrowser` — a deep import
outside the supported `react-native` surface (see [Typed
code](#typed-code) below). Metro cannot resolve it for `--platform
linux`, so a fresh cli-init project fails to bundle until `App.tsx` is
replaced with your own component — [Your first app](first-app.md#hello-gnome)
has a minimal one to start from.

## Typed code

Add an `env.d.ts` with `import "react-native-gtkx/types"` — it augments
the stock `react-native` types so `Platform.select({ linux: ... })`
typechecks, and `Pressable`'s state callback accepts `hovered` (declared
optional, since a component shared with ios/android gets `undefined`
there — write `hovered && styles.hovered`). One thing augmentation cannot
teach is `Platform.OS === "linux"` as a type guard (property types don't
merge across an augmentation) — use `Platform.select` where the branch
needs to typecheck. Deep imports (`react-native/Libraries/...`) are not
supported — only the public `react-native` surface is.

Both toolchains alias the bare `react-native-svg` import to
`react-native-gtkx/svg` at build time — see [Toolchains: bundler
aliases](toolchains.md#bundler-aliases) for what that means for
TypeScript, since the alias is invisible to the type checker.
