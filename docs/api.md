# API v1

The surface mirrors `react-native`; everything in the tables below is imported from `"react-native"` (aliased by the Metro preset — `react-native-gtkx/metro` — or the vite preset) or directly from `"react-native-gtkx"`. Completeness is enforced by `npm run docs:check` (every public export must be mentioned in this file). Toolchain subpaths: `react-native-gtkx/metro` (`withLinuxPlatform`), `react-native-gtkx/vite` (the vite preset), `react-native-gtkx/runner` (the `run-linux` command implementation), `react-native-gtkx/vitest` (`reactNativeGtkxTest`, a ready Vitest project config for component tests under headless Wayland), `react-native-gtkx/testing` (`@gtkx/testing`'s render/screen/userEvent surface plus `renderHookWithWindow`), `react-native-gtkx/mcp` (the `react-native-gtkx-mcp` bin's programmatic surface, for embedding and testing — the bin itself is how an agent uses it) and `react-native-gtkx/types` (augments the stock RN types with the `linux` platform — reference it from an `env.d.ts`) — see [getting-started](getting-started.md#tests) for the testing subpaths.

**Past the portable surface:** [`react-native-gtkx/gtk` and `react-native-gtkx/adw`](platform-layer.md) exposes the GTK layer itself — Adwaita and GTK widgets as React components, taking `style` so React Native drives their position and appearance, plus an `Adw.NavigationView` primitive that needs no router. That is where to look when this page does not have what you need; it is Linux-only by design and the import says so.

## Components

| Export              | GTK implementation             | Supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Differences from RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View`              | GtkBox (RnGtkxViewBox)         | `style`, `onLayout`, `testID`, children, `pointerEvents` (auto/none/box-none/box-only — mapped onto GTK picking: can-target + a contains() vfunc override; also honored from `style.pointerEvents`, the prop wins), ref: `measure`/`measureInWindow`/`measureLayout` (`ViewHandle`, RN's argument order; window coordinates come from `gtk_widget_compute_point`, so they are correct inside a scrolled viewport)                                                                                                                                                                                                                        | nesting another pointerEvents inside a box-only view is not supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Text`              | GtkLabel (Pango)               | wrap, `numberOfLines` (ellipsize END), `textAlign`, font styles, `onLayout`, `testID`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | nested `Text` elements are concatenated without per-span styles; text is always ellipsizable (shrinkable in narrow windows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Image`             | GtkPicture                     | `source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`; **`.svg` files load like any other image** — `Gdk.Texture.newFromFilename` rasterizes them via librsvg, no extra code needed (for building vector graphics from state instead of a file, see the "Svg" section below — a separate import, not part of this table)                                                                                                                                                                        | no synchronous size from remote images (style sets the size, as in RN); cache is not size-limited yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `TextInput`         | GtkEntry / GtkTextView         | controlled/uncontrolled (`value`/`defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus`/`onBlur`, `placeholder` (own dim overlay in multiline — GtkTextView has none), `secureTextEntry`, `editable`, `keyboardType`, `multiline`, `clearButtonMode` (GtkEntry's built-in clear icon; RN ships this on iOS only) (real GtkTextView: word wrap, internal scroll, Enter inserts a newline and never fires onSubmitEditing — RN semantics)                                                                                                                                                                                           | multiline needs a height in the style (as RN recommends)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Pressable`         | GtkFixed + GestureClick/Motion | `onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn/Out`, `disabled`, function-form `style`/`children` receiving `{pressed, hovered}`; the `PressEvent` payload is RN's shape (`locationX/Y` target-relative, `pageX/Y` window-relative, `identifier`, `target`, `force`, monotonic `timestamp`, single-element `touches`/`changedTouches` — a desktop pointer is one fabricated touch)                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `TouchableOpacity`  | on top of Pressable            | `activeOpacity`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ScrollView`        | GtkScrolledWindow              | vertical/`horizontal`, `contentContainerStyle`, `onScroll` (`contentOffset`, `contentSize`, `layoutMeasurement`), `onContentSizeChange`, `stickyHeaderIndices` (RN model: the REAL child is translated and painted on top — no duplicate), ref: `scrollTo`/`scrollToEnd` (`ScrollViewHandle`)                                                                                                                                                                                                                                                                                                                                            | `animated` in scrollTo is ignored                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `FlatList`          | windowed core on ScrollView    | virtualization (`estimatedItemSize` or `getItemLayout`, **`windowSize`/`initialNumToRender` — the primary scroll-performance knobs**, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`), `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`, `ListHeader/Footer/EmptyComponent`, `onEndReached(-Threshold)`, `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`), `inverted` (RN chat semantics: opens at `data[0]`, stays pinned on prepend), `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`, ref: `scrollToIndex`/`scrollToItem`/`scrollToOffset` + ScrollView methods (`FlatListHandle`) | 1000 rows mount windowed in ~120 ms (v1 full mount was 879 ms); `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure and a wider window means fewer mount+reflow bursts per scrolled pixel (measured: −21% churn, late frames 10/s → 7.7/s); rows beyond the visible ones are mounted `maxToRenderPerBatch` (10) at a time every `updateCellsBatchingPeriod` (50) ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one; no pull gesture — `onRefresh` must be app-triggered; an inverted list shorter than its viewport anchors to the top, not the bottom |
| `SectionList`       | on top of FlatList             | `sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | viewability props are not exposed (section-aware ViewTokens pending)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Switch`            | GtkSwitch                      | `value`/`onValueChange`, `disabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | sized by the GTK theme, not iOS metrics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ActivityIndicator` | GtkSpinner                     | `animating`, `size` (small/large/number)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no `color` yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Modal`             | modal GtkWindow (portal)       | `visible`, `onRequestClose` (Escape/close button), `title`, `width`/`height`; independently resizable with relayout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | desktop semantics: a separate window, not an overlay; `transparent`/`animationType` are no-ops                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Animated.View`     | direct widget calls            | `opacity` and the whole `transform` array — `translateX/Y`, `scale`, `scaleX`, `scaleY`, `rotate`/`rotateZ` — driven by Animated nodes, bypassing React (an angle comes from `interpolate` with a `deg`/`rad` outputRange)                                                                                                                                                                                                                                                                                                                                                                                                               | `rotateX`/`rotateY`/`perspective` (3D), `skewX`/`skewY` and `matrix` are not supported, and the transform origin is always the view's centre (no `transformOrigin`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SafeAreaView`      | = View                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no notches on desktop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `StatusBar`         | null                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no status bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Root`              | internal root                  | `width`/`height`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | extension: required by the test harness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `NestedRoot`        | internal root                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | extension: a Yoga root inside any GTK container slot (navigation pages, custom containers); the slot allocation is the viewport                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `IntrinsicRoot`     | internal root                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | extension: a content-sized Yoga root for chrome slots (HeaderBar start/end) — reports its content size to GTK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## API modules

| Export                | Supported                                                                                                                                                                         | Differences                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StyleSheet`          | `create`, `flatten`, `compose`, `absoluteFill(Object)`, `hairlineWidth`                                                                                                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `PlatformColor`       | Adwaita variables: `PlatformColor("accent-bg-color")` → `var(--...)`, `@named`                                                                                                    | names are Adwaita, not iOS/Android                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `AppRegistry`         | `registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome,applicationActions,actionAccels,windowActions,windowControllers,breakpoints})`, `getAppKeys` | desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app's HeaderBars (navigation) become the chrome. `applicationActions`/`actionAccels` reach the underlying `GtkApplication` (`app.*` actions — what a `Gio.Notification` action button targets); `windowActions`/`windowControllers` reach the window (`win.*` actions, a window-scoped `GtkShortcutController`); `breakpoints` reaches `AdwApplicationWindow`'s own prop and only does anything under `chrome: "content"` (a dev warning fires otherwise) |
| `Platform`            | `OS: "linux"`, `Version` (GTK), `select` (linux → native → default), `isTV`, `isTesting`                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Dimensions`          | `get("window"/"screen")`, `addEventListener("change")`                                                                                                                            | main window only (transient windows are ignored)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `useWindowDimensions` | reactive main-window dimensions                                                                                                                                                   | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Appearance`          | `getColorScheme`, `setColorScheme` (AdwStyleManager), `addChangeListener`                                                                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `useColorScheme`      | reactive theme                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `AppState`            | `currentState` active/background, `addEventListener`                                                                                                                              | driven by the window's `is-active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Alert`               | `alert(title, message, buttons, options)` → Adw.AlertDialog                                                                                                                       | `cancel`/`destructive`/`isPreferred` styles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Linking`             | `openURL`, `canOpenURL` (http/https/mailto/file), `getInitialURL` (null), `addEventListener("url")`                                                                               | system launcher; no deep-link delivery on desktop yet — "url" subscriptions never fire                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `InteractionManager`  | `runAfterInteractions(task?)` (cancellable, then-able), `createInteractionHandle`/`clearInteractionHandle`, `addListener`                                                         | navigation transitions register interactions, so screen work deferred with `runAfterInteractions` waits for the push/pop slide                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DevSettings`         | `addMenuItem(title, handler)` (entries in the Dev Menu — Ctrl+Shift+D in `run-linux --dev`, the react-native-windows shortcut), `reload(reason?)`                                 | silent no-ops in release builds, like RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `I18nManager`         | `isRTL` (live: GTK's read of the locale text direction), `doLeftAndRightSwapInRTL`, `getConstants`                                                                                | `allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops (mobile persistence has no desktop store)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `BackHandler`         | `addEventListener("hardwareBackPress")`, `exitApp`                                                                                                                                | no hardware back key on desktop — subscriptions are honored but nothing fires them yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Animated`            | `Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`, `loop`, `interpolate` (numbers and deg/rad strings, clamp/extend/identity)                                          | `useNativeDriver` is ignored (with a warning); the direct path is native-speed anyway                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Easing`              | linear/ease/quad/cubic/in/out/inOut/bezier                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `version`             | package version                                                                                                                                                                   | extension                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Styles (which keys go where and what is unsupported) — [style system table](../packages/react-native-gtkx/src/style/README.md).

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
  **Known limitation**: constructing a `Gsk.ColorStop` currently crashes in
  gtkx-rc2's native addon — verified through three independent construction
  paths (the generated constructor, its property setters, and a bypass that
  skips `ColorStop` entirely), all failing in the same compiled native code,
  so this is not fixable from application code. A gradient reference
  degrades to painting nothing for that fill/stroke (the same safe path as
  an unresolvable `url(#id)`) rather than crashing the app; the coordinate
  math itself is unaffected and unit-tested
  (`packages/react-native-gtkx/tests/unit/svg/gradient-geometry.test.ts`) —
  gradients will render as soon as this is fixed upstream, with no changes
  needed on either side.
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
