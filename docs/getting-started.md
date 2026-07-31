# Getting Started

react-native-gtkx lets you write native Linux (GTK4/Adwaita) applications with the React Native API. Portable code only needs `react-native`; reach for `react-native-gtkx/gtk` and `react-native-gtkx/adw` for a GTK/Adwaita widget the portable API has no concept of — a real `GtkListBox` row, an `AdwHeaderBar`, an `Adw.NavigationView` stack (see [platform-layer.md](platform-layer.md)). Raw `@gtkx/*` imports are the last resort for the handful of things neither subpath re-exports.

## Requirements

- Linux (x64/arm64, glibc), GTK4 ≥ 4.20, libadwaita ≥ 1.8 (Ubuntu 26.04+, Fedora 43+);
- Node.js ≥ 24;
- dev packages: `sudo apt install libgtk-4-dev libadwaita-1-dev` (Ubuntu).

## New project from the template

```bash
npx degit itsmepetrov/react-native-gtkx/template my-app && cd my-app
npm install
npm run dev        # window with Fast Refresh (edits apply without a restart)
npm run build && npm start   # production bundle, runs with plain node
```

Measured in a clean Ubuntu 26.04 container: 63 seconds from install to a window on screen.

## How it works

```
your code (react-native API)
  └─ vite preset: aliases react-native → react-native-gtkx, platform
     extensions .linux.tsx → .native.tsx → base
      └─ react-native-gtkx: Yoga (WASM) computes flexbox; styles are split into
         layout (Yoga) and visual (GTK CSS); coordinates are applied to
         real GTK widgets
          └─ gtkx: React reconciler → GTK4 via FFI
```

The entry point is the same as in RN:

```tsx
import { AppRegistry, StyleSheet, Text, View } from "react-native"

const App = () => (
  <View style={styles.screen}>
    <Text style={styles.title}>Hello, GNOME!</Text>
  </View>
)

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700" },
})

AppRegistry.registerComponent("app", () => App)
AppRegistry.runApplication("app", { title: "My App", width: 800, height: 600 })
```

`runApplication` accepts desktop parameters (`title`, `width`, `height`) — the only extension over the RN signature.

## Add Linux to an existing React Native app

Linux is an [out-of-tree platform](https://reactnative.dev/docs/out-of-tree-platforms)
(the react-native-windows/macOS model): your app keeps its ios/ and
android/ folders, its Metro/Babel toolchain, and gains one more target.
Four steps:

1. **Install the platform package:**

   ```bash
   npm install react-native-gtkx
   ```

   Its own `react-native.config.js` declares the `linux` platform and the
   `run-linux` command — nothing to declare app-side.

2. **Wrap your Metro config** (`metro.config.js`):

   ```js
   const { getDefaultConfig } = require("@react-native/metro-config")
   const { withLinuxPlatform } = require("react-native-gtkx/metro")

   module.exports = withLinuxPlatform(getDefaultConfig(__dirname))
   ```

   The wrap adds the platform (`.linux.tsx` extensions,
   `Platform.OS === "linux"`), redirects `react-native` imports to the
   platform package, and keeps host-side modules (GTK bindings, react,
   yoga) out of the bundle. Babel stays completely stock.

3. **Add `gtkx.config.ts`** with the GTK application id:

   ```ts
   import { defineConfig } from "@gtkx/config"

   export default defineConfig({
     libraries: ["Gtk-4.0", "Adw-1"],
     applicationId: "com.example.myapp",
   })
   ```

4. **Start the app from the entry** — on desktop the entry launches the
   app itself (the same pattern as react-native-web's `index.web.js`):

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

Run it:

```bash
npx react-native run-linux         # release bundle
npx react-native run-linux --dev   # Metro dev server + Fast Refresh
```

The command ensures the gtkx codegen store, bundles with Metro for
`--platform linux` and opens the window. With `--dev` it starts (or
reuses) the Metro dev server and edits apply to the live window with
component state preserved; syntax errors print readably in the terminal
and the app recovers on the next successful build. **Ctrl+Shift+D** (the
react-native-windows shortcut — the desktop stand-in for the shake
gesture) opens the Dev Menu: Reload plus any entries the app registers
via `DevSettings.addMenuItem`. `examples/rn-app` is a complete cli-init
app with all three platforms wired this way.

Notes for typed code: add an `env.d.ts` with
`import "react-native-gtkx/types"` — it augments the stock `react-native`
types so `Platform.select({ linux: ... })` typechecks, and `Pressable`'s
state callback accepts `hovered` (declared optional — a component shared
with ios/android gets `undefined` there, so write
`hovered && styles.hovered`). Future platform-specific props land in the
same file. One thing augmentation
cannot teach is `Platform.OS === "linux"` (property types do not merge) —
use `Platform.select` in typed code. Deep imports
(`react-native/Libraries/...`) are not supported — only the public
`react-native` surface.

## Navigation

Multi-screen apps use the standard react-navigation API with a native
Adwaita stack navigator: install `@react-navigation/native` and import
`createStackNavigator` from `react-native-gtkx/navigation` — pages render
as `Adw.NavigationPage` with the HeaderBar back button wired to
react-navigation state. See [docs/api.md](api.md#navigation-react-native-gtkxnavigation), and
[docs/research/navigation-extensibility.md](research/navigation-extensibility.md)
for porting an existing react-navigation app (which options carry over,
which are silently ignored today, and what the desktop cannot mean).

## Metro or vite?

- **Adding Linux to an existing RN app** (ios/android + Metro): the
  section above — standard RN toolchain end to end,
  `run-linux --dev` for Fast Refresh.
- **Linux-first project**: the template with the vite preset
  (`react-native-gtkx/vite`; `gtkx dev` gives Fast Refresh, builds are
  single-file bundles). Both paths consume the same published package.

## Examples in the repository

- `examples/profile` — a static layout; the same source also builds with react-native-web (`examples/profile-web`);
- `examples/playground` — interactive: Pressable, TextInput, Switch, FlatList, Modal, Animated, responsive via flexWrap;
- `examples/gallery` — a gallery of the entire v1 surface;
- `examples/rn-app` — a cli-init React Native app with ios + android + linux;
- `examples/hn-app` — a Hacker News reader on the Metro path: live API data over Node fetch, state-based two-screen navigation, a lazily loaded comment tree.

## Tests

Unit logic is plain vitest. Component tests use `@gtkx/testing` (render/screen/fireEvent) under headless Wayland: see `packages/react-native-gtkx/tests/gtk/` and `npm run test:gtk`. In tests, click via `fireEvent` and query roles with `Gtk.AccessibleRole` enums (see docs/gtkx-rc2-notes.md).

## Next steps

- [docs/api.md](api.md) — the entire v1 surface and differences from RN;
- [CONTRIBUTING.md](../CONTRIBUTING.md) — developing the library itself (from macOS — via the UTM VM);
- [docs/gtkx-rc2-notes.md](gtkx-rc2-notes.md) — the gtkx rc.2 baseline: workarounds, what it fixed, quirks that stay.
