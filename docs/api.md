# API v1

The surface mirrors `react-native`; everything in the tables below is imported from `"react-native"` (aliased by the Metro preset — `react-native-gtkx/metro` — or the vite preset; see [Package aliases](#package-aliases) for the six names both rewrite and how to change them) or directly from `"react-native-gtkx"`. Completeness is enforced by `npm run docs:check` (every public export must be mentioned in this file). Toolchain subpaths: `react-native-gtkx/metro` (`withLinuxPlatform`), `react-native-gtkx/vite` (the vite preset), `react-native-gtkx/runner` (the `run-linux` command implementation), `react-native-gtkx/vitest` (`reactNativeGtkxTest`, a ready Vitest project config for component tests under headless Wayland), `react-native-gtkx/testing` (`@gtkx/testing`'s render/screen/userEvent surface plus `renderHookWithWindow`), `react-native-gtkx/mcp` (the `react-native-gtkx-mcp` bin's programmatic surface, for embedding and testing — the bin itself is how an agent uses it) and `react-native-gtkx/types` (augments the stock RN types with the `linux` platform — reference it from an `env.d.ts`) — see [getting-started](getting-started.md#tests) for the testing subpaths.

**Past the portable surface:** [`react-native-gtkx/gtk` and `react-native-gtkx/adw`](platform-layer.md) exposes the GTK layer itself — Adwaita and GTK widgets as React components, taking `style` so React Native drives their position and appearance, plus an `Adw.NavigationView` primitive that needs no router. That is where to look when this page does not have what you need; it is Linux-only by design and the import says so.

## Components

| Export                     | GTK implementation                           | Supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Differences from RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View`                     | GtkBox (RnGtkxViewBox)                       | `style`, `onLayout`, `testID`, children, `pointerEvents` (auto/none/box-none/box-only — mapped onto GTK picking: can-target + a contains() vfunc override; also honored from `style.pointerEvents`, the prop wins), `focusable` + `onFocus`/`onBlur` (RN has `focusable` on View for Android/Windows; react-native-web and react-native-windows both have the callbacks — off by default, as in RN), ref: `measure`/`measureInWindow`/`measureLayout` (`ViewHandle`, RN's argument order; window coordinates come from `gtk_widget_compute_point`, so they are correct inside a scrolled viewport), the responder and touch props ([guide](gestures.md)) (`onStartShouldSetResponder(Capture)`, `onMoveShouldSetResponder(Capture)`, `onResponderGrant/Start/Move/End/Release/Terminate`, `onTouchStart/Move/End/Cancel` + `Capture`) — spread `PanResponder`'s `panHandlers` here                                                                                                                                                                                                                                                                                      | Responder negotiation is RN's in full — capture-then-bubble, transfer to an ancestor mid-gesture through `onResponderTerminationRequest`/`onResponderReject`, and `onResponderTerminate`. The lock is one per process as in RN; the negotiation PATH stops at the layout root, so native GTK widgets between or above views take no part. Single-pointer only: a mouse is one fabricated touch, `touches` never exceeds one. Terminations differ from RN's, because GTK decides most of them before JS is told: a context menu (a second mouse button), a native widget or a `Controllers` `GtkDragSource` taking the sequence, and text selection all arrive as a cancelled gesture and terminate **without** consulting `onResponderTerminationRequest` — GTK's `CLAIMED` is irrevocable, so there is nothing an answer could change. Window blur terminates unconditionally, as it does in react-native-web. An enclosing `ScrollView` scrolling under the gesture is the one termination the holder may refuse. `overflow: "hidden"` (and `"scroll"`, which clips identically — a `View` is not made scrollable by a style on this platform any more than it is in RN) clips both the paint AND the picking of the children, including transformed ones and children driven out by an animated absolute `top`/`left`: GTK pushes a clip node over the container's CSS padding box before it snapshots them, and `gtk_widget_pick()` refuses the same box, so what you cannot see you cannot click. `borderRadius` shapes that clip — a rounded container clips its children to the rounded corners. A container never clips its OWN background, border, shadow or outline, only its children's                                                                                                                                                                                                                                                                                                                                |
| `Text`                     | GtkLabel (Pango)                             | wrap, `numberOfLines` (ellipsize END), `textAlign`, font styles, `onLayout`, `testID`, ref: `measure`/`measureInWindow`/`measureLayout` (`TextHandle` — RN gives every host component the geometry methods, so a label no longer has to be wrapped in a `View` to be measurable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | nested `Text` elements are concatenated without per-span styles; text is always ellipsizable (shrinkable in narrow windows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Image`                    | GtkPicture                                   | `source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`; **`.svg` files load like any other image** — `Gdk.Texture.newFromFilename` rasterizes them via librsvg, no extra code needed (for building vector graphics from state instead of a file, see the "Svg" section below — a separate import, not part of this table); ref: `measure`/`measureInWindow`/`measureLayout` (`ImageHandle`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | no synchronous size from remote images (style sets the size, as in RN); cache is not size-limited yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `TextInput`                | GtkEntry / GtkTextView                       | controlled/uncontrolled (`value`/`defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus`/`onBlur`, `placeholder` (own dim overlay in multiline — GtkTextView has none), `secureTextEntry`, `editable`, `keyboardType`, `multiline`, `clearButtonMode` (GtkEntry's built-in clear icon; RN ships this on iOS only), the visual half of `style` (background, border, radius — it used to be computed and dropped, so a styled TextInput silently kept the theme's own frame) (real GtkTextView: word wrap, internal scroll, Enter inserts a newline and never fires onSubmitEditing — RN semantics)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | multiline needs a height in the style (as RN recommends)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Pressable`                | GtkBox (RnGtkxViewBox) + GestureClick/Motion | `onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn/Out`, `onFocus`/`onBlur`, `focusable`, `disabled`, function-form `style`/`children` receiving `{pressed, hovered, focused}` (react-native-web's own state shape); **keyboard-operable**: `focusable` defaults to true when `onPress` is set (react-native-web's rule), which puts the view in GTK's focus chain so Tab and the arrow keys reach it, and Enter/Space fire `onPress` as they do on web and Android; the `PressEvent` payload is RN's shape (`locationX/Y` target-relative, `pageX/Y` window-relative, `identifier`, `target`, `force`, monotonic `timestamp`, single-element `touches`/`changedTouches` — a desktop pointer is one fabricated touch). `hitSlop` and `pressRetentionOffset`, each a number or per-edge; the press rect defaults to RN's own `{top: 20, left: 20, right: 20, bottom: 30}` around the hit rect, and a release outside it is a cancel rather than a press                                                                                                                                                                                                     | `hitSlop` cannot escape an ancestor that clips — a `ScrollView` viewport, or any view with `overflow: "hidden"` — because GTK stops picking at the clip, which is the limit RN documents on Android for the same reason. Hover fires from touch as well as from a mouse: react-native-web filters that out, and here a GTK crossing event carries no device to filter on; GTK also sends a matching leave when a touch sequence ends, so the stuck phantom hover the filter exists for does not arise, and GTK's own `:hover` behaves the same way (docs/research/gestures.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `TouchableOpacity`         | on top of Pressable                          | `activeOpacity`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `TouchableHighlight`       | on top of Pressable                          | `underlayColor` (RN default `black`), `activeOpacity`, `onShowUnderlay`/`onHideUnderlay`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | RN renders a separate underlay VIEW behind the child and dims the child onto it; here the highlight is the view's own `backgroundColor` while pressed, because an extra box would change flex layout and what `measureLayout` is relative to — the same reason `GestureDetector` and `createAnimatedComponent` add none. Give the child a translucent background for RN's exact blend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `TouchableWithoutFeedback` | on top of Pressable                          | the `Pressable` press/hover/focus props, with no visual reaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | RN clones its single child instead of rendering a box, which its own docs call a mistake kept for compatibility; this renders the `Pressable` box. Prefer `Pressable`, as RN's docs say.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ScrollView`               | GtkScrolledWindow                            | vertical/`horizontal`, `contentContainerStyle` (RN's default: the content container is a plain `View`, so `alignItems` is `stretch` — children fill the cross axis unless they say otherwise), `onScroll` (`contentOffset`, `contentSize`, `layoutMeasurement`), `onScrollBeginDrag`/`onScrollEndDrag`/`onMomentumScrollBegin`/`onMomentumScrollEnd` (the four phases, each carrying the same `ScrollEvent` — see the Differences column), `onContentSizeChange`, `stickyHeaderIndices` (RN model: the REAL child is translated and painted on top — no duplicate), ref: `scrollTo`/`scrollToEnd` **plus the geometry methods** `measure`/`measureInWindow`/`measureLayout` (`ScrollViewHandle`). A view inside it that takes the responder suspends the scroller's own gestures for the rest of the interaction — RN's `setIsJSResponder`, so a child pan is reachable inside a scrolling list                                                                                                                                                                                                                                                                         | `animated` in scrollTo is ignored. **The scroll phases are the input DEVICE's, not the platform's**: a mouse wheel reports none of them — GTK emits a detent with no beginning, no end and nothing coasting after it, so there is no drag to begin and no momentum to report — while a touchpad glide reports all four, and the content really does keep moving after the fingers leave. `onScrollBeginDrag`/`onScrollEndDrag` map onto GTK's scroll SEQUENCE (`::scroll-begin`/`::scroll-end`) rather than onto a finger on the content, which is the one approximation: a touchpad never touches the content, so "the user started driving this scroller" is the closest true statement. The momentum pair is read off the adjustment actually moving after the sequence ended, not off `::decelerate` (which fires at every lift, velocity or none), so a glide that ends dead reports the drag pair and no momentum pair — as RN does. **None of it is installed until a handler is attached**: no controller, no signal, no timer, and 6.93 µs per scroll event with all four attached against 7.17 µs with none, which is inside the noise; the one residual is 0.31 µs per event for the GTK controller itself, and only while a handler is attached. Traces and numbers: [research/scroll-phases.md](research/scroll-phases.md). Scroll arbitration is **touch-only and unverified end to end**: all four gestures `GtkScrolledWindow` installs are touch-only, so under a mouse a child pan never competes with scrolling at all, and no touch can be injected on the test rig (wlroots has no virtual-touch protocol) — every link of the mechanism is tested, the finger is not. Two known edges on touch: a view that claims on a MOVE rather than on press can lose the first ~8 px to the scroller, which `CLAIMED` makes irrevocable (iOS has the same artefact); and the mouse wheel is deliberately left alone, so scrolling with a wheel during a gesture terminates the responder rather than being suppressed |
| `FlatList`                 | windowed core on ScrollView                  | virtualization (`estimatedItemSize` or `getItemLayout`, **`windowSize`/`initialNumToRender` — the primary scroll-performance knobs**, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`), `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`, `CellRendererComponent` (RN's per-cell wrapper — the list still hands it the cell's absolute `style` and the `onLayout` that measures it, and both must be applied; this is what `react-native-draggable-flatlist` builds its whole design on), `ListHeader/Footer/EmptyComponent`, `onEndReached(-Threshold)`, `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`), `inverted` (RN chat semantics: opens at `data[0]`, stays pinned on prepend), `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`, ref: `scrollToIndex`/`scrollToItem`/`scrollToOffset` + `scrollTo`/`scrollToEnd` (`FlatListHandle`) — the SCROLL half of a ScrollView ref, not the geometry half: a windowed list is a composite over a ScrollView and owns no widget of its own, so a `measure()` here would have to pick some inner widget and pretend it was the list. Measure the `ScrollView` or a cell | 1000 rows mount windowed in ~120 ms (v1 full mount was 879 ms); `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure and a wider window means fewer mount+reflow bursts per scrolled pixel (measured: −21% churn, late frames 10/s → 7.7/s); rows beyond the visible ones are mounted `maxToRenderPerBatch` (10) at a time every `updateCellsBatchingPeriod` (50) ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one; no pull gesture — `onRefresh` must be app-triggered; an inverted list shorter than its viewport anchors to the top, not the bottom; `CellRendererComponent` is not applied to a STICKY cell (`stickyHeaderIndices`) — pinning reorders the cell's real GTK widget, so the sticky container has to BE the cell                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SectionList`              | on top of FlatList                           | `sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | viewability props are not exposed (section-aware ViewTokens pending)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `VirtualizedList`          | the same windowed core                       | RN's data-source shape over the list `FlatList` already sits on: `data` is OPAQUE and read only through `getItemCount(data)` and `getItem(data, index)`, both honoured LAZILY (only the rows the window mounts are ever asked for). Everything else is `FlatList`'s row above, `CellRendererComponent` included                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The accessors are OPTIONAL here and required upstream — one component serves both shapes, which is why `FlatList` needs no separate implementation. `scrollToItem` scans the source through `getItem` (upstream scans too; an opaque source has no index to ask). Every difference in the `FlatList` row applies unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Switch`                   | GtkSwitch                                    | `value`/`onValueChange`, `disabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | sized by the GTK theme, not iOS metrics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ActivityIndicator`        | GtkSpinner                                   | `animating`, `size` (small/large/number)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | no `color` yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Modal`                    | modal GtkWindow (portal)                     | `visible`, `onRequestClose` (Escape/close button), `title`, `width`/`height`; independently resizable with relayout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | desktop semantics: a separate window, not an overlay; `transparent`/`animationType` are no-ops                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Animated.View`            | direct widget calls                          | `opacity` and the whole `transform` array — `translateX/Y`, `scale`, `scaleX`, `scaleY`, `rotate`/`rotateZ` — driven by Animated nodes, bypassing React (an angle comes from `interpolate` with a `deg`/`rad` outputRange); `top`/`left`/`right`/`bottom` too when the node's own `position` is `"absolute"`, which is what makes `Animated.ValueXY`'s `getLayout()` work; and `width`/`height` where the change is confined to the node that owns it; plus the same responder and touch props `View` takes — this is where an idiomatic `PanResponder` drag lands; plus `pointerEvents` and `animatedProps`, because Reanimated's `Animated.View` is `createAnimatedComponent(View)` and every View prop reaches it there                                                                                                                                                                                                                                                                                                                                                                                                                                              | `rotateX`/`rotateY`/`perspective` (3D), `skewX`/`skewY` and `matrix` are not supported, and the transform origin is always the view's centre (no `transformOrigin`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SafeAreaView`             | = View                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | no notches on desktop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `StatusBar`                | null                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | no status bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Root`                     | internal root                                | `width`/`height`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | extension: required by the test harness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NestedRoot`               | internal root                                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | extension: a Yoga root inside any GTK container slot (navigation pages, custom containers); the slot allocation is the viewport                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `IntrinsicRoot`            | internal root                                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | extension: a content-sized Yoga root for chrome slots (HeaderBar start/end) — reports its content size to GTK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## API modules

| Export                | Supported                                                                                                                                                                                                                                                                                                                                                       | Differences                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StyleSheet`          | `create`, `flatten`, `compose`, `absoluteFill(Object)`, `hairlineWidth`                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `PlatformColor`       | Adwaita variables: `PlatformColor("accent-bg-color")` → `var(--...)`, `@named`                                                                                                                                                                                                                                                                                  | names are Adwaita, not iOS/Android                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `AppRegistry`         | `registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome,actionAccels,breakpoints,applicationActions,windowActions,windowControllers})`, `getAppKeys`                                                                                                                                                                               | desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app's HeaderBars (navigation) become the chrome. `actionAccels` binds accelerators to action names on the `GtkApplication`; `breakpoints` reaches `AdwApplicationWindow`'s own prop and only does anything under `chrome: "content"` (a dev warning fires otherwise). **`applicationActions`/`windowActions`/`windowControllers` are deprecated** — reach for [`<ApplicationActions>`/`<WindowActions>`/`<WindowControllers>`](platform-layer.md#actions-and-shortcuts-declared-in-the-app-tree) instead; they still work unchanged |
| `Platform`            | `OS: "linux"`, `Version` (GTK), `select` (linux → native → default), `isTV`, `isTesting`                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Dimensions`          | `get("window"/"screen")`, `addEventListener("change")`                                                                                                                                                                                                                                                                                                          | main window only (transient windows are ignored)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `useWindowDimensions` | reactive main-window dimensions                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Appearance`          | `getColorScheme`, `setColorScheme` (AdwStyleManager), `addChangeListener`                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `useColorScheme`      | reactive theme                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `AppState`            | `currentState` active/background, `addEventListener`                                                                                                                                                                                                                                                                                                            | driven by the window's `is-active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Alert`               | `alert(title, message, buttons, options)` → Adw.AlertDialog                                                                                                                                                                                                                                                                                                     | `cancel`/`destructive`/`isPreferred` styles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Linking`             | `openURL`, `canOpenURL` (http/https/mailto/file), `getInitialURL` (null), `addEventListener("url")`                                                                                                                                                                                                                                                             | system launcher; no deep-link delivery on desktop yet — "url" subscriptions never fire                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `InteractionManager`  | `runAfterInteractions(task?)` (cancellable, then-able), `createInteractionHandle`/`clearInteractionHandle`, `addListener`                                                                                                                                                                                                                                       | navigation transitions register interactions, so screen work deferred with `runAfterInteractions` waits for the push/pop slide                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `DevSettings`         | `addMenuItem(title, handler)` (entries in the Dev Menu — Ctrl+Shift+D in `run-linux --dev`, the react-native-windows shortcut), `reload(reason?)`                                                                                                                                                                                                               | silent no-ops in release builds, like RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `I18nManager`         | `isRTL` (live: GTK's read of the locale text direction), `doLeftAndRightSwapInRTL`, `getConstants`                                                                                                                                                                                                                                                              | `allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops (mobile persistence has no desktop store)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `BackHandler`         | `addEventListener("hardwareBackPress")`, `exitApp`                                                                                                                                                                                                                                                                                                              | no hardware back key on desktop — subscriptions are honored but nothing fires them yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `findNodeHandle`      | a stable integer per mounted widget, resolvable back to it; accepted by `measureLayout` as its first argument, alongside a handle object. Takes what RN takes — a component handle, a node handle (returned unchanged), `null`/`undefined`. A windowed list resolves to the `ScrollView` it renders, as RN's `FlatList` resolves through to its own scroll view | The tag identifies the WIDGET, not the ref: two refs onto one view report the same number and a re-render that rebuilt the handle object does not change it. It reaches nothing native — there is no `UIManager` to hand a tag to — so it is worth exactly what this platform can resolve it to: `measureLayout`, and identity. `null` for anything that is not a mounted host view (RN's answer too)                                                                                                                                                                                                                                         |
| `Keyboard`            | `addListener` (honoured, never fires), `removeAllListeners`, `dismiss`, `isVisible` (always false), `metrics` (always undefined), `scheduleLayoutAnimation`                                                                                                                                                                                                     | This is the SOFTWARE keyboard, and a desktop has none: every event it carries describes a panel occluding the app, so none can fire. Subscriptions are real and `remove()` pairs with them (a fake subscription would turn an unmount into a crash) — the same shape as `BackHandler` above, and what react-native-windows inherits from RN core, whose emitter is only ever fed on iOS and Android. **`dismiss()` is a no-op and deliberately not RN's**: RN blurs the focused input as the only way to retract the keyboard, and doing that here would let a library's gesture steal focus from a form                                      |
| `LogBox`              | `ignoreLogs`, `ignoreAllLogs`, `install`, `uninstall` — accepted and ignored                                                                                                                                                                                                                                                                                    | RN's LogBox is a full-screen dev OVERLAY, and `ignoreLogs` has never filtered the console — it keeps a warning out of the yellow box. There is no overlay here, so the console output after the call is already the console output RN would have had, and nothing observable is lost. Called by `react-native-draggable-flatlist` on every `NestableDraggableFlatList` render, to silence a nesting warning this platform does not emit either                                                                                                                                                                                                |
| `PanResponder`        | `create(config)` -> `panHandlers` (spread onto a `View`), full `gestureState` (`dx`/`dy`, `vx`/`vy`, `x0`/`y0`, `moveX`/`moveY`, `numberActiveTouches`) — **react-native's own file, vendored unmodified** (MIT, `Libraries/Interaction/PanResponder.js`), running on our reproduction of RN's `touchHistory` store                                             | multi-touch `gestureState` is single-touch here (one pointer), and `onShouldBlockNativeResponder`'s return value is not consumed yet. `onPanResponderTerminationRequest` is asked when an ancestor tries to take the gesture and when an enclosing `ScrollView` scrolls; every other termination is GTK's decision and arrives as `onPanResponderTerminate` unasked (see `View`)                                                                                                                                                                                                                                                              |
| `Animated`            | `Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`, `loop`, `interpolate` (numbers and deg/rad strings, clamp/extend/identity), `ValueXY` (`setValue`/`setOffset`/`flattenOffset`/`extractOffset`, `getLayout`, `getTranslateTransform`) — the value a `PanResponder` drag writes to                                                                  | `useNativeDriver` is ignored (with a warning); the direct path is native-speed anyway; `Animated.event` is not implemented — write the value directly (`pan.setValue({x: g.dx, y: g.dy})`), which is what it would do                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Easing`              | linear/ease/quad/cubic/in/out/inOut/bezier                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `version`             | package version                                                                                                                                                                                                                                                                                                                                                 | extension                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

`StyleProp<T>` defaults its type argument, and `ViewStyle`/`TextStyle`/`ImageStyle` are exported as aliases of the one flat style bag this platform has — so `StyleProp<ViewStyle>`, the way ordinary React Native code writes it, compiles here unchanged. `Platform.OS` is typed as the full `PlatformOSType` union (plus `"linux"`), not the `"linux"` literal: comparing it against another platform is a runtime question, and RN's own types let that compile everywhere.

Styles (which keys go where and what is unsupported) — [style system table](../packages/react-native-gtkx/src/style/README.md). Includes `boxShadow` (RN 0.76) and `outlineColor`/`outlineOffset`/`outlineStyle`/`outlineWidth` (RN 0.77): both are what Adwaita's own theme uses for the `.card`/`.boxed-list` frame and for every focus ring, so they are the difference between a React Native style approximating the platform look and reproducing it — see [research/react-native-first-showcase.md](research/react-native-first-showcase.md).

## Key differences from React Native (summary)

1. **Desktop, not mobile**: `Modal` is a real window; `runApplication` accepts a title and dimensions; gestures are mouse-driven (hover works, no touch gestures);
2. **Node.js runtime**: all of npm/Node is available (fs, sqlite, napi) — "native modules" are written as regular Node modules; RN libraries with iOS/Android code do not work;
3. **Layout is exactly RN's**: every container runs a custom GtkLayoutManager that obeys only the Yoga engine — GTK widget minimums never leak into the layout, windows shrink freely, and `Dimensions.get("window")` reports the app viewport (the window's content area under the headerbar, like RN's app window);
4. **Text**: the ellipsis is opt-in via `numberOfLines`, exactly like RN; plain text wraps naturally and an unbreakable word wider than its box clips to it (a text leaf always clips; a container paint-overflows until its style says otherwise — see `overflow` below);
5. **transform** is paint-only, like RN: `translateX/Y`, `scale`, `scaleX`, `scaleY` and `rotate`/`rotateZ` apply to any component's style (not just `Animated.View`), the array composes left to right as in RN and CSS, and the origin is the view's centre. A transformed child honestly draws past its container over siblings (later siblings stay on top unless a `zIndex` says otherwise — see 10 below) without moving any ancestor, and GTK routes input through the transform, so a rotated view is clickable in its rotated shape — unless the container asks to clip, and `overflow: "hidden"` on it cuts the transformed child off at the edge exactly as it cuts off an untransformed one. Rotation and scale reach the widget as the `GskTransform` of its allocation (`docs/research/transforms.md`); 3D (`rotateX`/`rotateY`/`perspective`), `skewX`/`skewY`, `matrix` and `transformOrigin` are not supported;
6. **Animations never auto-stop**: the desktop "reduce animations" hint is not applied automatically (GTK-side animations are kept on to match `Animated`, which runs on its own timers) — honoring reduced motion stays an app-level opt-in, as in RN;
7. **Lists are windowed like RN's**: FlatList/SectionList mount only the rows around the viewport (prefix-sum offsets, `estimatedItemSize` refined by real measurements or exact `getItemLayout`); sticky headers translate the REAL widget (no duplicate) and `inverted` follows the RN chat contract — `contentOffset` counts from the end where `data[0]` renders. The one RefreshControl compromise: desktop has no pull gesture, so `refreshing`/`onRefresh` are API-compatible but the trigger is app chrome (a button/shortcut);
8. The package ships compiled (`dist/`: ESM + `.d.ts` alongside, sources embedded in the maps); consumers — Metro (`react-native-gtkx/metro` preset) and vite (preset) — both consume the built output. Requires Node ≥ 24 (the gtkx runtime floor; the run-linux host also relies on `module.registerHooks`).
9. **`zIndex` orders paint AND picking, per sibling group.** GTK4 has no z-order property, so the container widget does it: it allocates its children in Yoga's order and _snapshots_ them in `zIndex` order, and a widget covered by a higher-painting sibling declines `gtk_widget_pick()` so input lands where the pixels are. Layout is untouched — only the paint pass sorts. RN's rules, checked rather than assumed and each pinned by a test: it applies whatever `position` is (CSS needs a non-`static` `position`; RN does not, and neither does this); equal values keep document order (the sort is stable); `undefined` is `0` and negatives are legal and paint below silent siblings; and it is **per sibling group only** — it creates no stacking context that escapes the parent, so a child cannot paint above its parent's sibling. That last rule is the one that decides what you write: to lift a dragged chip over a drop-zone row, put the `zIndex` on the chip's ROW, exactly as on iOS and Android. Animated (`Animated.View`, `useAnimatedStyle`) on the same terms as `opacity` — one widget write, no Yoga pass. **One divergence**: `contains()` is GTK's only per-point hook and it is consulted after a widget's children, so an _interactive native leaf_ inside a covered sibling — a `TextInput`, a `Switch`, a `ScrollView` viewport, a raw GTK widget in a slot — still takes the press even where a raised view covers it. `Text` and `Image` do not (they have no press prop here, so while something is raised they are excluded from picking and the press reaches their nearest `View`), which is also why a `pointerEvents: "box-none"` View whose only child is a `Text` falls through to what is behind it while a sibling in that container is raised. Measurements, the probe, the mutation check and the real-pointer proof: [research/z-index.md](research/z-index.md).

10. **Pre-commit hooks regenerate derived data**: editing this file (or the other generator inputs) and forgetting to run `scripts/generate-mcp-data.mjs` no longer fails CI — the pre-commit hook regenerates `packages/react-native-gtkx/src/mcp/data/generated.ts` and stages it for you.

## Package aliases

Both presets — `withLinuxPlatform` (Metro) and `reactNativeGtkx` (vite) —
rewrite six package names during resolution, from one table
(`packages/react-native-gtkx/src/aliases/index.ts`) that both of them read. A
name is matched **exactly or with a `/` after it**, and the tail is
transplanted onto the target: `react-native-svg/lib/x` becomes
`react-native-gtkx/svg/lib/x`, while `react-native-svg-icons` is left alone.

| Package                                                                                          | Resolves to                         | Why                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native`                                                                                   | `react-native-gtkx`                 | **The platform.** Not a substitution and not configurable — the out-of-tree `npmPackageName` declaration alone does not alias imports for a bundle.  |
| [`react-native-svg`](#react-native-svg-compatibility-react-native-gtkxsvg)                       | `react-native-gtkx/svg`             | The real package is a native module.                                                                                                                 |
| [`react-native-reanimated`](#react-native-reanimated-react-native-gtkxreanimated)                | `react-native-gtkx/reanimated`      | The real package needs a worklet runtime and a Babel plugin.                                                                                         |
| [`react-native-worklets`](#react-native-worklets-react-native-gtkxworklets)                      | `react-native-gtkx/worklets`        | Where Reanimated 4 moved that runtime. Libraries pull `scheduleOnRN`/`scheduleOnUI` out of it at module scope, so an unaliased name fails at import. |
| [`react-native-gesture-handler`](#react-native-gesture-handler-react-native-gtkxgesture-handler) | `react-native-gtkx/gesture-handler` | A shim, not a port: it implements `GestureHandlerRootView` and makes every other export throw where it is used.                                      |
| [`react-native-reanimated-dnd`](#drag-and-drop-react-native-gtkxdnd)                             | `react-native-gtkx/dnd`             | A mirror of its API on GTK drag-and-drop. **The one that is a real choice** — see below.                                                             |

### The one that is a real choice

Five of the six substitute an implementation that cannot run here **at all**.
`react-native-reanimated-dnd` stopped being one of those: the real 2.0.0 runs
on top of this platform's Reanimated, worklets and gesture-handler surfaces,
dragged by a real pointer (the gallery's Upstream drop zones and Upstream
sortables sections). So
there is a genuine trade:

- **`react-native-gtkx/dnd` (default)** — GDK carries a
  `Gtk.WidgetPaintable` of the dragged view above every window, with the
  theme's own drag cursors, hit testing against the real widget tree and
  drops into _other applications_. The dragged view itself never moves.
- **the real `react-native-reanimated-dnd`** — `dragAxis`, `dragBoundsRef`,
  `dropAlignment`, `collisionAlgorithm` and the rest of upstream's prop
  surface, and the view moves under the pointer. No drag icon, no
  cross-application drop, and the drag is confined to the app window.

Everything else in [Differences from
`react-native-reanimated-dnd`](#differences-from-react-native-reanimated-dnd)
applies to the mirror; the real package has upstream's behaviour by
definition.

### Configuring the package aliases

Both presets take an `aliases` option: **deltas keyed by package name**, not a
replacement list. Anything you do not mention keeps its default, which is the
point — a list you have to re-state in full is a list that can silently lose
an entry, and `ssr.noExternal` losing three of these six names is what put the
real `react-native-gesture-handler` into a Linux app.

```ts
// vite.config.ts
import { reactNativeGtkx } from "react-native-gtkx/vite"

export default defineConfig({
  plugins: [
    reactNativeGtkx({
      aliases: {
        // false — drop one of ours, so the real package loads
        "react-native-reanimated-dnd": false,
        // string — exact name or subpath, tail transplanted
        "my-pkg": "my-pkg/linux",
        // { pattern, replace } — for the rare case where the subpath
        // layouts differ
        "weird-pkg": { pattern: /^weird-pkg\/lib\/(.+)$/, replace: "impl/$1" },
      },
    }),
  ],
})
```

```ts
// metro.config.ts — the same object, the same semantics
export default withLinuxPlatform(getDefaultConfig(__dirname), {
  aliases: { "react-native-reanimated-dnd": false },
})
```

Prefer the string form. It is anchored to the package name by construction,
which is not a nicety: `react-native-reanimated-dnd` is a lookalike of
`react-native-reanimated`, and `react-native-worklets-core` is a real,
unrelated package (VisionCamera's) that looks like `react-native-worklets` —
a loose prefix rewrite sends either onto a subpath that does not exist. Reach
for `{ pattern, replace }` only when a package's subpath layout does not match
its target's.

Because the rules are data rather than functions, the preset validates them
when your config loads, and says what is wrong:

- **an unknown key with `false`** — the aliases that exist are named, so a
  typo cannot silently do nothing;
- **an overlapping pattern** — "your pattern also matches
  `react-native-reanimated-dnd`, which is declared separately". Two rules
  claiming one specifier would make resolution order-dependent;
- **an unanchored pattern, or one with the `g`/`y` flag** — the first matches
  inside longer specifiers, the second carries a `lastIndex` between calls;
- **a target that is not a module specifier** — a relative or absolute path,
  or one ending in `/`;
- **`react-native`** — it cannot be dropped or retargeted, and the message
  says why: it is the platform, not one of the substituted packages.

On the vite path the option also drives `ssr.noExternal`, which is derived
from the table rather than written out beside it. Every name in the table
stays inside vite's pipeline — including the ones you turn off, deliberately:
an un-aliased package still imports `react-native` at module scope, and that
import only reaches the platform alias if Node never gets the package first.

## Navigation (`react-native-gtkx/navigation`)

A [react-navigation](https://reactnavigation.org) stack navigator backed by
`Adw.NavigationView` — native Adwaita page transitions, the HeaderBar back
button and back gestures stay in sync with react-navigation state (the
react-native-windows / native-stack model). Requires the optional peer
`@react-navigation/native` (v8).

`@react-navigation/native@8` itself peers on `react-native: "*"` (unlike
`@react-navigation/core@8`, which has no react-native peer at all). If your
app has no `react-native` package anywhere in its tree — a vite+gtkx app
with no Metro side, exactly what `examples/gallery` demonstrates —
`npm install` will print an unmet-peer-dependency warning for it. This is
harmless: react-native-gtkx never imports anything from the `react-native`
package, so nothing actually needs it at runtime; the warning is npm being
strict about a peer range upstream declared loosely (`"*"` — any version
satisfies it, npm just wants the package present at all).

```tsx
import { NavigationContainer } from "@react-navigation/native"
import { createStackNavigator } from "react-native-gtkx/navigation"

// Run the app with chrome: "content" — the navigator's HeaderBars ARE the
// window chrome (the default system chrome would add a second titlebar):
// AppRegistry.runApplication(name, { ..., chrome: "content" })

const Stack = createStackNavigator()

const App = () => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
      />
      <Stack.Screen
        name="Details"
        component={DetailsScreen}
        options={{ title: "Details page" }}
      />
    </Stack.Navigator>
  </NavigationContainer>
)
```

- Screen `options`: `title` (HeaderBar title, defaults to the route name),
  `headerShown` (default true).
- `createSidebarNavigator` — the desktop drawer equivalent on
  `Adw.NavigationSplitView`: a persistent native sidebar (`AdwActionRow`
  per screen, in a GtkListBox with Adwaita `navigation-sidebar` styling)
  selects between parallel screens (TabRouter semantics). Navigator prop
  `sidebarTitle`; screen `options`: `title`, `icon` (Adwaita symbolic icon
  name for the row's prefix), `color` (a CSS color for a colored-dot
  prefix instead of `icon` — the two are mutually exclusive per row,
  `color` wins if both are set), `count` (a badge suffix, hidden when 0 or
  unset). Run the app with `chrome: "content"` so the split view's
  HeaderBars are the window chrome (`examples/gallery` is built on it).
  Navigator prop `headerButtons` packs declarative native buttons into the
  content HeaderBar end (`{id, icon, tooltip, onPress}`, `icon` is an
  Adwaita symbolic name) — the gallery's color-scheme toggle uses it.
  Navigator prop `collapseWidth` (sp): below this width the split view
  collapses to the sidebar or the content pane alone, through a native
  `Adw.Breakpoint` wrapping the view in an `AdwBreakpointBin` — NOT a
  `useWindowDimensions` conditional (see docs/platform-layer.md, "Two ways
  to react to size"); the property flip happens inside GTK's own
  allocation pass, costing no React render for the resize itself. Unset by
  default — no `AdwBreakpointBin` is mounted at all, so existing consumers
  see no behavior change. Any route becoming active while collapsed
  reveals content (`AdwNavigationSplitView.showContent`, a plain native
  property write, not React state) — a row click OR a programmatic
  `navigate()`/`jumpTo()`; the native back button that then appears
  reverses it. Re-selecting the same, already-active row after that also
  reveals content again — GTK's `row-selected` does not refire for a
  re-click with no selection change, so this is driven by `row-activated`
  (fires on every click) in addition. The reverse direction — the split
  view's own back button, Escape or back gesture hiding content again — is
  observed too: it fires a `sidebarShown` event
  (`navigation.addListener("sidebarShown", …)`) on the currently active
  route, the same event-map protocol `createStackNavigator`'s
  `transitionStart`/`transitionEnd` use. Nothing in react-navigation state
  changes when this fires — TabRouter has no "closed" concept, the same
  route stays focused, only the pane did — so it exists purely for an app
  that wants to react (`examples/tasks-nav`'s `ContentScreen` resets its
  own in-screen "open task" state on it). Never fired for content being
  revealed (that direction is already an ordinary state change) or when
  `collapseWidth` is unset. Resizing back above `collapseWidth` and then
  back below it again does NOT reset `showContent` or the selection —
  confirmed empirically, not assumed — both simply persist across the
  round trip, the same size-class behavior a mobile master-detail app
  relies on; see docs/research/navigation-extensibility.md for the
  evidence.
- **Which rung to reach for.** Three ways to put content in the sidebar,
  cheapest first — the same ladder react-navigation's own `tabBarIcon` →
  `drawerLabel` → `drawerContent` climbs: (1) `title`/`icon`/`color`/`count`
  above — the convenience; composes an `AdwActionRow`. (2) `sidebarRow`
  (screen option, below) — draw one row yourself; the navigator keeps the
  list and everything attached to it (selection, click → `jumpTo`, staying
  in step with navigation state, the collapsed reveal). (3) `sidebarContent`
  (navigator prop, below) — draw the whole pane, routing surface included.
  The reason rungs 2 and 3 exist at all, plainly: **`AdwActionRow` carries
  Adwaita's OWN row metrics, not a default this package picked** — measured
  at roughly 104px per row (with a prefix and/or count laid out) against
  ~40px for a plain title-only row — and nothing passed to
  `title`/`icon`/`color`/`count` changes that height. A screen on rung 1
  has no lever for it; wanting a different height or density means climbing
  to `sidebarRow` or `sidebarContent` instead.
- Sidebar navigator props `minWidth` / `minHeight` (px, default 360×294 —
  GNOME's own adaptive floor): the narrowest size this navigator's UI
  supports, applied to the `AdwBreakpointBin` that `collapseWidth` mounts.
  Ignored when `collapseWidth` is unset, since no bin exists then. Adwaita
  cannot measure a breakpoint bin — what it contains changes with the
  breakpoints — so the bin reports a minimum of ZERO and warns that
  `width-request`/`height-request` must be set. Under `chrome: "content"`
  the bin is the window's own child, so that zero IS the window's floor:
  the window resizes straight past what the pane inside can draw, and
  Adwaita clips the pane instead of adapting it ("AdwNavigationSplitView
  exceeds AdwBreakpointBin width: requested 469 px, 360 px available" in
  the journal, felt as a list running off the right edge with its trailing
  controls cut away). An app whose content HeaderBar needs more than the
  default must raise it — measure the pane rather than guessing: a
  segmented control as `headerTitle` costs ~110px on its own and, unlike a
  title label, cannot ellipsize. `examples/tasks-nav` passes `480` for
  exactly that reason; the value stays below its `collapseWidth`, so the
  collapsed layout is still fully reachable.
- Sidebar screen options `headerLeft` / `headerRight` / `headerTitle`:
  `() => ReactNode` — the content HeaderBar's own start/end/title, per
  screen, on top of the one navigator-wide default. This is what lets one
  screen's header change shape with ITS OWN selection (a filter toggle
  group for a list, a back button plus star/trash for an open item):
  call `navigation.setOptions({ headerLeft, headerRight, headerTitle })`
  from inside the screen, in an effect keyed on whatever local state
  decides its shape — no stack involved, and no new navigator API beyond
  the options themselves (`useNavigationBuilder` already re-resolves
  descriptor options on every `setOptions` call). `headerTitle` replaces
  the HeaderBar's title widget outright (unset, the page's own title
  shows automatically, as before). A screen's own `headerButtons`
  (`HeaderButton[]`, same shape as the navigator prop) replaces the
  navigator-level default entirely for that screen. **Caveat, found
  while testing this**: `setOptions` MERGES into the previously resolved
  options rather than replacing them — a call that omits `headerRight`
  does not clear a `headerRight` a PREVIOUS call set, it leaves it in
  place. A screen that flips between shapes must give every one of these
  four keys an explicit value (`undefined` counts as a real overwrite; an
  absent key does not) on every call, not just the ones currently in use.
- Sidebar screen option `group`: `string` — the section this row belongs to.
  Consecutive screens sharing a `group` get one Adwaita section header above
  the first of them, attached with `GtkListBox.set_header_func` — the
  mechanism GNOME's own sidebars use. A header attached this way is a
  DECORATION owned by the row below it, not a row: it is outside the list's
  selection model and outside its focus chain, so the arrow keys and Tab walk
  straight past it and assistive technology never announces a row that cannot
  be activated. A header faked as a non-selectable `GtkListBoxRow` gets none
  of that. Grouping follows ROW ORDER, so screens in one group are declared
  together and a group name reappearing after a gap starts a second header
  rather than reordering anything; leave it unset on every screen (the
  default) and the list is flat. `examples/gallery` groups its sections into
  React Native / gtkx / Modules.
- Sidebar screen option `sidebarRow`: `() => ReactNode` — draw the row
  yourself instead of letting `title`/`icon`/`color`/`count` compose one.
  Those four are a convenience, not the ceiling: they build an
  `AdwActionRow`, which brings Adwaita's own row metrics with it, so an app
  wanting a different shape, density or height had nothing to reach for.
  Return anything a `GtkListBoxRow` can hold — React Native content, GTK
  widgets, a differently-configured Adwaita row. The navigator keeps owning
  row BEHAVIOUR (selection, click → `jumpTo`, staying in step with
  navigation state, the collapsed reveal), so a custom row cannot drift out
  of sync with the router; only what is drawn changes. A screen that passes
  none of `icon`/`color`/`count` gets a compact `GtkListBoxRow` + label
  automatically — `AdwActionRow`'s height is right when there IS a prefix
  and a count to lay out and pure cost when there is not. The next rung up
  is `sidebarContent`, below, for replacing the whole pane rather than one
  row.
- Sidebar navigator prop `sidebarContent`:
  `(props: SidebarContentProps) => ReactNode` — replaces the ENTIRE sidebar
  pane's body, for a sidebar that needs sections, a search field, a footer,
  or anything a flat list of rows cannot express. The sidebar's children
  stop being "one row per screen": you draw what you like, and navigation
  is just the `jumpTo` you were handed. `SidebarContentProps` carries
  `routes` (key, name, resolved options, title, `focused`), `focusedIndex`
  and `jumpTo(name)` — use those rather than dispatching yourself, so
  selection cannot drift from navigation state. The pane's AdwHeaderBar and
  `sidebarTitle` still belong to the navigator: this is the body under it,
  not the chrome. Mounted as React Native content (a layout root filling
  the pane); a sidebar built from GTK widgets wraps its own tree in
  `WidgetContent`, the same escape hatch `contentLayout: "widget"` is for a
  screen body. Reach for `sidebarRow` (above) first if you only want a
  different ROW — it keeps the navigator's list and everything attached to
  it; this one hands over the whole pane, routing included. A sidebar with
  a search field above the list and a footer below it, still driven by the
  navigator's own routing:

  ```tsx
  <Sidebar.Navigator
    sidebarContent={({ routes, focusedIndex, jumpTo }) => (
      <View style={{ flex: 1 }}>
        <SearchField onSubmit={filterRoutes} />
        <ScrollView style={{ flex: 1 }}>
          {routes.map((route, index) => (
            <Pressable
              key={route.key}
              onPress={() => jumpTo(route.name)}
            >
              <Text
                style={{
                  padding: 8,
                  fontWeight: index === focusedIndex ? "700" : "400",
                }}
              >
                {route.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <StorageUsageFooter />
      </View>
    )}
  >
    <Sidebar.Screen
      name="Inbox"
      component={InboxScreen}
    />
    <Sidebar.Screen
      name="Trash"
      component={TrashScreen}
    />
  </Sidebar.Navigator>
  ```

  `route.title` is already resolved (`options.title`, falling back to the
  route name) — no need to read `options.title` yourself. `jumpTo` reveals
  the content pane when collapsed, same as a native row click; the
  navigator, not this callback, decides that.

- Sidebar navigator props `sidebarHeaderLeft` / `sidebarHeaderRight` /
  `sidebarHeaderTitle`: `() => ReactNode` — the SIDEBAR pane's own
  AdwHeaderBar start/end/title, the exact counterparts of the content
  header's `headerLeft`/`headerRight`/`headerTitle`. Until these existed the
  sidebar header was a hard-coded `<AdwHeaderBar />` and `sidebarTitle` (a
  plain string) was the only thing an app could set on it at all, so a
  sidebar's own "new item" action — where GNOME puts it, next to the pane
  title — had nowhere to go and ended up on the content header instead
  (`examples/tasks-nav` shipped with two indistinguishable `+` buttons for
  exactly this reason). `sidebarHeaderTitle` replaces the title widget the
  same way a screen's `headerTitle` does; unset, `sidebarTitle` renders as
  before. Content is mounted through the same `HeaderSlotContent` root the
  content header uses, so React Native content lays out as a horizontal,
  content-hugging cluster flush with natively packed buttons — do not
  hand-roll an `IntrinsicContent` here, a bare Yoga root defaults to
  `column` and pushes the window controls onto a second row. These are
  navigator PROPS rather than screen options on purpose: there is one
  sidebar pane shared by every screen, so its chrome sits at the level
  `sidebarTitle`/`sidebarContent` already do, and the `sidebar` prefix marks
  which header a name refers to. There is deliberately no
  `sidebarHeaderButtons` convenience mirroring `headerButtons` — arbitrary
  content is the primitive, and a one-button call site reads no better as a
  `{id, icon, tooltip, onPress}` record than as the `GtkButton` it already
  is; add it only if a real call site is worse without it.

- Sidebar screen option `contentLayout`: `"react-native"` (default) or
  `"widget"` — what the screen's body IS. The default mounts it in a Yoga
  layout root that fills the pane, so `<View style={{ flex: 1 }}>` behaves
  the way it does anywhere else. `"widget"` packs the body into the page
  directly, with no layout root in between, for a screen whose body is a
  GTK widget tree (a `GtkScrolledWindow` around an `AdwClamp` around a
  `.boxed-list` `GtkListBox`, say): GTK's own sizing — `vexpand`, a list's
  natural height — then applies normally. **Under the default a widget tree
  collapses instead**, and quietly: every widget becomes a single Yoga LEAF
  measured for its own natural size, so a container renders its first child,
  drops the rest, and reports the ~1px it can shrink to, with no error
  anywhere. `examples/tasks-nav` is built this way. Mixing is per screen,
  not per subtree — a `"widget"` screen that wants React Native content
  somewhere inside it wraps that part in `SlotContent` itself.
- Stack screen options `headerLeft` / `headerRight`: `() => ReactNode` —
  real RN content in the HeaderBar (inputs included), hosted by an
  intrinsic-size root; `headerButtons` render after `headerRight`
  (hn-app's header search filter is the demo).
- Stack screen option `gestureEnabled: false` disables the native back
  button, Escape and the back gesture for that screen (the page's
  Adwaita `can-pop`); a programmatic `goBack` still pops. `usePreventRemove`
  works through the same mechanism — a prevented route reports
  `can-pop: false`, so no native pop can race react-navigation state; the
  route pops once the app lifts the guard (e.g. after its own
  confirmation dialog).
- Stack screen option `animation` maps onto `Adw.NavigationView`'s
  `animate-transitions` — GTK has exactly one transition style, not a
  choice of styles like iOS/Android, so the option collapses to a
  boolean: `"none"` turns transitions off, any other value (including
  native-stack's own style names, e.g. `"slide_from_bottom"`, `"fade"`)
  turns them on, with the standard Adwaita transition rather than the
  one asked for. Requesting a specific type still animates — it is not
  silently treated as `"none"` — and warns once in development.
  `animate-transitions` is a property of the whole view, not a per-page
  one, so there is no per-screen granularity to offer: the value used is
  read from whichever screen is currently on top of the visible stack,
  recomputed on every navigation. Setting it once via `screenOptions`
  (the same value for every screen) is the reliable way to use this —
  the per-screen case only matters if different screens genuinely
  disagree, and even then only the active one's value is observed.
  Interactive swipe-back gestures always animate regardless of this
  setting — Adwaita's own behavior, not overridable here.
- The factories are typed: `createStackNavigator<ParamList>()` gives
  typed `Screen` configs and `StackScreenProps<ParamList, Route>` for
  screen components (`SidebarScreenProps` likewise).
- The stack navigator emits `transitionStart` / `transitionEnd` on a
  screen's `navigation` object, matching `@react-navigation/stack` and
  `@react-navigation/native-stack` exactly: `{ data: { closing: boolean } }`,
  `closing: false` for the screen being pushed in, `closing: true` for the
  screen being popped out. A screen that stays mounted without actually
  entering or leaving (e.g. the screen underneath a push) gets neither
  event, same as upstream. Two things worth knowing before relying on
  timing:
  - **`transitionEnd` is tied to `AdwNavigationPage`'s own `shown`/`hidden`
    signals** — contrary to an earlier version of this page, Adwaita DOES
    expose a transition-finished signal (four of them, in fact: `showing`,
    `shown`, `hiding`, `hidden`, all per-page). `transitionEnd` on the
    entering screen fires on that screen's `shown`; on the leaving screen
    it fires on `hidden`. `transitionDuration` (default 400 ms) is a
    fallback only, used when a page's own signal never arrives — a
    signal-less environment, or a page skipped entirely by a multi-hop
    pop (popping past an intermediate screen never fires anything on it,
    since it was never the one actually on screen during the transition).
    When transitions are not animated, the real signals still fire —
    immediately — so `transitionEnd` is not delayed by the fallback
    window either.
  - **Native pops do not fire these events at all today.** A user-driven
    pop (the Adwaita back button, Escape, the back gesture) is handled by
    the widget itself before this package's code is told about it, so
    there is nothing to hook a `transitionStart` into. Only
    programmatic navigation (`navigate`, `goBack`, `dispatch`, …) fires
    `transitionStart`/`transitionEnd`.
- The sidebar navigator emits `sidebarShown` (`{ data: undefined }`) on a
  screen's `navigation` object — the collapsed-mode counterpart of a native
  pop, and the one case where a native, user-driven interaction (the split
  view's own back button, Escape, the back gesture) DOES get an event: the
  widget-level property that changes (`showContent`) has no
  react-navigation state behind it at all, so there is no state change for
  an app to observe any other way. Fired on the active route only when
  `showContent` goes from shown back to hidden, and only while
  `collapseWidth` is set; never fired for content being revealed (that
  already shows up as an ordinary focused-route change).
- The rest of the react-navigation surface — `useNavigation`, `useRoute`,
  `useFocusEffect`, `useIsFocused`, `useNavigationContainerRef`,
  `CommonActions`, `StackActions`, `usePreventRemove`, `NavigationContainer`
  and everything else — comes from `@react-navigation/native` directly, not
  from this package. **Breaking change**: earlier versions re-exported a
  subset of these names from `react-native-gtkx/navigation`; the re-export
  was removed because it was never complete (anything beyond the subset
  still required importing from `@react-navigation/native`, so it was one
  more place to look rather than a convenience). This package's navigation
  entry point now exports exactly its own surface: `createStackNavigator`,
  `createSidebarNavigator`, and the option/prop types around them.
- Each screen mounts its own layout root inside the page: the page's
  content allocation is that screen's viewport.
- Differences from `@react-navigation/native-stack`: `headerRight`/custom
  header widgets are not supported yet; deep-link "url" events never fire
  on desktop (see `Linking`).

## Svg

Vector graphics built from state, modeled on
[react-native-svg](https://github.com/software-mansion/react-native-svg) (the
de-facto standard RN mirrors) rather than invented from scratch — portable
code costs nothing to bring over. Drawing goes through `Gsk.Path`/
`Gtk.Snapshot` on a single custom widget (`RnGtkxSvgNode`, `registerClass` +
an overridden `snapshot()` vfunc — the same mechanism `RnGtkxLayout` and
`RnGtkxViewBox` already use), not a rasterized image: for that, `Image`
already loads `.svg` files today (see the `Image` row above).

**Not part of the main `react-native-gtkx` export surface** — unlike every
component in the table above, `Svg` and everything below are exported only
from `react-native-gtkx/svg`, in the shape of the `react-native-svg` package
itself. `react-native-svg` is a separate package on every other platform (RN
has no built-in `Svg`), so this project mirrors that split instead of adding
`Svg` to the main entry, which would make code written against it fail to
compile anywhere else. See "`react-native-svg` compatibility" below for the
exact import and how the alias resolves it.

```tsx
import Svg, { Circle, G, Path, Rect } from "react-native-svg"

const Icon = () => (
  <Svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
  >
    <Circle
      cx={12}
      cy={12}
      r={10}
      fill="#1c71d8"
    />
    <Path
      d="M8 12 l3 3 l5 -6"
      stroke="white"
      strokeWidth={2}
      fill="none"
    />
  </Svg>
)
```

- **`Svg`**: `width`/`height` (or `style`) size it — a Yoga leaf like
  `Image`, sized entirely by style/flex, never by measuring the widget
  (nothing here is intrinsic-sized). `viewBox="minX minY width height"` and
  `preserveAspectRatio` (`xMin/xMid/xMax` × `YMin/YMid/YMax`, `meet`/`slice`,
  `none`; default `xMidYMid meet`) reshape the internal coordinate system
  exactly like real SVG — Yoga never sees them. Content always clips to the
  allocated bounds (no `overflow: visible` opt-out).
- **`Path`**: `d` is handed straight to `Gsk.Path.parse()`, which understands
  SVG path syntax natively — there is no path parser of our own.
- **`Rect`** (`x`/`y`/`width`/`height`/`rx`/`ry`), **`Circle`**
  (`cx`/`cy`/`r`), **`Ellipse`** (`cx`/`cy`/`rx`/`ry`), **`Line`**
  (`x1`/`y1`/`x2`/`y2`, stroke-only — no `fill` prop at all, not even
  ignored), **`Polygon`**/**`Polyline`** (`points`, `"x,y x,y …"` or
  space-separated, closed/open respectively): each is a small geometry
  helper away from the same `d` syntax, so every shape ends up drawn through
  that one `Gsk.Path.parse()` call.
- Every shape accepts `fill`/`stroke` (a static CSS color — hex/`rgb()`/
  `hsl()`/named/`transparent`/`none`, or `"url(#id)"` referencing a
  gradient; default `fill="black"`, `stroke="none"`, matching SVG),
  `fillRule` (`nonzero` | `evenodd`), `fillOpacity`/`strokeOpacity`/
  `opacity`, `strokeWidth`, `strokeLinecap`/`strokeLinejoin`,
  `strokeDasharray`, `strokeDashoffset`.
- **`G`** groups children under an `opacity` and/or a `transform` string —
  `translate()`/`scale()`/`rotate()`/`rotate(a,cx,cy)`/`matrix()`, the plain
  SVG transform-list syntax (`matrix()` maps directly onto
  `Gsk.Transform.matrix2d()`); `skewX`/`skewY` and the structured
  `transform={[{translateX:...}]}` array form `Animated.View` accepts are
  not supported here.
- **Gradients**: `<Defs>` holds `<LinearGradient id x1 y1 x2 y2>` /
  `<RadialGradient id cx cy r>` (fractions 0–1 by default —
  `gradientUnits="objectBoundingBox"`, mapped against the shape's own
  `Gsk.Path.getBounds()`; `gradientUnits="userSpaceOnUse"` uses the
  coordinates as-is instead), each with `<Stop offset stopColor
stopOpacity>` children (`offset` accepts `0.5` or `"50%"`). `Defs` must be
  a direct child of `Svg` (nested `Defs` are not scanned). No
  `gradientTransform`, no `spreadMethod` beyond the default pad behavior.
  An unresolvable `url(#id)` paints nothing for that fill/stroke rather
  than throwing.
- **Animated**: the numeric props above (shape geometry, `opacity`,
  `strokeWidth`, `strokeDashoffset`) accept an `Animated.Value`/
  interpolation in place of a number. A tick mutates the widget's paint
  state directly and calls `queueDraw()` — the same bypass-React pattern
  `Animated.View` uses for `transform` (`setStoredTransform` +
  `queueAllocate`), just on its own invalidation channel since none of this
  touches Yoga. `G`'s `transform` string and `d`/`points` are not
  Animated-aware (they are strings, not numbers).
- Not in scope: `<Text>`/`<TSpan>` on a path, `<Mask>`, `<ClipPath>`, SVG
  filters, `<Use>`/`<Symbol>`/`<Pattern>`, and rasterizing arbitrary SVG
  strings at runtime (`SvgXml` — `Image` already covers SVG **files**). None
  of these have a real consumer yet; `Path`/`Rect`/`Circle`/`Ellipse`/
  `Line`/`Polygon`/`Polyline`/`G` cover icons, charts and indicators, the
  overwhelming majority of real usage.

### `react-native-svg` compatibility (`react-native-gtkx/svg`)

`react-native-gtkx/svg` re-exports the same set in `react-native-svg`'s
shape (`Svg` as both the default and a named export). The `react-native-gtkx/
metro` and `react-native-gtkx/vite` presets alias the bare `react-native-svg`
package name to it automatically, the same way they alias `react-native`
itself — so portable code that imports from `react-native-svg` runs
unmodified:

```tsx
import Svg, { Circle, Path } from "react-native-svg"
```

Apps using neither preset can point their own bundler alias at
`react-native-gtkx/svg` by hand. `react-native-svg` itself is never a
dependency of this package and does not need to be installed — the alias
works whether or not the real package is present.

## Drag and drop (`react-native-gtkx/dnd`)

A mirror of [`react-native-reanimated-dnd`](https://github.com/entropyconquers/react-native-reanimated-dnd)'s
API, implemented on `GtkDragSource`/`GtkDropTarget`. Both presets alias the
bare `react-native-reanimated-dnd` package name onto it, exactly as they do
`react-native-svg` — so an app that already does drag-and-drop keeps its
source:

```tsx
import { Draggable, Droppable, DropProvider } from "react-native-reanimated-dnd"
```

**Why a mirror and not the library.** Reanimated 4, `react-native-worklets`
and `react-native-gesture-handler` are imported at module scope in twelve of
its files, its sort algorithm lives inside a `useAnimatedReaction` worklet and
its row layout inside a `useAnimatedStyle`, and its public types are written
in `SharedValue<T>`. Full evidence in
[research/drag-and-drop.md](research/drag-and-drop.md).

**And it is the one alias that is a real choice.** Once those three surfaces
existed the real library ran on top of them, so an app can take upstream's own
implementation instead with
`aliases: { "react-native-reanimated-dnd": false }` — what that trades away
and what it buys is in [Package aliases](#the-one-that-is-a-real-choice).

**A ported app changes nothing in its source.** `<GestureHandlerRootView>` —
the one non-drag-and-drop import such an app has, because upstream's quick
start puts it at the root — is covered too: `react-native-gesture-handler` is
aliased to [`react-native-gtkx/gesture-handler`](#react-native-gesture-handler-react-native-gtkxgesture-handler),
a shim that implements that root faithfully and makes every other RNGH export
throw where it is used. `examples/reanimated-dnd` is upstream's own example
app, ported: its README lists every line the port had to change, and none of
them is a drag-and-drop call.

### Which one to reach for

There is one drag-and-drop API. Three sentences cover every case:

- **Porting an app that already uses `react-native-reanimated-dnd`** — change
  nothing. Both presets alias the package name; the imports stay as they are.
- **Writing a new app** — import from `react-native-gtkx/dnd`. Same names,
  same props, so the code also reads correctly to anyone who knows the
  library, and the file can move to a shared location later.
- **Reordering by row id rather than by array index** — a `Droppable` around
  a `Draggable` per row, inside one `DropProvider`. `Sortable` owns an array
  and reports positions, which is the right shape when the component owns the
  order; when a store owns it, filters it and sorts it, the id-keyed pair is
  the one that fits. `examples/tasks-nav/src/components/task-row.tsx` is a
  worked example.

`List`/`ListRow` used to offer a second, id-keyed reorder of their own. They
are gone from `react-native-gtkx/common` entirely — they were the Adwaita
list _appearance_ written in React Native, and that is an app's business (see
[platform-layer.md](platform-layer.md#listlistrowlistseparator-were-here-and-are-not-any-more)).
Nothing about `List` has anything to do with dragging any more.

| Export                                                                                | Notes                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DropProvider`                                                                        | Scopes a set of draggables and droppables. Renders a `View` (upstream renders a fragment) because `onDragging` needs a widget. `ref` gives `getDroppedItems()` and `requestPositionUpdate()`. |
| `Draggable`, `Draggable.Handle`, `useDraggable`                                       | The drag source. With a handle, the `GtkDragSource` attaches to the **handle's** widget, so the rest of the item stays pressable.                                                             |
| `Droppable`, `useDroppable`                                                           | The drop target. `capacity` is enforced in GDK's `::accept`, so a full zone shows the no-drop cursor.                                                                                         |
| `Sortable`, `SortableItem`, `SortableItem.Handle`, `useSortable`, `useSortableList`   | Drag-to-reorder. The component owns the order (upstream's contract); read the settled one from `onDrop`'s `allPositions`.                                                                     |
| `DraggableState`, `ScrollDirection`, `SortableDirection`, `HorizontalScrollDirection` | The enums, unchanged.                                                                                                                                                                         |
| `listToObject`, `objectMove`, `clamp`                                                 | The utilities, as plain functions rather than worklets.                                                                                                                                       |
| `SharedValueLike<T>`                                                                  | What `SharedValue<T>` degrades to: `{ value: T }` without the worklet crossing. Reads and writes work; they just do not animate.                                                              |

### Differences from `react-native-reanimated-dnd`

The dragged view never moves — GDK carries a `Gtk.WidgetPaintable` of it
above every window, with the theme's own cursors and hit testing against the
real widget tree, including widgets React Native never created. Everything
below follows from that one fact.

| Prop                                                                                                             | Behaviour here                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preDragDelay`                                                                                                   | Accepted, ignored. GDK's `gtk-dnd-drag-threshold` already separates a tap from a drag.                                                                              |
| `collisionAlgorithm`                                                                                             | Accepted, ignored. GDK hit-tests the pointer; `"center"` is the closest of the three.                                                                               |
| `requestPositionUpdate()`                                                                                        | No-op. Nothing caches a slot rectangle, because GDK re-hit-tests every motion.                                                                                      |
| `onLayoutUpdateComplete`                                                                                         | Accepted, ignored — there is no layout pass to complete.                                                                                                            |
| `itemHeight`, `estimatedItemHeight`, `enableDynamicHeights`, `useFlatList`, `containerHeight`                    | Accepted, ignored. Yoga lays rows out at their natural height, and there is no autoscroll for `containerHeight` to feed.                                            |
| `dragAxis`, `dragBoundsRef`, `animationFunction`                                                                 | **Unsupported.** All three describe where the dragged view goes, and it never went anywhere. Kept in the type so a file shared with iOS and Android still compiles. |
| `dropAlignment`, `dropOffset`                                                                                    | **Unsupported**, same reason.                                                                                                                                       |
| `positions`, `lowerBound`, `autoScrollDirection`, `itemHeights`                                                  | Real `{ value }` boxes (`SharedValueLike`), not `SharedValue`. Forwarding them with `{...rest}` works, reads work, writes do not animate.                           |
| `SortableGrid`, `SortableGridItem`, `useGridSortable*`, `useHorizontalSortable*`, `SortableDirection.Horizontal` | **Not implemented.** Importing them fails at build time; passing `Horizontal` throws.                                                                               |
| Autoscroll near a container edge during a drag                                                                   | Not implemented.                                                                                                                                                    |
| Sortable list height                                                                                             | Rows are in flow layout, so the list is as tall as its rows — not `itemsCount × itemHeight`.                                                                        |

## `react-native-gesture-handler` (`react-native-gtkx/gesture-handler`)

**Not a port of RNGH.** The semantics are reimplemented over this platform's
own responder system, the same way `react-native-gtkx/reanimated` and
`react-native-gtkx/dnd` are — upstream's implementation is the blueprint, not
a dependency. Two of the four reasons
[research/gestures.md](research/gestures.md) originally gave for refusing RNGH
expired when Reanimated shipped; the other two (no `exports` map on its
`src/web/`, and a react-native-windows precedent that has been a literal
`// NO-OP` since 2.8.0) stand, which is why nothing is vendored.
[research/gesture-detector.md](research/gesture-detector.md) has the
measurements the design rests on.

Both presets alias the package name onto this subpath, so a ported app changes
nothing in its source.

```tsx
import { Gesture, GestureDetector } from "react-native-gesture-handler"

const offset = useSharedValue(0)
const start = useSharedValue(0)

const pan = Gesture.Pan()
  .activeOffsetY([-10, 10])
  // Capture where the view already is. `translationY` is measured from where
  // THIS gesture activated, so it starts at zero on every new grab — writing
  // `offset.value = event.translationY` instead would throw away everything
  // the view had accumulated and snap it back toward its origin the second
  // time you grab it.
  .onStart(() => {
    start.value = offset.value
  })
  .onUpdate((event) => {
    offset.value = start.value + event.translationY
  })

;<GestureDetector gesture={pan}>
  <Animated.View style={[styles.card, animatedStyle]} />
</GestureDetector>
```

`Tap` and `LongPress` are the same state machine with different predicates —
one recognizer, one event stream, one grant channel:

```tsx
const doubleTap = Gesture.Tap()
  .numberOfTaps(2)
  // The tap-vs-drag rule: a press that travels further than this is a drag,
  // and stops being a tap.
  .maxDistance(10)
  .onStart(() => setZoomed((on) => !on))

const hold = Gesture.LongPress()
  .minDuration(400)
  // Fires with the pointer standing still — a long press activates on its
  // timer, not on the next movement.
  .onStart((event) => openMenuAfter(event.duration))
```

| Export                                                                                                                                                                                           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GestureHandlerRootView`                                                                                                                                                                         | **Implemented, faithfully.** A `View` with `style ?? { flex: 1 }` — note that an explicit `style` _replaces_ the default rather than merging with it, which is what upstream does in all three of its implementations. Its other job, marking the subtree as gesture-arbitrating, is already this platform's: the responder system's lock is global, so there is nothing to scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GestureDetector`                                                                                                                                                                                | **Implemented, and it adds no widget.** It renders its single child unchanged and reaches that child's widget through the handle the child already exposes, the same seam `createAnimatedComponent` uses. Its recognizer's responder props are merged into the child's, so a child with its own `onTouchStart` keeps working. `userSelect`, `touchAction` and `enableContextMenu` are Web-only upstream and are accepted and ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Gesture.Pan()`, `Gesture.Tap()`, `Gesture.LongPress()`, `Gesture.Native()`                                                                                                                      | **Implemented**, all four over one state machine — the same event stream, the same grant channel, different predicates. See the config tables below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Gesture.Pinch()`, `Gesture.Rotation()`                                                                                                                                                          | **Implemented, and they need a TOUCHPAD.** The same state machine, fed by `GtkGestureZoom`/`GtkGestureRotate` instead of by the pointer — see [the touchpad gestures](#gesturepinch-and-gesturerotation--the-two-that-need-a-touchpad) below. A mouse cannot produce either: with no touchpad attached they simply never begin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `usePanGesture()`, `useTapGesture()`, `useLongPressGesture()`, `useNativeGesture()`, `usePinchGesture()`, `useRotationGesture()`, `useFlingGesture()`, `useManualGesture()`, `useHoverGesture()` | **Implemented**, over the same recognizers. Nine hooks and ten recognizers, which is upstream's own count rather than a gap: `src/v3/hooks/gestures/` has nine directories and no `forceTouch`, `SingleGesture` omits ForceTouch from its union, and `useForceTouchGesture` exists nowhere in 3.1.0 — so `Gesture.ForceTouch()` is the whole API upstream offers for it. Upstream deprecated all twelve `Gesture.*` statics in 3.1.0 in favour of hooks, and its hook renamed the callbacks: `onStart` → `onActivate`, `onEnd` → `onDeactivate`, `onTouchesCancelled` → `onTouchesCancel`, no `onChange`, and `canceled` on the ending event instead of a second `success` argument. Both spellings are honoured as written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Gesture.Race()`, `Gesture.Simultaneous()`, `Gesture.Exclusive()`                                                                                                                                | **Implemented as list-builders** over the three relation maps, with no mechanism of their own — see [the relations](#cross-gesture-relations) below. One `GestureDetector` may hold a composition, which mounts several recognizers on the one child and still adds no widget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `useCompetingGestures()`, `useSimultaneousGestures()`, `useExclusiveGestures()`                                                                                                                  | **Implemented**, the hook spelling of the same three, over the same lists. `useCompetingGestures` is `Gesture.Race()` under upstream's better name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Gesture.Fling()`, `Gesture.Manual()`, `Gesture.Hover()`, `Gesture.ForceTouch()`                                                                                                                 | **Implemented**, and each was refused until now for a different reason — see [the last four](#the-last-four-fling-manual-hover-and-force-touch). `Fling` and `Manual` were reachable and unwritten. `Hover` was refused on a judgement about the test rig that was simply wrong, and is now the most fully verified of the four. `ForceTouch` needs a pressure-reporting **stylus**: it is driven by `GtkGestureStylus`, which is stylus-only, so a mouse produces no events for it at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Directions`, `HoverEffect`, `MouseButton`, `PointerType`                                                                                                                                        | **Implemented**, as the plain enums they are upstream, with every value pinned by a test. `Directions` is required rather than merely harmless — `Gesture.Fling().direction()` takes those bits. `PointerType` became meaningful with `ForceTouch`, the first kind whose events are honestly not a mouse. `HoverEffect` and `MouseButton` are **inert**, exactly as they are off their platforms upstream, and are exported because the knobs that take them (`.effect()`, `.mouseButton()`) are already accepted-and-inert: a knob that takes a number while refusing the constant naming that number is incoherent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `State`                                                                                                                                                                                          | **Implemented**, as the plain enum it is upstream: `UNDETERMINED` 0, `FAILED` 1, `BEGAN` 2, `CANCELLED` 3, `ACTIVE` 4, `END` 5. Every payload carries a faithful `state`, and two of the libraries this targets compare it by value, so all six numbers are pinned by a test against 3.1.0 — a silently different one would go on compiling and quietly answer false.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ScrollView`, `FlatList`, `TextInput`, `Switch`, `Pressable`                                                                                                                                     | **Implemented as the platform's own components, by identity.** Upstream builds each with `createNativeWrapper(RN.X, { disallowInterruption: true, shouldCancelWhenOutside: false })` — an RN component with a `NativeViewGestureHandler` attached, so its arbitration knows about the native scrolling underneath. Here the responder system IS that arbitration, every one of these already speaks it, and `Gesture.Native()` is how a gesture is declared over one explicitly — so the wrapper has nothing to add and the re-export is the component itself. They are here because they are RENDERED: two of the three measured consumers hand `FlatList`/`ScrollView` to `Animated.createAnimatedComponent()` at module scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback`                                                                                                                             | **Implemented as the platform's own**, same reasoning. Out of scope by preference and unavoidable in fact: `@gorhom/bottom-sheet` re-exports all three from its own public entry as `BottomSheetTouchable` on every platform except iOS, so it is upstream's export rather than an app's choice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| everything else                                                                                                                                                                                  | **Throws**, naming the symbol — and every remaining refusal now carries its reason rather than being a bare stub. Three groups: the RNGH **1.x component API** (`PanGestureHandler` and the eight other `*GestureHandler` components, `legacy_createNativeWrapper`), which is a second public surface over the same recognizers that upstream deprecated before it deprecated the builder, and which none of the four target libraries still uses; the **button family** (`RawButton`, `BaseButton`, `RectButton`, `BorderlessButton`, plus `TouchableNativeFeedback`, the deprecated `Touchable` mixin and `RefreshControl`), which is not RN components with a handler attached but RNGH's own native button views, with an Android ripple, `rippleColor`/`rippleRadius` and an `activeOpacity` applied by a widget this platform does not have; and the **tag registry** (`GestureStateManager`, `VirtualGestureDetector`, `InterceptingGestureDetector`), which needs a process-wide handler-tag lookup this platform deliberately does not keep — identity here is the mounted detector. The twelve `Legacy*` aliases inherit whichever of those applies. See [what stays refused, and why](#what-stays-refused-and-why). |

### `Gesture.Pan()` — the config surface

| Method                                                                                                                  | Behaviour                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activeOffsetX` / `activeOffsetY` / `failOffsetX` / `failOffsetY`                                                       | **Implemented.** A single number is DIRECTIONAL, by its sign — `activeOffsetX(20)` bounds the positive side only. Failure is tested before activation, and with strict comparisons where activation uses non-strict ones, so a translation exactly on a bound activates. |
| `minDistance`, `minVelocity`, `minVelocityX`, `minVelocityY`, `minPointers`, `maxPointers`                              | **Implemented.** `minDistance` defaults to 10 unless an `activeOffset*` or `minVelocity*` is set, in which case those are the criteria and distance stops applying.                                                                                                      |
| `activateAfterLongPress`                                                                                                | **Implemented, and it activates on the timer** rather than on the next pointer movement — see the responder-model extension in [research/gestures.md](research/gestures.md). `0` means no hold at all, as upstream (both of its implementations guard on `> 0`).         |
| `enabled`, `shouldCancelWhenOutside`, `manualActivation`                                                                | **Implemented.**                                                                                                                                                                                                                                                         |
| `hitSlop`                                                                                                               | **Implemented**, in RNGH's gesture spelling rather than RN's `View` one: it can SHRINK the area (negative values), and `{ left: 0, width: 32 }` anchors a strip to one edge.                                                                                             |
| the callbacks                                                                                                           | **Implemented**: `onBegin`, `onStart`, `onUpdate`, `onChange`, `onEnd`, `onFinalize`, `onTouchesDown`, `onTouchesMove`, `onTouchesUp`, `onTouchesCancelled`.                                                                                                             |
| `runOnJS`                                                                                                               | **Accepted, and does nothing** — correctly. It asks for the JS runtime; there is exactly one runtime here, so every callback already runs where it is asking.                                                                                                            |
| `averageTouches`, `enableTrackpadTwoFingerGesture`, `cancelsTouchesInView`, `activeCursor`, `mouseButton`, `withTestId` | **Accepted, inert** — each is platform-specific upstream too, and inert off its platform there.                                                                                                                                                                          |
| `simultaneousWithExternalGesture`, `requireExternalGestureToFail`, `blocksExternalGesture`                              | **Implemented** — see [cross-gesture relations](#cross-gesture-relations).                                                                                                                                                                                               |

The common configuration and the callbacks above are shared by all three
recognizers, minus `onUpdate` and `onChange`: upstream puts those on
`ContinousBaseGesture`, which `Tap` and `LongPress` do not extend. A discrete
gesture has no travel to report and the methods are not offered.

### Cross-gesture relations

Three relations, three maps keyed by handler tag, and the composers are sugar
over them. That is upstream's shape and it is reproduced because it is the
right one — 159 lines of list-building over three primitives.

| Relation                                                            | Means                                  |
| ------------------------------------------------------------------- | -------------------------------------- |
| `requireExternalGestureToFail(other)` — hook: `requireToFail`       | this gesture waits for `other` to fail |
| `simultaneousWithExternalGesture(other)` — hook: `simultaneousWith` | both may be ACTIVE at once             |
| `blocksExternalGesture(other)` — hook: `block`                      | `other` waits for **this** one         |

```tsx
const scroll = Gesture.Pan().activeOffsetX([-10, 10]).failOffsetY([-25, 25])

const sheet = Gesture.Pan()
  .activeOffsetY([-10, 10])
  // Held in BEGAN — taking nothing, claiming nothing — until `scroll` fails.
  .requireExternalGestureToFail(scroll)
```

A relation names the other gesture with the gesture **object**, a
`withRef()` handle to it, or a raw handler tag, exactly as upstream's
`GestureRef` does. Memoize the gesture you point AT (`useMemo`, a ref, or a
context value): both spellings rebuild their object every render, and a
relation written against a stale object of a gesture that has since been
rebuilt cannot be resolved. Upstream has the same constraint and the same
advice.

**Two locks, at two levels, and they are deliberately not merged.** The
responder lock keeps its one job — this interaction belongs to React Native,
one holder, one irrevocable `CLAIMED` on the source. Gesture arbitration is a
second, JS-only registry that never talks to GTK, so every relation resolves
before anything is claimed. The consequences are observable:

- **`Simultaneous` really means two ACTIVE gestures**, each getting its own
  `onStart`/`onUpdate`/`onEnd` for the same pointer — and there is still
  exactly ONE responder while that happens, claimed once. The gesture that did
  not win the lock is driven from the touch props, which fire regardless of
  responder status; the holder reads `onResponderMove`.
- **Mutual exclusion is the default.** Without a relation the first gesture to
  activate cancels every other gesture watching the same interaction. A
  gesture that is already ACTIVE, or parked waiting for another, is cancelled
  by nothing except an active `Gesture.Native()` — upstream's rule, and the
  reason `Native` is special rather than just another recognizer.
- **`END` and `FAILED` are not the same release.** A gesture waiting on
  another is released when that one FAILS or is CANCELLED, and **cancelled**
  when it ENDS: the thing it was deferring to actually happened, so its turn
  never comes.

`Race` adds no relation at all, because racing is what happens anyway;
`Simultaneous` is a pairwise fill of the second map; `Exclusive` is a chain
fill of the first, where every group waits for all the groups before it. A
nested `Exclusive` inside a `Simultaneous` stays exclusive.

#### Relations across `Root`s

The responder lock is one per process, but the negotiation PATH is whatever
GTK widget chain the interaction arrives on, and `NestedRoot`/`IntrinsicRoot`
put native widgets both above and below RN views. The arbitration registry is
also process-wide and has **no tree knowledge at all** — it is keyed by
handler tag. What makes that safe is when a gesture enters it: **on the press,
not on mount.**

So:

- **Two `Root`s that nest** — an island mounted inside another island's view —
  are one GTK widget chain, so both gestures are on one interaction path and
  every relation behaves exactly as it does inside a single `Root`. Native
  widgets in between take no part in the negotiation and do not break the
  chain.
- **Two `Root`s that are disjoint** — separate windows, or sibling islands —
  can never have both gestures live in one interaction: there is one pointer
  and one session. A relation between them is expressible, resolves to a real
  handler tag, and simply never has an occasion to apply. It is not an error
  and it does not warn.
- **`requireExternalGestureToFail` across disjoint `Root`s does not
  deadlock.** Parking only ever happens against a gesture that is live in the
  interaction under way, so a gesture in another `Root` is never waited for.
  Recording on mount instead would have made exactly this a permanent hang.

The same reasoning covers two gestures in one `Root` that the pointer cannot
reach together: siblings never see each other's interaction, so a relation
between siblings is inert for the same reason.

### `Gesture.Tap()` — the config surface

`Tap` activates on the **release**, not on the press, which is what leaves the
interaction available to anything else watching the same pointer while a tap is
still being decided. It never holds the responder until the instant it wins.

| Method                    | Behaviour                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numberOfTaps`            | **Implemented.** Between the taps the gesture stays `BEGAN` and holds nothing; `onBegin` fires once for the whole sequence, which is upstream's shape.                                                                                                                                                                                                              |
| `maxDuration`             | **Implemented**, default 500ms, re-armed on every press of a sequence. A press held past it fails on the timer, with the pointer still down.                                                                                                                                                                                                                        |
| `maxDelay`                | **Implemented**, default 500ms — how long the next tap may take to arrive before the sequence gives up.                                                                                                                                                                                                                                                             |
| `maxDistance`             | **Implemented.** A radius from the press, not a per-axis limit. This is the tap-vs-drag rule, and it is what lets a press that turns into a drag stop being a tap. **There is no default**, which is upstream's own behaviour: all three of its distance limits start at an "unset" sentinel, so an unconfigured tap accepts any travel that stays inside the view. |
| `maxDeltaX`, `maxDeltaY`  | **Implemented**, per axis, and independent of `maxDistance`.                                                                                                                                                                                                                                                                                                        |
| `minPointers`             | **Implemented**, checked against the most pointers the interaction ever had at once. Above 1 it never activates — see the differences below.                                                                                                                                                                                                                        |
| `shouldCancelWhenOutside` | **On by default**, set from the constructor exactly as upstream's `TapGesture` does. A press that wanders off the view is not a tap on it. Note that upstream's own `useTapGesture` forgets this and its builder does not; both spellings agree here.                                                                                                               |

### `Gesture.LongPress()` — the config surface

`LongPress` activates on a **timer**, with the pointer standing still — which
works only because of the out-of-event grant channel described in
[research/gestures.md](research/gestures.md). Waiting for the next pointer move
would mean waiting forever for a press-and-hold.

| Method                    | Behaviour                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minDuration`             | **Implemented**, default 500ms. `minDuration(0)` activates on the next tick rather than synchronously inside the press, which upstream does; nothing observable here depends on the difference.                                                                                                                                                   |
| `maxDistance`             | **Implemented**, default 10, and measured **from the press** for the whole gesture rather than re-based at activation — upstream's `startX`/`startY` are set on pointer-down and never moved. Travelling past it before the press matures **fails** the gesture; travelling past it after **cancels** it, so `onEnd`/`onFinalize` report `false`. |
| `numberOfPointers`        | **Implemented**, and above 1 it never activates — see the differences below.                                                                                                                                                                                                                                                                      |
| `shouldCancelWhenOutside` | **On by default**, as upstream sets it in both spellings.                                                                                                                                                                                                                                                                                         |
| `event.duration`          | **Implemented.** Milliseconds since the press, which is the point of the gesture. Upstream carries it on `LongPress` alone; here every payload has it, because there is one payload type.                                                                                                                                                         |

**Differences from `react-native-gesture-handler`.** There is one pointer and
`pointerType` is always `MOUSE`: the responder system fabricates one touch per
pointer, and wlroots offers no virtual-touch protocol, so `minPointers(2)`,
`numberOfPointers(2)` and every other multi-touch configuration is unreachable
rather than merely untested — those gestures simply never activate, which is
the honest outcome rather than a silently single-finger one.
`Pinch` and `Rotation` are the exception, and they are implemented — they take
their numbers from a touchpad rather than from the pointer, which is the one
input this platform has that carries more than one contact point. See below.

### `Gesture.Pinch()` and `Gesture.Rotation()` — the two that need a touchpad

**Implemented, and they are the only two gestures here that a mouse cannot
produce.** Everything else on this page runs off the pointer. These two do not,
because a pinch is not a pointer event in any sense: it is a conclusion
libinput draws from two fingers moving on a device it has classified as a
touchpad, delivered to the app as `zwp_pointer_gestures_v1` and turned by GDK
into a `GDK_TOUCHPAD_PINCH`.

That turns out to be a better path than upstream has. RNGH's own single-runtime
implementation runs a `ScaleGestureDetector` over two tracked pointers and needs
two real touches; only its `Pan` has a trackpad path at all, and that one is a
wheel-event heuristic. GTK's `gtk_gesture_zoom_filter_event` lets the touchpad
event straight through at two fingers and reads
`gdk_touchpad_event_get_pinch_scale()` off it, so the scale and the angle
arrive first-class rather than being reconstructed from positions.

**Recognition and arbitration are unchanged.** These are ordinary participants
in the same registry: the same state machine, the same callbacks, the same
`tryActivate`, the same three relation maps, the same broadcast cancel. Only the
raw numbers come from GTK, because they are what the pointer stream physically
lacks. There is no second arbitration path — `Gesture.Simultaneous(pinch,
rotation)` behaves exactly as `Gesture.Simultaneous(pan, tap)` does, and a
`Pinch` and a `Rotation` written without a relation race and cancel each other.

```tsx
const scale = useSharedValue(1)
const angle = useSharedValue(0)

// A photo viewer: both gestures live at once, which is what the relation buys.
const pinch = Gesture.Pinch().onUpdate((event) => {
  scale.value = event.scale // 1 at the start, cumulative, >1 for a spread
})
const rotation = Gesture.Rotation().onUpdate((event) => {
  angle.value = event.rotation // radians since the start, positive clockwise
})

;<GestureDetector gesture={Gesture.Simultaneous(pinch, rotation)}>
  <Animated.View style={animatedStyle}>{/* ... */}</Animated.View>
</GestureDetector>
```

| Field / method                                                                         | Behaviour                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.scale`                                                                          | **Implemented, cumulative and multiplicative**, 1 at the start of the gesture — upstream's own meaning. Not re-based when the gesture activates, which is where it differs from `Pan`'s translation: upstream's `resetProgress()` resets `scale` only while the handler is not yet ACTIVE, and GTK measures from its own recognition point for the same reason. |
| `event.scaleChange`                                                                    | **Implemented** as a RATIO — upstream's `changeEventCalculator` divides for `Pinch` where it subtracts for `Rotation`, because scale composes by multiplication. On the first update it is the `scale` itself, also upstream's.                                                                                                                                 |
| `event.rotation`                                                                       | **Implemented**, radians since the start of the gesture, **positive clockwise** — upstream's convention, and also libinput's and GDK's, so nothing is negated on the way through.                                                                                                                                                                               |
| `event.rotationChange`                                                                 | **Implemented** as a difference in radians.                                                                                                                                                                                                                                                                                                                     |
| `event.focalX` / `focalY`, `event.anchorX` / `anchorY`                                 | **Implemented**, in the gesture VIEW's coordinates — the space upstream's `absoluteToLocal` puts them in. They come from `gtk_gesture_get_bounding_box_center()`, whose coordinates are already relative to the widget the controller is on. `absoluteX`/`absoluteY` carry the same point in window coordinates.                                                |
| `event.velocity`                                                                       | **Implemented per SECOND** — scale-per-second for `Pinch`, radians-per-second for `Rotation`. This is a deliberate divergence; see below.                                                                                                                                                                                                                       |
| activation                                                                             | `Rotation` activates at **5° of accumulated rotation**, which is upstream's `ROTATION_RECOGNITION_THRESHOLD` exactly. `Pinch` activates at **5% of scale change**, which is not upstream's number and cannot be; see below.                                                                                                                                     |
| `enabled`, `hitSlop`, `manualActivation`, `runOnJS`, `withTestId`, the three relations | **Implemented**, as for every other kind. `hitSlop` is tested against the focal point.                                                                                                                                                                                                                                                                          |
| `shouldCancelWhenOutside`                                                              | **Off by default**, as upstream sets it from `PinchGestureHandler.init` / `RotationGestureHandler.init` — a pinch is not addressed to a point the way a tap is, so a focal point that drifts off the view mid-gesture does not cancel it.                                                                                                                       |
| the callbacks                                                                          | **Implemented**: `onBegin`, `onStart`, `onUpdate`, `onChange`, `onEnd`, `onFinalize`. Both gestures are CONTINUOUS upstream, so they have `onUpdate`/`onChange`.                                                                                                                                                                                                |
| the `onTouches*` callbacks                                                             | **Accepted, and never fire.** There is no touch sequence behind a touchpad gesture to report — no pointer goes down. Upstream's do not fire on a trackpad either.                                                                                                                                                                                               |
| pinch-specific / rotation-specific config                                              | **There is none, upstream included.** `PinchGesture` and `RotationGesture` add zero builder methods over `ContinousBaseGesture` in 3.1.0, and v3's `PinchGestureNativeProperties` is literally `Record<string, never>`.                                                                                                                                         |

**Two deliberate divergences, both named.**

`velocity` is **per second**, and upstream's web path computes neither of these
that way. `PinchGestureHandler` divides the scale delta by a millisecond
`timeDelta` and never by 1000, so its number is a thousand times smaller than
the "points per second" its own documentation promises; Android's equivalent
uses `timeDeltaSeconds` and agrees with the documentation.
`RotationGestureDetector.timeDelta` is worse — it returns
`currentTime + previousTime`, an addition rather than a subtraction, which makes
the denominator roughly twice a page-lifetime timestamp and the result not a
velocity at all. There is no single upstream number to reproduce here, so the
documented unit wins. This is the same call this module already makes about a
plain-number `hitSlop`, which upstream's web path silently ignores and its
native paths normalise: where web contradicts both the documentation and
upstream's own native path, follow the documentation and say so.

`Pinch` activates at **5% of scale change**, where upstream activates after two
stages of pixels — `ScaleGestureDetector` reports nothing until the span between
the two touches has changed by more than 30px, and `PinchGestureHandler` then
activates after a further 15px from wherever that opened. Both are arithmetic
over two touch POSITIONS, and a touchpad pinch has none: libinput hands the
compositor a ratio and GDK hands GTK a ratio, so there is no span in pixels
anywhere in the chain to measure 45 of. What makes a small threshold the right
restatement rather than a weaker one is where upstream's sits in the pipeline:
upstream's is the FIRST decision that a pinch is happening at all, while here
libinput has already made that decision — it will not emit a pinch until it has
classified the two fingers' motion as one rather than as a two-finger scroll.
Measured with a virtual touchpad, the first scale GTK reports after `begin` is
already about 1.09, so this gate is a second and smaller one.

**How this was verified, since no test in the suite can.** A touchpad gesture
needs a compositor with a libinput backend, and the headless one each vitest
worker runs against has none (`WLR_BACKENDS=headless`,
`WLR_LIBINPUT_NO_DEVICES=1`) — measured, and it delivers nothing. So the chain
below the GTK controller is measured by probe 6 in
[research/gesture-detector.md](research/gesture-detector.md): a virtual
multitouch touchpad on `/dev/uinput`
(`packages/react-native-gtkx/tests/gtk/support/virtual-touchpad.ts`, the
technique libinput's own litest suite uses), real libinput classification, the
desktop session's real compositor, real GDK, and both a raw `GtkGestureZoom` and
the shipped `Gesture.Pinch()` at the far end.
`packages/react-native-gtkx/tests/gtk/gesture-handler/touchpad-gestures.gtk.test.tsx`
covers the chain above it against real controllers on real widgets, and
`tests/unit/gesture-handler/touchpad.test.ts` covers the semantics.

### `Gesture.Native()` — the config surface

`Native` stands for the widget UNDERNEATH the detector rather than for
anything React Native is doing, which makes its one platform-specific rule the
most important thing about it: **it never takes the responder.** Taking it is
what makes this platform declare `CLAIMED` on the GTK sequence and call
`setKineticScrolling(false)` on every enclosing `GtkScrolledWindow` — RN's
`setIsJSResponder`, which exists to stop a native scroller stealing a JS drag.
A gesture whose whole meaning is "the native scroller is handling this" cannot
be the thing that switches the native scroller off. So it reports, and yields;
a GTK test drives a real wheel and a real drag over one and asserts the
scroller stays live throughout.

| Method                                               | Behaviour                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| activation                                           | **Implemented**, on upstream's own rule: `BEGAN` on press, `ACTIVE` once the pointer has travelled its `DEFAULT_TOUCH_SLOP` of 15px, which is where a native scrollable would have started scrolling. A lift before that fails rather than ends.                                      |
| `shouldActivateOnStart`                              | **Implemented.** Takes the gesture on the press itself, which is upstream's shape for a native view that is a button rather than a scrollable.                                                                                                                                        |
| `disallowInterruption`, `yieldsToContinuousGestures` | **Recorded, and read by nothing yet.** Both are statements about ARBITRATION, and the registry that arbitrates is the orchestrator's. Refusing them would refuse `@gorhom/bottom-sheet`'s own configuration for knobs whose only effect is on a relation it also states explicitly.   |
| the callbacks                                        | **Implemented**, all of them, and `Native` is CONTINUOUS upstream so it reports `onUpdate`/`onChange` travel like `Pan` does. They arrive from the touch props rather than from `onResponderMove`, because those fire regardless of responder status and this gesture never holds it. |
| `shouldCancelWhenOutside`                            | **On by default**, as upstream's `NativeViewGestureHandler.init` sets it.                                                                                                                                                                                                             |
| a sequence taken away mid-drag                       | **Reported as a cancellation** — `onEnd`/`onFinalize` with `success: false`. See the note below; this is the one place on the platform where telling a theft from an ending needed new machinery.                                                                                     |

### The last four: fling, manual, hover and force touch

**All four ship, and the interesting part is that each was refused for a
different reason — only one of which turned out to be about the platform.**
The recon that opened this work grouped them together and its own note said two
of them were "reachable today and just unwritten". Re-examined one at a time:

| Recognizer             | Why it was refused                         | What re-examining it found                                                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Gesture.Fling()`      | unwritten                                  | Nothing was blocking it. It is a velocity predicate and a direction predicate over the machine every other kind runs on.                                                                                                                                                                                                  |
| `Gesture.Manual()`     | unwritten                                  | The smallest of the four: two constant predicates. The work was making `GestureStateManager`'s four methods real transitions rather than two transitions and two deferred flags.                                                                                                                                          |
| `Gesture.Hover()`      | "no input to run on"                       | **Wrong, and inherited rather than measured.** A hover needs no button — it needs `motion_absolute` and nothing else, which is the one request the injection harness has always had. `Pressable` has shipped hover on the same GTK controller since long before this epic. It is now the most fully verified of the four. |
| `Gesture.ForceTouch()` | needs pressure, which nothing here reports | **True of every ordinary input, and not true of the rig.** No Wayland pointer protocol carries pressure — but the tablet protocol does, and a stylus is a kernel object. See below.                                                                                                                                       |

#### `Gesture.Fling()` — velocity, not distance

The thing to get right, and the thing a naive test does not catch: a fling is
not "the pointer travelled 200px to the right", because a slow drag travels
exactly as far. Upstream guards it twice and both are reproduced.

| Method / rule      | Behaviour                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `direction`        | **Implemented**, as the bitmask it is: `Directions.LEFT \| Directions.RIGHT` accepts either. Defaults to `Directions.RIGHT`. Setting two axis bits also opens the DIAGONAL between them, with a wider cone — `UP \| RIGHT` accepts a 45° flick that neither `UP` nor `RIGHT` accepts alone. |
| the cones          | Upstream's: 30° around each axis (±15°) and 60° around each diagonal (±30°), which tile the circle exactly.                                                                                                                                                                                 |
| `minVelocity`      | **700 units per second**, upstream's `DEFAULT_MIN_VELOCITY`, compared strictly. Not configurable upstream and not here.                                                                                                                                                                     |
| the deadline       | **800ms** from the press, upstream's `DEFAULT_MAX_DURATION_MS`. A press that has not flung by then FAILS, whatever it is doing.                                                                                                                                                             |
| `numberOfPointers` | **Implemented, and compared for EQUALITY** against the most pointers the interaction ever had — so a two-finger fling is honestly unreachable on a one-pointer platform rather than silently single-finger, the same shape `LongPress` has.                                                 |
| when it decides    | **On every move, not on the release.** A fling activates the instant it is fast enough and pointed the right way, with the button still down; the release is only the last chance.                                                                                                          |
| the progression    | BEGAN → ACTIVE → END in one synchronous breath, with **no `onUpdate` ever** — upstream overrides `activate()` to call `end()`. `Fling` is therefore discrete, and neither spelling offers `onUpdate`.                                                                                       |

**One documented difference from upstream, and it is the velocity itself.**
Upstream fits a second-degree least-squares polynomial over up to 20 samples
inside a 300ms horizon (`VelocityTracker`) and takes the linear coefficient.
This platform's `velocityX`/`velocityY` are the last inter-event delta — which
is what `Pan().minVelocity()` has always used here and what every payload
reports. `Fling` reads the same number its own event carries rather than a
second, better one nothing else can see. The consequence is that this fling is
more sensitive to a single long frame than upstream's; the deadline and the
cone are unaffected.

#### `Gesture.Manual()` — the app owns the state machine

No configuration of its own, in either spelling, which is upstream's shape
(`ManualGesture` adds zero builder methods; v3's `ManualGestureProperties` is
`Record<string, never>`). It begins on the press and then decides nothing: the
`GestureStateManager` handed to `onTouchesDown`/`onTouchesMove`/`onTouchesUp`/
`onTouchesCancel` is the whole API.

| Method        | Behaviour                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.begin()`    | UNDETERMINED → BEGAN.                                                                                                                                                                                                                          |
| `.activate()` | BEGAN → ACTIVE, **through the ordinary arbitration**. It is a request, not a decision: it can come back parked behind `requireExternalGestureToFail`, or cancelled. Forced past `manualActivation`, as upstream's web state manager forces it. |
| `.end()`      | BEGAN or ACTIVE → END, successfully.                                                                                                                                                                                                           |
| `.fail()`     | BEGAN or ACTIVE → FAILED.                                                                                                                                                                                                                      |

**One deliberate deviation, forced by the platform.** Upstream's Manual does not
end when the pointers lift — its documentation says so explicitly. Half of that
is reproduced exactly: a Manual still BEGAN when the pointer comes up **stays
BEGAN**, holding nothing. The other half is not reachable. A gesture that is
ACTIVE here is holding an _interaction_ — the responder lock, the GTK sequence,
the suspended scrollers — and that interaction ends when the button does.
Staying ACTIVE past it would mean holding a lock that no longer exists,
receiving no further events of any kind, and never reporting an ending at all.
So an ACTIVE Manual ends with the interaction, successfully. `onTouchesUp` fires
first and carries the state manager, so an app that wants a different ending has
the event to write it in.

#### `Gesture.Hover()` — the refusal that did not survive contact

Driven by `GtkEventControllerMotion` — the same controller `Pressable` uses for
its `hovered` state — through the same channel `Pinch` and `Rotation` arrive on.
It goes straight to ACTIVE on the crossing with no threshold at all (upstream's
`begin(); activate();` on one event), reports `x`/`y` in the gesture view's own
coordinates while the pointer moves inside, and ENDs — not cancels — when the
pointer leaves.

**It never takes the responder**, for the same structural reason the touchpad
gestures do not: the responder lock is a lock over an interaction, an
interaction starts with a press, and a hover has none. There is no session to
take and no GTK sequence to claim. A hover therefore cannot exclude a press.

| Method                      | Behaviour                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `.effect()` / `hoverEffect` | **Accepted, inert.** iOS's own pointer effect; nothing in upstream's web handler branches on it either.                 |
| `hitSlop`, `enabled`        | **Implemented**, including the shrinking (negative) form of `hitSlop`.                                                  |
| the callbacks               | **Implemented**; `Hover` is continuous, so `onUpdate`/`onChange` report travel and `changeX`/`changeY` carry the delta. |
| `mouseButton`               | Inert for this kind on both platforms — upstream's hover entry points never consult a button.                           |

**One thing to know before putting a hover next to something.** Mutual exclusion
is upstream's default and is reproduced, and a hover activates whenever the
pointer crosses in — so a hover entering while a pan on another view is still
BEGAN will cancel that pan. Upstream behaves the same way and works around it
per-use: its own `Pressable` sets `manualActivation` on the hover recognizer
precisely to stop it blocking a `Gesture.Native()`. Declare
`simultaneousWithExternalGesture` (or `Gesture.Simultaneous()`) between a hover
and anything sharing its screen. Inventing an exemption here would be a second
arbitration rule upstream does not have.

#### `Gesture.ForceTouch()` — pressure, and exactly how far it is verified

**Upstream does not implement this off iOS at all**, so there is no web
behaviour to restate and the semantics below come from the documented contract:
there is no `src/web/handlers/ForceTouchGestureHandler.ts`, the web `Gestures`
registry has nine entries and this is not one of them, the legacy component
resolves to a `ForceTouchFallback` that warns once and renders its children
unchanged, and there is no v3 hook.

| Method                 | Behaviour                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `minForce`             | **Implemented**, defaulting to upstream's documented **0.2**. Non-strict at the bound, like every other activation threshold here. Note that upstream's 0.2 is a doc comment rather than a constant — no JavaScript in 3.1.0 assigns it, because the real default lives in iOS code. |
| `maxForce`             | **Implemented** as a ceiling that FAILS the gesture before activation and CANCELS it after — the shape `LongPress`'s `maxDistance` has. Unset means no ceiling, which is upstream's shape too.                                                                                       |
| `feedbackOnActivation` | **Accepted, inert.** There is no haptic device on this platform.                                                                                                                                                                                                                     |
| `force`, `forceChange` | On every payload. `forceChange` is a **difference** (upstream's calculator subtracts, where the one for `Pinch` divides); on the first update it is the force itself.                                                                                                                |
| `pointerType`          | **`STYLUS`**, and this is the only kind that does not say `MOUSE`. A pressure reading can only have come from a tablet tool.                                                                                                                                                         |

**Where it comes from, and what a mouse does.** `GtkGestureStylus`, whose
`down`/`motion`/`up` signals carry `get_axis(GDK_AXIS_PRESSURE)` already
normalised to `[0, 1]` — which is upstream's documented range, so nothing is
rescaled. The controller is left at GTK's default `stylus-only`, so **a mouse
produces no events for it whatsoever**. That is deliberate and it is what keeps
a `ForceTouch` from quietly activating at pressure 0 on a machine with no
tablet; a GTK test injects a real mouse press and drag over one and asserts that
nothing fires.

**How far it IS verified, measured rather than asserted.** A uinput virtual pen
tablet (`tests/gtk/support/virtual-stylus.{py,ts}`, built from libinput's own
litest Wacom descriptor) drives the shipped recognizer through the whole real
chain — kernel, evdev, libinput, compositor, GDK, `GtkGestureStylus` — under
`spike/gesture-detector/run-stylus.sh`. It reports `begin=1 start=1 updates=13
end=1 success=true`, activation at force **0.2298** against a `minForce` of 0.2,
monotonically rising forces to **1.000**, `pointerType: STYLUS`, a `maxForce`
cancellation at **0.5196** against a ceiling of 0.5 with no update after it, and
zero callbacks on a card the pen never touched. What it cannot do is run inside
the vitest suite, whose compositor is started with `WLR_BACKENDS=headless
WLR_LIBINPUT_NO_DEVICES=1` and enumerates no input devices at all — the same
split `Pinch` and `Rotation` already live with, and a property of the
compositor rather than of the gesture.

### What stays refused, and why

The refusals that remain are decisions rather than gaps, and each now carries
its reason in the source as well as here. Re-checked against the four target
libraries rather than assumed: sweeping the shipped sources of
`@gorhom/bottom-sheet` 5.2.14, `react-native-draggable-flatlist` 4.0.3,
`react-native-drawer-layout` 4.2.9 and `react-native-reanimated-dnd` 2.0.0 for
every symbol still refused finds exactly one hit — `RefreshControl` in
`@gorhom/bottom-sheet` — and it is not this package's: it comes from
`react-native`, as a type in one file and as a value only in a `.android.tsx`
sibling, which Metro on this platform never resolves. **Nothing reaches for a
button, a legacy handler component, or any `Legacy*` alias.** The `Touchable`
subset shipped earlier remains the only thing upstream's own exports forced.

| Refused                                                                | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the nine `*GestureHandler` components and `legacy_createNativeWrapper` | The RNGH **1.x component API**, deprecated upstream years before the builder was, and migrated off by all four target libraries. Reimplementing it means a second public surface over the same recognizers, with its own `onGestureEvent`/`onHandlerStateChange` shape and its own prop plumbing, for zero measured consumers. `createNativeWrapper` specifically has nothing to add: the responder system IS the arbitration it registers with, every component here already speaks it, and `Gesture.Native()` is how a gesture is declared over one explicitly.                    |
| `RawButton`, `BaseButton`, `RectButton`, `BorderlessButton`            | Not RN components with a handler attached — RNGH's own **native button views**, in Java and Objective-C, with an Android ripple, `rippleColor`/`rippleRadius`, `borderless` drawable selection and an `activeOpacity` applied by the native view. There is no GTK widget with those semantics and no way to fake the ripple, so any implementation would be a `Pressable` wearing another name.                                                                                                                                                                                      |
| `TouchableNativeFeedback`, `Touchable`, `RefreshControl`               | Android's ripple by another name; RN's deprecated mixin; and pull-to-refresh, which needs a scroll gesture this `ScrollView` does not expose and a spinner widget this platform does not have.                                                                                                                                                                                                                                                                                                                                                                                       |
| `GestureStateManager`, `VirtualGestureDetector`                        | Upstream's standalone `create(tag)` factory looks a mounted handler up by tag in a global `NodeManager`. **The manager an app actually uses is implemented** — it is the one handed into `onTouches*`, and it is what drives `Gesture.Manual()`. What is missing is the process-wide tag→handler registry, and its absence is deliberate: identity here is the mounted detector, and relations resolve an app's gesture object to a tag lazily so that nothing has to be looked up in a global map. Upstream deprecates this export in favour of the hook API in the same breath.    |
| `InterceptingGestureDetector`                                          | 3.1.0's new experimental detector, which intercepts events destined for views BELOW it. On this platform that would mean claiming a GTK sequence before deciding — and `CLAIMED` is irrevocable here, so "intercept, look, maybe give it back" is not expressible.                                                                                                                                                                                                                                                                                                                   |
| `GestureDetectorType`                                                  | A TYPE upstream, not a value. Type positions never reach this module at all (the alias is a bundler alias; `tsc` resolves the real package's types from node_modules), so a runtime value under that name could only be read by code that has already gone wrong.                                                                                                                                                                                                                                                                                                                    |
| the twelve `Legacy*` aliases                                           | Each is 3.x's escape hatch back to the 2.x implementation of a component whose 3.x spelling is either implemented here already or refused above with its own reason. Where the modern name works, the alias would be a second name carrying a promise — "this behaves like 2.x did" — that this platform cannot keep, never having implemented 2.x to differ from. `LegacyDrawerLayoutAndroid` is refused twice over: React Native itself does not ship `DrawerLayoutAndroid` off Android, and `@react-navigation/drawer` reaches for `react-native-drawer-layout`, which runs here. |

### A native ancestor stealing the sequence is no longer a clean release

The correction [research/gestures.md](research/gestures.md) records, now
implemented. GTK's claim propagation is asymmetric: a claim by a **descendant**
cancels the ancestor's gesture (`::cancel` then `::end`), while a claim by an
**ancestor** DENIES the descendant and then ends it with an ordinary
`drag-end` — the same signal a finger lifting produces. This platform mapped
`drag-end` to `onResponderRelease` and `onTouchEnd`, so a native widget above
you stealing a drag arrived in JS as a **clean, successful ending** at whatever
position the theft happened at.

`responder/use-responder.ts` now watches `::sequence-state-changed` for the
`->DENIED` transition, which is the only thing that separates the two, and
routes a denied `drag-end` to the cancel path. So a stolen interaction reaches
`onResponderTerminate` and `onTouchCancel`, and every recognizer built on them
reports it as a cancellation.

Nothing depended on this before, and the reason is measured rather than
assumed: a view that takes the responder on PRESS makes the platform claim on
its own gesture, and a claim by the descendant cancels every ancestor's gesture
outright — so an ancestor never gets a second chance to steal. It becomes
load-bearing with `Gesture.Native()`, which is the first recognizer that
deliberately never claims.

### The two libraries this surface was measured against RUN

**Measured by building them and then driving them, not by reading them.** The
probe app is committed at `spike/core-exports` — the real published packages
under the real `gtkx build`, with the presets' aliases in place, and a real
`zwlr_virtual_pointer_v1` aimed at coordinates taken from `measureInWindow`
on the running tree. `bash spike/core-exports/run-headless.sh` in the VM
rebuilds it, drives it and prints:

```
[core-exports] PASS the window fills the output, so window coordinates are output coordinates — columns rect = 0,0 1024x708
[core-exports] draggable onDragBegin
[core-exports] draggable order=b,c,a,d,e
[core-exports] PASS the dragged row changed place — row-a y 40 -> 160
[core-exports] sheet index=2
[core-exports] PASS the sheet moved up under the drag — handle y 531 -> 212
[core-exports] PASS NEGATIVE CONTROL: the zone the pointer never visited saw nothing — control touch events = 0
```

That method is the point, and it corrected this section three times running.
Twice the blockers were predicted from sources and both lists were wrong; the
third time the list was right about the BUILD and could not have known what
the first render would hit. Nothing below was reasoned about — each entry is
an error the toolchain produced, in the order it produced it.

**`react-native-draggable-flatlist` 4.0.3.** Stopped at BUILD on
`react-native` rather than on `react-native-gesture-handler`:
[`findNodeHandle`](#api-modules) and [`LogBox`](#api-modules)
(`components/CellRendererComponent`, `components/NestableDraggableFlatList`),
then [`useAnimatedScrollHandler`](#implemented)
(`components/DraggableFlatList`, `components/NestableScrollContainer`). Past
the build it hit three more walls that only a running app can show:

1. `__DEV__` was not defined on the vite path at all — RN's own dev flag,
   which the Metro path gets from the app's stock preset and nothing supplied
   here. The preset defines it from vite's mode now;
2. `CellRendererComponent`, which the windowed list did not accept. That prop
   is the library's whole design (the cell is what translates, and what
   provides the "am I the active row" context), so `ScaleDecorator` threw
   `useIsActive must be called from within CellProvider!` on first render;
3. `useDerivedValue(() => withSpring(…))` — a documented Reanimated pattern
   and the shape of `hooks/useOnCellActiveAnimation`. The first evaluation of
   an updater has nothing to animate FROM, so upstream collapses every
   builder to its target for that one run; this platform seeded the shared
   value with the animation OBJECT instead, and the second evaluation failed
   with "an animation can only be assigned to a shared value holding a
   number".

**`@gorhom/bottom-sheet` 5.2.14.** Stopped at BUILD on the same surface plus
two: `findNodeHandle`, `LogBox`, [`Keyboard`](#api-modules) and
[`VirtualizedList`](#components) (`hooks/useGestureEventsHandlersDefault`,
`hooks/useScrollableSetter`, `utilities/findNodeHandle`,
`components/bottomSheetScrollable`). Everything it takes from THIS surface
resolved already — `Gesture.Native()`, `State`, the `Touchable` family it
re-exports as `BottomSheetTouchable`, `TextInput`, and the cross-gesture
relations its pan chains configure. Its one running wall was
`findNodeHandle` answering `null` for a list: it identifies its scrollable by
node handle (`hooks/useScrollable`), and a composite that resolved to nothing
left the sheet warning `Couldn't find the scrollable node handle id!` with no
scrollable bound. A windowed list resolves to the `ScrollView` it renders
now, which is what RN does for a `FlatList` too.

**`react-native-reanimated-dnd` 2.0.0 — never loads, by design; and it RUNS
when it does.** Both presets alias the package name onto
[`react-native-gtkx/dnd`](#drag-and-drop-react-native-gtkxdnd), which mirrors
its API on GTK's own drag-and-drop, so an app never resolves the real package
unless it asks to. The gallery's "Upstream drop zones" and "Upstream
sortables" sections ask — `aliases:
{ "react-native-reanimated-dnd": false }` (see [Package
aliases](#configuring-the-package-aliases)) — and installs it for real:
`Draggable`, `Droppable`, `DropProvider` and `Sortable` all work on this
surface, dragged by a real pointer. What that took, and the two things that
still differ, are in
[research/upstream-libraries.md](research/upstream-libraries.md).

#### What the probe does NOT prove

- **Anything about touch.** The pointer is a mouse, as everything on this rig
  is; a drag that a finger would arbitrate differently against a scroller is
  the same gap `research/gestures.md` records.
- **The rest of either library's surface.** One draggable list and one sheet
  with a scrollable in it were driven. `BottomSheetModal`, the backdrop, the
  footer, `NestableScrollContainer`, horizontal lists and `enableDynamicSizing`
  edge cases are built but not driven.
- **That every accepted-and-ignored call is harmless in every configuration.**
  `Keyboard`'s events never firing is right on a desktop and is still a
  behaviour difference: a sheet with `keyboardBehavior` configured has nothing
  to react to, and its keyboard state stays `UNDETERMINED`.

The throws are still the point where something IS missing. A
`PanGestureHandler` that quietly rendered its children without gestures is
exactly the trap [research/gestures.md](research/gestures.md) records
`Animated.View` falling into — compiled, ran, did nothing. The stand-ins fail
on call, on render and on property access, while still answering the
introspection React and `console.log` do first, so the message that surfaces
is the precise one — and `createAnimatedComponent` is the honest limit of
that: it reads only `displayName` and `name`, both on the allowlist, so a
stand-in it is handed binds without complaint and cannot fail until it is
rendered. That is why the earlier claim that RNGH's `FlatList`/`ScrollView`
re-exports stopped `draggable-flatlist` at import was wrong.

A symbol this shim does not list at all fails earlier still, at bundle time,
with the bundler's own "no export named X".

## `react-native-reanimated` (`react-native-gtkx/reanimated`)

Reanimated's **semantics**, reimplemented on a platform that has none of its
architecture — because it needs none of it. Both presets alias the bare
package name onto this subpath, so an app keeps its source:

```tsx
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
```

**Why the architecture is gone.** Reanimated exists to cross a thread
boundary. Here GTK's main loop _is_ the JS thread — a widget call is a
synchronous C call on the same stack — so a worklet is an ordinary function,
`measure()` is synchronous, and a shared value is an observable box. That is
not this project's reinterpretation: upstream ships the flattened version
itself, selects it with `SHOULD_BE_USE_WEB`, and routes react-native-windows
(no DOM, no second runtime) down it. Full evidence, and what it costs, in
[research/reanimated.md](research/reanimated.md).

**Why a reimplementation and not the library.** ~35,700 lines of `src/`, 21
DOM-bound files, and a `Platform.OS` gate that does not know about `linux`;
running it would mean maintaining a fork of a fast-moving dependency. The web
path is the blueprint — every behaviour here was read off it — and its pure
parts (`interpolate`, `Easing`, the spring config maths) are ported.

**The Babel plugin is not needed, and not assumed.** Its output is an ordinary
lexical closure with metadata and no injected runtime import, so `'worklet'`
is an inert directive. This platform never runs Babel (vite/rolldown; the
Metro path uses the app's own stock preset), while an app that also targets
iOS or Android keeps the plugin for those builds — so both configurations
work. Dependency tracking here is **dynamic**: a mapper subscribes to the
shared values it actually reads, which is more precise than a static
`__closure` scan (a conditional read is tracked correctly) and needs no build
step. `dependencies` arrays are accepted and control only when a mapper is
rebuilt.

### The boundary: what can be animated

This is the honest limit of the surface, and it is not a runtime limit. What
this platform can write to a mounted widget without a React render:

| Property                                                                                                            | Reached through    | How it reaches GTK                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opacity`                                                                                                           | `useAnimatedStyle` | `gtk_widget_set_opacity`, straight from the animation frame.                                                                                                                                      |
| `transform` (`translateX/Y`, `scale`, `scaleX/Y`, `rotate`/`rotateZ`)                                               | `useAnimatedStyle` | The rect store plus one queued allocation, applied as a `GskTransform`. No 3D, no skew, no `matrix` — the same list the static `transform` style takes.                                           |
| `top`, `left`, `right`, `bottom` — **only** on a node whose own `position` is `"absolute"`                          | `useAnimatedStyle` | Turned into a translate from the position the committed layout gave it: the same rect store, the same queued allocation, 1.99 µs.                                                                 |
| `width`, `height` — **only** where the change is confined to the node that owns it                                  | `useAnimatedStyle` | The node's own subtree re-laid-out pinned to the driven value, into the rect store as an override — 7.1 µs for a leaf, 21.7 µs with wrapped text, the same at five siblings and at three hundred. |
| `backgroundColor`, `color`, `borderColor` (and per side), `outlineColor`                                            | `useAnimatedStyle` | A `GtkCssProvider` private to that widget, reloaded in place — 11.2 µs per frame, flat in the size of the tree.                                                                                   |
| The numeric SVG props (`r`, `cx`, `strokeWidth`, `strokeDashoffset` and the rest of the geometry and paint numbers) | `useAnimatedProps` | The shape's own descriptor plus `queueDraw` — the SVG components subscribe to an animated node themselves, so nothing new writes.                                                                 |

Colours deliberately do **not** go through the memoised class registry the
static styles use. That registry keys on the generated CSS text, so a colour
driven through it would mint a class per frame into one process-wide
stylesheet that GTK re-parses whole and that is never pruned — measured at
0.8 ms for the first frame and 6.8 ms by the six-hundredth, still climbing.
The private provider has no cache and no document, so nothing about the
static path — including its memoisation — changes. Every animated component
gets this, not just `Animated.View`: the write path is a hook over "a widget
and its parent", so `Animated.Text` and anything through
`createAnimatedComponent` animate colours on the same terms.

**The remaining layout properties are refused, and it is a decision rather
than a gap.** `flex`, `flexBasis`, every `margin*`/`padding*`, `gap` and the
`min*`/`max*` family need a Yoga pass plus the commit walk that follows it,
and that cost is proportional to the CONTAINER rather than to the animated
value: 52 µs for a five-child container, 133 µs at sixty, 496 µs at three
hundred, per frame. A transform is 1.5 µs at all three, and a colour 11.2 µs.
A `useAnimatedStyle` that changes one of them warns once for that property,
says it is a layout property and why, and names the transform to use instead.
The value is still applied on the next React render rather than dropped.

It is a cost argument and only a cost argument. Two things that used to be
said here were re-measured and are not true:
[research/animated-size.md](research/animated-size.md) found that GTK
re-measuring every ancestor after the resize adds nothing at any tree size,
and that a size write cannot resize the window — the RN root reports a zero
size request, so the toplevel never re-negotiates. (An `IntrinsicRoot` mounted
directly in GTK chrome does change the window's request, and is the one place
the hazard is real.)

**`scaleX`/`scaleY` are an approximation for `width`/`height`, not a
replacement**, and the warning says which — it is the sentence a refused size
still gets. Measured on a 100×60 box widened to 260: a scale grows about the
view's CENTRE, so the box moves as it grows (x 500 → 420, where the width
change kept x at 500), and it scales the CONTENT with the box instead of
re-laying it out — the label inside kept its three-line 45 px layout and was
drawn stretched, where the width change re-wrapped it to one line of 15 px.
Reach for a scale when the content can take being stretched (a plain box, an
image). `translateX`/`translateY` for the insets are exact and carry no such
caveat.

Full measurements in [research/animated-size.md](research/animated-size.md),
next to the original table in
[research/animated-colors.md](research/animated-colors.md).

#### The first exception: insets on an absolutely positioned node

`top`, `left`, `right` and `bottom` **are** driven at frame rate, on a node
whose own `position` is `"absolute"`. Such a node is out of flow, so moving it
changes nothing but where it is drawn — which makes an inset exactly a
translation from the position the committed layout gave it, and lets it run on
the transform path with no Yoga pass at all. It is the shape the whole
sortable-list ecosystem is built on:

```tsx
const style = useAnimatedStyle(() => ({
  position: "absolute",
  left: 0,
  right: 0,
  top: top.value, // driven — 1.99 µs, flat in the size of the list
}))
```

Four things are worth knowing about it.

- **It composes with your own transform**, it does not replace it. The derived
  translate is applied outermost, so it moves the already-rotated,
  already-scaled box by the distance the layout asked for — a `top: 100` under
  `scale: 2` moves the box 100 px, not 200.
- **`right` and `bottom` invert**, because they measure inward from the far
  edge: a larger value moves the node towards the origin.
- **An axis anchored by BOTH edges is still refused**, because it is no longer
  a translation. `left: 0, right: 0` with no `width` derives the width from
  both edges, so animating `left` there resizes the node; and with a definite
  `width` Yoga honours `left` and ignores `right` entirely, so animating
  `right` would invent motion a real layout pass would not produce. Both cases
  warn in their own words and say which configuration would work. (The
  sortable shape above is fine: its horizontal axis has two edges but neither
  of them animates, and its vertical axis has only `top`.)
- **`measure()` reports the committed layout, not the translated position** —
  see below.
- **`position` may live in a sibling style entry.** The usual spelling —
  `style={[styles.row, useAnimatedStyle(() => ({ top: y.value }))]}` — works:
  the decision is taken against the flattened style, not against the updater's
  object alone.

Measurements, including the hit-testing probe under real pointer injection and
the per-configuration table, are in
[research/absolute-insets.md](research/absolute-insets.md).

#### The second exception: a size that is confined to the node that owns it

`width` and `height` **are** driven at frame rate where the change stops at
the node — the node's own subtree is re-laid-out pinned to the driven value,
the result goes into the rect store as an override, and one queued allocation
puts it on screen. Nothing above the node is visited and nothing is written
into Yoga, so the cost is the size of the NODE rather than of its container:

| children in the container | driven `width`, leaf | with wrapped text | the naive write | a transform |
| ------------------------- | -------------------- | ----------------- | --------------- | ----------- |
| 5                         | 7.1 µs               | 22.1 µs           | 52.1 µs         | 1.6 µs      |
| 60                        | 6.9 µs               | 21.8 µs           | 133.1 µs        | 1.5 µs      |
| 300                       | 7.1 µs               | 21.7 µs           | 496.4 µs        | 1.5 µs      |

```tsx
// A progress bar, a disclosure panel, a sliding drawer — all the same shape.
const style = useAnimatedStyle(() => ({ width: width.value }))

<View style={{ width: 400, height: 700 }}>
  {/* the container's width is its own, so nothing this box does can move it */}
  <Animated.View style={[{ height: 60 }, style]}>
    <Text>re-wraps as the box grows, which a scaleX does not</Text>
  </Animated.View>
  <View style={{ height: 20 }} />
</View>
```

**This is a real layout, not a stretch.** The content inside is re-laid-out at
the new size: text re-wraps, a flex row inside redistributes, a stretched
child follows. That is the difference from `scaleX`, and it is why this is a
Yoga pass at all rather than one store write.

The precondition — measured, and refused where it does not hold:

- **the axis is the container's CROSS axis.** A `width` in a column, a
  `height` in a row. A main-axis size pushes every following sibling along,
  which is the layout pass the whole refusal is about.
- **the container's size on that axis does not come from its children.** A
  definite or percentage size, a `flex` from its own parent, or `stretch` on
  its parent's cross axis — the rule climbs until it finds one. A
  content-sized container would grow with the node.
- **the node's OTHER axis does not come from its content.** A box with
  `height: auto` around wrapping text gets taller as it gets narrower, and
  everything after it moves.
- **the node's resolved cross-axis alignment is `flex-start` or `stretch`.**
  `center` and `flex-end` move the node's own origin as it grows.
- **no `aspectRatio`, and no `min`/`max` on that axis.** The first ties the
  other axis to this one; the second clamps the driven value, so the box
  silently stops following the animation.
- **the container does not wrap**, which would re-size the node's line and
  move every line after it.
- an **absolutely positioned** node qualifies too, on either axis, as long as
  the axis' START edge (`left`, `top`) is anchored — it then grows from an
  origin that does not move, and being out of flow it touches nothing at all.
- **not under an `IntrinsicRoot`.** That root reports its Yoga content size to
  GTK, so a size below it feeds the window's own size request — and the driven
  value deliberately never goes into Yoga, so the island would keep its old
  request and the node would draw outside it. This is the one root shape where
  the original "it can resize the window" worry was real.

Everything outside that keeps the refusal, and the warning names which of
those it was.

Three more things are worth knowing.

- **The container's `flexDirection` and `alignItems` are usually not in the
  updater's object** — `style={[styles.bar, useAnimatedStyle(() => ({ width:
w.value }))]}` is the ordinary spelling. The decision is taken against the
  layout tree, so it sees the real answer either way.
- **The driven size survives an unrelated engine flush.** It is kept as an
  override next to the animated offset rather than written over the committed
  rect, so a window resize — or any other reason the engine re-commits the
  tree mid-animation — cannot drop a frame of it.
- **`measure()` reports the committed layout, not the driven size**, exactly
  as it does for a transform and for an animated inset. The node's Yoga size
  did not change; it catches up on the next React render.

Measurements, the hit-testing probe under real pointer injection, and the
per-configuration comparison against a full layout pass are in
[research/animated-size.md](research/animated-size.md).

**`measure()` on a node moved this way reports the LAYOUT rect.** The node's
Yoga `top` did not change; only its allocated and painted position did. So
`x`/`y`/`width`/`height` are the committed layout — untranslated — while
`pageX`/`pageY` go through GTK's transform chain and report where the node is
actually drawn. `measureInWindow` and `measureLayout` follow `pageX`/`pageY`.
This is a real difference from reading the geometry back on mobile, and it is
the same split an explicit `translateY` has always had here.

**`zIndex` is driven, animated or not** — see item 10 of
[the differences summary](#key-differences-from-react-native-summary) for what
it means here and where it diverges. It is one widget
write, no Yoga pass and no CSS, so it costs what `opacity` costs; the shape
`useSortable` produces every frame (`{ position: "absolute", left: 0, right: 0,
top: top.value, zIndex: moving ? 1 : 0 }`) drives both `top` and `zIndex` and
warns about neither.

Everything else — borders, radii, shadows — still reaches GTK as a CSS class
computed during render. It is not dropped silently either: the property is
named in a one-per-session warning and its latest value is applied on the
next React render. `useAnimatedProps` has the same rule with the same
warning: a numeric prop is driven, anything else is named and lands on the
next render.

### Implemented

| Export                                                                                                           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSharedValue`, `makeMutable`, `isSharedValue`, `cancelAnimation`                                              | Full. A shared value is also a platform animated node, so it can be handed to `Animated.View`'s style directly as well as through `useAnimatedStyle`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `useAnimatedStyle`                                                                                               | Full for `opacity`, `transform`, colours, the insets of an absolutely positioned node and a `width`/`height` whose change is confined to that node — see the boundary above. A style whose _shape_ changes between runs costs exactly one React render and rebinds; a running animation costs none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `useAnimatedProps`                                                                                               | Numeric props, driven straight into the component that takes them — in practice the SVG shapes, which already accept `number \| AnimatedNode` on every geometry and paint number. Same lifecycle as `useAnimatedStyle`, down to the one render a shape change costs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `useDerivedValue`, `useAnimatedReaction`, `startMapper`, `stopMapper`                                            | Full. Mappers are torn down on unmount.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `withTiming`, `withSpring`, `withSequence`, `withRepeat`, `withDelay`                                            | Full for numeric values, on upstream's defaults (timing 300 ms / `inOut(quad)`, spring `GentleSpringConfig`), driven by the platform's own frame scheduler.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `withDecay`, `withClamp`                                                                                         | Full, including `velocity`, `deceleration`, `velocityFactor`, `clamp` and `rubberBandEffect` — upstream's own step function, ported. `withDecay` is what an inertial fling rides on: released with a velocity, it coasts, decelerates and stops with no target. `withClamp` runs its inner animation un-truncated and clips what reaches the value, which is upstream's distinction and is observable on an overshooting spring.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `interpolate`, `clamp`, `Extrapolation`, `Extrapolate`, `Easing`                                                 | Full, including per-edge extrapolation and `Easing.bezier`'s factory shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `interpolateColor`, `convertToRGBA`, `isColor`, `rgbaArrayToRGBAColor`                                           | Full for `'RGB'` (upstream's 2.2 gamma) and `'HSV'` (upstream's hue-wrap correction), including its `transparent` handling. `'LAB'` throws — see the differences table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `PlatformColor`                                                                                                  | The platform's own: theme colours by name, resolved by GTK against the live Adwaita palette. Can be animated _between_ on a shared value; cannot be interpolated _through_.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `useAnimatedScrollHandler`                                                                                       | `onScroll` in full, on a path that was already there: `ScrollView`'s `emitScroll` runs from a `GtkAdjustment::value-changed` handler — a C callback on the loop this JS is on — so a handler that writes a shared value gets Reanimated's promise (no React render per scroll) without any event machinery. Hand the result to a scrollable's `onScroll`; the handler receives Reanimated's FLATTENED event (`event.contentOffset.y`, not `event.nativeEvent`) carrying the three measurements a `GtkScrolledWindow` can report, plus one context object shared by every call. `onBeginDrag`/`onEndDrag`/`onMomentumBegin`/`onMomentumEnd` are called, and which of them you get depends on the input DEVICE: a wheel produces none (it has no sequence and nothing coasts after it), a touchpad glide produces all four. Routed through the ONE `onScroll` prop, as on mobile — `@gorhom/bottom-sheet` passes no phase prop at all — and sharing the single context object with `onScroll`, which is what its scroll lock is built on. `contentInset`, `velocity` and `zoomScale` are absent from the event rather than invented as zeros. See the `ScrollView` row and [research/scroll-phases.md](research/scroll-phases.md) |
| `scrollTo`                                                                                                       | `scrollTo(ref, x, y, animated)` on the scrollable an `useAnimatedRef` points at — the write half of the hook above, and the same reasoning: this IS the thread that owns the widget, so it calls the scrollable's own imperative `scrollTo` synchronously. Upstream's argument order rather than RN's options object, so library call sites are unchanged; `animated` is ignored, as it is on `ScrollView`. A ref pointing at nothing (or at something without a scroll API) is ignored rather than throwing, as upstream's is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `useScrollOffset`, `useScrollViewOffset`                                                                         | A shared value holding a scrollable's current offset, updated from the adjustment's own `value-changed` — no `onScroll` prop needed and no React render. Takes upstream's second argument (write into a shared value you already own) and upstream's own axis rule (`x` when there is a horizontal offset, `y` otherwise). Point it at a `ScrollView`, a `FlatList` (which resolves through to the `ScrollView` it renders, as `findNodeHandle` does) or an `Animated.ScrollView`; a ref on anything else warns once and the value stays 0. Costs 5.15 µs per scroll event while tracking and nothing at all while not — it connects on mount and disconnects on unmount.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `useHandler`                                                                                                     | Full. `doDependenciesDiffer` is always **false**, and that is a statement rather than a stub: upstream needs it because a worklet is a by-value snapshot that goes stale, and here a handler is an ordinary closure read out of a ref at call time. `useWeb` is true, for the reason the whole surface is on upstream's web path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `useEvent`                                                                                                       | **Scroll event names only** — `onScroll`, `onScrollBeginDrag`, `onScrollEndDrag`, `onMomentumScrollBegin`, `onMomentumScrollEnd`. The value it returns goes on a scrollable's `onScroll`, which IS the subscription here; that is the same object `useAnimatedScrollHandler` returns, so a hand-built handler and the stock one behave identically. Any other event name throws where it is asked for, naming itself: there is no native event registry to subscribe an arbitrary name against, and a subscription that could never fire is the failure mode this package refuses everywhere else. `rebuild` is accepted and ignored, for the same reason `doDependenciesDiffer` is false. `.workletEventHandler` throws — it registers a native view TAG, and there is neither.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `useAnimatedKeyboard`, `KeyboardState`                                                                           | Real shared values, **honoured and never updated** — the same shape and the same reason as RN's `Keyboard`: every number the hook reports describes a software panel taking screen space from the app, and a desktop has none. `height` is 0 because the keyboard occupies nothing and `state` is `CLOSED` because it is — deliberately not `UNKNOWN`, which upstream seeds only until the native side reports and here would be false. A `useAnimatedStyle` reading them subscribes, computes and settles once, so an app written for three platforms keeps one source and gets the right answer here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `useAnimatedRef`, `measure`                                                                                      | Full, and callable from anywhere — there is no worklet to be inside of. Returns `null` before the first committed layout, which is RN's own contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `runOnUI`, `runOnJS`, `scheduleOnUI`, `scheduleOnRN`                                                             | Deferred, not inlined — see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Animated.View`                                                                                                  | The platform's own, unchanged. Takes a `ref` giving `measure`/`measureInWindow`/`measureLayout`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Animated.Text`, `Animated.Image`, `Animated.ScrollView`                                                         | `createAnimatedComponent` over the platform's own components — no subclass and no special case. All three forward the `ref` through, so `useAnimatedRef` + `measure()` works on them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `createAnimatedComponent`                                                                                        | **Adds no widget to the tree.** It renders the wrapped component itself and reaches its widget through the ref that component already exposes, so the GTK output is what the unwrapped component produces. Wrap anything that takes a `ref` giving the geometry methods; anything else gets a named warning rather than a silent no-op.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `entering`, `exiting`, `layout`                                                                                  | On every animated component, not only `Animated.View` — see the layout-animation section below. `exiting` keeps the widget on screen after React has removed it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `FadeIn`, `FadeOut`, `LinearTransition`, `Layout`, `Keyframe`                                                    | Upstream's fluent surface (`.duration()`, `.delay()`, `.easing()`, `.springify()` and the spring parameters, `.rotate()`, `.withInitialValues()`, `.withCallback()`), usable as the class or as an instance. `Layout` is upstream's own deprecated alias of `LinearTransition`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The preset catalogue: `Fade*`, `Bounce*`, `Pinwheel*`, `Roll*`, `Rotate*`, `Slide*`, `Stretch*`, `Zoom*`         | 60 of upstream's 76, on upstream's own parameters, sharing one builder over a table. The 16 that are refused are the twelve `Flip*` (`perspective` + `rotateX`/`rotateY` — a 3D rotation, where this platform folds a transform array into one 2D affine matrix) and the four `LightSpeed*` (`skewX`, a deliberate cut across the whole transform surface). Both throw by name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `CurvedTransition`, `FadingTransition`, `JumpingTransition`, `SequencedTransition`, `EntryExitTransition`        | The four `layout` transitions beside `LinearTransition`, plus the one that composes an entering and an exiting builder into a single layout animation. Same properties, same paint-only position (see the differences table).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `LayoutAnimationConfig`, `enableLayoutAnimations`                                                                | `<LayoutAnimationConfig skipEntering skipExiting>` suppresses the animations of the subtree below it, and adds no widget. `enableLayoutAnimations` warns and does nothing, which is exactly what it does upstream — it is deprecated there and its allow-list is gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `withReanimatedTimer`, `advanceAnimationByTime`, `advanceAnimationByFrame`                                       | Real, and not an emulation: the frame driver every animation here runs on is this platform's own, so a test takes it and steps it. `withReanimatedTimer` also accepts an async body, which a `@gtkx/testing` test needs. `getAnimatedStyle` and `setUpTests` are refused — see the differences table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `BaseAnimationBuilder`, `ComplexAnimationBuilder`                                                                | One class under both names — upstream splits the plain chain from the spring parameters, this platform does not — so a library subclassing either keeps working.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GentleSpringConfig` and the other seven spring presets, `ReduceMotion`, `ReanimatedLogLevel`, `isSharedValue`   | Plain data, mirrored exactly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `isConfigured`, `isReanimated3`, `makeShareableCloneRecursive`, `isWorkletFunction`, `configureReanimatedLogger` | Present. Cloning is identity (nothing leaves the runtime it was made in); `configureReanimatedLogger` is accepted and does nothing, because there is no second logger to configure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Animating an SVG shape is the case `useAnimatedProps` exists for, and it
reads exactly as it does on mobile:

```tsx
import { Circle, Svg } from "react-native-gtkx/svg"
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const Pulse = () => {
  const r = useSharedValue(10)
  const animatedProps = useAnimatedProps(() => ({ r: r.value }))
  return (
    <Svg
      width={100}
      height={100}
      onLayout={() => (r.value = withTiming(40))}
    >
      <AnimatedCircle
        cx={50}
        cy={50}
        fill="green"
        animatedProps={animatedProps}
      />
    </Svg>
  )
}
```

#### Writing a shared value: `.value` or `.set()`

Both spellings are upstream's and both work here: `sharedValue.value = x`, or
`sharedValue.get()` / `sharedValue.set(x)` (which also takes an updater,
`count.set((current) => current + 1)`). They differ only under lint. The
React Compiler — [on by default on the vite path](getting-started.md#the-react-compiler-is-on-by-default-vite-path) —
treats anything a hook returns as frozen, so `react-hooks/immutability`
reports **every** assignment to `.value`, including the ones inside a
callback or an effect that are perfectly legitimate. `.get()`/`.set()` is
what upstream added for exactly this case and lints clean everywhere. Prefer
it in new code; `.value` keeps working, and a ported app does not have to be
rewritten.

### Layout animations, and the one primitive they needed

```tsx
<Animated.View
  entering={FadeIn.duration(300)}
  exiting={FadeOut}
  layout={LinearTransition.springify()}
/>
```

All three work on every animated component — `Animated.View`,
`Animated.Text`, `Animated.Image`, `Animated.ScrollView` and anything through
`createAnimatedComponent` — because they are added by wrapping rather than by
subclassing, and the wrapper adds no widget to the tree any more than
`createAnimatedComponent` does.

`entering` and `layout` needed nothing new. `entering` writes the builder's
initial values in the commit that mounts the widget (so it is never drawn
un-faded, not even for a frame) and animates from there. `layout` watches for
the layout engine committing a **different rect** for that child and walks it
from where it was to where the engine put it.

**`layout` animates the position, and applies the size.** Upstream's
`LinearTransition` animates `originX`/`originY`/`width`/`height`; all four are
still produced here, and the origins are honoured as a **translation** — the
same paint-only write a `transform` uses, composed with whatever transform the
style already has, so a row that scales while the list reorders does both. A
size change lands immediately instead, for the reason the boundary section
above already gives: animating a size means a Yoga pass per frame whose cost
is the tree's rather than the animated value's.

**`exiting` is the one that needed a new primitive**, and it is the reason
this slice exists. An exit animation has to keep drawing a widget React has
already reconciled away, and React's deletion is neither asynchronous nor
negotiable: in one synchronous commit it runs the unmounting subtree's
cleanups and unparents its topmost widget. So the platform grew a **widget
retention** primitive, generalised from the one
`react-native-gtkx/adw`'s `NavigationStack` already used for pages — hold what
is leaving, drop it on the real end signal, and arm a timer in case that
signal never comes:

- The widget is put back into the same container, **at the end of the child
  list**, so it draws over the siblings closing the gap rather than under
  them.
- Its Yoga node leaves the shadow tree immediately, so an exiting view does
  **not** hold its space — the row below it moves up at once, and the fade
  happens over the top.
- Every container in the retained subtree keeps its layout manager until the
  animation ends, so the exiting view's own children stay exactly where the
  engine put them.
- **A fallback timer always runs**, armed from the animation's declared
  length. Whichever arrives first — the animation's end or the timer — drops
  the widget, so a spring that never settles, a frame source that dies, or an
  animation that was never started cannot leak a widget that is still
  parented, drawn and hit-testable.

`exiting` is skipped when the component's own container is unmounting in the
same commit: there is no container left to hold the widget, and an exit
animation inside a disappearing parent is not one anybody sees.

### Differences from `react-native-reanimated`

| Behaviour                          | Here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animatable properties              | `opacity`, `transform` and colours — see the boundary table. Layout properties are refused with the transform to use instead; anything else warns once by name. Both land on the next render.                                                                                                                                                                                                                                                                                                                                                                  |
| Animated values                    | Numbers only. `withTiming("#ff0000")` throws rather than animating nothing: animate a number and map it with `interpolateColor`, which is what upstream's own examples do.                                                                                                                                                                                                                                                                                                                                                                                     |
| `interpolateColor` colour spaces   | `'RGB'` and `'HSV'`. `'LAB'` throws by name — upstream's is a vendored slice of culori fed 0-255 channels where culori documents 0-1, so matching it would mean matching the scaling.                                                                                                                                                                                                                                                                                                                                                                          |
| `interpolateColor` inputs          | Colour strings only, and not `PlatformColor` — a theme colour has no value until GTK resolves it against the live theme, so it has nothing to blend. Both cases throw and say which one happened.                                                                                                                                                                                                                                                                                                                                                              |
| `processColor`                     | Throws. It returns RN's packed AARRGGBB integer, whose only consumer is a native module; a colour's destination here is a GTK stylesheet, which takes strings.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `runOnUI` / `runOnJS`              | Schedule rather than run inline, and return `void`, as upstream. A UI hop is a **task**, an RN hop a microtask — so a UI hop is still the later of the two, but it does not wait for a frame the way upstream's _web_ build does (`requestAnimationFrame` stands in there for a UI runtime the web has not got; React Native's real one does not wait either). Waiting cost a `scheduleOnUI(measure)`/`scheduleOnRN(use it)` round trip a whole frame, which is longer than the gap between two GTK pointer events — see `docs/research/dnd-hover-flicker.md`. |
| `SharedValue.addListener`          | Accepts upstream's `(listenerID, listener)` **and** this platform's animated-node `(callback) => id`. Both callers are real, and supporting only one fails silently.                                                                                                                                                                                                                                                                                                                                                                                           |
| Worklet closure capture            | Live lexical capture, not the plugin's by-value snapshot. Only observable for a worklet closing over a reassigned plain `let`, which is already a bug on mobile.                                                                                                                                                                                                                                                                                                                                                                                               |
| `withSpring` rest condition        | Upstream stops on remaining energy relative to initial energy; the platform's solver stops on displacement and speed thresholds, derived here from the same energy budget. The stopping point differs by well under a pixel.                                                                                                                                                                                                                                                                                                                                   |
| `withDecay` config validation      | Throws at the `withDecay()` call rather than on the animation's first frame. Same errors (`clamp` shape, `velocityFactor > 0`, `rubberBandEffect` needing a `clamp`), one line earlier.                                                                                                                                                                                                                                                                                                                                                                        |
| `ReduceMotion`, `useReducedMotion` | The enum is mirrored and every value behaves as `Never`; `useReducedMotion()` is always false. GNOME's `gtk-enable-animations` is not read yet.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `reanimatedVersion`                | The upstream version this surface mirrors, not a claim to be that package.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `LinearTransition` size changes    | The position animates (as a translation); a width or height change lands immediately. A layout transition animates a rect the ENGINE produced, so it has no style to pin a subtree to — the carve-out `useAnimatedStyle` has for a driven `width`/`height` does not reach it.                                                                                                                                                                                                                                                                                  |
| Layout-animation properties        | `opacity`, `transform` and position. `width`/`height` are applied rather than driven (above); anything else a builder asks for is named once, by property, in a warning.                                                                                                                                                                                                                                                                                                                                                                                       |
| Builder methods                    | `.restDisplacementThreshold()` and `.restSpeedThreshold()` are accepted and ignored — this platform's spring derives its rest condition from the same energy budget instead (see the row above). `.reduceMotion()` is accepted and ignored for the reason `useReducedMotion()` is always false.                                                                                                                                                                                                                                                                |
| `entering` / `exiting` ownership   | A layout animation owns `opacity` and `transform` for as long as it runs, so a `useAnimatedStyle` driving the same property on the same view during a fade is two writers on one slot. Upstream has the same rule.                                                                                                                                                                                                                                                                                                                                             |
| The layout-animation catalog       | 60 of the 76 presets, all five `*Transition` builders, `Keyframe` and `LayoutAnimationConfig`. `Flip*` needs a 3D rotation and `LightSpeed*` a skew; both throw by name. `rotate` is carried as degrees rather than upstream's `'90deg'`/`'5rad'` strings — a numeric animation cannot carry a unit, and the matrix that reaches GTK is identical. A builder's own `.rotate()` and a `.withInitialValues()` angle still take either spelling.                                                                                                                  |
| `CurvedTransition` size easings    | `.easingWidth()` and `.easingHeight()` are accepted and ignored, for the reason in the `LinearTransition` row above: a size change lands immediately rather than being driven, so there is no curve to apply to it. The two position easings are honoured.                                                                                                                                                                                                                                                                                                     |
| `SharedTransition`                 | Throws. It needs three things that do not exist here: a `sharedTransitionTag` prop, an overlay above the navigation stack, and a retention that REPARENTS the leaving widget rather than holding it in place. Upstream's own web path does not implement it either.                                                                                                                                                                                                                                                                                            |
| `getAnimatedStyle`, `setUpTests`   | Throw. Upstream returns the style object its updater produced, which exists on mobile because its Jest path mirrors it onto the component; here a style is taken apart at bind time — opacity to the widget, colours to a private CSS provider, the whole `transform` array folded into one matrix — so there is no such object to return. Assert the widget instead (`getOpacity()`, `computeBounds()`), which is what every GTK test in this repo does and is strictly stronger.                                                                             |

### Not implemented — throws, naming itself

`Animated.FlatList`; sixteen of the seventy-six preset layout-animation
builders — the twelve `FlipIn*`/`FlipOut*` (a 3D rotation with a perspective)
and the four `LightSpeed*` (a skew), both of which need a transform this
platform's 2D matrix has no room for;
`processColor` and `DynamicColorIOS`; `useComposedEventHandler`,
`useFrameCallback`, `useTimestamp`; sensors, screen and shared-element
transitions; Reanimated 4's CSS animations (`css.create`, `css.keyframes`);
`defineAnimation`; `createWorkletRuntime` and `runOnRuntime` (see the worklets
section below); `getAnimatedStyle` and `setUpTests` (the other three test
helpers are implemented).

**Why `Animated.FlatList` is a decision and not an omission.** It is the one
animated component that is refused, because it is a _composite_ rather than a
host component: `FlatList` renders the windowed core, which renders a
`ScrollView`, which is the only thing in that chain that owns a widget — and
`FlatListHandle` is a scroll API by contract, so there is no handle to read a
widget back out of. Giving it one would mean publishing the scrolled window
through two layers whose job is to hide it. Upstream's `Animated.FlatList`
mostly exists so `onScroll` can be an `Animated.event` /
`useAnimatedScrollHandler` — and the second of those IS implemented here, so
a plain `FlatList` already takes one on its `onScroll` and needs no animated
wrapper for it. Put the animated style on an `Animated.View` around the list,
or use `Animated.ScrollView` when the list does not need virtualization.

The throw is the point, and it is the same discipline as the RNGH shim: a
`BounceIn` that mounted without bouncing is the trap
[research/gestures.md](research/gestures.md) records `Animated.View` falling
into — compiled, ran, did nothing. The stand-ins fail on call, on render and
on property access (`BounceIn.duration(300)`, `css.create`), while still
answering the introspection React and `console.log` do first. A symbol not
listed at all fails earlier still, at bundle time.

**`@gorhom/bottom-sheet`'s scroll lock is implemented and still cannot run.**
Both halves of it are here — the `onScroll`/`onBeginDrag`/`onEndDrag`/
`onMomentumEnd` handlers it registers, and the `scrollTo` they call to pin the
list — and driving the sheet with a real pointer showed the lock never
executes, because the sheet's scrollable **emits no scroll event at all**. The
cause is a layer below this surface: a scrollable with no style of its own,
inside a parent with a bounded height, does not become a viewport here — it
grows to its content, so its scroll range stays empty. `<FlatList style={{
flex: 1 }} />` in that parent scrolls and `<FlatList />` does not, measured
side by side in `spike/core-exports`, which keeps the failing check rather than
deleting it.

**`@gorhom/bottom-sheet` and `react-native-draggable-flatlist` both run now**,
and this surface is one of the three they needed: the other two are
[`react-native-gesture-handler`](#react-native-gesture-handler-react-native-gtkxgesture-handler)
and four `react-native` core exports. What each of them was actually stopped
by — and how that was established — is in
[the section that measured it](#the-two-libraries-this-surface-was-measured-against-run).

## `react-native-worklets` (`react-native-gtkx/worklets`)

Reanimated 4 moved the worklet surface out of Reanimated and into its own
package, and libraries import it under that name. Aliasing
`react-native-reanimated` alone therefore left the import wall standing one
package over — and it is an **import**-time wall, not a runtime one:
`react-native-reanimated-dnd` 2.0.0 pulls `scheduleOnRN` and `scheduleOnUI`
out of `react-native-worklets` at module scope in five of its hooks
(`useDraggable`, `useDroppable`, `useSortable`, `useHorizontalSortable`,
`useGridSortable`) with no `try { require } catch` anywhere, so the module
fails to load rather than failing where the function is used. Both presets
alias the package name onto this subpath, so an app keeps its source.

Two measurements worth keeping, taken against the published packages rather
than their docs:

- **`react-native-reanimated-dnd` 2.0.0 imports exactly two symbols from it**
  — `scheduleOnRN` and `scheduleOnUI`, both implemented here.
- **`@gorhom/bottom-sheet` 5.2.14 imports none.** It reaches `runOnJS` and
  `runOnUI` through `react-native-reanimated`, and does not depend on
  `react-native-worklets` at all. What blocks it is measured in the
  `react-native-gesture-handler` section, and it is not this package.
  `react-native-gesture-handler` 3.1.0 does use this package
  (`scheduleOnUI`), but behind a `try { require } catch`, so it never had this
  failure mode.

The thread functions here and the ones `react-native-gtkx/reanimated` exports
are the **same instance**, not two copies: jobs queued through either package
name land in one batch, in order, exactly as upstream, where Reanimated
re-exports them from this package.

### The boundary, and who drew it

What is implemented and what refuses is decided by **upstream's own
non-native build** — the `.ts` files it ships next to its `.native.ts` ones,
which are what react-native-windows and the web run. Where that build
computes something, so does this; where it throws, this refuses by name. That
is the only boundary here with a source of truth, and it draws itself in the
right place: a worklet runtime is a **second JS runtime**, and this platform
has one thread. Measured against `react-native-worklets` 0.11.3.

One thing that build does is deliberately **not** copied, and it is a timing
rather than a boundary: its UI hop waits for a `requestAnimationFrame`. That
is the web standing in for a UI runtime it has not got, and React Native — the
contract here — posts to a real thread that picks the job up without waiting
for a frame. See `docs/research/dnd-hover-flicker.md` for what the wait broke.

| Export                                                                                                                                                    | Behaviour                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runOnUI`, `scheduleOnUI`, `runOnJS`, `scheduleOnRN`                                                                                                      | Deferred, not inlined, and returning `void` — the same functions `react-native-gtkx/reanimated` exports, so see that section's differences table.                                    |
| `runOnUIAsync`                                                                                                                                            | Resolves with the worklet's return value when the UI hop runs it. The one thread API that hands anything back, because a promise crosses the deferral the others impose.             |
| `isWorkletFunction`                                                                                                                                       | Upstream's `__workletHash` check. This platform never runs the Babel plugin, so nothing is a worklet and nothing needs to be — `'worklet'` is an inert string.                       |
| `makeShareableCloneRecursive`, `createSerializable`, `makeShareable`, `makeShareableCloneOnUIRecursive`, `isSerializableRef`, `isShareableRef`            | Identity, as upstream's own non-native serializer: a value never leaves the runtime it was made in, so there is nothing to clone.                                                    |
| `serializableMappingCache`, `shareableMappingCache`, `registerCustomSerializable`, `callMicrotasks`                                                       | No-ops, as upstream.                                                                                                                                                                 |
| `isShareable`, `isSynchronizable`                                                                                                                         | Upstream's structural checks, ported unchanged.                                                                                                                                      |
| `RuntimeKind`, `getRuntimeKind`, `isRNRuntime`, `isUIRuntime`, `isWorkerRuntime`, `isWorkletRuntime`, `UIRuntimeId`                                       | Answer for the one runtime there is: `ReactNative`. Upstream's non-native path reports the same, because its initializer sets that kind and nothing ever changes it.                 |
| `getStaticFeatureFlag`, `getDynamicFeatureFlag`, `setDynamicFeatureFlag`, `isBundleModeEnabled`, `toggleSlowAnimationsOnUIRuntime`                        | `false` and no-ops. These gate upstream's native experiments and its Babel bundle mode, none of which exist here.                                                                    |
| `createWorkletRuntime`, `runOnRuntime`, `runOnRuntimeSync`/`Async`(`WithId`), `scheduleOnRuntime`(`WithId`), `getUIRuntimeHolder`, `getUISchedulerHolder` | **Throw**, naming themselves. A second runtime is structural, and upstream's own `runtimes.ts` throws for every one of these on any single-runtime build.                            |
| `runOnUISync`, `executeOnUIRuntimeSync`                                                                                                                   | **Throw.** Both are "run it over there and give me the answer now". Deferring instead would be worse than refusing: the caller wants the return value, and a deferred call has none. |
| `createShareable`, `createSynchronizable`                                                                                                                 | **Throw** — memory shared between runtimes.                                                                                                                                          |
| `WorkletsModule`                                                                                                                                          | **Throws**, naming itself. The one deliberate deviation from the mirror rule: upstream's non-native build exports it as `null`, which fails naming nothing.                          |

A symbol not listed at all fails earlier still, at bundle time, with the
bundler's own "no export named X".
