# VirtualizedList

**Profile:** GTK · **Backed by:** the same windowed core

Supported props: RN's opaque data-source shape over the same windowed core
`FlatList` sits on — `data` is read only through `getItemCount(data)` and
`getItem(data, index)`, both called lazily; only the rows the window
actually mounts are ever asked for. Everything else matches
[FlatList](flat-list.md), `CellRendererComponent` included.

Differs from react-native:

- The accessors are optional here and required upstream — one component
  serves both the opaque-source and plain-array shapes, which is why
  `FlatList` needs no separate implementation.
- `scrollToItem` scans the source through `getItem`, as upstream does — an
  opaque source has no index to look up directly.
- Every `FlatList` difference above applies unchanged.
