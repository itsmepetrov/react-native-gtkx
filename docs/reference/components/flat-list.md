# FlatList

**Profile:** GTK · **Backed by:** a windowed core over `ScrollView`

Supported props:

- Virtualization (`estimatedItemSize` or `getItemLayout`, `windowSize`/
  `initialNumToRender` as the primary scroll-performance knobs,
  `maxToRenderPerBatch`/`updateCellsBatchingPeriod`).
- `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`.
- `CellRendererComponent` — RN's per-cell wrapper. The list still hands it
  the cell's absolute `style` and the `onLayout` that measures it, and both
  must be applied, which is what `react-native-draggable-flatlist` builds
  its design on.
- `ListHeader`/`Footer`/`EmptyComponent`, `onEndReached(-Threshold)`.
- `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`).
- `inverted` — RN's chat semantics: the list opens at `data[0]` and stays
  pinned on prepend.
- `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`.
- A ref exposing `scrollToIndex`/`scrollToItem`/`scrollToOffset` plus
  `scrollTo`/`scrollToEnd` (`FlatListHandle`) — the scroll half of a
  `ScrollView` ref, not the geometry half: a windowed list is a composite
  over `ScrollView` and owns no widget of its own, so measure the
  `ScrollView` or a cell instead.

Differs from react-native:

- 1000 rows mount windowed in roughly 120&nbsp;ms.
- `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory
  pressure, and a wider window means fewer mount-and-reflow bursts per
  scrolled pixel (measured: 21% less churn, late frames down from 10/s to
  7.7/s).
- Rows beyond the visible ones mount `maxToRenderPerBatch` (10) at a time,
  every `updateCellsBatchingPeriod` (50)&nbsp;ms, so a flick or a long
  `scrollToOffset` fills its window over several frames instead of stalling
  one.
- There is no pull gesture — `onRefresh` is always app-triggered.
- An inverted list shorter than its viewport anchors to the top, not the
  bottom.
- `CellRendererComponent` does not apply to a sticky cell
  (`stickyHeaderIndices`), because pinning reorders the cell's real GTK
  widget — the sticky container has to _be_ the cell.

Traces and the full scroll-phase measurement method are recorded in the
repository's `docs/research/` notes, referenced from the source.
