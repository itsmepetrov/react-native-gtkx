# ScrollView

**Backed by:** `GtkScrolledWindow`

Supported props:

- Vertical and `horizontal` scrolling.
- `contentContainerStyle` — the content container is a plain `View`, so
  `alignItems` defaults to `stretch` as it does in RN.
- `onScroll` (`contentOffset`, `contentSize`, `layoutMeasurement`), the four
  scroll-phase callbacks `onScrollBeginDrag`/`onScrollEndDrag`/
  `onMomentumScrollBegin`/`onMomentumScrollEnd`, `onContentSizeChange`.
- `stickyHeaderIndices` — the real child is translated and painted on top,
  no duplicate node.
- A ref exposing `scrollTo`/`scrollToEnd` plus the geometry methods
  `measure`/`measureInWindow`/`measureLayout` (`ScrollViewHandle`).
- A child that takes the responder suspends the scroller's own gestures for
  the rest of the interaction, so a pan gesture is reachable inside a
  scrolling list.

Differs from react-native:

- `animated` in `scrollTo` is ignored.
- **The scroll phases are input-device aware**: a mouse wheel gives GTK
  isolated detents, so a burst is grouped into one begin/end session (a
  120&nbsp;ms idle boundary) and reports no momentum; a touchpad glide
  reports all four phases from its native GTK sequence, and content really
  keeps moving once the fingers lift. RN has no wheel input, so the wheel
  session is a desktop-only extension rather than a parity claim.
- `onScrollBeginDrag`/`onScrollEndDrag` map onto the user-driven scroll
  _session_ (a touchpad's begin/end signal, or the grouped wheel burst)
  rather than a finger literally touching the content — the closest true
  statement available, since a touchpad never touches the content directly.
  The momentum pair reflects the adjustment actually continuing to move
  after the session ends rather than a generic "decelerate" signal that
  fires on every lift — a glide that stops dead reports the drag pair with
  no momentum pair, as RN does.
- None of this installs until a handler is attached: with all four phase
  callbacks attached, a scroll event costs 6.93&nbsp;µs versus 7.17&nbsp;µs
  with none attached — inside the noise; the GTK controller itself costs
  0.31&nbsp;µs per event once any phase handler is present, and a begin/end
  consumer specifically adds 0.235&nbsp;µs per wheel detent for the session
  state machine.
- Scroll arbitration between a scroller and a child gesture is touch-only:
  `GtkScrolledWindow`'s own gestures are touch-only, so under a mouse a
  child pan never competes with scrolling at all. Two known edges under
  touch: a child gesture that claims on a move rather than on the initial
  press can lose the first ~8&nbsp;px to the scroller (GTK's claim is
  irrevocable, the same artifact iOS has); and a mouse wheel during an
  active gesture terminates the responder rather than being suppressed.
- **The scroller carries RN's own base style**, `flexGrow: 1, flexShrink:
1`, composed under the app's `style` the same way RN's
  `StyleSheet.compose` composes it, on the same node `style` lands on —
  `FlatList`, `SectionList` and `VirtualizedList` inherit it. This is what
  makes an unstyled scrollable a viewport rather than a box grown to its
  content, and it has one consequence worth knowing: an explicit main-axis
  `height` on the scroller is only its flex _basis_ — inside a taller flex
  parent, `flexGrow` still expands it past that height. That is parity with
  RN's own Yoga behavior, not a deviation. To bound the viewport, bound the
  _parent_ (`<View style={{ height: 200 }}><FlatList /></View>`, what an RN
  app already writes) or cancel the base style with `flexGrow: 0`.

Traces and the full scroll-phase measurement method are recorded in the
repository's `docs/research/` notes, referenced from the source.
