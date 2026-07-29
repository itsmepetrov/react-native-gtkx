# react-native-gtkx

**React Native for the Linux desktop.** Write apps against the familiar React Native API (`View`, `Text`, `StyleSheet`, flexbox) — they run as native GNOME applications on real GTK4/Adwaita widgets, with no WebView and no canvas rendering.

Under the hood: [gtkx](https://github.com/gtkx-org/gtkx) (a React reconciler for GTK4 on Node.js) + [Yoga](https://yogalayout.dev) (the RN flexbox engine). The model follows react-native-web: a compatibility layer on top of another renderer, with the `react-native` → `react-native-gtkx` alias provided by the vite preset.

![profile — GTK](docs/shots/profile.png)

_The `examples/profile` demo: not a single `@gtkx/*` import — only `react-native`. Every rectangle is a real GTK widget; Yoga computes the flexbox layout, Pango measures the text._

The same source built with react-native-web ([portability proof](docs/shots/profile-web.png)) — structurally identical.

## Status

- [x] Yoga + GtkFixed spike — **GO** (0 px accuracy, 500-node reflow in 0.17 ms, 60 fps — `spike/RESULTS.md`)
- [x] Dev environment (Docker/VM, GTK 4.22, live VNC) and CI workflow
- [x] gtkx-bridge (isolation from the RC API; [rc.1 workaround catalog](docs/gtkx-rc1-vs-main.md))
- [x] Layout engine (Yoga shadow tree, measure via Pango, batching, diffing, onLayout)
- [x] StyleSheet: layout/visual split, CSS Color 4 colors, PlatformColor → Adwaita
- [x] View / Text / Image / AppRegistry — first RN render in GTK
- [x] Platform / Dimensions / Appearance / AppState / Alert / Linking (+ hooks)
- [x] Pressable / TouchableOpacity / TextInput / ScrollView / FlatList / Switch / Modal / Animated
- [x] Vite preset (alias, platform extensions) + project template (install → window in 63 s)
- [ ] Component gallery, final documentation — in progress

Verified live: the interactive `examples/playground` (buttons, input, scrolling, modals, animation, responsive layout via flexWrap) — 325 tests (unit + component tests under headless Wayland).

## Documentation

- [Getting Started](docs/getting-started.md) — a new project in a minute;
- [API v1](docs/api.md) — the full surface and differences from RN;
- [CONTRIBUTING](CONTRIBUTING.md) — developing the library (including from macOS via a remote container);
- roadmap and decisions: `.claude/prds/`, `.claude/epics/` (ccpm).

## Requirements

Linux, GTK4 ≥ 4.20, libadwaita ≥ 1.8, Node.js ≥ 24.

## License

MIT
