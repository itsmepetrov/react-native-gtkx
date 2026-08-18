# Toolchains: Metro or vite

react-native-gtkx supports two toolchains, and neither is the "real" one
with the other bolted on — both consume the same published package and
render through the same bridge. Which one a project uses is a question
about where the project comes from, not a tier of support:

- **Adding Linux to an existing React Native app** (already has
  `ios`/`android` and a Metro config): stay on Metro. `npx react-native
run-linux --dev` gives Fast Refresh, `run-linux`/`build-linux` are the
  same commands the other platforms use, just for `--platform linux`.
- **Starting a Linux-first project**: the template, on the vite preset.
  `gtkx dev` gives Fast Refresh, builds are single-file bundles.

See [Installation](installation.md) for setting up either one and
[Packaging](packaging.md) for what each produces when it's time to ship.

## The vite path

`gtkx dev` and `gtkx build` are the two commands a vite-path project
runs day to day; both start vite themselves and pick up the project's
`vite.config.ts` (with the `react-native-gtkx/vite` preset applied)
automatically.

```bash
gtkx dev [entry]      # dev server + Fast Refresh; entry defaults to
                        # src/index{.tsx,.jsx,.ts,.js}
gtkx build [entry]     # production bundle
```

Both accept `--cwd=<path>` to run against a project root other than the
current directory. `gtkx build` also accepts `--asset-base=<path>`, an
asset base path relative to the executable's directory, for layouts
where the bundle and its assets don't sit side by side. `gtkx codegen`
(with `--force` to wipe and regenerate a corrupted store) generates the
`@gtkx/gi`/`@gtkx/jsx` bindings for the GIR libraries declared in
`gtkx.config.ts` — `gtkx dev`/`gtkx build` run it automatically; a bare
`vitest run` does not (see [Testing](#testing) below).

## The Metro path

`run-linux`, `build-linux` and `deploy-linux` are contributed to the React
Native CLI by `react-native-gtkx`'s own `react-native.config.js` — no
separate install, they come with the package.

```bash
npx react-native run-linux [--entry-file <path>] [--bundle-output <path>]
                            [--skip-bundling] [--dev] [--port <number>]

npx react-native build-linux [--entry-file <path>] [--bundle-output <path>]
                              [--standalone] [--sea] [--sea-output <path>]

npx react-native deploy-linux [--entry-file <path>] [--target <formats>]
                               [--out <path>] [--print-manifests] [--skip-build]
```

`run-linux` bundles with Metro and opens the window; `--dev` starts (or
reuses) the Metro dev server on `--port` (default `8081`) instead, for
Fast Refresh. `build-linux` bundles for distribution and stops short of
running it — see [Packaging](packaging.md) for `--standalone`/`--sea`,
the two flags that turn the Metro bundle into something shippable.
`deploy-linux` goes one step further and builds an installable `.deb`/
`.rpm`/`.AppImage` from that same Metro build — also covered on the
[Packaging](packaging.md) page, which is where its vite-path counterpart
lives too (the same command name works for either toolchain).

## The React Compiler (vite path only)

`gtkx dev` and `gtkx build` run the [React
Compiler](https://react.dev/learn/react-compiler) over every source file
in the project — never `node_modules`. It is on unless `gtkx.config.ts`
turns it off:

```ts
export default defineConfig({
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "com.example.myapp",
  reactCompiler: false,
})
```

Omitting the option and setting it to `true` mean the same thing — only
an explicit `false` disables it. The Metro path (`run-linux`/
`build-linux`) keeps the app's stock Babel preset and never runs the
compiler.

If a ported app misbehaves in a way that smells like stale rendering —
a value that should have updated didn't — set `reactCompiler: false` and
see whether the symptom goes away. That one line tells you which half of
the system to debug: if the symptom disappears, the underlying issue is
a [Rules of React](https://react.dev/reference/rules) violation the
compiler is compiling around correctly, and the real fix is moving the
offending read into state, a ref, or a hook — not leaving the compiler
off. A typical shape: a component reading mutable module-level state
during render has that read memoized by the compiler, so it renders
fourteen times and shows the same value every time — it looks like a
broken counter and is in fact a working one behind a cached render.

On React Native the compiler is opt-in, so an app that doesn't follow the
Rules of React still works there. Here it's on by default, so the same
violations become visible misbehavior on a platform where everything
else is also new — which reads as a platform bug when it's a Rules-of-
React one.

Reanimated shared values have their own spelling for the same reason:
`sharedValue.value = x` and `sharedValue.set(x)` both work, but only
`.get()`/`.set()` passes compiler-aware lint (`react-hooks/immutability`
treats anything a hook returns as frozen). Prefer `.get()`/`.set()` in
new code; `.value` keeps working, so a ported app doesn't need a
rewrite.

## Bundler aliases

Both presets rewrite the same six package names: `react-native` itself,
plus `react-native-svg`, `react-native-reanimated`,
`react-native-worklets`, `react-native-gesture-handler` and
`react-native-reanimated-dnd` onto their compat subpaths. The
`react-native-svg` alias is the one most projects notice at the type
level: the alias is a bundler-time rewrite, so TypeScript still needs
its own answer for the bare `"react-native-svg"` specifier — an
unresolved import in the editor even though the build works. Which fix
applies depends on the project:

- **Also ships to iOS/Android/web**: install the real
  `react-native-svg` — the app needs it there regardless, and it ships
  its own `.d.ts`. The Linux build never executes that package's code
  (the alias rewrites the import before Node sees it).
- **Linux-only project** (the template, or an app with no mobile
  target): install `react-native-svg` as a **devDependency purely for
  its types** — `npm install -D react-native-svg`. The ordinary fix for
  a bundler-alias setup with no real package installed.

## Testing

react-native-gtkx ships its GTK component-testing recipe as two
subpaths, so a consumer app doesn't have to rediscover it:

- `react-native-gtkx/vitest` — `reactNativeGtkxTest()`, a ready Vitest
  project config: the headless-compositor plugin, the `react-native`
  alias and platform extensions, and the React act-environment setup;
- `react-native-gtkx/testing` — re-exports `@gtkx/testing`'s
  render/screen/userEvent/fireEvent surface, plus `renderHookWithWindow`
  for hooks that read the active window (`useWindowDimensions` and
  similar).

```ts
import { reactNativeGtkxTest } from "react-native-gtkx/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig(reactNativeGtkxTest())
```

The default test glob is `**/*.gtk.test.{ts,tsx}`. Component tests need a
headless Wayland compositor and D-Bus on `PATH` — `sway xwayland dbus` on
Ubuntu — and `gtkx codegen` must already have generated the project's
`@gtkx/gi` bindings, since a bare `vitest run` doesn't trigger codegen
itself the way `gtkx dev`/`gtkx build` do; wire that as a `pretest`
script. A missing compositor fails a test run with a readable error
rather than hanging.

```tsx
import { Root } from "react-native"
import { render, screen } from "react-native-gtkx/testing"

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
```

## MCP server for agents

An agent working inside a project that depends on react-native-gtkx can
ask the library about itself instead of guessing:
`react-native-gtkx-mcp` is a [Model Context
Protocol](https://modelcontextprotocol.io) server shipped as a `bin` on
the package. Register it project-level (Claude Code's `.mcp.json`, or
the equivalent config of any MCP-compatible client):

```json
{
  "mcpServers": {
    "react-native-gtkx": { "command": "npx", "args": ["react-native-gtkx-mcp"] }
  }
}
```

`npx react-native-gtkx-mcp` from the project root resolves the locally
installed version, so it always answers for the exact react-native-gtkx
version the project has. Three tools:

- `rn_gtkx_list_surface` — browse the surface without knowing a name
  first (portable components/APIs, gtk/adw widgets, common), with
  counts;
- `rn_gtkx_describe_component` — the one to reach for first: does a
  component/widget exist, which subpath it's exported from, what GTK
  widget backs it, what differs from React Native, whether it takes
  `style`/`onLayout` or is raw;
- `rn_gtkx_search_docs` — free-text fallback for symptoms and
  known-issue questions the other two can't answer by name.

It runs without GTK installed — no `@gtkx/*` import anywhere in it,
reading only the package's own bundled docs/manifest data. That matters
in practice: an agent is often reading the project from a machine with
no GTK toolchain at all.
