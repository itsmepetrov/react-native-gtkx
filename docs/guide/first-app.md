# Your first app

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

The Metro path draws the same picture with the Metro preset instead of
the vite one in the first step — see [Toolchains](toolchains.md) for how
the two differ.

## Hello, GNOME

The entry point looks exactly like a React Native entry:

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

`runApplication` accepts desktop parameters (`title`, `width`, `height`)
— the only extension over the React Native signature.

## Running the app

A project started from the template runs with:

```bash
npm run dev
```

An app that added Linux to an existing React Native project runs
`run-linux` next to the platforms it already had:

```bash
npx react-native run-linux         # release bundle
npx react-native run-linux --dev   # Metro dev server + Fast Refresh

# the platforms this app already had
npx react-native run-ios
npx react-native run-android
```

`run-linux` ensures the gtkx codegen store, bundles with Metro for
`--platform linux`, and opens the window. With `--dev` it starts (or
reuses) the Metro dev server; edits apply to the live window with
component state preserved, syntax errors print readably in the terminal,
and the app recovers on the next successful build.

**Ctrl+Shift+D** — the react-native-windows shortcut, the desktop
stand-in for the shake gesture — opens the Dev Menu: Reload, plus any
entries the app registers through `DevSettings.addMenuItem`.

`run-linux` always runs what it builds. For a release build that stops
short of opening a window — packaging, CI, handing a bundle to someone
else's machine — see [Packaging](packaging.md) for `build-linux` instead.

## The gallery: a tour of the platform

`examples/gallery` in the repository is every capability this platform
claims, one per sidebar entry, in an app you run and poke at:

```bash
npm install                # from the repo root (workspaces)
cd examples/gallery
npm run dev                # gtkx dev — vite + Fast Refresh
```

The chrome is the package's own sidebar navigator — a native
`Adw.NavigationSplitView` with the sections in a real `GtkListBox` —
grouped in the order a reader meets the platform:

- **React Native** — views, text and layout, clipping, inputs/buttons/
  toggles, lists and media, Modal, Animated, interpolation, transforms,
  gestures (the responder system and `PanResponder`), and the core APIs
  (`Platform`, `Dimensions`, `Appearance`, `Alert`, `Linking`);
- **gtkx** — widget hosting (React Native content inside a GTK widget's
  child and slots) and the Adwaita stack (`Adw.NavigationView` driven
  declaratively);
- **Modules** — Reanimated (values, motion, layout animations, and the
  measured boundary of what's driven off the render thread), gesture
  handler (pan/tap/long-press, pinch/rotation, cross-gesture relations),
  drag-and-drop, Svg, and three sections running the real upstream
  `react-native-reanimated-dnd` and `react-native-drawer-layout`
  packages unmodified.

`GALLERY_SECTION=<id>` opens one section directly; `GALLERY_SCHEME=light`
starts in the light theme (the HeaderBar button toggles either way
live).

## Other examples in the repository

- `examples/profile` — a static layout; the same source also builds with
  react-native-web (`examples/profile-web`);
- `examples/rn-app` — a cli-init React Native app with ios, android and
  linux side by side;
- `examples/hn-app` — a Hacker News reader on the Metro path: live API
  data over Node `fetch`, state-based two-screen navigation, a lazily
  loaded comment tree.
