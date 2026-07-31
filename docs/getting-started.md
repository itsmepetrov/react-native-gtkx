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

## Svg

`<Svg>`/`<Path>`/`<Circle>` and the rest of the vector-graphics API come from
`react-native-svg`, not from `react-native-gtkx` itself — matching every
other platform, where `react-native-svg` is a separate package too (RN has
no built-in `Svg`). See [docs/api.md](api.md#svg) for the component set and
[the compat-subpath section](api.md#react-native-svg-compatibility-react-native-gtkxsvg)
for how both presets alias the bare `react-native-svg` import to it.

That alias is a bundler-level rewrite, so TypeScript still needs its own
answer for the specifier `"react-native-svg"` — an unresolved import in the
editor even though the build works fine. Which fix applies depends on what
the project targets:

- **Also ships to iOS/Android/web**: install the real `react-native-svg` —
  the app needs it on those platforms regardless. `react-native-svg` ships
  its own `.d.ts` (no separate `@types` package exists or is needed), so
  TypeScript resolves real, complete types for the specifier; the Linux
  build never actually executes that package's code — the preset rewrites
  the import to `react-native-gtkx/svg` before it reaches Node. Nothing
  react-native-gtkx-specific to configure.
- **Linux-only project** (the template, or an app with no mobile target):
  add `react-native-svg` as a **devDependency purely for its types** —
  `npm install -D react-native-svg`. This is the ordinary fix for a
  bundler-alias setup once the aliased name has no real package installed —
  the same shape as react-native-web's own TypeScript guidance (install a
  real, type-bearing package alongside the alias rather than fabricate
  one). Side benefit: if this package's compat surface ever drifts from
  upstream `react-native-svg`'s props (see the "Deliberate gaps" note in
  `packages/react-native-gtkx/src/svg-compat/index.ts`), the mismatch shows
  up as a type error instead of compiling silently.

We deliberately did not ship an ambient `declare module "react-native-svg"`
— the trick `react-native-gtkx/types` uses to teach the stock `react-native`
types about the `linux` platform. That works there because it only
_augments_ an already-resolved module (interfaces merge). Here the module
does not resolve at all without one of the two installs above, so the shim
would have to declare the whole module unconditionally to help — and a
project that installs the real `react-native-svg` later (adding a mobile
target) would then carry two declarations of the same module, the shim and
the real package's own, colliding. Installing the real package, even only
as a devDependency, never has that problem: there is only ever one
declaration of `"react-native-svg"` in play.

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

Unit logic is plain vitest — no special setup, runs anywhere. Component
tests render real GTK widgets under a headless Wayland compositor, and
react-native-gtkx ships the whole recipe as two subpaths so a consumer app
does not have to rediscover it:

- `react-native-gtkx/vitest` — `reactNativeGtkxTest()`, a ready Vitest
  project config: the headless-compositor plugin, the `react-native` alias
  and Metro-style platform extensions, an inline-deps default for RN
  libraries that import `react-native` themselves (`@react-navigation`),
  and the React act-environment setup;
- `react-native-gtkx/testing` — re-exports `@gtkx/testing`'s
  render/screen/userEvent/fireEvent surface (already RN-shaped: `getByText`
  finds a `Text`, `userEvent.click` walks up to a `Pressable`'s gesture
  controller — no wrapper needed) plus `renderHookWithWindow`, for hooks
  that read the active window (`useWindowDimensions` and similar) —
  `renderHook` alone mounts into a windowless container.

Minimal `vitest.config.ts`:

```ts
import { reactNativeGtkxTest } from "react-native-gtkx/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig(reactNativeGtkxTest())
```

The default test glob is `**/*.gtk.test.{ts,tsx}`; override `include` (and
`name`, `headless`, `platform`, `inlineDeps`, `setupFiles`,
`fileParallelism`) through `reactNativeGtkxTest`'s options. For a project
that also has portable unit tests, use the result as one entry of
`test.projects` instead of the whole config — `vitest.config.ts` at this
repo's root is the reference (`process.platform === "linux"` guards the
gtk project so `npm test` still works on a non-Linux dev machine, running
only the unit project there).

```tsx
import { Root } from "react-native"
import { render, screen } from "react-native-gtkx/testing"
import { expect, it } from "vitest"
import { App } from "../src/App"

it("renders the greeting", async () => {
  // react-native-gtkx components need a layout root — AppRegistry.runApplication()
  // in the real app, <Root> in a test.
  await render(
    <Root
      width={800}
      height={600}
    >
      <App />
    </Root>,
  )
  expect(screen.getByText("Hello, GNOME!")).toBeTruthy()
})
```

Requirements: a headless Wayland compositor and D-Bus on PATH — the same
system packages CI installs, `sway xwayland dbus` (Ubuntu:
`apt install sway xwayland dbus`). A missing compositor fails a test run
with a readable error (`Cannot find the "sway" executable on PATH`) rather
than hanging. `gtkx codegen` must already have generated the project's
`@gtkx/gi` bindings before the first test run — a bare `vitest run` does
not trigger codegen itself, unlike `gtkx dev`/`gtkx build`; the template's
own `package.json` wires this as a `pretest` script.

`packages/react-native-gtkx/tests/gtk/` is this repo's own suite, built on
the same `@gtkx/testing` surface directly (it tests source, not the
published package) — a good place to see more query and `userEvent`
patterns in context. Query roles with `Gtk.AccessibleRole` enums (see
docs/gtkx-rc2-notes.md for the live workarounds still baked into that
recipe).

## MCP server for agents

An agent working inside a project that depends on react-native-gtkx can
ask the library about itself instead of guessing: `react-native-gtkx-mcp`
is a [Model Context Protocol](https://modelcontextprotocol.io) server that
ships as a `bin` on this package. Register it in `.mcp.json` (Claude
Code, project-level) or the equivalent config of any MCP-compatible
client:

```json
{
  "mcpServers": {
    "react-native-gtkx": { "command": "npx", "args": ["react-native-gtkx-mcp"] }
  }
}
```

Running it as `npx react-native-gtkx-mcp` from the project root resolves
the locally installed `node_modules/.bin` entry — no separate install,
and it always answers for the exact react-native-gtkx version the
project actually has.

Three tools:

- `rn_gtkx_list_surface` — browse the surface without knowing a name
  first (portable components/APIs, gtk/adw widgets, common) with counts;
- `rn_gtkx_describe_component` — the one to reach for first: does a
  component/widget exist, which subpath it is exported from, what GTK
  widget backs it, what differs from React Native, whether a gtk/adw
  widget is wrapped (takes `style`/`onLayout`) or raw;
- `rn_gtkx_search_docs` — free-text fallback for symptoms and known-issue
  questions the other two cannot answer by name.

It works without GTK installed — plain Node, no `@gtkx/*` import
anywhere in it, reading only the package's own bundled docs/manifest data.
That matters in practice: the agent is often reading the project from a
Mac, with no GTK toolchain around at all.

## Next steps

- [docs/api.md](api.md) — the entire v1 surface and differences from RN;
- [CONTRIBUTING.md](../CONTRIBUTING.md) — developing the library itself (from macOS — via the UTM VM);
- [docs/gtkx-rc2-notes.md](gtkx-rc2-notes.md) — the gtkx rc.2 baseline: workarounds, what it fixed, quirks that stay.
