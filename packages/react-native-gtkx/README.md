<p align="center">
  <img src="https://raw.githubusercontent.com/itsmepetrov/react-native-gtkx/main/docs/icon.svg" width="128" alt="react-native-gtkx" />
</p>

<h1 align="center">react-native-gtkx</h1>

<p align="center"><b>React Native for the Linux desktop.</b><br/>
Write apps against the familiar React Native API — they run as native GNOME<br/>
applications on real GTK4/Adwaita widgets, with no WebView and no canvas rendering.</p>

<p align="center">
  <a href="https://github.com/itsmepetrov/react-native-gtkx/actions/workflows/ci.yml"><img src="https://github.com/itsmepetrov/react-native-gtkx/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/react-native-gtkx"><img src="https://img.shields.io/npm/v/react-native-gtkx" alt="npm" /></a>
  <a href="https://github.com/itsmepetrov/react-native-gtkx/releases"><img src="https://img.shields.io/github/v/release/itsmepetrov/react-native-gtkx?label=deb%20packages" alt="releases" /></a>
</p>

Under the hood: [gtkx](https://github.com/gtkx-org/gtkx) (a React reconciler for GTK4 on Node.js) + [Yoga](https://yogalayout.dev) (the RN flexbox engine). The model follows react-native-web: a compatibility layer on top of another renderer, with the `react-native` → `react-native-gtkx` alias provided by the Metro preset (Linux as a standard RN [out-of-tree platform](https://reactnative.dev/docs/out-of-tree-platforms) — `npx react-native run-linux` next to `run-ios`/`run-android`) or by the vite preset for Linux-first projects.

| ![Hacker News list — react-native-gtkx](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/shots/hn-list.png) | ![story screen with comments](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/shots/hn-story.png) |
| :-------------------------------------------------------------: | :----------------------------------------------------: |

_`examples/hn-app`, live in native GTK windows: a Hacker News reader on the standard React Native Metro toolchain. Tapping a card pushes a real `Adw.NavigationView` page — the back button, the slide and the preserved list position come from the platform, not from JS. The search field sits **inside** the HeaderBar (real RN content in native chrome) and queries the HN API; comments load as you scroll. The data layer is plain Node `fetch` — on this platform "native modules" are just Node._

And the portability proof — `examples/profile` renders ONE source file with both renderers, not a single `@gtkx/*` import in it:

| react-native-gtkx (GTK4)                                            | react-native-web (browser)                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| <img src="https://raw.githubusercontent.com/itsmepetrov/react-native-gtkx/main/docs/shots/profile.png" width="400" alt="profile — GTK"/> | <img src="https://raw.githubusercontent.com/itsmepetrov/react-native-gtkx/main/docs/shots/profile-web.png" width="400" alt="profile — web"/> |

## Status

- [x] Yoga + GtkFixed spike — **GO** (0 px accuracy, 500-node reflow in 0.17 ms, 60 fps — `docs/research/yoga-gtk-spike.md`)
- [x] Dev environment (UTM VM with a native GNOME session, headless sway for tests) and dev workflow
- [x] gtkx bridge (isolation from the RC API; [rc.1 workaround catalog](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/gtkx-rc1-vs-main.md))
- [x] Layout engine (Yoga shadow tree, measure via Pango, batching, diffing, onLayout)
- [x] StyleSheet: layout/visual split, CSS Color 4 colors, PlatformColor → Adwaita
- [x] View / Text / Image / AppRegistry — first RN render in GTK
- [x] Platform / Dimensions / Appearance / AppState / Alert / Linking (+ hooks)
- [x] Pressable / TouchableOpacity / TextInput / ScrollView / FlatList / Switch / Modal / Animated
- [x] Vite preset (alias, platform extensions) + project template (install → window in 63 s)
- [x] Component gallery and documentation
- [x] Windowed lists: virtualization (10k rows), sticky headers, SectionList, scrollToIndex, viewability, inverted (RN chat semantics), refresh parity
- [x] Linux as an RN **out-of-tree platform**: the standard Metro/Babel toolchain, `react-native.config.js` declared by the dependency, `npx react-native run-linux`, compiled package distribution (attw-checked) — see `examples/rn-app` (a cli-init app with ios + android + linux)
- [x] **Fast Refresh on both toolchains**: `run-linux --dev` (Metro dev server + HMR in the GTK host, state preserved) and `gtkx dev` (vite)

Verified live: `examples/gallery` (the whole surface) and the interactive `examples/playground` — 372 tests (unit + component tests under headless Wayland).

## Performance architecture

There is no "bridge tax" here. React Native's historic bottleneck — JSON
batches serialized between the JS and native threads — does not exist in this
architecture: gtkx binds GTK through an in-process FFI (NAPI-RS), so a widget
call is a synchronous C call on the same thread, with numbers and pointers
marshalled directly. That is the same direction React Native itself took with
JSI/Fabric, where Yoga and view commits run through direct synchronous calls.

Layout math runs in Yoga compiled to WASM (near-native speed): a 500-node
reflow measures at 0.13–0.17 ms. The GTK side is driven by our own
GtkLayoutManager subclass; a full measure+allocate pass over a 50-child
container costs ~0.21 ms including every FFI hop. Animation frames bypass
layout entirely — an Animated value write is a WeakMap store plus one queued
GTK allocation. Two orders of magnitude of headroom against a 60 fps frame
budget, measured, not estimated (see docs/research/yoga-gtk-spike.md and
docs/research/layout-manager.md).

## Documentation

- [Getting Started](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/getting-started.md) — a new project in a minute, and adding Linux to an existing RN app;
- [API v1](https://github.com/itsmepetrov/react-native-gtkx/blob/main/docs/api.md) — the full surface and differences from RN;
- [CONTRIBUTING](https://github.com/itsmepetrov/react-native-gtkx/blob/main/CONTRIBUTING.md) — developing the library (from macOS — via the UTM VM).

## Requirements

Linux, GTK4 ≥ 4.20, libadwaita ≥ 1.8, Node.js ≥ 24.

## License

MIT
