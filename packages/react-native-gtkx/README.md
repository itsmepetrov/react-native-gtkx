<p align="center">
  <img src="https://raw.githubusercontent.com/itsmepetrov/react-native-gtkx/main/docs/icon.svg" width="128" alt="react-native-gtkx" />
</p>

<h1 align="center">react-native-gtkx</h1>

<p align="center"><b>React Native for the Linux desktop.</b><br/>
The <code>react-native</code> API, rendered as real GTK4/Adwaita widgets — no WebView,<br/>
no canvas, no bridge. Linux is a React Native out-of-tree platform here:<br/>
<code>npx react-native run-linux</code>, next to <code>run-ios</code> and <code>run-android</code>.</p>

<p align="center">
  <a href="https://github.com/itsmepetrov/react-native-gtkx/actions/workflows/ci.yml"><img src="https://github.com/itsmepetrov/react-native-gtkx/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/react-native-gtkx"><img src="https://img.shields.io/npm/v/react-native-gtkx" alt="npm" /></a>
  <a href="https://github.com/itsmepetrov/react-native-gtkx/releases"><img src="https://img.shields.io/github/v/release/itsmepetrov/react-native-gtkx?label=deb%20packages" alt="releases" /></a>
</p>

Under the hood: [gtkx](https://github.com/gtkx-org/gtkx) (a React reconciler for GTK4, with an in-process FFI into libgtk) and [Yoga](https://yogalayout.dev) — the same flexbox engine React Native itself uses. Navigation runs on real Adwaita widgets: react-navigation's stack and drawer are backed by an actual `Adw.NavigationView`/`Adw.NavigationSplitView`, so the back button, the slide transition, Escape, the back gesture and the back-history menu are the platform's, not a JS re-implementation. Past the portable surface, `react-native-gtkx/gtk` and `/adw` hand you every GTK/Adwaita widget directly — including a navigation stack that needs no router at all.

| ![Real Adwaita navigation](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/shots/gallery/adwaita-stack.png) | ![GTK widgets hosting React Native content](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/shots/gallery/widget-hosting.png) | ![A sidebar-navigated app in light mode](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/shots/gallery/sidebar-groups-light.png) |
| :---------------------------------------------------------------: | :-----------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: |

_From `examples/gallery`: a real `Adw.NavigationView` stack, a GTK widget's content area hosting React Native content, and the same sidebar-navigated app in light mode (Adwaita's light/dark theming, both ways)._

## Quickstart

```sh
npx degit itsmepetrov/react-native-gtkx/template my-app && cd my-app
npm install && npm run dev   # a window, with Fast Refresh
```

Adding Linux to an app that already ships iOS/Android is `npm install react-native-gtkx`, a one-line Metro config wrap, and `npx react-native run-linux` — see [installation](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/guide/installation.md).

## Documentation

The full docs, including screenshots per component and a searchable reference, are in this repo's `docs/` tree:

- [Guide](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/guide) — [installation](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/guide/installation.md), [your first app](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/guide/first-app.md), [Metro vs. vite toolchains](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/guide/toolchains.md), the [plain-GTK profile](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/guide/plain-gtk.md), [packaging](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/guide/packaging.md) (debs, standalone).
- [Reference](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/reference) — every component and API, each with its GTK/Adw badge and its differences from React Native.
- [Architecture](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/architecture) — [overview](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/architecture/overview.md) (the reconciler-to-gtkx path, the widget surface), [layout and styling](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/architecture/layout-and-styling.md) (the Yoga shadow tree, the style split), [gestures](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/architecture/gestures.md), and [window/navigation/settings integration](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/architecture/integration.md).
- [What we need from gtkx](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/upstream-gtkx.md) — the standing upstream agenda.
- [CONTRIBUTING](https://github.com/itsmepetrov/react-native-gtkx/blob/main/CONTRIBUTING.md) — developing the library from macOS, via a Linux VM.

## Requirements

Linux, GTK4 ≥ 4.20, libadwaita ≥ 1.8, Node.js ≥ 24.

## License

MIT
