# upstream-libraries

Two real npm packages, installed for real, running on this platform.

- **`react-native-reanimated-dnd@2.0.0`** — the published tarball, not
  `react-native-gtkx/dnd`. The preset's alias is undone for this project only,
  so the library resolves for real and everything it imports
  (`react-native`, `react-native-reanimated`, `react-native-worklets`,
  `react-native-gesture-handler`) is answered by react-native-gtkx.
- **`react-native-drawer-layout@4.2.9`** — the drawer around the whole window.
  Drag from the left edge to open it.

This is the opposite of `examples/reanimated-dnd`, which proves the MIRROR:
upstream's own unedited source with `react-native-reanimated-dnd` aliased onto
`react-native-gtkx/dnd`, so the real package never loads. Both are worth
having, and the difference between them is the whole
[research note](../../docs/research/upstream-libraries.md).

```sh
npm run build -w upstream-libraries-example
npm run start -w upstream-libraries-example
```

Two things in here are deliberate and are explained where they appear:

- `vite.config.ts` carries a ten-line plugin because
  `react-native-drawer-layout` ships `GestureHandler.ios.js` and
  `GestureHandler.android.js` with no `.native.js`, so every out-of-tree
  platform silently resolves the no-op web fallback and the drawer becomes
  undraggable without a single warning;
- `Sortable` is given `useFlatList={false}`, because its rows are absolutely
  positioned and this platform's windowed list drops one of them.
