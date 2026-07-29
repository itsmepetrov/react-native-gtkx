# Getting Started

react-native-gtkx lets you write native Linux (GTK4/Adwaita) applications with the React Native API. No `@gtkx/*` imports in your code — only `react-native`.

## Requirements

- Linux (x64/arm64, glibc), GTK4 ≥ 4.20, libadwaita ≥ 1.8 (Ubuntu 26.04+, Fedora 43+);
- Node.js ≥ 24;
- dev packages: `sudo apt install libgtk-4-dev libadwaita-1-dev` (Ubuntu).

## New project from the template

```bash
cp -r <repository>/template my-app && cd my-app
npm install        # until the package is published: replace the dependency with a file: path, see the template README
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

## Examples in the repository

- `examples/profile` — a static layout; the same source also builds with react-native-web (`examples/profile-web`);
- `examples/playground` — interactive: Pressable, TextInput, Switch, FlatList, Modal, Animated, responsive via flexWrap;
- `examples/gallery` — a gallery of the entire v1 surface.

## Tests

Unit logic is plain vitest. Component tests use `@gtkx/testing` (render/screen/fireEvent) under headless Wayland: see `packages/react-native-gtkx/tests-gtk/` and `npm run test:gtk`. In tests, click via `fireEvent` and query roles with `Gtk.AccessibleRole` enums (see docs/gtkx-rc1-vs-main.md).

## Next steps

- [docs/api.md](api.md) — the entire v1 surface and differences from RN;
- [CONTRIBUTING.md](../CONTRIBUTING.md) — developing the library itself (including from macOS via a remote container);
- [docs/gtkx-rc1-vs-main.md](gtkx-rc1-vs-main.md) — rc.1 workarounds and the migration plan.
