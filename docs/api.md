# API v1

The surface mirrors `react-native`; everything in the tables below is imported from `"react-native"` (aliased by the Metro preset — `react-native-gtkx/metro` — or the vite preset) or directly from `"react-native-gtkx"`. Completeness is enforced by `npm run docs:check` (every public export must be mentioned in this file). Toolchain subpaths: `react-native-gtkx/metro` (`withLinuxPlatform`), `react-native-gtkx/vite` (the vite preset), `react-native-gtkx/runner` (the `run-linux` command implementation), `react-native-gtkx/vitest` (`reactNativeGtkxTest`, a ready Vitest project config for component tests under headless Wayland), `react-native-gtkx/testing` (`@gtkx/testing`'s render/screen/userEvent surface plus `renderHookWithWindow`), `react-native-gtkx/mcp` (the `react-native-gtkx-mcp` bin's programmatic surface, for embedding and testing — the bin itself is how an agent uses it) and `react-native-gtkx/types` (augments the stock RN types with the `linux` platform — reference it from an `env.d.ts`) — see [getting-started](getting-started.md#tests) for the testing subpaths.

**Past the portable surface:** [`react-native-gtkx/gtk` and `react-native-gtkx/adw`](platform-layer.md) exposes the GTK layer itself — Adwaita and GTK widgets as React components, taking `style` so React Native drives their position and appearance, plus an `Adw.NavigationView` primitive that needs no router. That is where to look when this page does not have what you need; it is Linux-only by design and the import says so.

## Components

| Export              | GTK implementation                           | Supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Differences from RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `View`              | GtkBox (RnGtkxViewBox)                       | `style`, `onLayout`, `testID`, children, `pointerEvents` (auto/none/box-none/box-only — mapped onto GTK picking: can-target + a contains() vfunc override; also honored from `style.pointerEvents`, the prop wins), `focusable` + `onFocus`/`onBlur` (RN has `focusable` on View for Android/Windows; react-native-web and react-native-windows both have the callbacks — off by default, as in RN), ref: `measure`/`measureInWindow`/`measureLayout` (`ViewHandle`, RN's argument order; window coordinates come from `gtk_widget_compute_point`, so they are correct inside a scrolled viewport), the responder and touch props ([guide](gestures.md)) (`onStartShouldSetResponder(Capture)`, `onMoveShouldSetResponder(Capture)`, `onResponderGrant/Start/Move/End/Release/Terminate`, `onTouchStart/Move/End/Cancel` + `Capture`) — spread `PanResponder`'s `panHandlers` here                                                                                  | Responder negotiation is RN's in full — capture-then-bubble, transfer to an ancestor mid-gesture through `onResponderTerminationRequest`/`onResponderReject`, and `onResponderTerminate`. The lock is one per process as in RN; the negotiation PATH stops at the layout root, so native GTK widgets between or above views take no part. Single-pointer only: a mouse is one fabricated touch, `touches` never exceeds one. Terminations differ from RN's, because GTK decides most of them before JS is told: a context menu (a second mouse button), a native widget or a `Controllers` `GtkDragSource` taking the sequence, and text selection all arrive as a cancelled gesture and terminate **without** consulting `onResponderTerminationRequest` — GTK's `CLAIMED` is irrevocable, so there is nothing an answer could change. Window blur terminates unconditionally, as it does in react-native-web. An enclosing `ScrollView` scrolling under the gesture is the one termination the holder may refuse |
| `Text`              | GtkLabel (Pango)                             | wrap, `numberOfLines` (ellipsize END), `textAlign`, font styles, `onLayout`, `testID`, ref: `measure`/`measureInWindow`/`measureLayout` (`TextHandle` — RN gives every host component the geometry methods, so a label no longer has to be wrapped in a `View` to be measurable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | nested `Text` elements are concatenated without per-span styles; text is always ellipsizable (shrinkable in narrow windows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Image`             | GtkPicture                                   | `source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`; **`.svg` files load like any other image** — `Gdk.Texture.newFromFilename` rasterizes them via librsvg, no extra code needed (for building vector graphics from state instead of a file, see the "Svg" section below — a separate import, not part of this table); ref: `measure`/`measureInWindow`/`measureLayout` (`ImageHandle`)                                                                                                                                                                                                                                                                                                                                                                                                                                 | no synchronous size from remote images (style sets the size, as in RN); cache is not size-limited yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `TextInput`         | GtkEntry / GtkTextView                       | controlled/uncontrolled (`value`/`defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus`/`onBlur`, `placeholder` (own dim overlay in multiline — GtkTextView has none), `secureTextEntry`, `editable`, `keyboardType`, `multiline`, `clearButtonMode` (GtkEntry's built-in clear icon; RN ships this on iOS only), the visual half of `style` (background, border, radius — it used to be computed and dropped, so a styled TextInput silently kept the theme's own frame) (real GtkTextView: word wrap, internal scroll, Enter inserts a newline and never fires onSubmitEditing — RN semantics)                                                                                                                                                                                                                                                                                                                                                             | multiline needs a height in the style (as RN recommends)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Pressable`         | GtkBox (RnGtkxViewBox) + GestureClick/Motion | `onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn/Out`, `onFocus`/`onBlur`, `focusable`, `disabled`, function-form `style`/`children` receiving `{pressed, hovered, focused}` (react-native-web's own state shape); **keyboard-operable**: `focusable` defaults to true when `onPress` is set (react-native-web's rule), which puts the view in GTK's focus chain so Tab and the arrow keys reach it, and Enter/Space fire `onPress` as they do on web and Android; the `PressEvent` payload is RN's shape (`locationX/Y` target-relative, `pageX/Y` window-relative, `identifier`, `target`, `force`, monotonic `timestamp`, single-element `touches`/`changedTouches` — a desktop pointer is one fabricated touch). `hitSlop` and `pressRetentionOffset`, each a number or per-edge; the press rect defaults to RN's own `{top: 20, left: 20, right: 20, bottom: 30}` around the hit rect, and a release outside it is a cancel rather than a press | `hitSlop` cannot escape an ancestor that clips — a `ScrollView` viewport — because GTK stops picking at the clip, which is the limit RN documents on Android for the same reason. Hover fires from touch as well as from a mouse: react-native-web filters that out, and here a GTK crossing event carries no device to filter on; GTK also sends a matching leave when a touch sequence ends, so the stuck phantom hover the filter exists for does not arise, and GTK's own `:hover` behaves the same way (docs/research/gestures.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `TouchableOpacity`  | on top of Pressable                          | `activeOpacity`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ScrollView`        | GtkScrolledWindow                            | vertical/`horizontal`, `contentContainerStyle` (RN's default: the content container is a plain `View`, so `alignItems` is `stretch` — children fill the cross axis unless they say otherwise), `onScroll` (`contentOffset`, `contentSize`, `layoutMeasurement`), `onContentSizeChange`, `stickyHeaderIndices` (RN model: the REAL child is translated and painted on top — no duplicate), ref: `scrollTo`/`scrollToEnd` **plus the geometry methods** `measure`/`measureInWindow`/`measureLayout` (`ScrollViewHandle`). A view inside it that takes the responder suspends the scroller's own gestures for the rest of the interaction — RN's `setIsJSResponder`, so a child pan is reachable inside a scrolling list                                                                                                                                                                                                                                               | `animated` in scrollTo is ignored. Scroll arbitration is **touch-only and unverified end to end**: all four gestures `GtkScrolledWindow` installs are touch-only, so under a mouse a child pan never competes with scrolling at all, and no touch can be injected on the test rig (wlroots has no virtual-touch protocol) — every link of the mechanism is tested, the finger is not. Two known edges on touch: a view that claims on a MOVE rather than on press can lose the first ~8 px to the scroller, which `CLAIMED` makes irrevocable (iOS has the same artefact); and the mouse wheel is deliberately left alone, so scrolling with a wheel during a gesture terminates the responder rather than being suppressed                                                                                                                                                                                                                                                                                        |
| `FlatList`          | windowed core on ScrollView                  | virtualization (`estimatedItemSize` or `getItemLayout`, **`windowSize`/`initialNumToRender` — the primary scroll-performance knobs**, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`), `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`, `ListHeader/Footer/EmptyComponent`, `onEndReached(-Threshold)`, `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`), `inverted` (RN chat semantics: opens at `data[0]`, stays pinned on prepend), `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`, ref: `scrollToIndex`/`scrollToItem`/`scrollToOffset` + `scrollTo`/`scrollToEnd` (`FlatListHandle`) — the SCROLL half of a ScrollView ref, not the geometry half: a windowed list is a composite over a ScrollView and owns no widget of its own, so a `measure()` here would have to pick some inner widget and pretend it was the list. Measure the `ScrollView` or a cell                                             | 1000 rows mount windowed in ~120 ms (v1 full mount was 879 ms); `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure and a wider window means fewer mount+reflow bursts per scrolled pixel (measured: −21% churn, late frames 10/s → 7.7/s); rows beyond the visible ones are mounted `maxToRenderPerBatch` (10) at a time every `updateCellsBatchingPeriod` (50) ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one; no pull gesture — `onRefresh` must be app-triggered; an inverted list shorter than its viewport anchors to the top, not the bottom                                                                                                                                                                                                                                                                                                                                                                        |
| `SectionList`       | on top of FlatList                           | `sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | viewability props are not exposed (section-aware ViewTokens pending)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Switch`            | GtkSwitch                                    | `value`/`onValueChange`, `disabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | sized by the GTK theme, not iOS metrics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ActivityIndicator` | GtkSpinner                                   | `animating`, `size` (small/large/number)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | no `color` yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Modal`             | modal GtkWindow (portal)                     | `visible`, `onRequestClose` (Escape/close button), `title`, `width`/`height`; independently resizable with relayout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | desktop semantics: a separate window, not an overlay; `transparent`/`animationType` are no-ops                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Animated.View`     | direct widget calls                          | `opacity` and the whole `transform` array — `translateX/Y`, `scale`, `scaleX`, `scaleY`, `rotate`/`rotateZ` — driven by Animated nodes, bypassing React (an angle comes from `interpolate` with a `deg`/`rad` outputRange); `top`/`left`/`right`/`bottom` too when the node's own `position` is `"absolute"`, which is what makes `Animated.ValueXY`'s `getLayout()` work; plus the same responder and touch props `View` takes — this is where an idiomatic `PanResponder` drag lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `rotateX`/`rotateY`/`perspective` (3D), `skewX`/`skewY` and `matrix` are not supported, and the transform origin is always the view's centre (no `transformOrigin`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SafeAreaView`      | = View                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | no notches on desktop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `StatusBar`         | null                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | no status bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Root`              | internal root                                | `width`/`height`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | extension: required by the test harness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `NestedRoot`        | internal root                                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | extension: a Yoga root inside any GTK container slot (navigation pages, custom containers); the slot allocation is the viewport                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `IntrinsicRoot`     | internal root                                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | extension: a content-sized Yoga root for chrome slots (HeaderBar start/end) — reports its content size to GTK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## API modules

| Export                | Supported                                                                                                                                                                                                                                                                                                           | Differences                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StyleSheet`          | `create`, `flatten`, `compose`, `absoluteFill(Object)`, `hairlineWidth`                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `PlatformColor`       | Adwaita variables: `PlatformColor("accent-bg-color")` → `var(--...)`, `@named`                                                                                                                                                                                                                                      | names are Adwaita, not iOS/Android                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `AppRegistry`         | `registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome,actionAccels,breakpoints,applicationActions,windowActions,windowControllers})`, `getAppKeys`                                                                                                                                   | desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app's HeaderBars (navigation) become the chrome. `actionAccels` binds accelerators to action names on the `GtkApplication`; `breakpoints` reaches `AdwApplicationWindow`'s own prop and only does anything under `chrome: "content"` (a dev warning fires otherwise). **`applicationActions`/`windowActions`/`windowControllers` are deprecated** — reach for [`<ApplicationActions>`/`<WindowActions>`/`<WindowControllers>`](platform-layer.md#actions-and-shortcuts-declared-in-the-app-tree) instead; they still work unchanged |
| `Platform`            | `OS: "linux"`, `Version` (GTK), `select` (linux → native → default), `isTV`, `isTesting`                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Dimensions`          | `get("window"/"screen")`, `addEventListener("change")`                                                                                                                                                                                                                                                              | main window only (transient windows are ignored)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `useWindowDimensions` | reactive main-window dimensions                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Appearance`          | `getColorScheme`, `setColorScheme` (AdwStyleManager), `addChangeListener`                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `useColorScheme`      | reactive theme                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `AppState`            | `currentState` active/background, `addEventListener`                                                                                                                                                                                                                                                                | driven by the window's `is-active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Alert`               | `alert(title, message, buttons, options)` → Adw.AlertDialog                                                                                                                                                                                                                                                         | `cancel`/`destructive`/`isPreferred` styles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Linking`             | `openURL`, `canOpenURL` (http/https/mailto/file), `getInitialURL` (null), `addEventListener("url")`                                                                                                                                                                                                                 | system launcher; no deep-link delivery on desktop yet — "url" subscriptions never fire                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `InteractionManager`  | `runAfterInteractions(task?)` (cancellable, then-able), `createInteractionHandle`/`clearInteractionHandle`, `addListener`                                                                                                                                                                                           | navigation transitions register interactions, so screen work deferred with `runAfterInteractions` waits for the push/pop slide                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `DevSettings`         | `addMenuItem(title, handler)` (entries in the Dev Menu — Ctrl+Shift+D in `run-linux --dev`, the react-native-windows shortcut), `reload(reason?)`                                                                                                                                                                   | silent no-ops in release builds, like RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `I18nManager`         | `isRTL` (live: GTK's read of the locale text direction), `doLeftAndRightSwapInRTL`, `getConstants`                                                                                                                                                                                                                  | `allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops (mobile persistence has no desktop store)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `BackHandler`         | `addEventListener("hardwareBackPress")`, `exitApp`                                                                                                                                                                                                                                                                  | no hardware back key on desktop — subscriptions are honored but nothing fires them yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PanResponder`        | `create(config)` -> `panHandlers` (spread onto a `View`), full `gestureState` (`dx`/`dy`, `vx`/`vy`, `x0`/`y0`, `moveX`/`moveY`, `numberActiveTouches`) — **react-native's own file, vendored unmodified** (MIT, `Libraries/Interaction/PanResponder.js`), running on our reproduction of RN's `touchHistory` store | multi-touch `gestureState` is single-touch here (one pointer), and `onShouldBlockNativeResponder`'s return value is not consumed yet. `onPanResponderTerminationRequest` is asked when an ancestor tries to take the gesture and when an enclosing `ScrollView` scrolls; every other termination is GTK's decision and arrives as `onPanResponderTerminate` unasked (see `View`)                                                                                                                                                                                                                                                              |
| `Animated`            | `Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`, `loop`, `interpolate` (numbers and deg/rad strings, clamp/extend/identity), `ValueXY` (`setValue`/`setOffset`/`flattenOffset`/`extractOffset`, `getLayout`, `getTranslateTransform`) — the value a `PanResponder` drag writes to                      | `useNativeDriver` is ignored (with a warning); the direct path is native-speed anyway; `Animated.event` is not implemented — write the value directly (`pan.setValue({x: g.dx, y: g.dy})`), which is what it would do                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Easing`              | linear/ease/quad/cubic/in/out/inOut/bezier                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `version`             | package version                                                                                                                                                                                                                                                                                                     | extension                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

`StyleProp<T>` defaults its type argument, and `ViewStyle`/`TextStyle`/`ImageStyle` are exported as aliases of the one flat style bag this platform has — so `StyleProp<ViewStyle>`, the way ordinary React Native code writes it, compiles here unchanged. `Platform.OS` is typed as the full `PlatformOSType` union (plus `"linux"`), not the `"linux"` literal: comparing it against another platform is a runtime question, and RN's own types let that compile everywhere.

Styles (which keys go where and what is unsupported) — [style system table](../packages/react-native-gtkx/src/style/README.md). Includes `boxShadow` (RN 0.76) and `outlineColor`/`outlineOffset`/`outlineStyle`/`outlineWidth` (RN 0.77): both are what Adwaita's own theme uses for the `.card`/`.boxed-list` frame and for every focus ring, so they are the difference between a React Native style approximating the platform look and reproducing it — see [research/react-native-first-showcase.md](research/react-native-first-showcase.md).

## Key differences from React Native (summary)

1. **Desktop, not mobile**: `Modal` is a real window; `runApplication` accepts a title and dimensions; gestures are mouse-driven (hover works, no touch gestures);
2. **Node.js runtime**: all of npm/Node is available (fs, sqlite, napi) — "native modules" are written as regular Node modules; RN libraries with iOS/Android code do not work;
3. **Layout is exactly RN's**: every container runs a custom GtkLayoutManager that obeys only the Yoga engine — GTK widget minimums never leak into the layout, windows shrink freely, and `Dimensions.get("window")` reports the app viewport (the window's content area under the headerbar, like RN's app window);
4. **Text**: the ellipsis is opt-in via `numberOfLines`, exactly like RN; plain text wraps naturally and an unbreakable word wider than its box clips to it (text leaves clip; containers keep paint-overflow);
5. **transform** is paint-only, like RN: `translateX/Y`, `scale`, `scaleX`, `scaleY` and `rotate`/`rotateZ` apply to any component's style (not just `Animated.View`), the array composes left to right as in RN and CSS, and the origin is the view's centre. A transformed child honestly draws past its container over siblings (later siblings stay on top, RN's default z-order) without moving any ancestor, and GTK routes input through the transform, so a rotated view is clickable in its rotated shape. Rotation and scale reach the widget as the `GskTransform` of its allocation (`docs/research/transforms.md`); 3D (`rotateX`/`rotateY`/`perspective`), `skewX`/`skewY`, `matrix` and `transformOrigin` are not supported;
6. **Animations never auto-stop**: the desktop "reduce animations" hint is not applied automatically (GTK-side animations are kept on to match `Animated`, which runs on its own timers) — honoring reduced motion stays an app-level opt-in, as in RN;
7. **Lists are windowed like RN's**: FlatList/SectionList mount only the rows around the viewport (prefix-sum offsets, `estimatedItemSize` refined by real measurements or exact `getItemLayout`); sticky headers translate the REAL widget (no duplicate) and `inverted` follows the RN chat contract — `contentOffset` counts from the end where `data[0]` renders. The one RefreshControl compromise: desktop has no pull gesture, so `refreshing`/`onRefresh` are API-compatible but the trigger is app chrome (a button/shortcut);
8. The package ships compiled (`dist/`: ESM + `.d.ts` alongside, sources embedded in the maps); consumers — Metro (`react-native-gtkx/metro` preset) and vite (preset) — both consume the built output. Requires Node ≥ 24 (the gtkx runtime floor; the run-linux host also relies on `module.registerHooks`).
9. **Pre-commit hooks regenerate derived data**: editing this file (or the other generator inputs) and forgetting to run `scripts/generate-mcp-data.mjs` no longer fails CI — the pre-commit hook regenerates `packages/react-native-gtkx/src/mcp/data/generated.ts` and stages it for you.

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

**Why a mirror and not the library.** It cannot run here. Reanimated 4,
`react-native-worklets` and `react-native-gesture-handler` are imported at
module scope in twelve of its files, its sort algorithm lives inside a
`useAnimatedReaction` worklet and its row layout inside a `useAnimatedStyle`,
and its public types are written in `SharedValue<T>`. Full evidence in
[research/drag-and-drop.md](research/drag-and-drop.md).

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

| Export                               | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GestureHandlerRootView`             | **Implemented, faithfully.** A `View` with `style ?? { flex: 1 }` — note that an explicit `style` _replaces_ the default rather than merging with it, which is what upstream does in all three of its implementations. Its other job, marking the subtree as gesture-arbitrating, is already this platform's: the responder system's lock is global, so there is nothing to scope.                                                    |
| `GestureDetector`                    | **Implemented, and it adds no widget.** It renders its single child unchanged and reaches that child's widget through the handle the child already exposes, the same seam `createAnimatedComponent` uses. Its recognizer's responder props are merged into the child's, so a child with its own `onTouchStart` keeps working. `userSelect`, `touchAction` and `enableContextMenu` are Web-only upstream and are accepted and ignored. |
| `Gesture.Pan()`                      | **Implemented.** See the table below for the config surface.                                                                                                                                                                                                                                                                                                                                                                          |
| `usePanGesture()`                    | **Implemented**, over the same recognizer. Upstream deprecated all twelve `Gesture.*` statics in 3.1.0 in favour of hooks, and its hook renamed the callbacks: `onStart` → `onActivate`, `onEnd` → `onDeactivate`, `onTouchesCancelled` → `onTouchesCancel`, no `onChange`, and `canceled` on the ending event instead of a second `success` argument. Both spellings are honoured as written.                                        |
| the other eleven `Gesture.*` statics | **Throw**, each naming itself — `Gesture.Pinch()` reports `Gesture.Pinch`, not `Gesture`.                                                                                                                                                                                                                                                                                                                                             |
| `State`                              | **Throws.** It is only meaningful compared against an event from a handler that does not exist here yet; it lands with `Tap` and `LongPress`.                                                                                                                                                                                                                                                                                         |
| everything else                      | **Throws**, naming the symbol. `PanGestureHandler` and the legacy handler components, `RectButton` and the button family, the re-exported `ScrollView`/`FlatList`, the other `use*Gesture` hooks.                                                                                                                                                                                                                                     |

### `Gesture.Pan()` — the config surface

| Method                                                                                                                  | Behaviour                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activeOffsetX` / `activeOffsetY` / `failOffsetX` / `failOffsetY`                                                       | **Implemented.** A single number is DIRECTIONAL, by its sign — `activeOffsetX(20)` bounds the positive side only. Failure is tested before activation, and with strict comparisons where activation uses non-strict ones, so a translation exactly on a bound activates. |
| `minDistance`, `minVelocity`, `minVelocityX`, `minVelocityY`, `minPointers`, `maxPointers`                              | **Implemented.** `minDistance` defaults to 10 unless an `activeOffset*` or `minVelocity*` is set, in which case those are the criteria and distance stops applying.                                                                                                      |
| `activateAfterLongPress`                                                                                                | **Implemented, and it activates on the timer** rather than on the next pointer movement — see the responder-model extension in [research/gestures.md](research/gestures.md).                                                                                             |
| `enabled`, `shouldCancelWhenOutside`, `manualActivation`                                                                | **Implemented.**                                                                                                                                                                                                                                                         |
| `hitSlop`                                                                                                               | **Implemented**, in RNGH's gesture spelling rather than RN's `View` one: it can SHRINK the area (negative values), and `{ left: 0, width: 32 }` anchors a strip to one edge.                                                                                             |
| the callbacks                                                                                                           | **Implemented**: `onBegin`, `onStart`, `onUpdate`, `onChange`, `onEnd`, `onFinalize`, `onTouchesDown`, `onTouchesMove`, `onTouchesUp`, `onTouchesCancelled`.                                                                                                             |
| `runOnJS`                                                                                                               | **Accepted, and does nothing** — correctly. It asks for the JS runtime; there is exactly one runtime here, so every callback already runs where it is asking.                                                                                                            |
| `averageTouches`, `enableTrackpadTwoFingerGesture`, `cancelsTouchesInView`, `activeCursor`, `mouseButton`, `withTestId` | **Accepted, inert** — each is platform-specific upstream too, and inert off its platform there.                                                                                                                                                                          |
| `simultaneousWithExternalGesture`, `requireExternalGestureToFail`, `blocksExternalGesture`                              | **Throw.** Cross-gesture relations need the arbitration registry, which is a later slice. Silently ignoring a relation would let two gestures that were meant to cooperate race instead, with no error.                                                                  |

**Differences from `react-native-gesture-handler`.** `numberOfPointers` is
always 1 and `pointerType` is always `MOUSE`: the responder system fabricates
one touch per pointer, and wlroots offers no virtual-touch protocol, so a
`minPointers(2)` gesture is unreachable rather than merely untested. Nothing
is simultaneous yet — one interaction has one holder — so two detectors over
the same pointer do not both activate. `Pinch` and `Rotation` are a later
increment for a measured reason: GTK feeds touchpad gestures properly and
better than RNGH's own web path does, but nothing in this rig can produce one
to test against.

The throws are the point. A `PanGestureHandler` that quietly rendered its
children without gestures is exactly the trap
[research/gestures.md](research/gestures.md) records `Animated.View` falling
into — compiled, ran, did nothing. The stand-ins fail on call, on render and
on property access, while still answering the introspection React and
`console.log` do first, so the message that surfaces is the precise one.

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

| Property                                                                                                            | Reached through    | How it reaches GTK                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `opacity`                                                                                                           | `useAnimatedStyle` | `gtk_widget_set_opacity`, straight from the animation frame.                                                                      |
| `transform` (`translateX/Y`, `scale`, `scaleX/Y`, `rotate`, `skew`)                                                 | `useAnimatedStyle` | The rect store plus one queued allocation, applied as a `GskTransform`.                                                           |
| `top`, `left`, `right`, `bottom` — **only** on a node whose own `position` is `"absolute"`                          | `useAnimatedStyle` | Turned into a translate from the position the committed layout gave it: the same rect store, the same queued allocation, 1.99 µs. |
| `backgroundColor`, `color`, `borderColor` (and per side), `outlineColor`                                            | `useAnimatedStyle` | A `GtkCssProvider` private to that widget, reloaded in place — 11.2 µs per frame, flat in the size of the tree.                   |
| The numeric SVG props (`r`, `cx`, `strokeWidth`, `strokeDashoffset` and the rest of the geometry and paint numbers) | `useAnimatedProps` | The shape's own descriptor plus `queueDraw` — the SVG components subscribe to an animated node themselves, so nothing new writes. |

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

**Layout properties are refused, and it is a decision rather than a gap.**
`width`, `height`, `flex` and every `margin*`/`padding*` need a Yoga pass,
whose cost is proportional to the TREE and not to the animated value: 64 µs
for a five-child container, 128 µs at sixty, 496 µs at three hundred, per
frame, before GTK re-measures every ancestor the resize invalidated. A
transform is 0.7 µs at all three, and a colour 11.2 µs. A `useAnimatedStyle`
that changes a layout property warns once for that property, says it is a
layout property and why, and names the transform to use instead (`scaleX` for
`width`, and so on). The value is still applied on the next React render
rather than dropped. Full measurements, and the two numbers that would change
the decision, in [research/animated-colors.md](research/animated-colors.md).

#### The one exception: insets on an absolutely positioned node

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

**`measure()` on a node moved this way reports the LAYOUT rect.** The node's
Yoga `top` did not change; only its allocated and painted position did. So
`x`/`y`/`width`/`height` are the committed layout — untranslated — while
`pageX`/`pageY` go through GTK's transform chain and report where the node is
actually drawn. `measureInWindow` and `measureLayout` follow `pageX`/`pageY`.
This is a real difference from reading the geometry back on mobile, and it is
the same split an explicit `translateY` has always had here.

**`zIndex` does nothing, animated or not.** GTK4 has no z-order property: a
container paints its children in sibling order, so the last sibling is on top,
and restacking would mean reordering the widgets themselves — which is the
order this platform keeps its shadow tree in sync with, so it would silently
reorder the layout. A `zIndex` in a style is named in a one-per-session
warning. For a sortable list the consequence is that a row dragged over the
row below it is painted under it; order the elements the way you want them
painted.

Everything else — borders, radii, shadows — still reaches GTK as a CSS class
computed during render. It is not dropped silently either: the property is
named in a one-per-session warning and its latest value is applied on the
next React render. `useAnimatedProps` has the same rule with the same
warning: a numeric prop is driven, anything else is named and lands on the
next render.

### Implemented

| Export                                                                                                           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSharedValue`, `makeMutable`, `isSharedValue`, `cancelAnimation`                                              | Full. A shared value is also a platform animated node, so it can be handed to `Animated.View`'s style directly as well as through `useAnimatedStyle`.                                                                                                                                                                                                                                                                            |
| `useAnimatedStyle`                                                                                               | Full for `opacity`, `transform`, colours and the insets of an absolutely positioned node — see the boundary above. A style whose _shape_ changes between runs costs exactly one React render and rebinds; a running animation costs none.                                                                                                                                                                                        |
| `useAnimatedProps`                                                                                               | Numeric props, driven straight into the component that takes them — in practice the SVG shapes, which already accept `number \| AnimatedNode` on every geometry and paint number. Same lifecycle as `useAnimatedStyle`, down to the one render a shape change costs.                                                                                                                                                             |
| `useDerivedValue`, `useAnimatedReaction`, `startMapper`, `stopMapper`                                            | Full. Mappers are torn down on unmount.                                                                                                                                                                                                                                                                                                                                                                                          |
| `withTiming`, `withSpring`, `withSequence`, `withRepeat`, `withDelay`                                            | Full for numeric values, on upstream's defaults (timing 300 ms / `inOut(quad)`, spring `GentleSpringConfig`), driven by the platform's own frame scheduler.                                                                                                                                                                                                                                                                      |
| `withDecay`, `withClamp`                                                                                         | Full, including `velocity`, `deceleration`, `velocityFactor`, `clamp` and `rubberBandEffect` — upstream's own step function, ported. `withDecay` is what an inertial fling rides on: released with a velocity, it coasts, decelerates and stops with no target. `withClamp` runs its inner animation un-truncated and clips what reaches the value, which is upstream's distinction and is observable on an overshooting spring. |
| `interpolate`, `clamp`, `Extrapolation`, `Extrapolate`, `Easing`                                                 | Full, including per-edge extrapolation and `Easing.bezier`'s factory shape.                                                                                                                                                                                                                                                                                                                                                      |
| `interpolateColor`, `convertToRGBA`, `isColor`, `rgbaArrayToRGBAColor`                                           | Full for `'RGB'` (upstream's 2.2 gamma) and `'HSV'` (upstream's hue-wrap correction), including its `transparent` handling. `'LAB'` throws — see the differences table.                                                                                                                                                                                                                                                          |
| `PlatformColor`                                                                                                  | The platform's own: theme colours by name, resolved by GTK against the live Adwaita palette. Can be animated _between_ on a shared value; cannot be interpolated _through_.                                                                                                                                                                                                                                                      |
| `useAnimatedRef`, `measure`                                                                                      | Full, and callable from anywhere — there is no worklet to be inside of. Returns `null` before the first committed layout, which is RN's own contract.                                                                                                                                                                                                                                                                            |
| `runOnUI`, `runOnJS`, `scheduleOnUI`, `scheduleOnRN`                                                             | Deferred, not inlined — see below.                                                                                                                                                                                                                                                                                                                                                                                               |
| `Animated.View`                                                                                                  | The platform's own, unchanged. Takes a `ref` giving `measure`/`measureInWindow`/`measureLayout`.                                                                                                                                                                                                                                                                                                                                 |
| `Animated.Text`, `Animated.Image`, `Animated.ScrollView`                                                         | `createAnimatedComponent` over the platform's own components — no subclass and no special case. All three forward the `ref` through, so `useAnimatedRef` + `measure()` works on them.                                                                                                                                                                                                                                            |
| `createAnimatedComponent`                                                                                        | **Adds no widget to the tree.** It renders the wrapped component itself and reaches its widget through the ref that component already exposes, so the GTK output is what the unwrapped component produces. Wrap anything that takes a `ref` giving the geometry methods; anything else gets a named warning rather than a silent no-op.                                                                                          |
| `entering`, `exiting`, `layout`                                                                                  | On every animated component, not only `Animated.View` — see the layout-animation section below. `exiting` keeps the widget on screen after React has removed it.                                                                                                                                                                                                                                                                 |
| `FadeIn`, `FadeOut`, `LinearTransition`, `Layout`, `Keyframe`                                                    | The four builders in scope, with upstream's fluent surface (`.duration()`, `.delay()`, `.easing()`, `.springify()` and the spring parameters, `.withInitialValues()`, `.withCallback()`), usable as the class or as an instance. `Layout` is upstream's own deprecated alias of `LinearTransition`.                                                                                                                              |
| `BaseAnimationBuilder`, `ComplexAnimationBuilder`                                                                | One class under both names — upstream splits the plain chain from the spring parameters, this platform does not — so a library subclassing either keeps working.                                                                                                                                                                                                                                                                 |
| `GentleSpringConfig` and the other seven spring presets, `ReduceMotion`, `ReanimatedLogLevel`, `isSharedValue`   | Plain data, mirrored exactly.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `isConfigured`, `isReanimated3`, `makeShareableCloneRecursive`, `isWorkletFunction`, `configureReanimatedLogger` | Present. Cloning is identity (nothing leaves the runtime it was made in); `configureReanimatedLogger` is accepted and does nothing, because there is no second logger to configure.                                                                                                                                                                                                                                              |

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

| Behaviour                          | Here                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animatable properties              | `opacity`, `transform` and colours — see the boundary table. Layout properties are refused with the transform to use instead; anything else warns once by name. Both land on the next render.                                                                                                        |
| Animated values                    | Numbers only. `withTiming("#ff0000")` throws rather than animating nothing: animate a number and map it with `interpolateColor`, which is what upstream's own examples do.                                                                                                                           |
| `interpolateColor` colour spaces   | `'RGB'` and `'HSV'`. `'LAB'` throws by name — upstream's is a vendored slice of culori fed 0-255 channels where culori documents 0-1, so matching it would mean matching the scaling.                                                                                                                |
| `interpolateColor` inputs          | Colour strings only, and not `PlatformColor` — a theme colour has no value until GTK resolves it against the live theme, so it has nothing to blend. Both cases throw and say which one happened.                                                                                                    |
| `processColor`                     | Throws. It returns RN's packed AARRGGBB integer, whose only consumer is a native module; a colour's destination here is a GTK stylesheet, which takes strings.                                                                                                                                       |
| `runOnUI` / `runOnJS`              | Schedule rather than run inline, and return `void` — matching upstream's own single-runtime path (`react-native-worklets/src/threads.ts`: a microtask plus one frame for `runOnUI`, a microtask for `runOnJS`). They _could_ be direct calls here; code written for Reanimated assumes they are not. |
| `SharedValue.addListener`          | Accepts upstream's `(listenerID, listener)` **and** this platform's animated-node `(callback) => id`. Both callers are real, and supporting only one fails silently.                                                                                                                                 |
| Worklet closure capture            | Live lexical capture, not the plugin's by-value snapshot. Only observable for a worklet closing over a reassigned plain `let`, which is already a bug on mobile.                                                                                                                                     |
| `withSpring` rest condition        | Upstream stops on remaining energy relative to initial energy; the platform's solver stops on displacement and speed thresholds, derived here from the same energy budget. The stopping point differs by well under a pixel.                                                                         |
| `withDecay` config validation      | Throws at the `withDecay()` call rather than on the animation's first frame. Same errors (`clamp` shape, `velocityFactor > 0`, `rubberBandEffect` needing a `clamp`), one line earlier.                                                                                                              |
| `ReduceMotion`, `useReducedMotion` | The enum is mirrored and every value behaves as `Never`; `useReducedMotion()` is always false. GNOME's `gtk-enable-animations` is not read yet.                                                                                                                                                      |
| `reanimatedVersion`                | The upstream version this surface mirrors, not a claim to be that package.                                                                                                                                                                                                                           |
| `LinearTransition` size changes    | The position animates (as a translation); a width or height change lands immediately. Animating a size is a Yoga pass per frame — the same measured refusal `useAnimatedStyle` makes for layout properties.                                                                                          |
| Layout-animation properties        | `opacity`, `transform` and position. `width`/`height` are applied rather than driven (above); anything else a builder asks for is named once, by property, in a warning.                                                                                                                             |
| Builder methods                    | `.restDisplacementThreshold()` and `.restSpeedThreshold()` are accepted and ignored — this platform's spring derives its rest condition from the same energy budget instead (see the row above). `.reduceMotion()` is accepted and ignored for the reason `useReducedMotion()` is always false.      |
| `entering` / `exiting` ownership   | A layout animation owns `opacity` and `transform` for as long as it runs, so a `useAnimatedStyle` driving the same property on the same view during a fade is two writers on one slot. Upstream has the same rule.                                                                                   |
| The layout-animation catalog       | `FadeIn`, `FadeOut`, `LinearTransition`/`Layout` and `Keyframe` are implemented. The other ~90 preset builders are not, and throw by name — they are presets over the same two animations and the same built config, so they are cheap to add and simply have not been.                              |

### Not implemented — throws, naming itself

`Animated.FlatList`; the ~90 preset layout-animation builders (`BounceIn*`,
`FlipIn*`, `Pinwheel*`, `Roll*`, `Slide*`, `Stretch*`, `ZoomIn*` and the
rest), `LayoutAnimationConfig` and the non-linear transitions
(`CurvedTransition`, `SequencedTransition`, `JumpingTransition`,
`FadingTransition`, `EntryExitTransition`);
`processColor` and `DynamicColorIOS`; `useEvent`/`useHandler`,
`useAnimatedScrollHandler`, `useScrollOffset`, `useFrameCallback`,
`useTimestamp`; sensors, the keyboard hook, screen and shared-element
transitions; Reanimated 4's CSS animations (`css.create`, `css.keyframes`);
`defineAnimation`; `createWorkletRuntime` and `runOnRuntime` (see the worklets
section below); the Jest helpers.

**Why `Animated.FlatList` is a decision and not an omission.** It is the one
animated component that is refused, because it is a _composite_ rather than a
host component: `FlatList` renders the windowed core, which renders a
`ScrollView`, which is the only thing in that chain that owns a widget — and
`FlatListHandle` is a scroll API by contract, so there is no handle to read a
widget back out of. Giving it one would mean publishing the scrolled window
through two layers whose job is to hide it. Upstream's `Animated.FlatList`
mostly exists so `onScroll` can be an `Animated.event` /
`useAnimatedScrollHandler`, and neither of those is implemented here either.
Put the animated style on an `Animated.View` around the list, or use
`Animated.ScrollView` when the list does not need virtualization.

The throw is the point, and it is the same discipline as the RNGH shim: a
`BounceIn` that mounted without bouncing is the trap
[research/gestures.md](research/gestures.md) records `Animated.View` falling
into — compiled, ran, did nothing. The stand-ins fail on call, on render and
on property access (`BounceIn.duration(300)`, `css.create`), while still
answering the introspection React and `console.log` do first. A symbol not
listed at all fails earlier still, at bundle time.

**This does not unblock `@gorhom/bottom-sheet` and friends.** They need
`GestureDetector` from `react-native-gesture-handler`, which remains
unimplemented and is its own piece of work.

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
  `react-native-worklets` at all. What blocks it is still `GestureDetector`,
  as above. `react-native-gesture-handler` 3.1.0 does use this package
  (`scheduleOnUI`), but behind a `try { require } catch`, so it never had this
  failure mode.

The thread functions here and the ones `react-native-gtkx/reanimated` exports
are the **same instance**, not two copies: jobs queued through either package
name land in one batch on one frame, exactly as upstream, where Reanimated
re-exports them from this package.

### The boundary, and who drew it

What is implemented and what refuses is decided by **upstream's own
non-native build** — the `.ts` files it ships next to its `.native.ts` ones,
which are what react-native-windows and the web run. Where that build
computes something, so does this; where it throws, this refuses by name. That
is the only boundary here with a source of truth, and it draws itself in the
right place: a worklet runtime is a **second JS runtime**, and this platform
has one thread. Measured against `react-native-worklets` 0.11.3.

| Export                                                                                                                                                    | Behaviour                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runOnUI`, `scheduleOnUI`, `runOnJS`, `scheduleOnRN`                                                                                                      | Deferred, not inlined, and returning `void` — the same functions `react-native-gtkx/reanimated` exports, so see that section's differences table.                                    |
| `runOnUIAsync`                                                                                                                                            | Resolves with the worklet's return value on the frame it runs. The one thread API that hands anything back, because a promise crosses the deferral the others impose.                |
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
