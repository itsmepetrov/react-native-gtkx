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

`run-linux` always runs what it builds — for a release build that stops
short of opening a window (packaging, CI, handing a bundle to someone
else's machine), use `build-linux` instead; see
[Shipping an app](#shipping-an-app) below for what it produces and what
running it later needs.

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

## Shipping an app

The two paths get you from source to something installable differently,
because they take different positions on what stays out of the bundle.

**vite path** (`gtkx build`): everything except the native GTK addon is
inlined into one file. `dist/bundle.js` + `dist/gtkx.node` (plus
`dist/gschemas.compiled` if the app declares a GSettings schema — the
bundle's own banner points `GSETTINGS_SCHEMA_DIR` at its own directory) is
the whole runtime: copy those anywhere with Node ≥24, GTK4 ≥4.20 and
libadwaita ≥1.8, and `node bundle.js` runs it. No `node_modules` involved.

**Metro path** (`react-native build-linux`): the release counterpart to
`run-linux` that iOS, Android and react-native-windows already have and
this platform did not until now — it bundles with Metro and stops, instead
of bundling and immediately running like `run-linux` does:

```bash
npx react-native build-linux         # writes dist/main.jsbundle
```

This is **not** self-contained, unlike the vite path. Metro deliberately
keeps `@gtkx/*`, `react` and `yoga-layout` out of the bundle — they have to
be the exact instances the Node+GTK host loads, not a second copy Metro
inlines (see `packages/react-native-gtkx/src/metro/index.ts`,
`HOST_MODULE_EXTERNALS`, for why). So running `dist/main.jsbundle` needs,
on top of Node ≥24/GTK4/libadwaita, a real `node_modules` with
`react-native-gtkx` installed and the app's `gtkx.config.ts` present at the
working directory:

```bash
node node_modules/react-native-gtkx/dist/runner/host.js dist/main.jsbundle
```

(run from the app root — the config loader reads `gtkx.config.ts` from the
current directory, exactly like `run-linux` itself). Any ordinary
`npm install` of the app already has that `node_modules`; the difference
from the vite path only matters when packaging for a machine that never
ran one — see `scripts/build-deb.ts`'s Metro branch, which builds that
closure itself: a fresh, isolated install of the locally-packed
`react-native-gtkx` plus `gtkx codegen`, never a copy of a monorepo's own
hoisted `node_modules` (which would prove nothing about what a real install
needs).

That is the **default** artifact, and it is the only one that carries the
`node_modules` caveat. `--standalone` below removes it entirely: the same
Metro build, emitted as one self-contained file that runs on a system Node
with nothing installed beside it — the vite path's shape, on the Metro
path.

### One file (Metro path)

`build-linux` produces three artifacts. Which one you want is a question
about the delivery channel, not about the build — they share the same
Metro step and differ only in how much of the runtime travels with the
app:

| Flag           | Artifact                   | Needs installed                    | Size (`hn-app`, linux-arm64) |
| -------------- | -------------------------- | ---------------------------------- | ---------------------------- |
| _(none)_       | `dist/main.jsbundle`       | a `node_modules` tree **and** Node | 0.4 MB + the tree            |
| `--standalone` | `dist/<name>.cjs`          | Node only (`Depends: nodejs`)      | 6.9 MB                       |
| `--sea`        | `dist/<name>` (executable) | nothing at all                     | 104 MB (30 MB compressed)    |

```bash
npx react-native build-linux --standalone     # in the app root
node ./dist/<your-package-name>.cjs           # one script, system node

npx react-native build-linux --sea
./dist/<your-package-name>                    # one executable, nothing else
```

Both flags produce the jsbundle exactly as before, then one additional
file next to it. `--sea-output <path>` overrides where it goes; the
default is `dist/<package name>` with any npm scope stripped (plus `.cjs`
for `--standalone`).

**Pick `--standalone` for anything installed through a package manager.**
It is the same shape gtkx's own packaging produces and the same shape the
vite path already ships in its `.deb` — a bundle plus a `nodejs`
dependency — and it is the lightest of the three by any measure that
counts: the plain jsbundle looks smaller only because its `node_modules`
tree is not weighed. **Pick `--sea` for "download this one file and run
it"**, where nothing can be assumed to be installed. They are not
competing implementations: `--sea` is `--standalone` with a copy of Node
wrapped around it, and that copy is the entire 97 MB between them.

A tagged release of this repo publishes the `--sea` executable for
`hn-app`, `zstd`-compressed, alongside the `.deb`s (`zstd -d` it and run
it). The `.deb`s remain how you install these apps; the executable is
there for the machine that has no Node to depend on.

That copy is stripped of its debug symbols as part of the build, which is
not a micro-optimisation: the `node` binary NodeSource distributes for
Ubuntu ships `with debug_info, not stripped` — 117 MB, 98 MB after
`strip --strip-all` — so 19 MB of every unstripped SEA is debug
information for Node's own C++, which nothing in a shipped app can use.
The step is best-effort: a build machine without binutils gets a warning
and a larger executable, not a failed build. It also runs strictly before
postject, since `--strip-all` removes exactly the kind of non-allocated
section the injected blob is. What remains after that is Node itself, and
it does not compress away either — but it does compress: 30 MB with
`zstd -19`, which is what a download actually costs.

The native addon (`@gtkx/native-*.node`, a real `dlopen`ed library) cannot
be JavaScript, so both artifacts carry it as bytes — a SEA asset in the
executable, a base64 literal in the `.cjs` — and extract it to
`$XDG_CACHE_HOME/react-native-gtkx-sea` on first run, keyed by content
hash. That is what keeps "one file" honest in both cases.

Nothing extra to install to bundle it. That work is done by **rolldown**,
which is vite's own engine — vite 8 depends on it outright, `@gtkx/cli`
depends on vite, and this package depends on `@gtkx/cli`, so it is already
in every install. (esbuild, which gtkx's tutorial uses for the same job,
would have been the one genuinely new bundler in the tree: vite 8 lists it
as an _optional_ peer and does not install it.)

One thing `--sea` does need that a plain `build-linux` does not: **the
gtkx codegen store**, and therefore GTK development headers on the build
machine. A plain `build-linux` deliberately needs neither — Metro
externalizes every GTK module — but the SEA inlines `virtual:gtkx-config`,
which re-exports `@gtkx/jsx/metadata`, a codegen product. `build-linux
--sea` runs `gtkx codegen` itself; it just can't do so on a machine
without the headers.

`postject` is fetched through `npx` at build time, so the first run needs
network access.

This follows gtkx's own tutorial (`gtkx-org/gtkx examples/tutorial`:
bundle to CJS, `node --experimental-sea-config`, postject injects the blob
into a copy of the `node` binary) for the SEA/postject mechanics.
It diverges on the two hard parts specific to this project — full
reasoning, including everything found empirically while building it (not
just designed on paper), lives in
`packages/react-native-gtkx/src/sea/bundle.ts` and `native-shim.ts`; the
short version:

- **The native addon** (`@gtkx/native-<platform>-<libc>`, loaded through
  dlopen) cannot be embedded as bundled code — a SEA is a V8 code cache
  blob, dlopen needs a real file. The tutorial's own answer is to keep it
  BESIDE the executable; that's two files, which is exactly what this
  build exists to stop being. This build embeds it as a Node SEA "asset"
  instead and extracts it to a per-user cache directory
  (`$XDG_CACHE_HOME/react-native-gtkx-sea`, falling back to `os.tmpdir()`
  for a read-only `$HOME`) on first run, keyed by a content hash so
  repeat launches reuse the extracted file. Loading it back turned out to
  need `process.dlopen()`, not `require()` — a SEA's main script can only
  `require()` built-ins and embedded assets (confirmed empirically:
  `require(anyAbsolutePath)` throws `ERR_UNKNOWN_BUILTIN_MODULE`) — and,
  found only by actually running the result, an explicit
  `nativeModule.exports.init()` call right after `dlopen()`: without it
  the first GTK-driven callback into JS panics on the Rust side ("the
  Node environment was accessed from a thread it is not installed on").
- **Metro's externals** (`HOST_MODULE_EXTERNALS`) are inlined by a
  generated entry — a third host implementation alongside `host.ts` and
  `host-dev.ts` — that `await import()`s every externalized name and
  assembles `globalThis.__hostModules` before running the jsbundle text,
  instead of the app needing a runtime `node_modules` to load them from.
  `gtkx.config.ts` is resolved once, at bundle time (like the vite path
  already does), not on every process start (like `host.ts` does) — a SEA
  has no "app root" to read a config file from at runtime.

Size, measured on the one platform this was built and proven on
(linux-arm64): **104 MB** for `hn-app`, 30 MB compressed. Stripped Node is
~98 MB of that — the bundled app code plus the embedded native addon is
under 7 MB. Worth saying plainly: that is still a heavy download for what
a Hacker News reader needs, and it will not shrink further while the
artifact carries a full Node binary. That is the trade `--sea` exists to
make, and `--standalone` is the answer whenever it isn't worth it.

**Proof, not just a build**: copied the executable alone (no `node_modules`,
no source tree) to an isolated directory on the VM, removed `/usr/bin/node`
from the system (confirmed `command -v node` found nothing), launched the
binary under a headless Wayland compositor, and screenshotted a live,
working "Hacker News" window with real fetched data — not a build log, not
a run from the source tree.

**vite path — not done here.** Investigated, and it does not generalize
the same way: the vite bundle loads the native addon through
`createRequire(import.meta.url)("./gtkx.node")` — a dynamically obtained
`require`, not a literal `require(...)` call — which a bundler does not
intercept the way it intercepts a static import (verified: the resolve
hook never fires for it in a real rebuild of `dist/bundle.js`). The vite
bundle also has its own top-level await, incompatible with the CJS format
a Node SEA main script requires. Both are fixable in principle (a
text-level rewrite of the compiled `require` call before re-bundling,
version-coupled to `@gtkx/cli`'s vite plugin), but that is a different,
more fragile technique than the Metro path's, and wasn't built or proven
here. If a true single file is wanted for the vite path too, that rewrite
is where to start — not a repeat of this approach.

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
docs/gtkx-rc3-notes.md for the live workarounds still baked into that
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
- [docs/gtkx-rc3-notes.md](gtkx-rc3-notes.md) — the gtkx rc.3 baseline: workarounds, what it fixed, quirks that stay.
