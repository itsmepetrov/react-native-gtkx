# Glossary

Terms this documentation uses in a specific sense, gathered in one place so
every other page can use them without redefining them.

## Platform

react-native-gtkx itself: the `react-native` API, rendered as native
GTK4/libadwaita widgets on Linux through gtkx (a React reconciler with an
in-process FFI into libgtk) and Yoga (layout). Linux is a React Native
[out-of-tree platform](https://reactnative.dev/docs/out-of-tree-platforms)
here, the same model react-native-windows and react-native-macos use — see
[Overview](overview).

## Host

The Node process a bundle actually runs inside — the JS runtime plus the
native GTK addon (`@gtkx/*`) loaded into it — as distinct from the bundle
itself, which a bundler produces but does not run. On the Metro path this is
`run-linux`'s own host (`dist/runner/host.js`); on the vite path, the
`gtkx dev`/`gtkx build` process fills the same role. See
[Packaging](../guide/packaging.md) and [Running without
libadwaita](../guide/plain-gtk.md#how-the-profile-is-detected).

## Bridge

`src/gtkx/bridge/` — the one place in this package's source that imports
`@gtkx/*` (eslint-enforced). gtkx is a young dependency, so its API drift
is absorbed here instead of at every call site; each workaround this forces
carries a `1.0-WORKAROUND` tag, cataloged in `docs/gtkx-1.0-notes.md`. See
[Overview](overview).

## Profile

Whether an app links libadwaita: **Adw** (the default — Adwaita widgets,
theming, native chrome) or **plain GTK** (no libadwaita at all). The choice
is per-app, made once in `gtkx.config.ts`'s `libraries`, not a runtime flag —
both are real, supported profiles, not a tier system. Every Reference entry
carries its own `**Profile:**` fact (or, for a whole subpath page, a
`profile:` frontmatter key), checked against the code by `docs:check`. See
[Running without libadwaita](../guide/plain-gtk.md).

## Toolchain

One of the two ways a project builds and runs: the **Metro path**
(`npx react-native run-linux`/`build-linux`, for a project that already has
`ios`/`android`) or the **vite path** (`gtkx dev`/`gtkx build`, what the
Linux-first template uses). Both consume the same published package and
render through the same bridge — the choice is about where a project comes
from, not a difference in what it can do. See
[Toolchains](../guide/toolchains.md).

## Surface

The exported set of components/APIs at a given import boundary — the
portable surface (everything reachable from `"react-native"`), the widget
surface (every `Gtk.Widget`/`Adw.Widget` subclass gtkx binds, wrapped, raw or
auxiliary), and so on for `react-native-gtkx/common`, `/gtk`, `/adw` and the
compat subpaths. "Surface" names what a subpath actually exports, checked
against the Reference by `docs:check`. See
[Overview](overview#the-widget-surface-wrapped-raw-and-auxiliary) and
[Reference](../reference).

## Layout root

Where a `LayoutEngine` — one Yoga tree — is created. There are three: the
window root (`AppRegistry.runApplication`), a nested root (`SlotContent`,
fills its slot) and an intrinsic root (`IntrinsicContent`, sized by its own
content); a test renders into a fourth, `<Root>`. The gesture responder
system's negotiation and a `ScrollView`'s clip both stop at a layout root's
boundary, since a React Native tree here can be an island inside a native GTK
widget tree. See [Layout and styling](layout-and-styling#three-flavors-of-layout-root).

## Portable

Code that imports only from `"react-native"` (or an upstream package
resolved onto its compat subpath by the aliasing both presets apply) and
therefore runs unchanged on iOS, Android and web too. Importing
`react-native-gtkx/gtk`, `/adw`, `/common` or a raw `@gtkx/*` module is
Linux-only by definition — the import itself is what marks a line as no
longer portable. See [Installation](../guide/installation.md) and
[Overview](overview#three-subpaths-beneath-the-portable-surface).
