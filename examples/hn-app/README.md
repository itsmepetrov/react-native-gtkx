# hn-app — a Hacker News reader

A two-screen Hacker News client for the Linux desktop, built on the
standard React Native Metro toolchain via
[react-native-gtkx](../../README.md). The UI is plain `react-native`
imports rendered as GTK4/Adwaita widgets; the data layer is the live
[HN Firebase API](https://github.com/HackerNews/API) over plain Node
`fetch` — no networking module, no native code.

## Run it

```sh
npm install          # from the repo root (workspaces)
npx react-native run-linux           # release bundle
npx react-native run-linux --dev     # Metro dev server + Fast Refresh
```

Needs GTK4 + libadwaita and Node >= 22.15.

## What it demonstrates

- **FlatList over live data** — top stories with pull-free refresh and
  infinite scroll (`onEndReached` pagination against a snapshotted
  ranking, see [`src/api.ts`](./src/api.ts));
- **state-based navigation** — tapping a card opens the story screen;
  it paints over the list (`position: "absolute"`), so the list stays
  mounted and its scroll offset and loaded pages survive going back —
  no navigation library;
- **a lazily loaded comment tree** — every comment fetches itself from
  `/item/<id>` when its node mounts, indents by depth and caps at three
  levels with a "Show replies" button ([`src/StoryScreen.tsx`](./src/StoryScreen.tsx));
- **HN HTML → plain text** — entities, `<p>` paragraphs, `<a href>`
  links flattened for `<Text>` in [`src/html.ts`](./src/html.ts), unit
  tested in [`tests/unit`](./tests/unit);
- **desktop integrations** — `Linking.openURL` for "Open in browser"
  and a remote `Image` favicon (a PNG favicon service; GTK cannot
  decode ICO, `onError` hides the image gracefully).
