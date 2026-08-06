// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-mcp-data.mjs from docs/reference/*.md
// (including docs/reference/components/*.md, one page per component),
// docs/architecture/*.md, docs/guide/*.md, docs/gtkx-rc4-notes.md,
// docs/getting-started.md,
// docs/research/navigation-extensibility.md and
// scripts/widget-surface/classification.json.
//
// Regenerate after touching any of those:
//   node scripts/generate-mcp-data.mjs
// Check without writing (used in verification):
//   node scripts/generate-mcp-data.mjs --check

export type PortableRecord = {
  readonly name: string
  readonly subpath: "react-native"
  readonly gtkImplementation?: string
  readonly supported: string
  readonly differences: string
}

export type CommonRecord = {
  readonly name: string
  readonly subpath: "react-native-gtkx/common"
  readonly summary: string
}

export type WidgetRecord = {
  readonly name: string
  readonly subpath: "react-native-gtkx/gtk" | "react-native-gtkx/adw"
  readonly wrapped: boolean
  readonly reason?: string
}

export type DocChunk = {
  readonly doc: string
  readonly heading: string
  readonly text: string
}

export const PORTABLE_COMPONENTS = [
  {
    name: "View",
    subpath: "react-native",
    gtkImplementation: "`GtkBox` (a custom paintable box)",
    supported:
      "`style`, `onLayout`, `testID`, children. `pointerEvents` — `auto` / `none` / `box-none` / `box-only`, mapped onto GTK picking (a can-target flag plus a `contains()` override). Also honored from `style.pointerEvents`, with the prop taking precedence. `focusable` plus `onFocus` / `onBlur` — off by default, as in RN. A ref exposing `measure` / `measureInWindow` / `measureLayout` (`ViewHandle`, RN's own argument order — window coordinates come from `gtk_widget_compute_point`, so they read correctly inside a scrolled viewport). The full responder and touch prop set — `onStartShouldSetResponder(Capture)`, `onMoveShouldSetResponder(Capture)`, `onResponderGrant/Start/Move/End/Release/Terminate`, `onTouchStart/Move/End/Cancel` plus `Capture`; `PanResponder`'s `panHandlers` spread here too. See [Gestures](../../gestures.md).",
    differences:
      'Input is single-pointer: a mouse is one fabricated touch, and `touches` never exceeds one. Responder negotiation is RN\'s model in full — capture-then-bubble, mid-gesture transfer through `onResponderTerminationRequest` / `onResponderReject`, one lock per process — but the negotiation path stops at the layout root, so native GTK widgets between or above views take no part in it. GTK settles most terminations before JS is consulted: a context menu, a native widget or `GtkDragSource` taking the sequence, and text selection all arrive as an already-cancelled gesture and terminate **without** consulting `onResponderTerminationRequest` — GTK\'s claim is irrevocable. Window blur terminates unconditionally (as on react-native-web). An enclosing `ScrollView` scrolling under the gesture is the one termination the responder may still refuse. `overflow: "hidden"` (and `"scroll"`, which clips identically) clips both the paint and the picking of children — including transformed ones and children an animation drives outside the box. `borderRadius` shapes that clip. A container never clips its own background, border, shadow or outline — only its children\'s.',
  },
  {
    name: "Text",
    subpath: "react-native",
    gtkImplementation: "`GtkLabel` (Pango)",
    supported:
      "wrapping, `numberOfLines` (end ellipsis), `textAlign`, font styles, `onLayout`, `testID`, and a ref exposing the geometry methods (`TextHandle` — a label needs no wrapping `View` to be measurable).",
    differences:
      "Nested `Text` elements are concatenated without per-span styling. Text is always ellipsizable — it shrinks in a narrow window rather than overflowing.",
  },
  {
    name: "Image",
    subpath: "react-native",
    gtkImplementation: "`GtkPicture`",
    supported:
      "`source={{ uri }}` or a string — local paths, `file://` and `http(s)` (fetched through Node and cached to disk by URL, with in-flight requests de-duplicated). `resizeMode` — `cover` / `contain` / `stretch` / `center`. `onLoad` / `onError`; a ref exposing the geometry methods (`ImageHandle`). `.svg` files load like any other image (rasterized through librsvg). Building vector graphics from state instead of a file is a separate import — see [Svg](../svg.md).",
    differences:
      "A remote image has no synchronous size — `style` sets the size, as in RN. The disk cache is not size-limited yet.",
  },
  {
    name: "SafeAreaView",
    subpath: "react-native",
    gtkImplementation: "= `View`",
    supported: "—",
    differences:
      "A desktop window has no notch, so this renders exactly as `View`.",
  },
  {
    name: "StatusBar",
    subpath: "react-native",
    gtkImplementation: "renders nothing",
    supported: "—",
    differences:
      "There is no status bar on a desktop window, so every prop is accepted and ignored.",
  },
  {
    name: "ActivityIndicator",
    subpath: "react-native",
    gtkImplementation: "`GtkSpinner`",
    supported: "`animating`, `size` (`small` / `large` / a number).",
    differences: "`color` is not supported yet.",
  },
  {
    name: "Root",
    subpath: "react-native",
    gtkImplementation: "an internal layout root",
    supported: "`width`, `height`.",
    differences: "Extension: the root the test harness renders a tree into.",
  },
  {
    name: "NestedRoot",
    subpath: "react-native",
    gtkImplementation: "an internal layout root",
    supported: "—",
    differences:
      "Extension: a Yoga layout root inside any GTK container slot (a navigation page, a custom container) — the slot's own allocation is the viewport.",
  },
  {
    name: "IntrinsicRoot",
    subpath: "react-native",
    gtkImplementation: "an internal layout root",
    supported: "—",
    differences:
      "Extension: a content-sized Yoga root for chrome slots (a header bar's start/end content) — it reports its content size to GTK instead of receiving an allocation.",
  },
  {
    name: "TextInput",
    subpath: "react-native",
    gtkImplementation: "`GtkEntry` (single line) / `GtkTextView` (multiline)",
    supported:
      "Controlled and uncontrolled use (`value` / `defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus` / `onBlur`. `placeholder` — its own dim overlay in multiline mode, since `GtkTextView` has none built in. `secureTextEntry`, `editable`, `keyboardType`, `multiline`. `clearButtonMode` — `GtkEntry`'s built-in clear icon (RN only ships this on iOS). The visual half of `style` — background, border and radius all reach the widget, rather than being computed and dropped.",
    differences:
      "Multiline needs an explicit `height` in its style, exactly as RN recommends. A real `GtkTextView` wraps words, scrolls internally, and inserts a newline on Enter rather than firing `onSubmitEditing` — RN's own multiline semantics.",
  },
  {
    name: "Switch",
    subpath: "react-native",
    gtkImplementation: "`GtkSwitch`",
    supported: "`value` / `onValueChange`, `disabled`.",
    differences: "Sized by the GTK theme, not by iOS metrics.",
  },
  {
    name: "Pressable",
    subpath: "react-native",
    gtkImplementation: "`View` + click/motion event controllers",
    supported:
      "`onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn` / `onHoverOut`, `onFocus` / `onBlur`, `focusable`, `disabled`. A function-form `style` / `children` receiving `{ pressed, hovered, focused }` (react-native-web's own state shape). Keyboard-operable: `focusable` defaults to `true` whenever `onPress` is set (react-native-web's rule), which puts the view in the GTK focus chain — Tab and the arrow keys reach it, and Enter/Space fire `onPress` as they do on web and Android. The `PressEvent` payload matches RN's shape (`locationX/Y` target-relative, `pageX/Y` window-relative, `identifier`, `target`, `force`, a monotonic `timestamp`, single-element `touches`/`changedTouches`). `hitSlop` and `pressRetentionOffset` each take a number or a per-edge object; the press rect defaults to RN's own `{ top: 20, left: 20, right: 20, bottom: 30 }` around the hit rect, and releasing outside it cancels rather than presses.",
    differences:
      '`hitSlop` cannot escape a clipping ancestor — a `ScrollView` viewport or any view with `overflow: "hidden"` — because GTK stops hit-testing at the clip; RN documents the identical limit on Android for the same reason. Hover fires from touch input as well as from a mouse (react-native-web filters that out; here a crossing event carries no device to filter on) — GTK also sends a matching leave when a touch sequence ends, so the stuck phantom hover the filter guards against does not arise; GTK\'s own `:hover` behaves the same way.',
  },
  {
    name: "TouchableOpacity",
    subpath: "react-native",
    gtkImplementation: "built on `Pressable`",
    supported: "`activeOpacity`.",
    differences: "—",
  },
  {
    name: "TouchableHighlight",
    subpath: "react-native",
    gtkImplementation: "built on `Pressable`",
    supported:
      "`underlayColor` (default `black`, as in RN), `activeOpacity`, `onShowUnderlay` / `onHideUnderlay`.",
    differences:
      "RN renders a separate underlay view behind the child and dims the child onto it. Here the highlight is the view's own `backgroundColor` while pressed — an extra box would change flex layout and what `measureLayout` measures relative to, the same reason `GestureDetector` and `createAnimatedComponent` add none either. Give the child a translucent background for RN's exact blend.",
  },
  {
    name: "TouchableWithoutFeedback",
    subpath: "react-native",
    gtkImplementation: "built on `Pressable`",
    supported:
      "the same press/hover/focus props as `Pressable`, with no visual reaction.",
    differences:
      "RN clones its single child rather than rendering a box of its own — its own documentation calls that a compatibility artifact. This renders the `Pressable` box instead. Prefer `Pressable` directly, as RN's own docs recommend.",
  },
  {
    name: "ScrollView",
    subpath: "react-native",
    gtkImplementation: "`GtkScrolledWindow`",
    supported:
      "Vertical and `horizontal` scrolling. `contentContainerStyle` — the content container is a plain `View`, so `alignItems` defaults to `stretch` as it does in RN. `onScroll` (`contentOffset`, `contentSize`, `layoutMeasurement`), the four scroll-phase callbacks `onScrollBeginDrag`/`onScrollEndDrag`/ `onMomentumScrollBegin`/`onMomentumScrollEnd`, `onContentSizeChange`. `stickyHeaderIndices` — the real child is translated and painted on top, no duplicate node. A ref exposing `scrollTo`/`scrollToEnd` plus the geometry methods `measure`/`measureInWindow`/`measureLayout` (`ScrollViewHandle`). A child that takes the responder suspends the scroller's own gestures for the rest of the interaction, so a pan gesture is reachable inside a scrolling list.",
    differences:
      "`animated` in `scrollTo` is ignored. **The scroll phases are input-device aware**: a mouse wheel gives GTK isolated detents, so a burst is grouped into one begin/end session (a 120&nbsp;ms idle boundary) and reports no momentum; a touchpad glide reports all four phases from its native GTK sequence, and content really keeps moving once the fingers lift. RN has no wheel input, so the wheel session is a desktop-only extension rather than a parity claim. `onScrollBeginDrag`/`onScrollEndDrag` map onto the user-driven scroll _session_ (a touchpad's begin/end signal, or the grouped wheel burst) rather than a finger literally touching the content — the closest true statement available, since a touchpad never touches the content directly. The momentum pair reflects the adjustment actually continuing to move after the session ends rather than a generic \"decelerate\" signal that fires on every lift — a glide that stops dead reports the drag pair with no momentum pair, as RN does. None of this installs until a handler is attached: with all four phase callbacks attached, a scroll event costs 6.93&nbsp;µs versus 7.17&nbsp;µs with none attached — inside the noise; the GTK controller itself costs 0.31&nbsp;µs per event once any phase handler is present, and a begin/end consumer specifically adds 0.235&nbsp;µs per wheel detent for the session state machine. Scroll arbitration between a scroller and a child gesture is touch-only: `GtkScrolledWindow`'s own gestures are touch-only, so under a mouse a child pan never competes with scrolling at all. Two known edges under touch: a child gesture that claims on a move rather than on the initial press can lose the first ~8&nbsp;px to the scroller (GTK's claim is irrevocable, the same artifact iOS has); and a mouse wheel during an active gesture terminates the responder rather than being suppressed. **The scroller carries RN's own base style**, `flexGrow: 1, flexShrink: 1`, composed under the app's `style` the same way RN's `StyleSheet.compose` composes it, on the same node `style` lands on — `FlatList`, `SectionList` and `VirtualizedList` inherit it. This is what makes an unstyled scrollable a viewport rather than a box grown to its content, and it has one consequence worth knowing: an explicit main-axis `height` on the scroller is only its flex _basis_ — inside a taller flex parent, `flexGrow` still expands it past that height. That is parity with RN's own Yoga behavior, not a deviation. To bound the viewport, bound the _parent_ (`<View style={{ height: 200 }}><FlatList /></View>`, what an RN app already writes) or cancel the base style with `flexGrow: 0`.",
  },
  {
    name: "FlatList",
    subpath: "react-native",
    gtkImplementation: "a windowed core over `ScrollView`",
    supported:
      "Virtualization (`estimatedItemSize` or `getItemLayout`, `windowSize`/ `initialNumToRender` as the primary scroll-performance knobs, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`). `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`. `CellRendererComponent` — RN's per-cell wrapper. The list still hands it the cell's absolute `style` and the `onLayout` that measures it, and both must be applied, which is what `react-native-draggable-flatlist` builds its design on. `ListHeader`/`Footer`/`EmptyComponent`, `onEndReached(-Threshold)`. `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`). `inverted` — RN's chat semantics: the list opens at `data[0]` and stays pinned on prepend. `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`. A ref exposing `scrollToIndex`/`scrollToItem`/`scrollToOffset` plus `scrollTo`/`scrollToEnd` (`FlatListHandle`) — the scroll half of a `ScrollView` ref, not the geometry half: a windowed list is a composite over `ScrollView` and owns no widget of its own, so measure the `ScrollView` or a cell instead.",
    differences:
      "1000 rows mount windowed in roughly 120&nbsp;ms. `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure, and a wider window means fewer mount-and-reflow bursts per scrolled pixel (measured: 21% less churn, late frames down from 10/s to 7.7/s). Rows beyond the visible ones mount `maxToRenderPerBatch` (10) at a time, every `updateCellsBatchingPeriod` (50)&nbsp;ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one. There is no pull gesture — `onRefresh` is always app-triggered. An inverted list shorter than its viewport anchors to the top, not the bottom. `CellRendererComponent` does not apply to a sticky cell (`stickyHeaderIndices`), because pinning reorders the cell's real GTK widget — the sticky container has to _be_ the cell.",
  },
  {
    name: "SectionList",
    subpath: "react-native",
    gtkImplementation: "built on `FlatList`",
    supported:
      "`sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`).",
    differences:
      "Viewability props are not exposed yet (section-aware `ViewToken`s are not implemented).",
  },
  {
    name: "VirtualizedList",
    subpath: "react-native",
    gtkImplementation: "the same windowed core",
    supported:
      "RN's opaque data-source shape over the same windowed core `FlatList` sits on — `data` is read only through `getItemCount(data)` and `getItem(data, index)`, both called lazily; only the rows the window actually mounts are ever asked for. Everything else matches [FlatList](flat-list.md), `CellRendererComponent` included.",
    differences:
      "The accessors are optional here and required upstream — one component serves both the opaque-source and plain-array shapes, which is why `FlatList` needs no separate implementation. `scrollToItem` scans the source through `getItem`, as upstream does — an opaque source has no index to look up directly. Every `FlatList` difference above applies unchanged.",
  },
  {
    name: "Modal",
    subpath: "react-native",
    gtkImplementation: "a modal `GtkWindow` (a portal)",
    supported:
      "`visible`, `onRequestClose` (Escape or the window's close button), `title`, `width`/`height`; independently resizable, with relayout.",
    differences:
      "This is a real, separate desktop window rather than an overlay drawn above the current one. `transparent` and `animationType` are accepted and have no effect.",
  },
] as const satisfies readonly PortableRecord[]

export const PORTABLE_APIS = [
  {
    name: "StyleSheet",
    subpath: "react-native",
    supported:
      "`create`, `flatten`, `compose`, `absoluteFill`/ `absoluteFillObject`, `hairlineWidth`.",
    differences: "—",
  },
  {
    name: "PlatformColor",
    subpath: "react-native",
    supported:
      'Adwaita theme variables — `PlatformColor("accent-bg-color")` resolves to `var(--accent-bg-color)`; `@name` reaches a legacy named GTK color.',
    differences: "The names are Adwaita's own, not iOS's or Android's.",
  },
  {
    name: "AppRegistry",
    subpath: "react-native",
    supported:
      "`registerComponent`, `runApplication(appKey, { title, width, height, initialProps, chrome, actionAccels, breakpoints })`, `getAppKeys`.",
    differences:
      'These are desktop window parameters, not mobile ones. `chrome: "content"` uses an `AdwApplicationWindow` with no window titlebar when the app declares `"Adw-1"` in its `gtkx.config.ts` — the app\'s own header bars become the window chrome — and falls back to the plain `GtkApplicationWindow` that `chrome: "system"` always uses when it does not. Requesting `chrome: "content"` unconditionally is the portable choice: header-bar chrome where Adwaita is available, an ordinary window otherwise, with no branch of the app\'s own. `actionAccels` binds accelerators to `GtkApplication` action names; `breakpoints` reaches `AdwApplicationWindow` directly and only takes effect under `chrome: "content"` with `"Adw-1"` declared — otherwise a development warning names the mismatch once per run. `applicationActions`/`windowActions`/`windowControllers` are superseded by the declarative `<ApplicationActions>`/`<WindowActions>`/ `<WindowControllers>` components documented with the platform layer; they still work unchanged.',
  },
  {
    name: "Platform",
    subpath: "react-native",
    supported:
      '`OS: "linux"`, `Version` (the GTK version), `select` (`linux` → `native` → `default`), `isTV`, `isTesting`.',
    differences:
      '`Platform.OS` is typed as the full `PlatformOSType` union plus `"linux"`, not a `"linux"` literal — comparing it against another platform\'s name is a runtime question, and RN\'s own types let that compile everywhere.',
  },
  {
    name: "Dimensions",
    subpath: "react-native",
    supported: '`get("window"/"screen")`, `addEventListener("change")`.',
    differences:
      "Reports the main window only — transient windows are ignored. `get(\"window\")` is the app's own viewport: the window's content area under its header bar, the desktop analogue of RN's app window.",
  },
  {
    name: "useWindowDimensions",
    subpath: "react-native",
    supported: "reactive main-window dimensions.",
    differences: "—",
  },
  {
    name: "Appearance",
    subpath: "react-native",
    supported:
      "`getColorScheme`, `setColorScheme`, `addChangeListener`. Backed by `AdwStyleManager`; on the plain-GTK profile (no `\"Adw-1\"`), it is sourced from the `org.freedesktop.appearance` desktop portal's `color-scheme` setting instead, with live updates through the portal's own change signal, falling back further to `Gtk.Settings:gtk-application-prefer-dark-theme` when no portal answers.",
    differences:
      "On every profile, `setColorScheme` writes to this process only — it never writes a system-wide preference. With no portal reachable and no explicit `setColorScheme` call yet, the reported scheme is whatever `Gtk.Settings` already defaults to (light), not an observed system value.",
  },
  {
    name: "useColorScheme",
    subpath: "react-native",
    supported: "reactive theme.",
    differences: "—",
  },
  {
    name: "AppState",
    subpath: "react-native",
    supported: "`currentState` (`active`/`background`), `addEventListener`.",
    differences: "Driven by the window's own active/inactive state.",
  },
  {
    name: "Alert",
    subpath: "react-native",
    supported:
      "`alert(title, message, buttons, options)`, backed by `Adw.AlertDialog` (or `Gtk.AlertDialog`, GTK ≥ 4.10, on the plain-GTK profile), including `cancel`/`destructive`/`isPreferred` button styles and default/cancel mapping.",
    differences:
      "On the plain-GTK profile, `destructive`/`isPreferred` appearance is lost — `Gtk.AlertDialog` has no equivalent, so every button renders the same, though default/cancel mapping is preserved. `cancelable: false` with no `cancel`-style button cannot be enforced there either, since `Gtk.AlertDialog` has no way to block Escape or a window-close dismissal; add a `cancel`-style button for identical behavior on both profiles.",
  },
  {
    name: "Linking",
    subpath: "react-native",
    supported:
      '`openURL`, `canOpenURL` (`http`/`https`/`mailto`/`file`), `getInitialURL` (always `null`), `addEventListener("url")`.',
    differences:
      'Opens through the system launcher. There is no deep-link delivery on desktop yet — `"url"` subscriptions are accepted but never fire.',
  },
  {
    name: "InteractionManager",
    subpath: "react-native",
    supported:
      "`runAfterInteractions(task?)` (cancellable, then-able), `createInteractionHandle`/`clearInteractionHandle`, `addListener`.",
    differences:
      "A navigation transition registers itself as an interaction, so work deferred with `runAfterInteractions` during a push or pop waits for the slide to finish.",
  },
  {
    name: "DevSettings",
    subpath: "react-native",
    supported:
      "`addMenuItem(title, handler)` (entries in the Dev Menu — Ctrl+Shift+D in `run-linux --dev`), `reload(reason?)`.",
    differences: "Silent no-ops in release builds, as in RN.",
  },
  {
    name: "I18nManager",
    subpath: "react-native",
    supported:
      "`isRTL` (a live read of the locale's text direction), `doLeftAndRightSwapInRTL`, `getConstants`.",
    differences:
      "`allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops — mobile's persisted RTL override has no desktop store to persist to.",
  },
  {
    name: "BackHandler",
    subpath: "react-native",
    supported: '`addEventListener("hardwareBackPress")`, `exitApp`.',
    differences:
      "There is no hardware back key on desktop — subscriptions are honored, but nothing fires them yet.",
  },
  {
    name: "findNodeHandle",
    subpath: "react-native",
    supported:
      "a stable integer per mounted widget, resolvable back to it; accepted by `measureLayout` as its first argument, alongside a handle object. Takes what RN takes: a component handle, a node handle (returned unchanged), `null`/`undefined`. A windowed list resolves to the `ScrollView` it renders, as RN's `FlatList` resolves to its own scroll view.",
    differences:
      "The tag identifies the widget, not the ref: two refs onto one view report the same number, and a re-render that rebuilt the handle object does not change it. It has no native manager to resolve against, so it is worth exactly what this platform can resolve it to — `measureLayout`, and identity. `null` for anything that is not a mounted host view, as in RN.",
  },
  {
    name: "Keyboard",
    subpath: "react-native",
    supported:
      "`addListener` (honored, never fires), `removeAllListeners`, `dismiss`, `isVisible` (always `false`), `metrics` (always `undefined`), `scheduleLayoutAnimation`.",
    differences:
      "Every event this module carries describes a _software_ keyboard occluding the app, and a desktop has none — so none of them fire. Subscriptions are real and `remove()` pairs with them, so an unmount never crashes on a stale listener. `dismiss()` is deliberately a no-op rather than RN's own behavior: RN blurs the focused input as its only way to retract the keyboard, and doing that here would let a library's gesture steal focus from a form.",
  },
  {
    name: "LogBox",
    subpath: "react-native",
    supported:
      "`ignoreLogs`, `ignoreAllLogs`, `install`, `uninstall` — accepted and ignored.",
    differences:
      "RN's LogBox is a full-screen development overlay, and `ignoreLogs` only ever kept a warning out of that overlay — it never filtered the console. There is no overlay here, so console output is already what RN's own console output would have been, and nothing observable is lost by calling it.",
  },
  {
    name: "PanResponder",
    subpath: "react-native",
    supported:
      "`create(config)` → `panHandlers` (spread onto a `View`), the full `gestureState` (`dx`/`dy`, `vx`/`vy`, `x0`/`y0`, `moveX`/`moveY`, `numberActiveTouches`) — react-native's own `PanResponder.js`, unmodified, running on this platform's own touch-history store.",
    differences:
      "Multi-touch `gestureState` is single-touch here, since input is one pointer. `onShouldBlockNativeResponder`'s return value is not consulted yet. `onPanResponderTerminationRequest` is asked when an ancestor tries to take the gesture, or when an enclosing `ScrollView` scrolls; every other termination is GTK's own decision and arrives as an unasked `onPanResponderTerminate` (see [View](components/view.md)).",
  },
  {
    name: "Animated",
    subpath: "react-native",
    supported:
      "![The gallery's Animated section: Animated.timing with looping, Animated.spring overshoot, and Animated.event driving a scroll-linked header.](../shots/gallery/animated.png) ![The gallery's Interpolate section: a multi-stop opacity range, a mirrored extrapolate-clamp bounce, and two interpolations of one Animated.Value.](../shots/gallery/interpolate.png) `Animated` — `Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`, `loop`, `interpolate` (numbers and `deg`/`rad` strings, with clamp/extend/identity extrapolation), `ValueXY` (`setValue`/`setOffset`/ `flattenOffset`/`extractOffset`, `getLayout`, `getTranslateTransform`) and `event(argMapping, config?)` — reads directly off `PanResponder`'s `gestureState` or a `ScrollView`'s `onScroll`, mapping is positional over the callback's own arguments, traversed recursively into plain objects down to a leaf that is a `Value`/`ValueXY`, and `config.listener` still runs after the mapping does. `Animated.View`'s style takes `opacity` and the whole `transform` array (`translateX`/`translateY`, `scale`, `scaleX`, `scaleY`, `rotate`/`rotateZ`) driven directly by `Animated` nodes rather than through React, plus `top`/`left`/`right`/`bottom` when the node's own `position` is `\"absolute\"` (what makes `ValueXY.getLayout()` work), `width`/`height` where the change is confined to the node that owns it, the same responder and touch props `View` takes, `pointerEvents`, and `animatedProps` — because `Animated.View` is `createAnimatedComponent(View)`, and every `View` prop reaches it there.",
    differences:
      "`rotateX`/`rotateY`/`perspective` (3D transforms), `skewX`/`skewY` and `matrix` are not supported, and the transform origin is always the component's own center — see [Components](components/index.md#layout-paint-and-hit-testing). `useNativeDriver` is accepted and ignored, with a development warning: the direct path already runs at native speed, and because there is no native side to hand the event to, `Animated.event` always returns the plain JS handler regardless of `useNativeDriver`. A mapped path the real event does not carry is silently left unset at any depth rather than thrown — a deliberate widening of RN's own traversal, which throws one level above a missing leaf.",
  },
  {
    name: "Easing",
    subpath: "react-native",
    supported:
      "`linear`, `ease`, `quad`, `cubic`, `in`, `out`, `inOut`, `bezier`.",
    differences: "—",
  },
  {
    name: "version",
    subpath: "react-native",
    supported: "the package version.",
    differences: "Extension: not part of RN's own API.",
  },
] as const satisfies readonly PortableRecord[]

export const COMMON_PRIMITIVES = [
  {
    name: "NavigationStack",
    subpath: "react-native-gtkx/common",
    summary: "`Adw.NavigationView` driven by a `stack` array of tags",
  },
  {
    name: "NavigationStackPage",
    subpath: "react-native-gtkx/common",
    summary: "one page of that stack, identified by `tag`",
  },
  {
    name: "SlotContent",
    subpath: "react-native-gtkx/common",
    summary:
      "Sizing: fills the slot. Use for: a page body, a pane, a dialog body.",
  },
  {
    name: "IntrinsicContent",
    subpath: "react-native-gtkx/common",
    summary:
      "Sizing: sized by its own Yoga layout. Use for: an AdwHeaderBar slot, a toolbar area, a list row.",
  },
] as const satisfies readonly CommonRecord[]

export const GTK_WIDGETS = [
  { name: "GtkActionBar", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkAppChooserButton",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  {
    name: "GtkAppChooserWidget",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkAspectFrame", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkBox", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkCalendar", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkCellView", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkCenterBox", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkCheckButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkColorButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkColorChooserWidget",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  {
    name: "GtkColorDialogButton",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkColumnView", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkComboBox", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkComboBoxText", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkDrawingArea", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkDropDown", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkEditableLabel", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkEmojiChooser", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkEntry", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkExpander", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkFileChooserWidget",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkFixed", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkFlowBox", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkFontButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkFontChooserWidget",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  {
    name: "GtkFontDialogButton",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkFrame", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkGLArea", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkGraphicsOffload",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkGrid", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkGridView", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkHeaderBar", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkIconView", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkImage", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkInfoBar", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkInscription", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkLabel", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkLevelBar", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkLinkButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkListBox", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkListView", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkLockButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkMediaControls", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkMenuButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkNotebook", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkOverlay", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkPaned", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkPasswordEntry", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkPicture", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkPopover", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkPopoverBin", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkPopoverMenu", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkPopoverMenuBar",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkProgressBar", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkRange", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkRevealer", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkScale", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkScaleButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkScrollbar", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkScrolledWindow",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkSearchBar", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkSearchEntry", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkSeparator", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkShortcutLabel", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkShortcutsGroup",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  {
    name: "GtkShortcutsSection",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  {
    name: "GtkShortcutsShortcut",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkSpinButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkSpinner", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkStack", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkStackSidebar", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkStackSwitcher", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkStatusbar", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkSwitch", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkText", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkTextView", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkToggleButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkTreeExpander", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkTreeView", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkVideo", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkViewport", subpath: "react-native-gtkx/gtk", wrapped: true },
  { name: "GtkVolumeButton", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkWindowControls",
    subpath: "react-native-gtkx/gtk",
    wrapped: true,
  },
  { name: "GtkWindowHandle", subpath: "react-native-gtkx/gtk", wrapped: true },
  {
    name: "GtkAboutDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkAppChooserDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkApplicationWindow",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkAssistant",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkColorChooserDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkDragIcon",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkFileChooserDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkFlowBoxChild",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "child-only (derives Gtk.FlowBoxChild)",
  },
  {
    name: "GtkFontChooserDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkListBoxRow",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "GtkMessageDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkPageSetupUnixDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkPrintUnixDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkShortcutsWindow",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "GtkWindow",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
] as const satisfies readonly WidgetRecord[]

export const ADW_WIDGETS = [
  { name: "AdwAboutDialog", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwAlertDialog", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwAvatar", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwBanner", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwBin", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwBottomSheet", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwBreakpointBin", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwButtonContent", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwCarousel", subpath: "react-native-gtkx/adw", wrapped: true },
  {
    name: "AdwCarouselIndicatorDots",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  {
    name: "AdwCarouselIndicatorLines",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  { name: "AdwClamp", subpath: "react-native-gtkx/adw", wrapped: true },
  {
    name: "AdwClampScrollable",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  { name: "AdwDialog", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwFlap", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwHeaderBar", subpath: "react-native-gtkx/adw", wrapped: true },
  {
    name: "AdwInlineViewSwitcher",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  { name: "AdwLayoutSlot", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwLeaflet", subpath: "react-native-gtkx/adw", wrapped: true },
  {
    name: "AdwMultiLayoutView",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  {
    name: "AdwNavigationSplitView",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  {
    name: "AdwNavigationView",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  {
    name: "AdwOverlaySplitView",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  {
    name: "AdwPreferencesDialog",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  {
    name: "AdwPreferencesGroup",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  { name: "AdwShortcutLabel", subpath: "react-native-gtkx/adw", wrapped: true },
  {
    name: "AdwShortcutsDialog",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  { name: "AdwSidebar", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwSpinner", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwSplitButton", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwSqueezer", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwStatusPage", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwTabBar", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwTabButton", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwTabOverview", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwTabView", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwToastOverlay", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwToggleGroup", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwToolbarView", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwViewStack", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwViewSwitcher", subpath: "react-native-gtkx/adw", wrapped: true },
  {
    name: "AdwViewSwitcherBar",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  {
    name: "AdwViewSwitcherSidebar",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  {
    name: "AdwViewSwitcherTitle",
    subpath: "react-native-gtkx/adw",
    wrapped: true,
  },
  { name: "AdwWindowTitle", subpath: "react-native-gtkx/adw", wrapped: true },
  { name: "AdwWrapBox", subpath: "react-native-gtkx/adw", wrapped: true },
  {
    name: "AdwAboutWindow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "AdwActionRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwApplicationWindow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "AdwButtonRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwComboRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwEntryRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwExpanderRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwMessageDialog",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "AdwNavigationPage",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (denylist — see scripts/widget-surface/classify.ts)",
  },
  {
    name: "AdwPasswordEntryRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwPreferencesPage",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (denylist — see scripts/widget-surface/classify.ts)",
  },
  {
    name: "AdwPreferencesRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwPreferencesWindow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
  {
    name: "AdwSpinRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwSwitchRow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "child-only (derives Gtk.ListBoxRow)",
  },
  {
    name: "AdwWindow",
    subpath: "react-native-gtkx/adw",
    wrapped: false,
    reason: "toplevel (implements GtkRoot)",
  },
] as const satisfies readonly WidgetRecord[]

export const DOC_CHUNKS = [
  {
    doc: "docs/reference/aliases.md",
    heading: "Configuring the aliases",
    text: 'Both presets take an `aliases` option as **deltas keyed by package name**,\nnot a replacement list — anything not mentioned keeps its default. A\nreplacement list that has to be re-stated in full is a list that can quietly\nlose an entry; losing one of these six from a bundler\'s own external-package\nlist is what admits the real, incompatible upstream package into a Linux\nbuild.\n\n```ts\n// vite.config.ts\nimport { reactNativeGtkx } from "react-native-gtkx/vite"\n\nexport default defineConfig({\n  plugins: [\n    reactNativeGtkx({\n      aliases: {\n        // false — drop one of ours, so the real upstream package loads\n        "react-native-reanimated-dnd": false,\n        // string — an exact name or subpath, tail transplanted\n        "my-pkg": "my-pkg/linux",\n        // { pattern, replace } — only for the rare case where the subpath\n        // layouts genuinely differ\n        "weird-pkg": { pattern: /^weird-pkg\\/lib\\/(.+)$/, replace: "impl/$1" },\n      },\n    }),\n  ],\n})\n```\n\n```ts\n// metro.config.ts — the same object, the same semantics\nexport default withLinuxPlatform(getDefaultConfig(__dirname), {\n  aliases: { "react-native-reanimated-dnd": false },\n})\n```\n\nPrefer the string form: it is anchored to the exact package name, which\nmatters because `react-native-reanimated-dnd` is a lookalike of\n`react-native-reanimated`, and `react-native-worklets-core` is a real,\nunrelated package that looks like `react-native-worklets`. A loose prefix\nrewrite would send either one onto a subpath that does not exist. Reach for\n`{ pattern, replace }` only when a package\'s subpath layout genuinely does\nnot match its target\'s.\n\nBecause the rules are data rather than functions, a preset validates them\nwhen the config loads and reports exactly what is wrong:\n\n- an unknown key paired with `false` — the aliases that exist are named, so a\n  typo cannot silently do nothing;\n- an overlapping pattern — two rules claiming one specifier would make\n  resolution order-dependent, so this is rejected;\n- an unanchored pattern, or one carrying the `g`/`y` regex flag — the first\n  matches inside a longer specifier than intended, the second carries state\n  (`lastIndex`) between calls;\n- a target that is not a plain module specifier — a relative or absolute\n  path, or one ending in `/`;\n- `react-native` itself — it cannot be dropped or retargeted; the platform\n  alias is not one of the six substituted packages.\n\nOn the vite path, the same option also drives `ssr.noExternal`, derived from\nthe table rather than duplicated beside it — every name in the table stays\ninside vite\'s own pipeline, including one that is turned off deliberately: an\nun-aliased package still imports `react-native` at module scope, and that\nimport only reaches the platform alias if Node never resolves the real\npackage first.',
  },
  {
    doc: "docs/reference/aliases.md",
    heading: "The one alias that is a real trade",
    text: "Five of these six substitute an implementation that cannot run on this\nplatform at all. `react-native-reanimated-dnd` is the exception: its real\n2.0.0 release runs on top of this platform's own Reanimated, worklets and\ngesture-handler surfaces, dragged by a real pointer. Choosing between the two\nis a genuine trade, not a workaround:\n\n- **`react-native-gtkx/dnd` (the default)** — GDK animates a paintable of the\n  dragged view above every window, with the desktop theme's own drag\n  cursors, hit-testing against the real widget tree, and drops into _other_\n  applications. The dragged view itself never moves.\n- **the real `react-native-reanimated-dnd`** — the full upstream prop\n  surface (`dragAxis`, `dragBoundsRef`, `dropAlignment`,\n  `collisionAlgorithm`, and the rest), and the view genuinely moves under the\n  pointer. No drag icon, no cross-application drop, and the drag stays\n  confined to the app window.\n\nSee [Drag and drop](dnd.md) for what the mirror does and does not carry over\nfrom upstream's own prop surface; the real package, once aliased off, has\nupstream's behavior by definition.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "StyleSheet",
    text: "Supported: `create`, `flatten`, `compose`, `absoluteFill`/\n`absoluteFillObject`, `hairlineWidth`.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "PlatformColor",
    text: "Supported: Adwaita theme variables — `PlatformColor(\"accent-bg-color\")`\nresolves to `var(--accent-bg-color)`; `@name` reaches a legacy named GTK\ncolor.\n\nDiffers from react-native:\n\n- The names are Adwaita's own, not iOS's or Android's.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "AppRegistry",
    text: 'Supported: `registerComponent`, `runApplication(appKey, { title, width,\nheight, initialProps, chrome, actionAccels, breakpoints })`, `getAppKeys`.\n\nDiffers from react-native:\n\n- These are desktop window parameters, not mobile ones.\n- `chrome: "content"` uses an `AdwApplicationWindow` with no window titlebar\n  when the app declares `"Adw-1"` in its `gtkx.config.ts` — the app\'s own\n  header bars become the window chrome — and falls back to the plain\n  `GtkApplicationWindow` that `chrome: "system"` always uses when it does\n  not. Requesting `chrome: "content"` unconditionally is the portable\n  choice: header-bar chrome where Adwaita is available, an ordinary window\n  otherwise, with no branch of the app\'s own.\n- `actionAccels` binds accelerators to `GtkApplication` action names;\n  `breakpoints` reaches `AdwApplicationWindow` directly and only takes\n  effect under `chrome: "content"` with `"Adw-1"` declared — otherwise a\n  development warning names the mismatch once per run.\n- `applicationActions`/`windowActions`/`windowControllers` are superseded\n  by the declarative `<ApplicationActions>`/`<WindowActions>`/\n  `<WindowControllers>` components documented with the platform layer; they\n  still work unchanged.',
  },
  {
    doc: "docs/reference/apis.md",
    heading: "Platform",
    text: 'Supported: `OS: "linux"`, `Version` (the GTK version), `select`\n(`linux` → `native` → `default`), `isTV`, `isTesting`.\n\nDiffers from react-native:\n\n- `Platform.OS` is typed as the full `PlatformOSType` union plus `"linux"`,\n  not a `"linux"` literal — comparing it against another platform\'s name is\n  a runtime question, and RN\'s own types let that compile everywhere.',
  },
  {
    doc: "docs/reference/apis.md",
    heading: "Dimensions",
    text: 'Supported: `get("window"/"screen")`, `addEventListener("change")`.\n\nDiffers from react-native:\n\n- Reports the main window only — transient windows are ignored.\n- `get("window")` is the app\'s own viewport: the window\'s content area\n  under its header bar, the desktop analogue of RN\'s app window.',
  },
  {
    doc: "docs/reference/apis.md",
    heading: "useWindowDimensions",
    text: "Supported: reactive main-window dimensions.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "Appearance",
    text: "Supported: `getColorScheme`, `setColorScheme`, `addChangeListener`. Backed\nby `AdwStyleManager`; on the plain-GTK profile (no `\"Adw-1\"`), it is\nsourced from the `org.freedesktop.appearance` desktop portal's\n`color-scheme` setting instead, with live updates through the portal's own\nchange signal, falling back further to\n`Gtk.Settings:gtk-application-prefer-dark-theme` when no portal answers.\n\nDiffers from react-native:\n\n- On every profile, `setColorScheme` writes to this process only — it\n  never writes a system-wide preference.\n- With no portal reachable and no explicit `setColorScheme` call yet, the\n  reported scheme is whatever `Gtk.Settings` already defaults to (light),\n  not an observed system value.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "useColorScheme",
    text: "Supported: reactive theme.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "AppState",
    text: "Supported: `currentState` (`active`/`background`), `addEventListener`.\n\nDiffers from react-native:\n\n- Driven by the window's own active/inactive state.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "Alert",
    text: "Supported: `alert(title, message, buttons, options)`, backed by\n`Adw.AlertDialog` (or `Gtk.AlertDialog`, GTK ≥ 4.10, on the plain-GTK\nprofile), including `cancel`/`destructive`/`isPreferred` button styles and\ndefault/cancel mapping.\n\nDiffers from react-native:\n\n- On the plain-GTK profile, `destructive`/`isPreferred` appearance is lost\n  — `Gtk.AlertDialog` has no equivalent, so every button renders the same,\n  though default/cancel mapping is preserved.\n- `cancelable: false` with no `cancel`-style button cannot be enforced\n  there either, since `Gtk.AlertDialog` has no way to block Escape or a\n  window-close dismissal; add a `cancel`-style button for identical\n  behavior on both profiles.\n\n`alert` maps directly onto a native dialog on both the Adwaita and\nplain-GTK profiles; see [the Guide's plain-GTK page](../guide/plain-gtk.md)\nfor how a plain-GTK app is configured.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "Linking",
    text: 'Supported: `openURL`, `canOpenURL` (`http`/`https`/`mailto`/`file`),\n`getInitialURL` (always `null`), `addEventListener("url")`.\n\nDiffers from react-native:\n\n- Opens through the system launcher.\n- There is no deep-link delivery on desktop yet — `"url"` subscriptions\n  are accepted but never fire.',
  },
  {
    doc: "docs/reference/apis.md",
    heading: "InteractionManager",
    text: "Supported: `runAfterInteractions(task?)` (cancellable, then-able),\n`createInteractionHandle`/`clearInteractionHandle`, `addListener`.\n\nDiffers from react-native:\n\n- A navigation transition registers itself as an interaction, so work\n  deferred with `runAfterInteractions` during a push or pop waits for the\n  slide to finish.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "DevSettings",
    text: "Supported: `addMenuItem(title, handler)` (entries in the Dev Menu —\nCtrl+Shift+D in `run-linux --dev`), `reload(reason?)`.\n\nDiffers from react-native:\n\n- Silent no-ops in release builds, as in RN.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "I18nManager",
    text: "Supported: `isRTL` (a live read of the locale's text direction),\n`doLeftAndRightSwapInRTL`, `getConstants`.\n\nDiffers from react-native:\n\n- `allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops —\n  mobile's persisted RTL override has no desktop store to persist to.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "BackHandler",
    text: 'Supported: `addEventListener("hardwareBackPress")`, `exitApp`.\n\nDiffers from react-native:\n\n- There is no hardware back key on desktop — subscriptions are honored,\n  but nothing fires them yet.',
  },
  {
    doc: "docs/reference/apis.md",
    heading: "findNodeHandle",
    text: "Supported: a stable integer per mounted widget, resolvable back to it;\naccepted by `measureLayout` as its first argument, alongside a handle\nobject. Takes what RN takes: a component handle, a node handle (returned\nunchanged), `null`/`undefined`. A windowed list resolves to the\n`ScrollView` it renders, as RN's `FlatList` resolves to its own scroll\nview.\n\nDiffers from react-native:\n\n- The tag identifies the widget, not the ref: two refs onto one view\n  report the same number, and a re-render that rebuilt the handle object\n  does not change it.\n- It has no native manager to resolve against, so it is worth exactly what\n  this platform can resolve it to — `measureLayout`, and identity.\n- `null` for anything that is not a mounted host view, as in RN.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "Keyboard",
    text: "Supported: `addListener` (honored, never fires), `removeAllListeners`,\n`dismiss`, `isVisible` (always `false`), `metrics` (always `undefined`),\n`scheduleLayoutAnimation`.\n\nDiffers from react-native:\n\n- Every event this module carries describes a _software_ keyboard\n  occluding the app, and a desktop has none — so none of them fire.\n- Subscriptions are real and `remove()` pairs with them, so an unmount\n  never crashes on a stale listener.\n- `dismiss()` is deliberately a no-op rather than RN's own behavior: RN\n  blurs the focused input as its only way to retract the keyboard, and\n  doing that here would let a library's gesture steal focus from a form.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "LogBox",
    text: "Supported: `ignoreLogs`, `ignoreAllLogs`, `install`, `uninstall` —\naccepted and ignored.\n\nDiffers from react-native:\n\n- RN's LogBox is a full-screen development overlay, and `ignoreLogs` only\n  ever kept a warning out of that overlay — it never filtered the console.\n  There is no overlay here, so console output is already what RN's own\n  console output would have been, and nothing observable is lost by\n  calling it.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "PanResponder",
    text: "![The gallery's Gestures section: a PanResponder-driven drag, and the inner/sibling responder-negotiation demo.](../shots/gallery/gestures.png)\n\nSupported: `create(config)` → `panHandlers` (spread onto a `View`), the\nfull `gestureState` (`dx`/`dy`, `vx`/`vy`, `x0`/`y0`, `moveX`/`moveY`,\n`numberActiveTouches`) — react-native's own `PanResponder.js`, unmodified,\nrunning on this platform's own touch-history store.\n\nDiffers from react-native:\n\n- Multi-touch `gestureState` is single-touch here, since input is one\n  pointer.\n- `onShouldBlockNativeResponder`'s return value is not consulted yet.\n- `onPanResponderTerminationRequest` is asked when an ancestor tries to\n  take the gesture, or when an enclosing `ScrollView` scrolls; every other\n  termination is GTK's own decision and arrives as an unasked\n  `onPanResponderTerminate` (see [View](components/view.md)).",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "Animated",
    text: "![The gallery's Animated section: Animated.timing with looping, Animated.spring overshoot, and Animated.event driving a scroll-linked header.](../shots/gallery/animated.png)\n\n![The gallery's Interpolate section: a multi-stop opacity range, a mirrored extrapolate-clamp bounce, and two interpolations of one Animated.Value.](../shots/gallery/interpolate.png)\n\n`Animated` — `Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`,\n`loop`, `interpolate` (numbers and `deg`/`rad` strings, with\nclamp/extend/identity extrapolation), `ValueXY` (`setValue`/`setOffset`/\n`flattenOffset`/`extractOffset`, `getLayout`, `getTranslateTransform`) and\n`event(argMapping, config?)` — reads directly off `PanResponder`'s\n`gestureState` or a `ScrollView`'s `onScroll`, mapping is positional over the\ncallback's own arguments, traversed recursively into plain objects down to a\nleaf that is a `Value`/`ValueXY`, and `config.listener` still runs after the\nmapping does. `Animated.View`'s style takes `opacity` and the whole\n`transform` array (`translateX`/`translateY`, `scale`, `scaleX`, `scaleY`,\n`rotate`/`rotateZ`) driven directly by `Animated` nodes rather than through\nReact, plus `top`/`left`/`right`/`bottom` when the node's own `position` is\n`\"absolute\"` (what makes `ValueXY.getLayout()` work), `width`/`height` where\nthe change is confined to the node that owns it, the same responder and touch\nprops `View` takes, `pointerEvents`, and `animatedProps` — because\n`Animated.View` is `createAnimatedComponent(View)`, and every `View` prop\nreaches it there.\n\nDiffers from react-native: `rotateX`/`rotateY`/`perspective` (3D transforms),\n`skewX`/`skewY` and `matrix` are not supported, and the transform origin is\nalways the component's own center — see\n[Components](components/index.md#layout-paint-and-hit-testing).\n`useNativeDriver` is accepted and ignored, with a development warning: the\ndirect path already runs at native speed, and because there is no native side\nto hand the event to, `Animated.event` always returns the plain JS handler\nregardless of `useNativeDriver`. A mapped path the real event does not carry\nis silently left unset at any depth rather than thrown — a deliberate\nwidening of RN's own traversal, which throws one level above a missing leaf.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "Easing",
    text: "Supported: `linear`, `ease`, `quad`, `cubic`, `in`, `out`, `inOut`,\n`bezier`.",
  },
  {
    doc: "docs/reference/apis.md",
    heading: "version",
    text: "Supported: the package version.\n\nDiffers from react-native:\n\n- Extension: not part of RN's own API.",
  },
  {
    doc: "docs/reference/dnd.md",
    heading: "Why a mirror, not the library",
    text: "`react-native-reanimated-dnd` cannot run on this platform as published.\nReanimated 4, `react-native-worklets` and `react-native-gesture-handler` are\nimported at module scope in twelve of its files, its sort algorithm lives\ninside a `useAnimatedReaction` worklet, its row layout inside a\n`useAnimatedStyle`, and its public types are written in `SharedValue<T>`.\nThis subpath re-implements the same API surface as plain functions and\ncomponents over real GTK widgets instead.",
  },
  {
    doc: "docs/reference/dnd.md",
    heading: "Opting out of the mirror",
    text: 'Once the gesture-handler and Reanimated-compatible surfaces exist as their\nown shims, the real `react-native-reanimated-dnd` package can run on top of\nthem unmodified. An app can choose that instead of the mirror with a bundler\nalias override (`aliases: { "react-native-reanimated-dnd": false }`), which\nfalls through to upstream\'s own implementation. See\n[reanimated-compat.md](reanimated-compat.md) for what the Reanimated surface\nunderneath it provides.',
  },
  {
    doc: "docs/reference/dnd.md",
    heading: "One drag-and-drop API, two shapes",
    text: "- **Porting an app that already uses `react-native-reanimated-dnd`** —\n  nothing changes. Both presets alias the package name; the imports stay as\n  they are.\n- **Writing a new app** — import from `react-native-gtkx/dnd` directly. Same\n  names, same props, so the code reads correctly to anyone who knows the\n  library.\n- **Reordering by row id rather than by array index** — a `Droppable` around\n  a `Draggable` per row, inside one `DropProvider`, is the right shape when a\n  store owns the order, filters it and sorts it. `Sortable` owns an array and\n  reports positions, which fits when the component itself owns the order.\n\n`List`/`ListRow` are not part of `react-native-gtkx/common`'s export\nsurface — that would have been Adwaita's list appearance written in React\nNative, an app's own concern, with its own id-keyed reorder bundled in. An\napp that wants id-keyed reordering combines `Droppable` and `Draggable` per\nrow instead, as above. See\n[platform-layer.md](../platform-layer.md#listlistrowlistseparator-were-here-and-are-not-any-more).",
  },
  {
    doc: "docs/reference/dnd.md",
    heading: "The exported surface",
    text: "- **`DropProvider`** — Scopes a set of draggables and droppables. Renders\n  a `View` — upstream renders a fragment — because `onDragging` needs a\n  widget to attach to. Its `ref` gives `getDroppedItems()` and\n  `requestPositionUpdate()`.\n- **`Draggable`, `DraggableHandle`, `useDraggable`** — The drag source.\n  With a handle, the `GtkDragSource` attaches to the handle's widget only,\n  so the rest of the item stays pressable.\n- **`Droppable`, `useDroppable`** — The drop target. `capacity` is\n  enforced in GDK's `::accept`, so a full zone shows the no-drop cursor.\n- **`Sortable`, `SortableItem`, `useSortable`, `useSortableList`,\n  `useHorizontalSortable`, `useHorizontalSortableList`** — Drag-to-reorder,\n  vertical by default or horizontal (`direction=\"horizontal\"`). The\n  component owns the order — upstream's own contract — read the settled\n  one from `onDrop`'s `allPositions`.\n- **`SortableGrid`, `SortableGridItem`, `useGridSortable`,\n  `useGridSortableList`** — The 2-D sibling: cells reorder the same way, in\n  a real Yoga `flexWrap` grid rather than upstream's absolutely-positioned\n  cells. There is no list-level `onMove`/`onDragStart`/`onDrop`/\n  `onDragging` here, matching upstream's own `SortableGridProps` — wire\n  those on each `SortableGridItem` instead.\n- **`DraggableState`, `ScrollDirection`, `SortableDirection`,\n  `HorizontalScrollDirection`, `GridOrientation`, `GridStrategy`,\n  `GridScrollDirection`** — The enums, unchanged from upstream.\n- **`clamp`, `listToObject`, `objectMove`** — The list-order utilities, as\n  plain functions rather than worklets.\n- **`calculateGridPosition`, `calculateIndexFromRowColumn`,\n  `listToGridObject`, `getGridCellFromCoordinates`, `reorderGridInsert`,\n  `reorderGridSwap`, `calculateGridContentDimensions`,\n  `findItemIdAtIndex`** — The grid utilities, same reasoning: plain\n  functions, not worklets. `getGridCellFromCoordinates` floors onto the\n  cell whose top-left corner is at or before the point, exactly matching\n  upstream's own behaviour.\n- **`SharedValueLike<T>`** — What `SharedValue<T>` degrades to: `{ value:\nT }`, without the worklet crossing. Reads and writes work; they just do\n  not animate.\n\nDeliberately not re-exported: `setPosition`, `setAutoScroll`,\n`setGridPosition`, `setGridAutoScroll`. Upstream exports these as worklet\nhelpers that mutate a `SharedValue` mid-gesture, driven by a UI-thread\ngesture that does not exist here — there is nothing for them to drive. An\napp that imports one of these directly was reaching into upstream's\ninternals; the build failing at that import is the intended outcome.",
  },
  {
    doc: "docs/reference/dnd.md",
    heading: "Differs from react-native-reanimated-dnd",
    text: "The dragged view never moves. GDK carries a `Gtk.WidgetPaintable` of it above\nevery window, with the theme's own cursors and hit-testing against the real\nwidget tree — including widgets React Native never created. Everything below\nfollows from that one fact.",
  },
  {
    doc: "docs/reference/dnd.md",
    heading: "The drag layer",
    text: "A dragged `Draggable`/`SortableItem` escapes any `overflow: hidden` ancestor\nautomatically — not a prop, the same way GDK's own drag icon is not one.\nGDK's icon already escapes any clip in this process's own tree (it is a\ncompositor surface, not a descendant of anything here), but that is only a\ncue at the cursor this process cannot introspect. While a drag is in flight,\na second, non-interactive `Gtk.Picture` showing a live `Gtk.WidgetPaintable`\nof the dragged row is added to a `Gtk.Overlay` wrapped once around each\nwindow's real content, escaping every ancestor's clip the same way any\n`Overlay` child does.\n\nThe original view dims to reduced opacity for the drag's duration — restored\nto whatever it was, not hardcoded — rather than disappearing, the same\npattern `react-native-draggable-flatlist`'s `activeOpacity` and similar\nlibraries use. Because a `Gtk.WidgetPaintable` is a live view of the widget\nit observes, GDK's own drag icon and this overlay copy dim along with the\noriginal — the three are one underlying render.\n\nThe dragged widget itself is never reparented into the overlay: a 100×100\ncard would render at 800×600 under a new parent's own size negotiation, and\nan unmount mid-drag would strand the widget outside the tree React still\nowns. The overlay copy takes no input (`can-target: false`); neither\nhit-testing nor the responder path changes, both still resolve against the\noriginal widget unchanged. See [gestures.md](../gestures.md) for the\nresponder path itself.\n\nZero React renders happen per frame: positioning the overlay copy is two\nwidget property writes (`setMarginStart`/`setMarginTop`) per motion event,\nabout 1.76 µs median.",
  },
  {
    doc: "docs/reference/dnd.md",
    heading: "Prop-by-prop",
    text: "- **`preDragDelay`** — Accepted, ignored. GDK's `gtk-dnd-drag-threshold`\n  already separates a tap from a drag.\n- **`collisionAlgorithm`** — Accepted, ignored. GDK hit-tests the pointer\n  directly; `\"center\"` is the closest of the three algorithms to that.\n- **`requestPositionUpdate()`** — A no-op. Nothing caches a slot\n  rectangle, because GDK re-hit-tests every motion event.\n- **`onLayoutUpdateComplete`** — Accepted, ignored — there is no layout\n  pass to complete.\n- **`itemHeight`, `estimatedItemHeight`, `enableDynamicHeights`,\n  `useFlatList`, `containerHeight`, `containerWidth`** — Accepted, ignored.\n  Yoga lays rows out at their natural height, and the mirror's own\n  `ScrollView` measures its own viewport for autoscroll rather than\n  trusting a hint.\n- **`dragAxis`, `dragBoundsRef`, `animationFunction`** — **Unsupported.**\n  All three describe where the dragged view goes, and it never goes\n  anywhere here. Kept in the type so a file shared with iOS and Android\n  still compiles.\n- **`dropAlignment`, `dropOffset`** — **Unsupported**, same reason.\n- **`positions`, `lowerBound`/`leftBound`,\n  `autoScrollDirection`/`autoScrollHorizontalDirection`, `itemHeights`** —\n  Real `{ value }` boxes (`SharedValueLike`), not `SharedValue`.\n  Forwarding them with `{...rest}` works, reads work;\n  `autoScrollDirection`/`autoScrollHorizontalDirection` are genuinely\n  written by the built-in autoscroll (below), the rest do not animate.\n- **`SortableDirection.Horizontal`, `useHorizontalSortable`,\n  `useHorizontalSortableList`** — Implemented. Reorder-by-crossing does\n  not care which axis a list scrolls along — the tracked position reads\n  whichever coordinate the axis cares about — so this is\n  `Sortable`/`useSortable`'s own machinery with a horizontal `ScrollView`\n  and `leftBound`/`autoScrollHorizontalDirection` plumbing, not a second\n  implementation. `gap`/`paddingHorizontal` are real Yoga layout on the\n  content container, not hints.\n- **`SortableGrid`, `SortableGridItem`, `useGridSortable`,\n  `useGridSortableList`** — Implemented. The grid is a real Yoga\n  `flexWrap` layout — fixed-size cells, a fixed cross-axis dimension\n  (`columns`/`rows` × `itemWidth`/`itemHeight`) — rather than upstream's\n  absolutely-positioned cells at a `useAnimatedStyle`-computed `top`/\n  `left`; the same row/column arithmetic (`calculateGridPosition`) places\n  them, a different engine paints it. `getGridCellFromCoordinates` floors\n  onto the cell whose top-left corner is at or before a point, exactly\n  matching upstream. `SortableGridItem`'s `isBeingRemoved` removal\n  animation is accepted and ignored, same reason as `animationFunction`\n  above. `scrollEnabled` is accepted and ignored too — this platform's\n  `ScrollView` has no prop to disable input the way upstream's does.\n- **Autoscroll near a container edge during a drag** — Implemented for\n  `Sortable` and `SortableGrid`: a `GtkDropControllerMotion` on the list's\n  own viewport reports how close the drag sits to an edge, and a\n  `Gtk.Widget` tick callback nudges the real `GtkAdjustment` toward it for\n  as long as it stays there — an imperative per-frame write, no React\n  render either way. One difference from upstream: the scroll runs at a\n  constant speed while the edge band is occupied, rather than easing into\n  a 1500ms glide, because there is no timing engine here to ease with. Not\n  wired into the standalone\n  `useSortableList`/`useHorizontalSortableList`/`useGridSortableList`\n  hooks, which build no `ScrollView` of their own to drive.\n- **Sortable list height** — Rows are in flow layout, so the list is as\n  tall as its rows, not `itemsCount × itemHeight`.",
  },
  {
    doc: "docs/reference/dnd.md",
    heading: "Reorder feel: how a crossing resolves",
    text: "`Sortable`/`SortableGrid` track the dragged item's own rect the same way\nupstream does — `fromIndex * slotSize` plus the pointer's delta since the\ndrag began, reusing the same `GtkDropControllerMotion` the edge-autoscroll\nabove already watches every motion event with.\n\nDiffers from react-native-reanimated-dnd: this mirror resolves which slot\nthe item has landed on by rounding that tracked position rather than\nflooring it — the dragged item's centre against a slot's centre, not its\ntop-left corner against the slot's origin — symmetrically in both\ndirections. Measured with a real pointer, a 100px row or cell needs about\n50–60px of travel either way — away from index 0 or toward it, a centre grab\nor an edge grab — before the crossing resolves.\n\nThe real, unaliased `react-native-reanimated-dnd` package's own arithmetic\nfloors the dragged rect onto a slot boundary from its top-left corner\ninstead: crossing a neighbour toward index 0 takes about one pixel of\ntravel there, crossing one away from it takes the neighbour's entire size in\nthat axis. That asymmetry is upstream's own behaviour, reproduced unchanged\nwhen an app opts out of the mirror and runs the real package — not a\ncompat-surface distortion this platform introduces.\n\nThe origin the tracking measures against is the drag's own grab point,\nconverted to the list's container coordinates — never the first motion\nsample after a drag begins, since under fast pointer motion that sample can\nalready be displaced past GDK's own drag-start threshold, which would\nsilently undercount every reading taken from it. The change is scoped to\n`Sortable`/`SortableGrid`'s own reorder mechanism; `Draggable`/`Droppable`'s\ndrop-zone hit-testing is untouched and still GDK's own — `collisionAlgorithm`\nstays accepted-and-ignored there, as above.\n\nPer-motion-event cost of the tracking arithmetic itself is about 0.003 µs\nmedian (settling from about 0.01 µs on the first JIT round) — pure\narithmetic, no FFI hop — next to the drag layer's own roughly 1.76 µs for\nits two real GTK property writes per motion event.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "GestureHandlerRootView",
    text: "`GestureHandlerRootView` renders a `View` with `style ?? { flex: 1 }` — the\nsame default upstream's three platform implementations agree on. An explicit\n`style` prop **replaces** the default box rather than merging with it: an app\nthat passes `style={{ height: 100 }}` gets a 100px box with no `flex`, not a\nflexing one with a height added on top.\n\nUpstream's root view has a second job — marking the subtree as\ngesture-arbitrating — that this platform does not need to reproduce: the\nresponder system's lock is already global, so there is no scope for a\nprovider to draw. `GestureHandlerRootView` is therefore a plain layout box,\nfaithful to upstream's rendered output, with nothing else attached to it.\n\nAn app places one at the root of its tree, as upstream's own documentation\nrecommends, so that anything relying on the default `flex: 1` to fill the\nscreen has it.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "GestureDetector",
    text: "![The gallery's Gesture detector section: Pan, Tap and LongPress recognizers configured with activateAfterLongPress, activeOffset/failOffset, hitSlop and numberOfTaps.](../shots/gallery/gesture-detector.png)\n\n`GestureDetector` renders exactly one child and adds no widget of its own. It\nreaches the child's underlying GTK widget through the same ref-forwarding\nseam `createAnimatedComponent` uses, and merges its recognizer's responder\nprops into the child's own — a child with its own `onTouchStart` keeps\nworking alongside the gesture. Passing a fragment, a string, or more than one\nchild throws, naming the requirement, because there is nothing for a second\nwidget to attach to. Passing something that is not a gesture spec — not built\nwith `Gesture.*()`, a hook, or a composer — throws as well, naming the\nmethods that do produce one.\n\nIf the child does not forward a ref to a widget-backed component at all — an\nopaque wrapper that renders, say, an `Animated.View` internally without\nforwarding its own ref or unknown props onto it — `GestureDetector` falls\nback to a context-based attachment instead: one of this platform's own\ncomponents mounted somewhere inside that child can claim the gesture on its\nown widget. This exists because `react-native-sortables`' v3 gesture-handler\nintegration hands `GestureDetector` exactly such a wrapper.\n\n`hitSlop`, `shouldCancelWhenOutside`, and the `x`/`y` fields on every payload\nare all measured against the gesture's own view — which is why the widget\nstill matters even though no event travels through it directly.\n\n`userSelect`, `touchAction` and `enableContextMenu` are accepted and ignored:\nthey are Web-only upstream (no text selection to suppress, no CSS\n`touch-action`, no context-menu default to cancel on this platform), and\naccepting them keeps source that targets several platforms portable.\n\nA native ancestor further up the widget tree that steals the interaction\nmid-drag — a `ScrollView` above a `GestureDetector`, for instance — reports as\na cancellation to every recognizer built on it: `onEnd`/`onFinalize` fire with\n`success: false`, not a clean ending. The responder system tells a theft\n(GTK denies the claim) apart from an ordinary release by watching for the\n`->DENIED` transition on the GTK sequence and routing it to the cancel path\nrather than the release path.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Recognizers",
    text: "All ten recognizers run on one shared state machine — `UNDETERMINED` →\n`BEGAN` → (`ACTIVE` → `END`) or `FAILED`/`CANCELLED` — with the difference\nbetween kinds being which predicates the machine evaluates and which\ncallbacks are offered. `Tap` and `LongPress`, for example, are the same\nmachine as `Pan` with different predicates over the same event stream and the\nsame grant channel.\n\nEvery recognizer has two spellings: the chainable builder (`Gesture.Pan()`,\ndeprecated upstream since 3.1.0 but still what most shipped consumers call)\nand a hook (`usePanGesture()`, the spelling upstream is migrating to). Both\nproduce the same internal gesture spec; neither is a second implementation.\n\n| Recognizer | Builder                | Hook                         | Input it needs      | Reports travel (`onUpdate`/`onChange`) |\n| ---------- | ---------------------- | ---------------------------- | ------------------- | -------------------------------------- |\n| Pan        | `Gesture.Pan()`        | `usePanGesture()`            | pointer             | yes                                    |\n| Tap        | `Gesture.Tap()`        | `useTapGesture()`            | pointer             | no                                     |\n| LongPress  | `Gesture.LongPress()`  | `useLongPressGesture()`      | pointer             | no                                     |\n| Native     | `Gesture.Native()`     | `useNativeGesture()`         | pointer             | yes                                    |\n| Pinch      | `Gesture.Pinch()`      | `usePinchGesture()`          | touchpad            | yes                                    |\n| Rotation   | `Gesture.Rotation()`   | `useRotationGesture()`       | touchpad            | yes                                    |\n| Fling      | `Gesture.Fling()`      | `useFlingGesture()`          | pointer             | no                                     |\n| Manual     | `Gesture.Manual()`     | `useManualGesture()`         | pointer             | yes                                    |\n| Hover      | `Gesture.Hover()`      | `useHoverGesture()`          | pointer (no button) | yes                                    |\n| ForceTouch | `Gesture.ForceTouch()` | — (upstream has none either) | stylus              | yes                                    |\n\nPinch and Rotation are driven by a touchpad rather than by the pointer, and\nForceTouch is driven by a stylus — see\n[the recognizers that need other hardware](#pinch-and-rotation--the-two-that-need-a-touchpad)\nbelow. Every other kind runs on the ordinary pointer stream.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "One pointer, not multiple touches",
    text: "There is exactly one pointer on this platform, and every payload's\n`pointerType` reads `MOUSE` except on `ForceTouch`, which reads `STYLUS` — the\nonly kind whose reading is honestly not a mouse. The responder system\nfabricates one touch per pointer and has no virtual-touch protocol to draw a\nsecond contact point from. `minPointers(2)`, `numberOfPointers(2)`, and every\nother multi-pointer configuration are therefore honestly unreachable: those\nrecognizers simply never activate, rather than silently behaving as if a\nsingle finger satisfied a two-finger requirement.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Common configuration and callbacks",
    text: "Every recognizer accepts:\n\n| Option                          | Effect                                                                                                                                                                                                                            |\n| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `enabled`                       | Turns the recognizer on or off.                                                                                                                                                                                                   |\n| `hitSlop`                       | Extra area a press still counts in, in RNGH's spelling — a plain number, or a per-edge object. Unlike a `View`'s own `hitSlop`, a negative number **shrinks** the area, and `{ left: 0, width: 32 }` anchors a strip to one edge. |\n| `shouldCancelWhenOutside`       | Whether wandering off the view cancels the gesture. Defaults differ per kind — noted in each section below.                                                                                                                       |\n| `manualActivation`              | Only an explicit `GestureStateManager`/`.activate()` call can activate the gesture; the ordinary predicate is not enough on its own.                                                                                              |\n| `withRef()` / a raw handler tag | Names this gesture for a relation written on another one.                                                                                                                                                                         |\n| `withTestId()` / `testID`       | A label carried on the config for introspection.                                                                                                                                                                                  |\n\nAnd the callbacks:\n\n| Callback                                                                                  | Fires                                                         |\n| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |\n| `onBegin`                                                                                 | Entering `BEGAN`.                                             |\n| `onStart` (`onActivate` in the hook spelling)                                             | Entering `ACTIVE`.                                            |\n| `onUpdate`, `onChange`                                                                    | On travel — continuous kinds only; see the per-kind sections. |\n| `onEnd` (`onDeactivate`)                                                                  | Leaving `ACTIVE`/`BEGAN` for `END` or a cancellation.         |\n| `onFinalize`                                                                              | Always last, whatever the outcome.                            |\n| `onTouchesDown`, `onTouchesMove`, `onTouchesUp`, `onTouchesCancelled` (`onTouchesCancel`) | Raw touch data, independent of the recognizer's own state.    |\n\nThe builder spelling's ending callbacks take `(event, success)`; the hook\nspelling instead reads a `canceled` field off one event argument, and has no\n`onChange` at all — `changeX`/`changeY` are always present on the update\npayload. `Tap`, `LongPress` and `Fling` are discrete and offer no\n`onUpdate`/`onChange` in either spelling: a gesture with no travel to report\nhas nothing for those callbacks to carry.\n\n`runOnJS` is accepted and does nothing: it asks for the JS runtime, and there\nis exactly one runtime here, so every callback already runs where it is\nasking. `averageTouches`, `enableTrackpadTwoFingerGesture`,\n`cancelsTouchesInView`, `activeCursor` and `mouseButton` are accepted and\ninert — each is platform-specific upstream too (Android-only, iOS-only or\nWeb-only respectively), and inert off its own platform there as well.\n\nThe three relation methods — `simultaneousWithExternalGesture`,\n`requireExternalGestureToFail`, `blocksExternalGesture` — are covered in\n[Cross-gesture relations](#cross-gesture-relations).",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Pan",
    text: "| Option                                                            | Effect                                                                                                                                                                                                                          |\n| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `activeOffsetX` / `activeOffsetY` / `failOffsetX` / `failOffsetY` | A single number is directional by its sign — `activeOffsetX(20)` bounds only the positive side. Failure is tested with strict comparisons where activation uses non-strict ones, so a translation exactly on a bound activates. |\n| `minDistance`                                                     | Defaults to 10, unless an `activeOffset*` or `minVelocity*` option is set — then distance stops applying and those are the criteria instead.                                                                                    |\n| `minVelocity`, `minVelocityX`, `minVelocityY`                     | Velocity thresholds, in addition to or instead of distance.                                                                                                                                                                     |\n| `minPointers`, `maxPointers`                                      | Pointer-count bounds — see [One pointer, not multiple touches](#one-pointer-not-multiple-touches).                                                                                                                              |\n| `activateAfterLongPress`                                          | Activates on a timer rather than on the next pointer movement. `0` (the default) means no hold at all.                                                                                                                          |\n\n`translationX`/`translationY` are measured from the point of activation, not\nfrom the press — a fresh grab always starts at zero, which is why an app\ncapturing a running offset does so in `onStart` rather than by reading the\ntranslation directly (see the example at the top of this page).\n`velocityX`/`velocityY` are the last inter-event delta, not a smoothed\nfigure — see [the fling deviation](#fling) below, which reads the same\nnumber.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Tap",
    text: "`Tap` activates on the **release**, not on the press, so the interaction stays\navailable to anything else watching the same pointer while a tap is still\nbeing decided — it never holds the responder until the instant it wins.\n\n| Option                    | Effect                                                                                                                                                                          |\n| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `numberOfTaps`            | Taps required. Between them the gesture stays `BEGAN`, holding nothing; `onBegin` fires once for the whole sequence.                                                            |\n| `maxDuration`             | Defaults to 500ms, re-armed on every press of a sequence. A press held past it fails on the timer, pointer still down.                                                          |\n| `maxDelay`                | Defaults to 500ms — how long the next tap may take to arrive before the sequence gives up.                                                                                      |\n| `maxDistance`             | A radius from the press, not a per-axis limit — the tap-vs-drag rule. **Has no default**, matching upstream: an unconfigured tap accepts any travel that stays inside the view. |\n| `maxDeltaX`, `maxDeltaY`  | Per-axis limits, independent of `maxDistance`.                                                                                                                                  |\n| `minPointers`             | Checked against the most pointers the interaction ever had at once. Above 1, see [One pointer, not multiple touches](#one-pointer-not-multiple-touches).                        |\n| `shouldCancelWhenOutside` | On by default, from the constructor. A press that wanders off the view is not a tap on it.                                                                                      |\n\nDiffers from `react-native-gesture-handler`: `useTapGesture()` defaults\n`shouldCancelWhenOutside` to `true` here, matching `Gesture.Tap()`. Upstream's\nown hook forgets to set this default even though its builder and its native\nhandler config both do, so its two spellings disagree with each other; both\nspellings agree here.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "LongPress",
    text: "`LongPress` activates on a **timer**, with the pointer standing still —\nwaiting for the next pointer movement would mean waiting forever for a\npress-and-hold.\n\n| Option                    | Effect                                                                                                                                                                                                                                        |\n| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `minDuration`             | Defaults to 500ms.                                                                                                                                                                                                                            |\n| `maxDistance`             | Defaults to 10, measured from the press for the whole gesture rather than re-based at activation. Travelling past it before the press matures fails the gesture; travelling past it after cancels it, so `onEnd`/`onFinalize` report `false`. |\n| `numberOfPointers`        | Above 1, see [One pointer, not multiple touches](#one-pointer-not-multiple-touches).                                                                                                                                                          |\n| `shouldCancelWhenOutside` | On by default.                                                                                                                                                                                                                                |\n| `event.duration`          | Milliseconds since the press. Upstream carries this on `LongPress` alone; every payload here carries it, since there is one payload type across all ten kinds.                                                                                |\n\nDiffers from `react-native-gesture-handler`: `minDuration(0)` activates on the\nnext tick rather than synchronously inside the press. Nothing observable\ndepends on the difference.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Native",
    text: '`Native` stands for the widget **underneath** the detector — the one\nplatform-specific rule that follows from that is that it never takes the\nresponder. Taking it is what makes this platform claim `CLAIMED` on the GTK\nsequence and suspend kinetic scrolling on every enclosing scrollable, and a\ngesture whose whole meaning is "the native scroller is handling this" cannot\nbe the thing that switches the native scroller off. It reports what happens\nand yields.\n\n| Option                                               | Effect                                                                                                                                                                                                                                                        |\n| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| activation                                           | `BEGAN` on press, `ACTIVE` once the pointer has travelled 15px — where a native scrollable would have started scrolling. A lift before that fails rather than ends.                                                                                           |\n| `shouldActivateOnStart`                              | Takes the gesture on the press itself — the shape for a native view that is a button rather than a scrollable.                                                                                                                                                |\n| `disallowInterruption`, `yieldsToContinuousGestures` | Recorded on the config, for the relation registry to read; neither changes behaviour by itself.                                                                                                                                                               |\n| `shouldCancelWhenOutside`                            | On by default.                                                                                                                                                                                                                                                |\n| the callbacks                                        | All present; `Native` is continuous, so it reports `onUpdate`/`onChange` travel like `Pan`. They arrive from the touch props (which fire regardless of responder status) rather than from the responder move event, since `Native` never holds the responder. |\n| a sequence taken away mid-drag                       | Reported as a cancellation — see [the ancestor-steals-the-sequence note](#gesturedetector) above.                                                                                                                                                             |',
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Pinch and Rotation — the two that need a touchpad",
    text: "![The gallery's Pinch and rotation section: Gesture.Pinch() and Gesture.Rotation(), both driven by a touchpad.](../shots/gallery/gesture-pinch.png)\n\nBoth are driven by a touchpad rather than by the pointer: a pinch is not a\npointer event, it is a conclusion libinput draws from two fingers moving on a\ndevice it has classified as a touchpad, delivered as\n`zwp_pointer_gestures_v1` and turned by GDK into `GDK_TOUCHPAD_PINCH`. `GtkGestureZoom`\nand `GtkGestureRotate` read the scale and the angle directly off that event\nrather than reconstructing them from tracked positions — a more direct path\nthan upstream's own `ScaleGestureDetector`, which tracks two real touches and\nhas no touchpad path of its own. With no touchpad attached, neither gesture\never begins; a mouse cannot produce the input either recognizer needs.\n\nRecognition and arbitration are otherwise unchanged: the same state machine,\nthe same callbacks, the same relation maps, the same broadcast cancel as\nevery other kind. `Gesture.Simultaneous(pinch, rotation)` behaves exactly like\n`Gesture.Simultaneous(pan, tap)`; without a relation, a `Pinch` and a\n`Rotation` race and cancel each other like any other two gestures would.\n\n```tsx\nconst scale = useSharedValue(1)\nconst angle = useSharedValue(0)\n\nconst pinch = Gesture.Pinch().onUpdate((event) => {\n  scale.value = event.scale // 1 at the start, cumulative, >1 for a spread\n})\nconst rotation = Gesture.Rotation().onUpdate((event) => {\n  angle.value = event.rotation // radians since the start, positive clockwise\n})\n\n;<GestureDetector gesture={Gesture.Simultaneous(pinch, rotation)}>\n  <Animated.View style={animatedStyle} />\n</GestureDetector>\n```\n\nNeither recognizer has any configuration of its own beyond what every kind\nshares — matching upstream, where `PinchGesture` and `RotationGesture` add\nzero builder methods over their common base.\n\n| Field                                              | Value                                                                                                                                         |\n| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |\n| `event.scale`                                      | Cumulative and multiplicative, 1 at the start of the gesture, and not re-based when it activates.                                             |\n| `event.scaleChange`                                | A ratio (scale composes by multiplication) — the `scale` itself on the first update.                                                          |\n| `event.rotation`                                   | Radians since the start of the gesture, positive clockwise.                                                                                   |\n| `event.rotationChange`                             | A difference in radians.                                                                                                                      |\n| `event.focalX`/`focalY`, `event.anchorX`/`anchorY` | In the gesture view's own coordinates; `absoluteX`/`absoluteY` carry the same point in window coordinates.                                    |\n| `event.velocity`                                   | Per second — scale-per-second for `Pinch`, radians-per-second for `Rotation`. See the deviation note below.                                   |\n| activation                                         | `Rotation` at 5° of accumulated rotation (upstream's own threshold). `Pinch` at 5% of accumulated scale change.                               |\n| `shouldCancelWhenOutside`                          | Off by default — a pinch is not addressed to a point the way a tap is, so a focal point drifting off the view mid-gesture does not cancel it. |\n| the `onTouches*` callbacks                         | Accepted, and never fire — there is no touch sequence behind a touchpad gesture, matching upstream's own behaviour on a trackpad.             |\n| pinch-specific / rotation-specific config          | None, upstream included.                                                                                                                      |\n\nDiffers from `react-native-gesture-handler`, in two places, both named\nexplicitly rather than silently reproduced:\n\n- **Velocity units.** `event.velocity` is computed per second here, which is\n  what upstream's own documentation promises but not what either of its web\n  handlers actually computes: `PinchGestureHandler` divides by a millisecond\n  delta and never by 1000 (a thousand times too small), and\n  `RotationGestureDetector`'s time delta is an addition of two timestamps\n  rather than a subtraction, which is not a velocity at all. There is no\n  single correct upstream number to reproduce, so the documented unit is what\n  ships.\n- **Pinch's activation threshold.** `Pinch` activates at 5% of accumulated\n  scale change. Upstream activates after two stages of pixel arithmetic — 30px\n  of span change, then a further 15px — which has nothing to measure here: a\n  touchpad pinch arrives as a ratio, with no pixel span anywhere in the chain.\n  A percentage is the restatement, and a small one is the correct scale for\n  it, because libinput has already decided the two fingers are pinching rather\n  than scrolling before GTK ever sees the event — upstream's own threshold is\n  the first such decision in its pipeline, this one is a second, smaller gate\n  after that decision has already been made elsewhere.\n\nBoth gestures need a real touchpad and a compositor with a libinput backend to\nobserve; the headless compositor this project's own test suite runs against\nhas neither, so both are verified with a virtual touchpad device instead of\ninside that suite.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Fling",
    text: "The distinguishing fact about a fling is that it is a velocity predicate, not\na distance one — a slow drag can travel exactly as far as a fast flick.\n\n| Option / rule      | Value                                                                                                                                                                                                           |\n| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `direction`        | A bitmask of `Directions`, defaulting to `Directions.RIGHT`. Setting two axis bits also opens the diagonal between them, with a wider cone — `UP \\| RIGHT` accepts a 45° flick that neither axis accepts alone. |\n| the cones          | 30° around each axis (±15°), 60° around each diagonal (±30°) — tiling the circle exactly, matching upstream.                                                                                                    |\n| `minVelocity`      | 700 units per second, compared strictly. Not configurable, upstream included.                                                                                                                                   |\n| the deadline       | 800ms from the press. A press that has not flung by then fails, whatever it is doing.                                                                                                                           |\n| `numberOfPointers` | Compared for equality against the most pointers the interaction ever had — see [One pointer, not multiple touches](#one-pointer-not-multiple-touches).                                                          |\n| when it decides    | On every move, not on release — the instant the pointer is fast enough and pointed the right way, button still down. The release is only the last chance.                                                       |\n| the progression    | `BEGAN` → `ACTIVE` → `END` in one synchronous step, with no `onUpdate` ever — a fling is discrete.                                                                                                              |\n\nDiffers from `react-native-gesture-handler`: `velocityX`/`velocityY` are the\nlast inter-event delta, the same number `Pan().minVelocity()` reads, rather\nthan upstream's least-squares fit over up to 20 samples inside a 300ms\nhorizon. A fling here is more sensitive to a single long frame than\nupstream's smoothed figure; the deadline and the cone are unaffected.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Manual",
    text: "No configuration of its own, in either spelling — matching upstream, where\n`ManualGesture` adds zero builder methods. It begins on the press and decides\nnothing on its own: the `GestureStateManager` handed to\n`onTouchesDown`/`onTouchesMove`/`onTouchesUp`/`onTouchesCancel` is the whole\nAPI.\n\n| Method        | Transition                                                                                                                                                                                     |\n| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `.begin()`    | `UNDETERMINED` → `BEGAN`.                                                                                                                                                                      |\n| `.activate()` | `BEGAN` → `ACTIVE`, through the ordinary arbitration — a request, not a decision: it can come back parked behind `requireExternalGestureToFail`, or cancelled. Forced past `manualActivation`. |\n| `.end()`      | `BEGAN` or `ACTIVE` → `END`, successfully.                                                                                                                                                     |\n| `.fail()`     | `BEGAN` or `ACTIVE` → `FAILED`.                                                                                                                                                                |\n\nDiffers from `react-native-gesture-handler`: upstream's documentation states\nthat `Manual` does not end when the pointers lift. Half of that holds here —\na `Manual` still `BEGAN` when the pointer comes up stays `BEGAN`, holding\nnothing. The other half does not: an `ACTIVE` `Manual` here is holding an\ninteraction — the responder lock, the GTK sequence, suspended scrollers — and\nthat interaction ends when the pointer does. Staying `ACTIVE` past it would\nmean holding a lock that no longer exists and never reporting an ending at\nall, so an `ACTIVE` `Manual` ends, successfully, with the interaction.\n`onTouchesUp` fires first and carries the state manager, for an app that wants\na different ending to write it in.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Hover",
    text: "Driven by the same GTK motion controller `Pressable` uses for its `hovered`\nstate. It goes straight to `ACTIVE` on the pointer crossing in, with no\nthreshold at all, reports `x`/`y` in the gesture view's own coordinates while\nthe pointer moves inside, and ends — not cancels — when the pointer leaves.\n\n| Option                      | Effect                                                                                                 |\n| --------------------------- | ------------------------------------------------------------------------------------------------------ |\n| `.effect()` / `hoverEffect` | Accepted, inert — iOS's own pointer effect; upstream's web handler never branches on it either.        |\n| `hitSlop`, `enabled`        | As for every other kind, including the shrinking (negative) form of `hitSlop`.                         |\n| the callbacks               | `Hover` is continuous, so `onUpdate`/`onChange` report travel and `changeX`/`changeY` carry the delta. |\n| `mouseButton`               | Inert for this kind, matching upstream: hover never consults a button.                                 |\n\nA hover never takes the responder — there is no press to start an interaction\nwith, so there is no session to claim. That means a hover cannot exclude a\npress by itself, and mutual exclusion is still the default: a hover crossing\nin while a `Pan` on another view is still `BEGAN` cancels that pan, matching\nupstream's own behaviour. Declaring `simultaneousWithExternalGesture` (or\ncomposing with `Gesture.Simultaneous()`) between a hover and anything sharing\nits screen avoids that, the same way upstream's own `Pressable` sets\n`manualActivation` on its internal hover recognizer to stop it blocking a\nnative gesture.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "ForceTouch",
    text: "Upstream does not implement `ForceTouch` off iOS at all, so there is no web\nbehaviour to match — the semantics below come from its documented contract.\n\n| Option                 | Effect                                                                                                                                            |\n| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `minForce`             | Defaults to 0.2, upstream's documented default. Non-strict at the bound, like every other activation threshold here.                              |\n| `maxForce`             | A ceiling that fails the gesture before activation and cancels it after — the same shape `LongPress`'s `maxDistance` has. Unset means no ceiling. |\n| `feedbackOnActivation` | Accepted, inert — there is no haptic device on this platform.                                                                                     |\n| `force`, `forceChange` | On every payload. `forceChange` is a difference (the force itself on the first update).                                                           |\n| `pointerType`          | Always `STYLUS` for this kind — the only one that is not `MOUSE`, since a pressure reading can only have come from a tablet tool.                 |\n\n`ForceTouch` has no hook counterpart in either implementation — upstream's own\nhook tree has nine directories and no `forceTouch`, so `Gesture.ForceTouch()`\nis the whole API upstream offers for it, and the whole API offered here.\n\nIt is driven by `GtkGestureStylus`, whose pressure axis arrives already\nnormalised to `[0, 1]` — upstream's documented range, so nothing is rescaled.\nThe controller is stylus-only by default, so **a mouse produces no events for\nit at all**: that is deliberate, and it is what keeps a `ForceTouch` from\nactivating at pressure 0 on a machine with no drawing tablet. Verifying the\nfull chain end to end needs a real or virtual stylus device; the headless\ncompositor this project's test suite runs against enumerates none.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Gesture composition",
    text: "`Gesture.Race()`, `Gesture.Simultaneous()` and `Gesture.Exclusive()` (and\ntheir hook equivalents `useCompetingGestures()`, `useSimultaneousGestures()`\nand `useExclusiveGestures()`) are list-builders over the three relation maps\ndescribed in [Cross-gesture relations](#cross-gesture-relations), with no\nmechanism of their own:\n\n- `Race` adds no relation at all — racing is what happens without one.\n- `Simultaneous` is a pairwise fill of the simultaneous-handlers map.\n- `Exclusive` is a chain fill of the wait-for map, where every group waits for\n  every group before it. A nested `Exclusive` inside a `Simultaneous` stays\n  exclusive.\n\nA single `GestureDetector` may hold a composition. It mounts every recognizer\nthe composition contains onto the one child, and still adds no widget.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "Cross-gesture relations",
    text: "![The gallery's Gesture relations section: Gesture.Native() over a ScrollView, simultaneousWithExternalGesture, and requireExternalGestureToFail.](../shots/gallery/gesture-relations.png)\n\n| Relation                                                                   | Means                                   |\n| -------------------------------------------------------------------------- | --------------------------------------- |\n| `requireExternalGestureToFail(other)` — hook config: `requireToFail`       | This gesture waits for `other` to fail. |\n| `simultaneousWithExternalGesture(other)` — hook config: `simultaneousWith` | Both may be `ACTIVE` at once.           |\n| `blocksExternalGesture(other)` — hook config: `block`                      | `other` waits for **this** one.         |\n\nA relation names the other gesture with the gesture object itself, a\n`withRef()` handle to it, or a raw handler tag. The gesture object built by\neither spelling is rebuilt on every render, so a relation should point at a\nmemoized object (`useMemo`, a ref, or a context value) — a relation written\nagainst a stale object of a gesture that has since been rebuilt cannot be\nresolved. Upstream has the same constraint.\n\n```tsx\nconst scroll = Gesture.Pan().activeOffsetX([-10, 10]).failOffsetY([-25, 25])\n\nconst sheet = Gesture.Pan()\n  .activeOffsetY([-10, 10])\n  // Held in BEGAN — taking nothing, claiming nothing — until `scroll` fails.\n  .requireExternalGestureToFail(scroll)\n```\n\n**Two locks, at two levels, deliberately not merged.** The responder lock\nkeeps its one job: one interaction belongs to React Native, one holder, one\nirrevocable claim on the source. Gesture arbitration is a second, JS-only\nregistry that never talks to GTK — every relation resolves before anything is\nclaimed. The consequences:\n\n- `Simultaneous` really means two `ACTIVE` gestures, each getting its own\n  `onStart`/`onUpdate`/`onEnd` for the same pointer — while exactly one\n  responder is claimed. The gesture that did not win the responder lock is\n  driven from the touch props, which fire regardless of responder status; the\n  holder reads the responder-move event.\n- Mutual exclusion is the default. Without a relation, the first gesture to\n  activate cancels every other gesture watching the same interaction. A\n  gesture that is already `ACTIVE`, or parked waiting for another, is\n  cancelled by nothing except an active `Gesture.Native()` — which is why\n  `Native` is treated as special rather than as just another recognizer.\n- `END` and `FAILED` are not the same release for a parked gesture: one\n  waiting on another is released when that one fails or is cancelled, and\n  **cancelled** when it ends — the thing it was deferring to actually\n  happened, so its own turn never comes.\n\nTwo responder roots that nest — an island mounted inside another island's\nview — are one GTK widget chain, so both gestures share one interaction path\nand every relation behaves as it would inside a single root. Two roots that\nare disjoint — separate windows, or sibling islands — can never have both\ngestures live in one interaction at once: a relation between them is\nexpressible and resolves to a real handler tag, it simply never has an\noccasion to apply, and it neither errors nor warns.\n`requireExternalGestureToFail` across disjoint roots does not deadlock for the\nsame reason: parking only ever happens against a gesture that is live in the\ninteraction under way, so a gesture in another root is never waited for.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "GestureStateManager",
    text: "`GestureStateManager.activate(handlerTag)`, `.fail(handlerTag)` and\n`.deactivate(handlerTag)` are standalone functions, keyed by a numeric handler\ntag rather than by a gesture object — the shape `react-native-gesture-handler`\n3.1.0 itself exports under this name (its older `.create(tag)` factory survives\nonly as a type, with no runtime value).\n\nEach call looks the tag up in a registry populated the instant a\n`GestureDetector` mints a handler tag for a mounted recognizer, and forgotten\nthe instant that detector unmounts, then routes to the same state-manager\nobject `Gesture.Manual()`'s own `onTouchesDown`/`onTouchesMove`/`onTouchesUp`/\n`onTouchesCancel` callbacks already receive — the same machinery, the same\narbitration loop, nothing built twice.\n\n| Method                    | Effect                                                                                      |\n| ------------------------- | ------------------------------------------------------------------------------------------- |\n| `.activate(handlerTag)`   | `BEGAN` → `ACTIVE` on the recognizer that tag names, through the ordinary arbitration loop. |\n| `.fail(handlerTag)`       | `BEGAN` or `ACTIVE` → `FAILED`.                                                             |\n| `.deactivate(handlerTag)` | `BEGAN` or `ACTIVE` → `END`, successfully — upstream's other name for the same transition.  |\n| an unknown tag            | A no-op, with a development-mode warning.                                                   |\n\nDiffers from `react-native-gesture-handler`: a tag naming no mounted\nrecognizer — never minted, or already unmounted — does not throw. It is a\nno-op, warned in development rather than in production, which is not\nupstream's own shape (a native lookup miss) but the closest match available:\nloud without being fatal, matching the same no-op a gesture's own state\nmachine already gives an out-of-order call.\n\n`react-native-sortables`' own v3 gesture-handler adapter calls\n`GestureStateManager.activate(event.handlerTag)` from its own\n`onTouchesMove`, reading only the numeric tag off the event — the ordinary\npath for any drag using that library, not an edge case.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "State, Directions and the other enums",
    text: "| Export        | Values                                                                             | Used for                                                                                                                                                                               |\n| ------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `State`       | `UNDETERMINED` 0, `FAILED` 1, `BEGAN` 2, `CANCELLED` 3, `ACTIVE` 4, `END` 5        | Every payload's `state`/`oldState` fields, so `state === State.ACTIVE` is ordinary, correct code.                                                                                      |\n| `Directions`  | `RIGHT` 1, `LEFT` 2, `UP` 4, `DOWN` 8 — a bitmask                                  | `Gesture.Fling().direction()`. Four diagonal combinations exist by OR-ing two axis bits together (`UP \\| RIGHT`, and so on) but are not named on the public object, matching upstream. |\n| `PointerType` | `TOUCH` 0, `STYLUS` 1, `MOUSE` 2, `KEY` 3, `OTHER` 4                               | Every payload's `pointerType`. Only `MOUSE` and `STYLUS` are ever actually reported on this platform.                                                                                  |\n| `HoverEffect` | `NONE` 0, `LIFT` 1, `HIGHLIGHT` 2                                                  | `.effect()`/`hoverEffect` on `Gesture.Hover()`. Inert — iOS's own pointer effect, inert in upstream's own web handler too.                                                             |\n| `MouseButton` | `LEFT` 1, `RIGHT` 2, `MIDDLE` 4, `BUTTON_4` 8, `BUTTON_5` 16, `ALL` 31 — a bitmask | `.mouseButton()`. Inert, matching upstream off Web.                                                                                                                                    |\n\n`HoverEffect` and `MouseButton` are exported as real data even though they are\ninert on this platform, for the same reason their knobs are accepted rather\nthan refused: both are already accepted-and-inert configuration, and a knob\nthat accepts a number while refusing the named constant for that number would\nbe incoherent. Every value in all five enums is pinned against\n`react-native-gesture-handler` 3.1.0's own source numbers.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "The re-exported components",
    text: "`ScrollView`, `FlatList`, `TextInput`, `Switch`, `Pressable`,\n`TouchableOpacity`, `TouchableHighlight` and `TouchableWithoutFeedback` are\nre-exported under RNGH's names as this platform's own components, unwrapped.\n\nUpstream builds each of these with\n`createNativeWrapper(RN.X, { disallowInterruption: true, shouldCancelWhenOutside: false })`\n— attaching a `NativeViewGestureHandler` so that its own arbitration knows\nabout the native scrolling or the native press underneath. On this platform\nthe responder system already **is** that arbitration: every one of these\ncomponents already speaks it, and `Gesture.Native()` is how an app declares a\ngesture over one of them explicitly when it needs to. The wrapper has nothing\nto add here, so the honest re-export is the component itself.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "What is not implemented",
    text: 'Every export listed below throws when used — on call, on render, or on\nproperty access, naming itself — rather than silently rendering its children\nwithout gestures attached. An import this subpath does not list at all fails\nearlier still, at bundle time, with the bundler\'s own "no export named X".',
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "The legacy handler-component API (RNGH 1.x)",
    text: "`FlingGestureHandler`, `ForceTouchGestureHandler`, `LongPressGestureHandler`,\n`NativeViewGestureHandler`, `PanGestureHandler`, `PinchGestureHandler`,\n`RotationGestureHandler`, `TapGestureHandler` and `legacy_createNativeWrapper`\nall throw, naming themselves.\n\nThese are RNGH's 1.x component API —\n`<PanGestureHandler onGestureEvent={...}><View/></PanGestureHandler>`, with\nits own `onGestureEvent`/`onHandlerStateChange` event shape, its own\n`enabled`/`waitFor` prop plumbing and its own `createHandler` HOC — which\nupstream deprecated years before it deprecated the builder spelling. The\nbuilder (`Gesture.Pan()` and its siblings) and the hook spelling\n(`usePanGesture()` and its siblings) are the two spellings implemented here,\nwhich is one more than upstream itself still recommends.\n`legacy_createNativeWrapper(Component, config)` attaches a\n`NativeViewGestureHandler` to an arbitrary component; it has nothing to add on\nthis platform for the same reason the re-exported components above do not\nneed it — the responder system is already the arbitration it would register\nwith.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "The native button family",
    text: "`BaseButton`, `RawButton`, `RectButton` and `BorderlessButton` all throw,\nnaming themselves.\n\nThese are not RN components with a handler attached — they are RNGH's own\nnative button views, implemented in Java and Objective-C, with an Android\nripple, `rippleColor`/`rippleRadius`, `borderless` drawable selection, an\n`exclusive` group, and an `activeOpacity` applied by the native view rather\nthan by style. No GTK widget has that set of semantics, and there is no way to\nfake the ripple — any implementation would be a `Pressable` wearing another\ncomponent's name.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "RefreshControl, Touchable and TouchableNativeFeedback",
    text: "All three throw, naming themselves.\n\n`TouchableNativeFeedback` is Android's ripple by another name.\n`Touchable` is React Native's own deprecated mixin. `RefreshControl` is\npull-to-refresh, which needs a scroll gesture this platform's `ScrollView`\ndoes not expose and a spinner widget this platform does not have.",
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "The three new-API pieces that don't apply here",
    text: '`GestureDetectorType`, `InterceptingGestureDetector` and\n`VirtualGestureDetector` all throw, naming themselves, for three separate\nreasons:\n\n- **`GestureDetectorType`** is a type upstream, not a value. Type positions\n  never reach this module at all — the alias is a bundler alias, so `tsc`\n  resolves the real package\'s types from `node_modules` — so a runtime value\n  under this name could only be reached by code that has already gone wrong.\n- **`InterceptingGestureDetector`** intercepts events destined for views below\n  it. Doing that here would mean claiming a GTK sequence before deciding\n  whether to keep it, and a claim on this platform is irrevocable — the\n  "intercept, look, maybe give it back" shape has no GTK equivalent.\n- **`VirtualGestureDetector`** drives a gesture with no view at all. The\n  handler-tag registry behind `GestureStateManager` answers "which mounted\n  recognizer does this number mean", not "mint a recognizer with nothing to\n  measure and no widget to attach a controller to" — every recognizer on this\n  platform is still built by a mounted `GestureDetector` wrapping exactly one\n  child.',
  },
  {
    doc: "docs/reference/gesture-handler.md",
    heading: "The 2.x legacy aliases",
    text: "`LegacyScrollView`, `LegacyFlatList`, `LegacyTextInput`, `LegacySwitch`,\n`LegacyPressable`, `LegacyText`, `LegacyRawButton`, `LegacyBaseButton`,\n`LegacyRectButton`, `LegacyBorderlessButton`, `LegacyRefreshControl` and\n`LegacyDrawerLayoutAndroid` all throw, naming themselves.\n\nEach is 3.x's escape hatch back to its 2.x implementation of a component whose\n3.x spelling either already works here under its modern name, or is refused\nabove with its own reason. Where the modern name works, the legacy alias\nwould carry a promise this platform cannot keep — \"this behaves like 2.x\ndid\" — since 2.x's own behaviour was never implemented here to differ from.\nWhere the modern name is refused, the alias inherits that refusal.\n`LegacyDrawerLayoutAndroid` is refused twice over: React Native itself does\nnot ship `DrawerLayoutAndroid` off Android, and `@react-navigation/drawer`\nreaches for `react-native-drawer-layout` instead, which runs on this\nplatform.",
  },
  {
    doc: "docs/reference/globals.md",
    heading: "Already native, nothing to install",
    text: "Node already provides `fetch`/`Headers`/`Request`/`Response`, `Blob`/`File`,\n`WebSocket`, `URL`/`URLSearchParams`, `AbortController`/`AbortSignal`,\n`structuredClone`, `TextEncoder`/`TextDecoder`, `atob`/`btoa`,\n`queueMicrotask`, `setImmediate`/`clearImmediate`, a monotonic `performance`,\n`crypto`, `DOMException`, and `console` (including `group`/`groupCollapsed`/\n`groupEnd`, which RN's own console polyfill only ever adds on a native\nruntime). `FormData` is native too, but not RN-compatible in one specific\nway: it does not understand react-native's own file-entry shape\n(`formData.append('photo', { uri, type, name })`) — an object there is\ncoerced to the literal string `\"[object Object]\"` instead of attaching a\nfile. `XMLHttpRequest` and `FileReader` are not Node-native at all and are\nnot installed by this platform, unlike RN, which installs both\nunconditionally; reach for `fetch` and `Blob`'s own `.text()`/\n`.arrayBuffer()`/`.stream()` instead.",
  },
  {
    doc: "docs/reference/globals.md",
    heading: "Installed for parity",
    text: "Each of these is installed only if nothing already provides it, so an\nexisting global always wins:\n\n- **`window = globalThis`, `self = globalThis`** — the same thing RN's own\n  bootstrap does first. An isomorphic library's `typeof window !==\n\"undefined\"` check — usually meaning \"not a server context, safe to run\n  browser-shaped init\" — reads the same way here as on any other RN\n  platform.\n- **`navigator.product = \"ReactNative\"`** — the ecosystem's standard\n  environment-detection value. Node already ships a minimal `navigator`\n  (`.userAgent` only) from version 21 on; this adds `product` next to it\n  rather than replacing the object, matching RN's own fallback behavior\n  exactly.\n- **`requestIdleCallback`/`cancelIdleCallback`** — the standard web-fallback\n  shape every userland polyfill uses: fires on the next macrotask, reports a\n  fixed 50&nbsp;ms budget through `timeRemaining()`, and `didTimeout` is\n  always `false`. This is \"run this off the current tick, eventually,\" not a\n  real idle-scheduling primitive — code that depends on genuine idle\n  detection should not rely on it.\n- **`global.alert`** — forwards a single string to `Alert.alert('Alert',\ntext)`, against this platform's own `Alert` module (see\n  [APIs](apis.md#alert)).\n- **`ErrorUtils`** — `setGlobalHandler`/`reportError`/`reportFatalError`/\n  `applyWithGuard`/`guard`, a faithful port of RN's own polyfill. The default\n  handler rethrows, exactly RN's un-hooked behavior. Both toolchains provide\n  it, so code that expects `global.ErrorUtils` to exist (which several\n  RN-ecosystem libraries do) finds it either way.\n- **`requestAnimationFrame`/`cancelAnimationFrame`** — installed as globals,\n  not module exports, exactly as RN installs them from its own bootstrap\n  rather than exporting them from `\"react-native\"`. Both ride the same frame\n  clock `Animated` and the Reanimated-compatible surface already share, not a\n  second timer. A call returns an id; the callback receives a monotonic,\n  high-resolution timestamp; a callback requested while a batch is already\n  running lands on the next frame, never the one currently flushing;\n  cancelling is silent, including for an unknown or already-delivered handle;\n  and one callback throwing is reported without stopping its siblings in the\n  same batch. Differs from react-native only in mechanism, not in behavior —\n  there is no native per-platform frame source on a Linux desktop, so this\n  rides the same clock `Animated` runs on, the way the DOM's own\n  `requestAnimationFrame` stands in for it on react-native-web.",
  },
  {
    doc: "docs/reference/globals.md",
    heading: "`__DEV__`",
    text: "Provided by the bundler, not by this module. The vite preset defines it from\nvite's own build mode; the Metro path gets it from the app's own stock\n`@react-native/metro-config` preset, independent of this platform's own\nMetro wrapper.",
  },
  {
    doc: "docs/reference/globals.md",
    heading: "Not installed, by architecture",
    text: "React Native's Fabric-era DOM-compatibility globals — `Node`, `Element`,\n`HTMLElement`, `Document`, `Event`, `EventTarget`, `CustomEvent`,\n`DOMRect(ReadOnly/List)`, `HTMLCollection`, `NodeList` — exist to back\nFabric's DOM-traversal API over its C++ shadow tree. This platform has\nneither Fabric nor a shadow tree of its own — its React reconciler drives\nGTK widgets and the Yoga layout tree directly — so there is no shadow tree\nfor a DOM-shaped facade to expose, and none of these globals are installed.",
  },
  {
    doc: "docs/reference/globals.md",
    heading: "The runtime itself",
    text: 'Every module of npm and Node is available at runtime — `fs`, `sqlite`,\nnative addons — so a "native module" here is written as an ordinary Node\nmodule rather than as platform-specific native code. An RN library whose\nnative side is genuinely iOS/Android code (rather than pure JavaScript) does\nnot run here. The package itself ships compiled — ESM plus `.d.ts` files,\nsources embedded in the maps — and requires Node ≥ 24, the floor both the\ngtkx runtime and the `run-linux` host rely on.',
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Requirements",
    text: 'The package peers optionally on `@react-navigation/native` (v8), which must\nbe installed alongside it.\n\n`@react-navigation/native@8` itself peers on `react-native: "*"` — unlike\n`@react-navigation/core@8`, which declares no `react-native` peer at all. An\napp with no `react-native` package anywhere in its tree (a vite+gtkx app\nwith no Metro side, for example) gets an unmet-peer-dependency warning from\n`npm install` for it. The warning is harmless: react-native-gtkx never\nimports anything from the `react-native` package, so nothing at runtime\nactually needs it present.\n\n`react-native-gtkx/navigation` exports exactly two factories —\n`createStackNavigator` and `createSidebarNavigator` — and the option/prop/\nevent types around them. The rest of the react-navigation surface\n(`useNavigation`, `useRoute`, `useFocusEffect`, `useIsFocused`,\n`useNavigationContainerRef`, `CommonActions`, `StackActions`,\n`usePreventRemove`, `NavigationContainer`, and everything else) comes from\n`@react-navigation/native` directly, not from this package.',
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Window chrome",
    text: "Both navigators' header bars stand in for the window's own title bar, so\nthe app should run with content chrome:\n\n```tsx\nAppRegistry.runApplication(name, { ..., chrome: \"content\" })\n```\n\nRunning with the default system chrome instead doubles the title bar,\nsince the pages already bring their own header bars. In that case, each\nnavigator logs a one-time development warning naming the fix.",
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Stack navigator",
    text: '![The gallery\'s Adwaita stack section: a real Adw.NavigationView push, with a native header-bar back button — the same primitive react-native-gtkx/navigation\'s stack navigator builds on.](../shots/gallery/adwaita-stack.png)\n\n_This demo bypasses react-navigation entirely (its own `useState` router); it\nonly proves the underlying native primitive the stack navigator above is\nbuilt on._\n\n`createStackNavigator()` returns a `Navigator`/`Screen` pair used the same\nway as `@react-navigation/native-stack`\'s:\n\n```tsx\nimport { NavigationContainer } from "@react-navigation/native"\nimport { createStackNavigator } from "react-native-gtkx/navigation"\n\nconst Stack = createStackNavigator()\n\nconst App = () => (\n  <NavigationContainer>\n    <Stack.Navigator>\n      <Stack.Screen\n        name="Home"\n        component={HomeScreen}\n      />\n      <Stack.Screen\n        name="Details"\n        component={DetailsScreen}\n        options={{ title: "Details page" }}\n      />\n    </Stack.Navigator>\n  </NavigationContainer>\n)\n```',
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Screen options",
    text: '- **`title`** (`string`, default: route name) — Header bar title.\n- **`headerShown`** (`boolean`, default `true`) — Shows the header bar for\n  this screen.\n- **`headerButtons`** (`HeaderButton[]`) — Native buttons packed at the end\n  of the header bar, after `headerRight`. Each button is `{ id, icon,\ntooltip, onPress }`; `icon` is an Adwaita symbolic icon name.\n- **`headerLeft`** (`() => ReactNode`) — Content packed at the start of the\n  header bar, in an intrinsic-size layout root — the content\'s own Yoga\n  size is the slot size.\n- **`headerRight`** (`() => ReactNode`) — Content packed at the end of the\n  header bar, before `headerButtons`.\n- **`gestureEnabled`** (`boolean`, default `true`) — `false` disables the\n  native back button, Escape and the back gesture for this screen.\n  Programmatic `goBack` still works; this is also the mechanism behind\n  `usePreventRemove` — a prevented route reports the same disabled state,\n  so no native pop can race react-navigation state, and the route pops\n  once the app lifts the guard.\n- **`animation`** (`string`, default `"default"`) — Differs from\n  react-navigation: GTK has exactly one transition style, so this\n  collapses to a boolean. `"none"` turns transitions off; any other value\n  — including native-stack\'s own style names such as\n  `"slide_from_bottom"` or `"fade"` — turns transitions on and plays the\n  standard Adwaita transition instead of the one requested. A\n  non-`"none"`/`"default"` value still animates (it is not silently\n  treated as `"none"`) and logs a development warning once.\n\n`animation` is a property of the whole view, not a per-page one, so there\nis no per-screen granularity: the value used is read from whichever screen\nis currently on top of the visible stack, recomputed on every navigation.\nSetting it once via `screenOptions` — the same value for every screen — is\nthe reliable way to use it; the per-screen case only matters when\ndifferent screens genuinely disagree, and even then only the active\nscreen\'s value is observed. Interactive swipe-back gestures always animate\nregardless of this setting, an Adwaita behavior that is not overridable\nhere.\n\nWhen `headerShown` is `false`, the screen\'s content fills the page\ndirectly, with no header bar; otherwise it renders inside the header bar\'s\ncontent area. Each screen mounts its own layout root inside the page, so\nthe page\'s content allocation is exactly that screen\'s viewport.\n\nDiffers from react-navigation: a full custom header replacement\n(`@react-navigation/native-stack`\'s `header` option) is not implemented —\n`headerLeft`, `headerRight` and `headerButtons` compose within the\nstandard header bar instead. Deep-link `url` events never fire on\ndesktop; see [`apis.md`](./apis.md) for `Linking`.',
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Transition events",
    text: "The stack navigator emits two events on a screen's `navigation` object,\nmatching `@react-navigation/stack` and `@react-navigation/native-stack`:\n\n- **`transitionStart`** (`{ data: { closing: boolean } }`) — Fires when a\n  push/pop/replace transition starts, once per involved route (not once\n  per gesture or tap). `closing` is `false` for the route becoming\n  visible, `true` for the route leaving the visible stack.\n- **`transitionEnd`** (`{ data: { closing: boolean } }`) — Fires when the\n  transition settles. Tied to `AdwNavigationPage`'s own `shown`/`hidden`\n  signals: it fires on `shown` for the entering screen and on `hidden` for\n  the leaving screen. `transitionDuration` (default 400 ms) is a fallback\n  only, used when a page's own signal never arrives — a signal-less\n  environment, or an intermediate screen skipped entirely by a multi-hop\n  pop. When transitions are not animated, the real signals still fire\n  immediately, so `transitionEnd` is never delayed by the fallback window.\n\nA screen that stays mounted without actually entering or leaving the\nvisible stack — the screen underneath a push, for example — receives\nneither event, matching upstream.\n\nDiffers from react-navigation: native pops (the back button, Escape, the\nback gesture) do not fire either event today. A user-driven pop is\nhandled by the widget itself before the adapter is told about it, so there\nis nothing to hook a `transitionStart` into; only programmatic navigation\n(`navigate`, `goBack`, `dispatch`, …) fires these events.",
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Sidebar navigator",
    text: '`createSidebarNavigator()` is the desktop equivalent of a drawer navigator,\nbuilt on `Adw.NavigationSplitView`: a persistent native sidebar (an\n`AdwActionRow` per screen, in a `GtkListBox` with Adwaita\'s\n`navigation-sidebar` styling) selects between parallel screens — `TabRouter`\nsemantics, not a stack.\n\n```tsx\nimport { createSidebarNavigator } from "react-native-gtkx/navigation"\n\nconst Sidebar = createSidebarNavigator()\n\nconst App = () => (\n  <NavigationContainer>\n    <Sidebar.Navigator sidebarTitle="Mail">\n      <Sidebar.Screen\n        name="Inbox"\n        component={InboxScreen}\n        options={{ icon: "mail-symbolic" }}\n      />\n      <Sidebar.Screen\n        name="Trash"\n        component={TrashScreen}\n        options={{ icon: "user-trash-symbolic" }}\n      />\n    </Sidebar.Navigator>\n  </NavigationContainer>\n)\n```',
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Navigator props",
    text: "- **`sidebarTitle`** (`string`, default `\"Sidebar\"`) — Title of the\n  sidebar pane's header bar.\n- **`headerButtons`** (`HeaderButton[]`) — Buttons packed at the end of the\n  content header bar; a screen's own `headerButtons` option overrides this\n  entirely for that screen.\n- **`sidebarHeaderLeft` / `sidebarHeaderRight`** (`() => ReactNode`) —\n  Content packed at the start/end of the sidebar pane's own header bar —\n  distinct from the content header's `headerLeft`/`headerRight`, which are\n  per-screen options, because one sidebar pane is shared by every screen.\n  Mounted through the same intrinsic content root as the content header,\n  so it lays out as a horizontal, content-hugging cluster flush with\n  natively packed buttons.\n- **`sidebarHeaderTitle`** (`() => ReactNode`) — Replaces the sidebar\n  header bar's title widget (a search entry, a switcher). Left unset,\n  `sidebarTitle` renders as a plain label.\n- **`collapseWidth`** (`number`, sp; unset by default) — Width below which\n  the split view collapses to the sidebar or the content pane alone,\n  through a native `Adw.Breakpoint`. Unset by default: no breakpoint is\n  mounted at all, so an app that never sets this sees no behavior change.\n- **`minWidth` / `minHeight`** (`number`, px; default `360` / `294`) — The\n  narrowest size the sidebar navigator's UI supports, applied to the\n  breakpoint container `collapseWidth` mounts. Ignored when\n  `collapseWidth` is unset, since no container exists then. The default is\n  GNOME's own adaptive floor.\n- **`sidebarContent`** (`(props: SidebarContentProps) => ReactNode`) —\n  Replaces the entire sidebar pane body.\n\n`collapseWidth` is not driven by React state or `useWindowDimensions`: the\nproperty flip happens inside GTK's own allocation pass, at no cost of a\nReact render for the resize itself.\n\nAdwaita cannot measure a breakpoint container on its own — what it holds\nchanges with the breakpoints — so it otherwise reports a minimum size of\nzero and warns that a width/height request must be set. Left at the\ndefault, this is not an issue; an app whose content header bar needs more\nroom than the default (a segmented control as `headerTitle`, for example,\ncosts roughly 110 px on its own and cannot ellipsize the way a plain title\nlabel can) must raise `minWidth`/`minHeight` — measured against the pane's\nown content, not guessed. Setting it too low does not fail loudly: the\nwindow resizes past what the pane can draw, and Adwaita clips the pane\ninstead of adapting it (an `AdwNavigationSplitView exceeds\nAdwBreakpointBin width` message in the system journal, felt as content\nrunning off the edge). The sidebar pane's own width is separately bounded\nbetween 180 and 280 px regardless of `collapseWidth`.",
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Screen options",
    text: '- **`title`** (`string`, default: route name) — Sidebar row and content\n  header bar title.\n- **`icon`** (`string`) — Adwaita symbolic icon name for the row\'s prefix.\n  Ignored when `color` is also set — a row shows a colored dot or an icon,\n  never both.\n- **`color`** (`string`) — CSS color for a colored-dot prefix, replacing\n  `icon`. `color` wins when both are set.\n- **`count`** (`number`) — Badge shown as the row\'s suffix. Hidden when\n  `0` or unset.\n- **`headerLeft` / `headerRight`** (`() => ReactNode`) — Content header bar\n  start/end, per screen — a filter toggle group for a list, a back button\n  plus star/trash for an open item.\n- **`headerTitle`** (`() => ReactNode`) — Replaces the content header\n  bar\'s title widget for this screen. Left unset, the header bar shows the\n  page\'s own title automatically.\n- **`headerButtons`** (`HeaderButton[]`) — Overrides the navigator-level\n  `headerButtons` prop for this screen.\n- **`contentLayout`** (`"react-native" | "widget"`, default\n  `"react-native"`) — What the screen\'s body is. `"react-native"` mounts\n  it in a Yoga layout root that fills the pane, so `<View style={{ flex:\n1 }}>` behaves the way it does anywhere else. `"widget"` packs the body\n  into the page directly, with no layout root in between, for a screen\n  whose body is a GTK widget tree — GTK\'s own sizing (`vexpand`, a list\'s\n  natural height) then applies normally. Under the default, a widget tree\n  collapses instead, and quietly: every widget becomes a single Yoga leaf\n  measured for its own natural size, so the container renders its first\n  child, drops the rest, and reports the roughly 1 px it can shrink to,\n  with no error anywhere. Mixing is per screen, not per subtree — a\n  `"widget"` screen that wants React Native content somewhere inside it\n  wraps that part in `SlotContent` itself.\n- **`sidebarRow`** (`() => ReactNode`) — Draws the row directly instead of\n  letting `title`/`icon`/`color`/`count` compose one. See\n  [Building sidebar rows](#building-sidebar-rows) below.\n- **`group`** (`string`) — Section this row belongs to. See\n  [Grouping rows](#grouping-rows) below.\n\nA screen changes its own header shape from inside itself by calling\n`navigation.setOptions({ headerLeft, headerRight, headerTitle })` in an\neffect keyed on whatever local state decides the shape — no navigator API\nbeyond the options themselves is involved. `setOptions` merges into the\npreviously resolved options rather than replacing them: a call that omits\n`headerRight` does not clear a `headerRight` a previous call set, it\nleaves it in place. A screen that flips between header shapes must give\nevery one of `headerLeft`, `headerRight`, `headerTitle` and `headerButtons`\nan explicit value on every call — `undefined` counts as a real overwrite,\nan absent key does not.',
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Building sidebar rows",
    text: 'There are three ways to put content in the sidebar, cheapest first — the\nsame ladder react-navigation\'s own `tabBarIcon` → `drawerLabel` →\n`drawerContent` climbs:\n\n1. **`title` / `icon` / `color` / `count`** — the convenience. Composes an\n   `AdwActionRow` automatically.\n2. **`sidebarRow`** (screen option) — draw one row yourself. The navigator\n   keeps owning row behavior: selection, click → `jumpTo`, staying in step\n   with navigation state, the collapsed reveal. Return anything a\n   `GtkListBoxRow` can hold — React Native content, GTK widgets, a\n   differently configured Adwaita row.\n3. **`sidebarContent`** (navigator prop) — draw the whole pane, routing\n   surface included:\n\n```tsx\n<Sidebar.Navigator\n  sidebarContent={({ routes, focusedIndex, jumpTo }) => (\n    <View style={{ flex: 1 }}>\n      <SearchField onSubmit={filterRoutes} />\n      <ScrollView style={{ flex: 1 }}>\n        {routes.map((route, index) => (\n          <Pressable\n            key={route.key}\n            onPress={() => jumpTo(route.name)}\n          >\n            <Text\n              style={{\n                padding: 8,\n                fontWeight: index === focusedIndex ? "700" : "400",\n              }}\n            >\n              {route.title}\n            </Text>\n          </Pressable>\n        ))}\n      </ScrollView>\n      <StorageUsageFooter />\n    </View>\n  )}\n>\n  <Sidebar.Screen\n    name="Inbox"\n    component={InboxScreen}\n  />\n  <Sidebar.Screen\n    name="Trash"\n    component={TrashScreen}\n  />\n</Sidebar.Navigator>\n```\n\n`SidebarContentProps` carries `routes` (each with `key`, `name`, resolved\n`options`, resolved `title`, and `focused`), `focusedIndex`, and\n`jumpTo(name)`. `route.title` is already resolved (`options.title`, falling\nback to the route name). `jumpTo` reveals the content pane when collapsed,\nthe same as a native row click — use it rather than dispatching directly,\nso selection cannot drift from navigation state. The pane\'s header bar and\n`sidebarTitle` still belong to the navigator; `sidebarContent` replaces only\nthe body under it. A sidebar built from GTK widgets instead of React\nNative content wraps its own tree in `WidgetContent`, the same escape\nhatch `contentLayout: "widget"` uses for a screen body.\n\nThe reason rungs 2 and 3 exist at all: `AdwActionRow` carries Adwaita\'s own\nrow metrics, not a default this package picked — measured at roughly\n104 px per row (with a prefix and/or count laid out) against roughly 40 px\nfor a plain title-only row — and nothing passed to\n`title`/`icon`/`color`/`count` changes that height. A screen on rung 1 has\nno lever for it; a different height or density means climbing to\n`sidebarRow` or `sidebarContent`.',
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Grouping rows",
    text: '![The gallery sidebar, light theme: a "React Native" section header above Views, Text, Layout, Clipping and the rest, then a "gtkx" header above Widget hosting and Adwaita stack.](../shots/gallery/sidebar-groups-light.png)\n\n![The same sidebar in the dark theme, with the headers equally legible.](../shots/gallery/sidebar-groups-dark.png)\n\n_The gallery\'s own screenshots elsewhere on this site are all native\nGNOME/Adwaita chrome in the dark theme — this pair is the one deliberate\nlight/dark comparison._\n\nConsecutive screens sharing a `group` value get one Adwaita section header\nabove the first of them. The header is a decoration owned by the row below\nit, not a row of its own — it sits outside the list\'s selection model and\noutside its focus chain, so arrow keys and Tab walk past it and assistive\ntechnology never announces a row that cannot be activated.\n\nGrouping follows row order: screens in one group must be declared\ntogether, and a group name reappearing after a gap starts a second header\nrather than reordering anything. Leaving `group` unset on every screen —\nthe default — keeps the list flat.',
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Collapsing",
    text: "Any route becoming active while collapsed reveals content\n(`AdwNavigationSplitView`'s `showContent`, a plain native property write,\nnot React state) — a row click or a programmatic `navigate()`/`jumpTo()`;\nthe native back button that then appears reverses it. Re-selecting the\nsame, already-active row also reveals content again, since GTK's\n`row-selected` does not refire for a re-click with no selection change.\n\nResizing back above `collapseWidth` and then below it again does not reset\nthe selection or which pane is showing — both simply persist across the\nround trip, the same size-class behavior a mobile master-detail app relies\non.",
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Sidebar transition events",
    text: "- **`sidebarShown`** (`{ data: undefined }`) — Fires when the split\n  view's own back affordance (back button, Escape, back gesture) hides the\n  content pane while collapsed, returning to the sidebar.\n\nDiffers from react-navigation: this is the one case where a native,\nuser-driven interaction does get an event. Unlike a stack pop, nothing is\nremoved from `TabRouter`'s state when this happens — the same route stays\nfocused, only the visible pane changes — so there is no state change for\nan app to observe any other way. `sidebarShown` fires on the currently\nactive route, never for content being revealed (that direction is already\nan ordinary state change), and never at all when `collapseWidth` is unset.",
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Typed factories",
    text: "`createStackNavigator<ParamList>()` and `createSidebarNavigator<ParamList>()`\nare generic: the returned `Navigator`/`Screen` pair is typed against\n`ParamList`, so a mistyped screen name or a mismatched param type is caught\nat the JSX call site. Each factory has its own screen-props helper for a\ncomponent that reads `route`/`navigation` directly as props —\n`StackScreenProps<ParamList, RouteName>` for the stack navigator,\n`SidebarScreenProps<ParamList, RouteName>` for the sidebar navigator — and\nits own navigation-helpers type for a component that instead reaches its\nnavigation object through `useNavigation()` (one `component` shared across\nseveral routes, for example): `useNavigation<StackNavigationHelpers>()` /\n`useNavigation<SidebarNavigationHelpers>()`.\n\nExported types: `StackNavigationOptions`, `StackNavigationEventMap`,\n`StackNavigationHelpers`, `StackScreenProps`, `StackScreenConfig`,\n`TypedStackNavigator`, `SidebarNavigationOptions`,\n`SidebarNavigationEventMap`, `SidebarNavigationHelpers`,\n`SidebarScreenProps`, `SidebarScreenConfig`, `TypedSidebarNavigator`,\n`SidebarContentProps`, `HeaderButton`.",
  },
  {
    doc: "docs/reference/navigation.md",
    heading: "Unsupported screen options",
    text: "react-navigation's own navigator factory is untyped upstream, so neither\nTypeScript nor the runtime otherwise says anything about a screen option\nthis adapter does not recognize (a `@react-navigation/native-stack` option\nthat does not apply here, for instance). Each navigator instead logs one\ndevelopment-only warning per unknown option key, naming the option and why\nit is ignored — for example, `headerStyle`/`headerTintColor`/\n`headerTitleStyle` are ignored because Adwaita's theme owns the chrome\nstyling on this platform, `presentation` is ignored because only `\"card\"`\nexists today, and `detachInactiveScreens`/`freezeOnBlur`/`inactiveBehavior`\nare ignored because pushed pages always stay mounted, with no unmount/\nfreeze knob to offer. The warning fires once per navigator kind per key,\nnot once per screen or per render, and never in production.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "One thread, not two",
    text: "On mobile, Reanimated exists to cross a thread boundary: JS and the UI run on\nseparate runtimes, and worklets, shared values, `runOnUI` and the Babel\nplugin all exist to move work across it. Here GTK's main loop _is_ the JS\nthread — a widget call is a synchronous C call on the same stack — so a\nworklet is an ordinary function, `measure()` is synchronous, and a shared\nvalue is an observable box that updates in place.\n\nThis is upstream's own behavior, not a platform-specific reinterpretation:\nreact-native-reanimated selects this same flattened implementation for\nreact-native-windows and for the web. Its non-DOM, non-native-runtime web\nbuild is the blueprint this subpath is read off, including its pure-JS\npieces (`interpolate`, `Easing`, the spring solver's config normalization),\nwhich are ported here rather than imported.\n\nThe Babel plugin is neither required nor assumed. Its output is an ordinary\nlexical closure carrying metadata properties and no injected runtime import,\nso `'worklet'` is an inert directive — a worklet is directly callable whether\nor not the plugin has run. This platform never runs Babel itself (the Vite\npath bundles with rolldown; the Metro path uses the app's own stock preset),\nso an app that also ships to iOS or Android keeps the plugin for those\nbuilds without conflict.\n\nDiffers from react-native-reanimated: worklet closures use live lexical\ncapture, not the Babel plugin's by-value snapshot. This is only observable\nfor a worklet that closes over a reassigned plain `let` — already a bug on\nmobile — so ordinary code is unaffected.\n\nDependency tracking in `useDerivedValue` and `useAnimatedReaction` is dynamic\nrather than static: a mapper subscribes to the shared values it actually\nreads on each run, rather than to a Babel-collected `__closure` list. A\n`dependencies` array is accepted and honored — it still controls when a\nmapper rebuilds — but it is never required for correctness, and a\nconditional read is tracked correctly either way.\n\n`makeShareableCloneRecursive` and `isWorkletFunction` are re-exported\ndirectly from the worklets subpath described at the end of this page — the\nsame instance, not a second implementation.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Shared values and animations",
    text: "![The gallery's Reanimated values section: a shared value dragged and sprung back, with the render counters proving zero React renders per frame.](../shots/gallery/reanimated.png)\n\n`useSharedValue`, `makeMutable`, `isSharedValue` and `cancelAnimation` are\nfully implemented. A shared value doubles as one of the platform's own\nanimated nodes, so it can be handed straight to a `View`'s style, in addition\nto being read inside `useAnimatedStyle`.\n\nA shared value can be written either of two ways:\n\n```tsx\nsharedValue.value = x\nsharedValue.set(x) // also takes an updater: count.set((c) => c + 1)\n```\n\nBoth are real and both work; `.get()`/`.set()` is the pair upstream added for\nexactly one situation this platform inherits. The React Compiler — on by\ndefault on the Vite path (see\n[the Guide's toolchains page](../guide/toolchains.md#the-react-compiler-vite-path-only)) —\ntreats anything a hook returns as frozen, so `react-hooks/immutability`\nreports every assignment to `.value`, including ones inside a callback or\neffect that are perfectly legitimate. `.get()`/`.set()` lints clean\neverywhere; `.value` keeps working, so a ported app never has to be\nrewritten.\n\nDiffers from react-native-reanimated: `SharedValue.addListener` accepts both\nupstream's `(listenerID, listener)` signature and this platform's own\nanimated-node signature, `(callback) => id`. Both call sites are real in\npractice, and supporting only one would fail the other silently.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "`with*()` animations",
    text: "![The gallery's Reanimated motion section: the five animation functions (withTiming/withSpring/withSequence/withRepeat/withDelay) and seven easing curves compared side by side.](../shots/gallery/reanimated-motion.png)\n\n`withTiming`, `withSpring`, `withSequence`, `withRepeat` and `withDelay` are\nfully implemented for numeric values, on upstream's own defaults (timing:\n300 ms, `Easing.inOut(Easing.quad)`; spring: `GentleSpringConfig`), driven by\nthe platform's single frame scheduler. Each can be assigned directly to a\nshared value or returned from a `useAnimatedStyle`/`useAnimatedProps`\nupdater.\n\nDiffers from react-native-reanimated: re-aiming a running animation (giving\nit a new target while it is mid-flight) keeps the animation's current value\nbut takes only the new descriptor's velocity — upstream also carries the\nprevious animation's velocity across the re-aim. A target that moves every\nframe ends up slightly more damped here than upstream.\n\n`withDecay` and `withClamp` are fully implemented, including `velocity`,\n`deceleration`, `velocityFactor`, `clamp` and `rubberBandEffect` — upstream's\nown step function, ported. `withDecay` is what an inertial fling rides on:\nreleased with a velocity, it coasts, decelerates, and stops with no target\nto reach. `withClamp` runs its inner animation un-truncated and only clips\nwhat reaches the value, which is observable on an overshooting spring —\nupstream's own distinction.\n\nDiffers from react-native-reanimated: `withDecay`'s config (`clamp` shape,\n`velocityFactor > 0`, `rubberBandEffect` needing a `clamp`) is validated at\nthe `withDecay()` call itself rather than on the animation's first frame —\nsame errors, one line earlier.\n\nDiffers from react-native-reanimated: the spring's rest condition is derived\ndifferently. Upstream stops a spring once its remaining energy drops below a\nfraction of its initial energy; this platform's solver stops on displacement\nand speed thresholds, derived from the same energy budget. The stopping\npoint differs by well under a pixel. A layout-animation builder's\n`.restDisplacementThreshold()` and `.restSpeedThreshold()` are accepted and\nignored for the same reason.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Spring presets",
    text: "Eight named configs ship as plain data, mirrored exactly from upstream:\n\n| Preset                                       | Values                                                           |\n| -------------------------------------------- | ---------------------------------------------------------------- |\n| `Reanimated3DefaultSpringConfig`             | `damping: 10, mass: 1, stiffness: 100`                           |\n| `Reanimated3DefaultSpringConfigWithDuration` | `duration: 1333, dampingRatio: 0.5`                              |\n| `WigglySpringConfig`                         | `damping: 90, mass: 4, stiffness: 900`                           |\n| `WigglySpringConfigWithDuration`             | `duration: 550, dampingRatio: 0.75`                              |\n| `GentleSpringConfig`                         | `damping: 120, mass: 4, stiffness: 900` — `withSpring`'s default |\n| `GentleSpringConfigWithDuration`             | `duration: 550, dampingRatio: 1`                                 |\n| `SnappySpringConfig`                         | `damping: 110, mass: 4, stiffness: 900, overshootClamping: true` |\n| `SnappySpringConfigWithDuration`             | `duration: 550, dampingRatio: 0.92, overshootClamping: true`     |",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Animating an object or array, not just a number",
    text: "An animated value can be a plain object or array whose leaves are numbers —\nupstream's real `AnimatableValue`, minus color strings (see below).\n`withTiming({ x: 10, y: 20 })` and `withSpring` interpolate every leaf on the\nsame curve and the same clock: a nested object recurses, and an array's own\nelements are always numbers, never nested — upstream's own asymmetry. The\ncompletion callback fires once per animation, not once per leaf, and\ncomposing through `withDelay`/`withSequence`/`withRepeat` carries a shape\nexactly as it carries a plain number.\n\nDiffers from react-native-reanimated: a target whose shape does not match\nthe value it is animating from throws, naming the mismatched leaf, rather\nthan silently dropping the key the way upstream's from-value-driven walk\ndoes. A key that previously held a plain number seeds an animation from that\nnumber, unchanged from upstream; a key that previously held a plain object\ndoes not — upstream's own `prepareAnimation` has no branch for a plain data\nobject either, so it is seeded at the target exactly like a key that was\nabsent. An `{x, y}` `withTiming` costs about twice a single number's own\nper-frame cost, measured before the result ever reaches a style property.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "`useDerivedValue` and `useAnimatedReaction`",
    text: "Both are fully implemented, along with the `startMapper`/`stopMapper`\nprimitive they are built on — a few libraries reach for that primitive\ndirectly. Mappers are torn down on unmount. `inputs`, the static candidate\nlist the Babel plugin would otherwise produce, is accepted and ignored:\ntracking is dynamic, so a mapper subscribes to what it actually reads rather\nthan to what it was told to expect.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "`useAnimatedStyle` and `useAnimatedProps`",
    text: "![The gallery's Reanimated limits section: a driven width next to a refused one, showing exactly where useAnimatedStyle stops driving a layout property at frame rate.](../shots/gallery/reanimated-limits.png)\n\nWhat this platform can write to a mounted widget without a React render is a\nfixed set of properties — the honest boundary of the surface, not a\ntemporary limit:\n\n| Property                                                                                                            | Reached through    | How it reaches GTK                                                                                                                                      |\n| ------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `opacity`                                                                                                           | `useAnimatedStyle` | `gtk_widget_set_opacity`, straight from the animation frame.                                                                                            |\n| `transform` (`translateX/Y`, `scale`, `scaleX/Y`, `rotate`/`rotateZ`)                                               | `useAnimatedStyle` | The rect store plus one queued allocation, applied as a `GskTransform`. No 3D, no skew, no `matrix` — the same list the static `transform` style takes. |\n| `top`, `left`, `right`, `bottom` — only on a node whose own `position` is `\"absolute\"`                              | `useAnimatedStyle` | Turned into a translation from the position the committed layout gave it — the same rect store, the same queued allocation.                             |\n| `width`, `height` — only where the change is confined to the node that owns it                                      | `useAnimatedStyle` | The node's own subtree is re-laid-out pinned to the driven value, into the rect store as an override.                                                   |\n| `backgroundColor`, `color`, `borderColor` (and per side), `outlineColor`                                            | `useAnimatedStyle` | A `GtkCssProvider` private to that widget, reloaded in place.                                                                                           |\n| The numeric SVG props (`r`, `cx`, `strokeWidth`, `strokeDashoffset` and the rest of the geometry and paint numbers) | `useAnimatedProps` | The shape's own descriptor plus `queueDraw` — the SVG components already subscribe to an animated node themselves.                                      |\n\nColors deliberately do not go through the memoized class registry the static\nstyles use. That registry keys on generated CSS text, so a color driven\nthrough it would mint a class per animation frame into one process-wide\nstylesheet that GTK re-parses whole and never prunes. The private provider\nhas no cache and no document, so nothing about the static path changes.\nEvery animated component gets this, not only `Animated.View` — the write\npath is a hook over \"a widget and its parent\", so `Animated.Text` and\nanything through `createAnimatedComponent` animate colors on the same terms.\n\nDiffers from react-native-reanimated: the remaining layout properties —\n`flex`, `flexBasis`, every `margin*`/`padding*`, `gap`, the `min*`/`max*`\nfamily — are refused rather than driven at frame rate. Each needs a Yoga\npass plus the commit walk that follows it, and that cost scales with the\n_container_ rather than with the animated value, while a transform or a\ncolor's cost stays flat regardless of tree size. A `useAnimatedStyle` that\nchanges one of these warns once for that property, names it as a layout\nproperty, and names the transform to use instead. The value is not dropped:\nit is applied on the next React render, and when the value comes from an\nanimation the updater returned (`height: withTiming(320)`), that render is\nproduced automatically — when the animation reaches its target, and at most\nonce every 100 ms while it is on its way. That is at most ten renders a\nsecond, never one per frame.\n\n`scaleX`/`scaleY` are an approximation for `width`/`height`, not a\nreplacement, and the warning for a refused size says so. A scale grows\naround the view's center, so the box moves as it grows, where a real width\nchange would not move it; and it scales the box's _content_ with it instead\nof re-laying it out, so wrapped text keeps its old line breaks and is drawn\nstretched rather than re-wrapped. Reach for a scale when the content can\ntolerate being stretched — a plain box, an image. `translateX`/`translateY`\nfor insets are exact and carry no such caveat.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "The first exception: insets on an absolutely positioned node",
    text: '`top`, `left`, `right` and `bottom` are driven at frame rate on a node whose\nown `position` is `"absolute"`. Such a node is out of flow, so moving it\nchanges nothing but where it is drawn — which makes an inset exactly a\ntranslation from the position the committed layout gave it, and lets it run\non the transform path with no Yoga pass at all. This is the shape the whole\nsortable-list ecosystem is built on:\n\n```tsx\nconst style = useAnimatedStyle(() => ({\n  position: "absolute",\n  left: 0,\n  right: 0,\n  top: top.value, // driven, with no Yoga pass\n}))\n```\n\nA few things follow from that:\n\n- **It composes with your own transform** rather than replacing it. The\n  derived translation is applied outermost, so it moves the\n  already-rotated, already-scaled box by the distance the layout asked for\n  — a `top: 100` under `scale: 2` moves the box 100 px, not 200.\n- **`right` and `bottom` invert**, because they measure inward from the far\n  edge: a larger value moves the node toward the origin.\n- **An axis anchored by both edges is still refused**, because it is no\n  longer a translation. `left: 0, right: 0` with no `width` derives the\n  width from both edges, so animating `left` there resizes the node; with a\n  definite `width`, Yoga honors `left` and ignores `right` entirely, so\n  animating `right` would invent motion a real layout pass would not\n  produce. Both cases warn in their own words and name a working\n  configuration.\n- **`measure()` reports the committed layout, not the translated\n  position** — see [Gesture and scroll integration](#gesture-and-scroll-integration).\n- **`position` may live in a sibling style entry**, as in\n  `style={[styles.row, useAnimatedStyle(() => ({ top: y.value }))]}` — the\n  decision is made against the flattened style, not against the updater\'s\n  object alone.',
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "The second exception: a size confined to the node that owns it",
    text: "`width` and `height` are driven at frame rate where the change stops at the\nnode: the node's own subtree is re-laid-out pinned to the driven value, the\nresult goes into the rect store as an override, and one queued allocation\nputs it on screen. Nothing above the node is visited and nothing is written\ninto Yoga, so the cost tracks the size of the node rather than of its\ncontainer.\n\n```tsx\n// A progress bar, a disclosure panel, a sliding drawer — all the same shape.\nconst style = useAnimatedStyle(() => ({ width: width.value }))\n\n<View style={{ width: 400, height: 700 }}>\n  {/* the container's width is its own, so nothing this box does can move it */}\n  <Animated.View style={[{ height: 60 }, style]}>\n    <Text>re-wraps as the box grows, which a scaleX does not</Text>\n  </Animated.View>\n  <View style={{ height: 20 }} />\n</View>\n```\n\nThis is a real layout, not a stretch: the content inside is re-laid-out at\nthe new size, text re-wraps, a flex row inside redistributes, a stretched\nchild follows — which is the difference from `scaleX` and the reason this is\na Yoga pass at all.\n\nThe precondition is measured, and the refusal applies wherever it does not\nhold:\n\n- The axis is the container's **cross** axis — a `width` in a column, a\n  `height` in a row. A main-axis size pushes every following sibling along,\n  which is the layout pass the refusal exists to avoid.\n- The container's size on that axis does not come from its children — a\n  definite or percentage size, a `flex` from its own parent, or `stretch` on\n  its parent's cross axis. A content-sized container would grow with the\n  node.\n- The node's other axis does not come from its content — a box with\n  `height: auto` around wrapping text gets taller as it gets narrower, and\n  everything after it moves.\n- The node's resolved cross-axis alignment is `flex-start` or `stretch` —\n  `center` and `flex-end` move the node's own origin as it grows.\n- No `aspectRatio` and no `min`/`max` on that axis — the first ties the\n  other axis to this one, and the second clamps the driven value, so the\n  box silently stops following the animation.\n- The container does not wrap, which would resize the node's line and move\n  every line after it.\n- An absolutely positioned node qualifies on either axis, as long as that\n  axis' start edge (`left`, `top`) is anchored — it then grows from an\n  origin that does not move, and being out of flow, it touches nothing at\n  all. This does not apply under an `IntrinsicRoot`, which reports its Yoga\n  content size to GTK as the window's own size request — a size below it\n  deliberately never goes into Yoga, so the island would keep its old\n  request while the node draws outside it.\n\nThree more properties of this path are worth knowing:\n\n- The container's `flexDirection` and `alignItems` are usually not present\n  in the updater's own object — `style={[styles.bar, useAnimatedStyle(() => ({\nwidth: w.value }))]}` is the ordinary spelling, and the decision is taken\n  against the real layout tree either way.\n- The driven size survives an unrelated engine flush: it is kept as an\n  override next to the animated offset rather than written over the\n  committed rect, so a window resize — or any other reason the tree\n  re-commits mid-animation — cannot drop a frame of it.\n- `measure()` reports the committed layout, not the driven size, exactly as\n  it does for a transform or an animated inset — see below.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "`measure()` on a node moved this way",
    text: "`measure()` on a node whose position or size is being driven reports the\n**layout** rect, not the paint position: the node's Yoga `top` (or `width`/\n`height`) did not change, only its allocated and painted position did. So\n`x`/`y`/`width`/`height` are the committed layout, untranslated, while\n`pageX`/`pageY` follow GTK's real transform chain and report where the node\nis actually drawn. `measureInWindow` and `measureLayout` follow `pageX`/\n`pageY`. This is the same split an explicit `translateY` has always\nproduced here.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "`zIndex`",
    text: '`zIndex` is driven, animated or not, and costs what `opacity` costs — one\nwidget write, no Yoga pass, no CSS. The shape a sortable list produces every\nframe (`{ position: "absolute", left: 0, right: 0, top: top.value, zIndex:\nmoving ? 1 : 0 }`) drives both `top` and `zIndex` and warns about neither.',
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Everything else in the style",
    text: "Borders, radii and shadows still reach GTK as a CSS class computed during\nrender; a `useAnimatedStyle` that changes one of them names it once in a\nwarning and applies its latest value on the next React render — produced\nautomatically when the value comes from an animation, exactly as for a\nrefused layout property. `useAnimatedProps` follows the same rule with the\nsame warning: a numeric prop is driven, anything else is named and lands on\nthe next render.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "An animation returned from the updater",
    text: "`useAnimatedStyle(() => ({ height: withSpring(open.value ? 320 : 0) }))` is\nhow Reanimated's own documentation writes an animation, and it runs here on\nthe platform's one frame scheduler. Three rules — all upstream's, read out\nof its own `styleUpdater`/`prepareAnimation`, not inferred — decide what a\ngiven mapper run does with it:\n\n- A key animating for the first time is seeded at its target, not animated\n  to it — there is nothing to animate from.\n- A key whose previous updater result held a plain number animates from\n  that number, so the common \"snap shut, open smoothly\" shape works:\n  `useAnimatedStyle(() => ({ height: open.value ? withTiming(200) : 100 }))`\n  and `useAnimatedStyle(() => ({ opacity: visible.value ? withTiming(1) : 0\n}))` both run their full range over the animation's duration rather than\n  jumping.\n- A later run producing the same animation does not restart it — compared\n  by target and shape rather than by object identity, since a mapper\n  re-runs many times a second and every run builds a fresh descriptor.\n\nThe reverse direction is not the mirror image: when a plain number replaces\na running animation, the animation is cancelled and the number lands at\nonce — it does not ease back, and no settle is reported. That matches\nupstream, which deletes the animation and pushes the plain value in the same\nmapper run rather than symmetrizing the two directions. On a driven property\nthe number reaches the widget on that frame; on a refused one, the snap is a\nReact render, produced for the caller automatically rather than waiting for\na cadence or a settle that will never come.\n\nA percentage or a color string in the previous result is not a starting\npoint a numeric driver can use, so those fall back to being seeded at the\ntarget.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Animating an SVG shape",
    text: '`useAnimatedProps` reads exactly as it does on mobile:\n\n```tsx\nimport { Circle, Svg } from "react-native-gtkx/svg"\nimport Animated, {\n  useAnimatedProps,\n  useSharedValue,\n  withTiming,\n} from "react-native-reanimated"\n\nconst AnimatedCircle = Animated.createAnimatedComponent(Circle)\n\nconst Pulse = () => {\n  const r = useSharedValue(10)\n  const animatedProps = useAnimatedProps(() => ({ r: r.value }))\n  return (\n    <Svg\n      width={100}\n      height={100}\n      onLayout={() => (r.value = withTiming(40))}\n    >\n      <AnimatedCircle\n        cx={50}\n        cy={50}\n        fill="green"\n        animatedProps={animatedProps}\n      />\n    </Svg>\n  )\n}\n```',
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Interpolation and color",
    text: "`interpolate`, `clamp` and `Extrapolation` (with its deprecated alias\n`Extrapolate`) are fully implemented, including per-edge extrapolation\nmodes. `Easing` is fully implemented, including `Easing.bezier`'s factory\nshape.\n\n`interpolateColor`, `convertToRGBA`, `isColor` and `rgbaArrayToRGBAColor` are\nfully implemented for the `'RGB'` color space (upstream's 2.2-gamma\ninterpolation) and `'HSV'` (upstream's hue-wrap correction), including\n`'transparent'` handling.\n\nDiffers from react-native-reanimated: the `'LAB'` color space throws by\nname. Upstream's `'LAB'` support is a vendored slice of the `culori` library\nfed 0-255 channels, where `culori` itself documents a 0-1 range — matching\nupstream here would mean matching that scaling bug rather than the color\nspace itself.\n\nDiffers from react-native-reanimated: `interpolateColor` only accepts color\nstrings as input, never `PlatformColor`. A theme color has no numeric value\nuntil GTK resolves it against the live Adwaita theme, so there is nothing to\nblend between keyframes; passing one throws, naming the case.\n\n`PlatformColor` is the platform's own: a theme color addressed by name,\nresolved by GTK against the live Adwaita palette (`var(--accent-bg-color)`\nand the rest). It can be animated _between_ on a shared value — assign one\n`PlatformColor` and then another, and a shared value transitions cleanly —\nbut it cannot be interpolated _through_, for the reason above.\n\nDiffers from react-native-reanimated: `processColor` and `DynamicColorIOS`\nthrow by name. `processColor` returns RN's packed AARRGGBB integer, whose\nonly real consumer is a native module that unpacks it; there is no native\nmodule here, a color's destination is a GTK stylesheet, and a stylesheet\ntakes strings. Refusing beats handing back a number nothing downstream would\naccept.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Gesture and scroll integration",
    text: "`useAnimatedRef` and `measure` are fully implemented, and callable from\nanywhere — there is no worklet boundary to be inside of. `measure` returns\n`null` before the first committed layout, matching RN's own contract. See\n[above](#measure-on-a-node-moved-this-way) for what it reports on a node\nwhose position or size is being driven.\n\n`useAnimatedScrollHandler` is fully implemented for `onScroll`, riding a\npath that already existed: `ScrollView`'s `emitScroll` runs from a\n`GtkAdjustment::value-changed` handler, a C callback on the same loop this\nJS runs on — so a handler that writes a shared value gets Reanimated's\npromise (no React render per scroll event) with no extra event machinery.\nHand the result to a scrollable's `onScroll` prop; the handler receives\nReanimated's flattened event shape (`event.contentOffset.y`, not\n`event.nativeEvent`) carrying the three measurements a `GtkScrolledWindow`\ncan report, plus one context object shared across every call.\n\n`onBeginDrag`, `onEndDrag`, `onMomentumBegin` and `onMomentumEnd` are all\ncalled: a mouse-wheel burst produces one synthetic begin/end pair with no\nmomentum phase, while a touchpad glide produces all four phases from its\nnative gesture sequence. The wheel pair is a documented desktop extension —\nRN has no wheel input to model. `contentInset`, `velocity` and `zoomScale`\nare absent from the event rather than invented as zero.\n\n`scrollTo(ref, x, y, animated)` is fully implemented against a\n`useAnimatedRef`-pointed scrollable: because this is the same thread that\nowns the widget, it calls the scrollable's own imperative `scrollTo`\nsynchronously.\n\nDiffers from react-native-reanimated: the argument order is upstream's\npositional form rather than RN's options object, so library call sites are\nunaffected. `animated` is accepted and ignored, matching `ScrollView`'s own\nbehavior. A ref pointing at nothing, or at a component with no scroll API,\nis silently ignored rather than throwing, matching upstream.\n\n`useScrollOffset` and `useScrollViewOffset` are fully implemented: a shared\nvalue that tracks a scrollable's current offset, updated directly from the\nadjustment's own `value-changed` signal — no `onScroll` prop required and no\nReact render per event. They take upstream's argument for writing into a\nshared value the caller already owns, and upstream's own axis rule (`x` when\na horizontal offset exists, `y` otherwise). Point one at a `ScrollView`, a\n`FlatList` (which resolves through to the `ScrollView` it renders\ninternally), or an `Animated.ScrollView`; pointing one at anything else\nwarns once and the value stays `0`. Cost is about 5 µs per scroll event\nwhile tracking, and nothing while not — the hook connects on mount and\ndisconnects on unmount.\n\n`useHandler` is fully implemented. Its `doDependenciesDiffer` is always\n`false` — not a stub, a statement: upstream needs that check because a\nworklet is a by-value snapshot that can go stale, and here a handler is an\nordinary closure read out of a ref at call time, so it never goes stale.\n`useWeb` reports `true`, for the same reason the whole surface sits on\nupstream's own web implementation.\n\n`useEvent` is implemented for scroll event names only — `onScroll`,\n`onScrollBeginDrag`, `onScrollEndDrag`, `onMomentumScrollBegin`,\n`onMomentumScrollEnd`. The value it returns goes straight on a scrollable's\n`onScroll` prop, which is the actual subscription mechanism here — the same\nobject `useAnimatedScrollHandler` returns, so a hand-built handler and the\nstock one behave identically.\n\nDiffers from react-native-reanimated: any other event name throws where it\nis requested, naming itself — there is no native event registry to\nsubscribe an arbitrary event name against, and a subscription that could\nnever fire is exactly the failure mode this package refuses everywhere else.\n`rebuild` is accepted and ignored, for the same reason `doDependenciesDiffer`\nis always false. `.workletEventHandler` throws — it exists upstream to\nregister a native view tag, and there is neither a native view nor a tag\nhere.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Threads: `runOnUI` / `runOnJS`",
    text: "There is one thread, so `runOnUI` and `runOnJS` have nothing to cross — but\nthey are not inlined. Both schedule rather than run immediately, and both\nreturn `void`, matching upstream. A \"UI\" hop is queued as a task and an \"RN\"\nhop as a microtask, so a UI hop still resolves later than an RN hop queued\nat the same instant — the same relative order upstream produces — without\nwaiting for an animation frame the way upstream's own web build does\n(`requestAnimationFrame` stands in there for a UI runtime the web doesn't\nhave; React Native's real UI thread does not wait for one either, and\nneither does this platform).\n\nWaiting for a frame that never needed to be waited for is not cosmetic: a\n`scheduleOnUI(measure)` / `scheduleOnRN(use the result)` round trip that\nwaits a full frame is longer than the gap between two GTK pointer events,\nand produces an observable hover-flicker in drag interactions if it\nregresses.\n\n`scheduleOnUI` and `scheduleOnRN` are `react-native-worklets`' own names for\nthe same mechanism, and are the very same functions re-exported — see\n[Worklets](#worklets-react-native-gtkxworklets) below.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading:
      "`Animated.View`, `Animated.Text`, `Animated.Image`, `Animated.ScrollView`",
    text: "`Animated.View` is the platform's own `View`, unchanged, taking a `ref` that\ngives `measure`/`measureInWindow`/`measureLayout`. `Animated.Text`,\n`Animated.Image` and `Animated.ScrollView` are `createAnimatedComponent`\nover the platform's own components — no subclass, no special case — and all\nthree forward `ref` through, so `useAnimatedRef` + `measure()` works on them\nexactly as on `Animated.View`.\n\n`createAnimatedComponent` adds no widget to the tree. It renders the\ncomponent it wraps and reaches that component's widget through the `ref` it\nalready exposes, so the GTK output is exactly what the unwrapped component\nproduces — wrapping a component in an extra layer would change flex layout\nfor its children and change what `measureLayout` is relative to, which is a\ndifferent tree, not a shim. Wrap anything that takes a `ref` exposing the\ngeometry methods; anything else gets a named warning rather than a silent\nno-op.\n\nDiffers from react-native-reanimated: `Animated.FlatList` throws by name\nrather than working. Unlike `View`/`Text`/`Image`/`ScrollView`, `FlatList`\nis a composite over a windowed core over a `ScrollView` — the `ScrollView`\nis the only thing in that chain that owns a widget, and `FlatListHandle` is\na scroll API by contract, so there is no widget to read back out of its\nref. Upstream's `Animated.FlatList` mostly exists so `onScroll` can be an\n`Animated.event`/`useAnimatedScrollHandler`, and that hook is implemented\nhere directly — a plain `FlatList` already takes it on its own `onScroll`\nprop and needs no animated wrapper for it. Put an animated style on an\n`Animated.View` around the list, or use `Animated.ScrollView` when\nvirtualization isn't needed.\n\n`addWhitelistedNativeProps` and `addWhitelistedUIProps`, both reachable off\nthe default export, are accepted and do nothing — documented no-ops\nupstream too, since the allow-lists they used to write to no longer exist in\nReanimated itself. They are kept callable so startup code that calls them\ndoes not fail on a line that already did nothing upstream.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Layout animations",
    text: "![The gallery's Layout animations section: FadeIn/FadeOut/LinearTransition reordering rows, and the layout-animation preset catalogue.](../shots/gallery/reanimated-layout.png)\n\n`entering`, `exiting` and `layout` props work on every animated component —\n`Animated.View`, `Animated.Text`, `Animated.Image`, `Animated.ScrollView`,\nand anything wrapped with `createAnimatedComponent` — because they are added\nby wrapping a component rather than by subclassing it, and the wrapper adds\nno widget to the tree, exactly like `createAnimatedComponent` itself.\n\n```tsx\n<Animated.View\n  entering={FadeIn.duration(300)}\n  exiting={FadeOut}\n  layout={LinearTransition.springify()}\n/>\n```\n\n`entering` writes the builder's initial values in the same commit that\nmounts the widget, so it is never drawn un-faded, not even for one frame,\nand animates from there. `layout` watches for the layout engine committing a\ndifferent rect for that child, and walks it from where it was to where the\nengine put it.\n\nDiffers from react-native-reanimated: `layout` animates the position as a\ntranslation and applies a size change immediately, rather than animating\nboth. Upstream's `LinearTransition` animates `originX`/`originY`/`width`/\n`height` together; here, the origins are still honored as a translation —\ncomposed with whatever transform the style already has, so a row that\nscales while a list reorders does both — but a size change lands on the\nnext commit instead of animating, for the same reason `useAnimatedStyle`\nrefuses to drive most sizes: animating a size means a Yoga pass whose cost\nis the tree's, not the animated value's. `CurvedTransition`'s\n`.easingWidth()`/`.easingHeight()` are accepted and ignored for the same\nreason; its two position easings are honored.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "`exiting` and widget retention",
    text: "`exiting` needed a primitive nothing else in this surface required. An exit\nanimation has to keep drawing a widget that React has already reconciled\naway, and React's deletion is neither asynchronous nor negotiable — in one\nsynchronous commit it runs the unmounting subtree's cleanup and unparents\nits topmost widget. The platform holds the widget through a\n**widget-retention** mechanism, the same one `react-native-gtkx/adw`'s\n`NavigationStack` uses to keep a page on screen while it slides out:\n\n- The widget is put back into the same container, at the end of the child\n  list, so it draws over the siblings closing the gap rather than under\n  them.\n- Its Yoga node leaves the layout tree immediately, so an exiting view does\n  not hold its space open — the row below it moves up at once, and the exit\n  animation plays over the top.\n- Every container inside the retained subtree keeps its layout manager\n  until the animation ends, so the exiting view's own children stay exactly\n  where they were.\n- A fallback timer always runs, armed from the animation's declared length.\n  Whichever arrives first — the animation's real end or the timer — drops\n  the widget, so a spring that never settles, a dead frame source, or an\n  animation that never started cannot leave a widget parented, drawn and\n  hit-testable forever.\n\n`exiting` is skipped when the component's own container is unmounting in\nthe same commit — there is no container left to hold the widget in, and an\nexit animation inside a disappearing parent has no one left to be seen by.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "`Keyframe` and the `*Transition` builders",
    text: "`FadeIn`, `FadeOut`, `LinearTransition` (and its deprecated alias `Layout`)\nand `Keyframe` are fully implemented, exposing upstream's fluent surface —\n`.duration()`, `.delay()`, `.easing()`, `.springify()` and the spring\nparameters, `.rotate()`, `.withInitialValues()`, `.withCallback()` — usable\nas the class itself or as a built instance.\n\n`BaseAnimationBuilder` and `ComplexAnimationBuilder` both resolve to one\nclass. Upstream splits the plain chain from the spring-parameter chain into\ntwo classes; this platform does not, and a library subclassing either name\nkeeps working.\n\nFour more `layout` transitions beside `LinearTransition` are fully\nimplemented: `CurvedTransition`, `FadingTransition`, `JumpingTransition`,\n`SequencedTransition`, plus `EntryExitTransition`, which composes an\nentering builder and an exiting builder into one layout animation. Each\nfollows the same paint-only position rule as `LinearTransition` above.\n\n`LayoutAnimationConfig` is fully implemented: `<LayoutAnimationConfig\nskipEntering skipExiting>` suppresses the animations of the subtree below\nit and adds no widget. `enableLayoutAnimations` warns and does nothing,\nmatching upstream exactly, where it is deprecated and its allow-list is\ngone.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "The preset catalogue",
    text: "60 of upstream's 76 layout-animation presets are implemented, on upstream's\nown parameters, sharing one builder class over a parameter table. (`FadeIn`\nand `FadeOut` themselves ship as the hand-written base builders described\nabove, alongside `Keyframe` and `LinearTransition`, rather than as table\nentries — the family below covers the rest of upstream's `Fade*` set.)\n\n| Family       | Presets                                                                                                                                                                                                                                      |\n| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| Bounce (10)  | `BounceIn`, `BounceInDown`, `BounceInLeft`, `BounceInRight`, `BounceInUp`, `BounceOut`, `BounceOutDown`, `BounceOutLeft`, `BounceOutRight`, `BounceOutUp`                                                                                    |\n| Fade (8)     | `FadeInDown`, `FadeInLeft`, `FadeInRight`, `FadeInUp`, `FadeOutDown`, `FadeOutLeft`, `FadeOutRight`, `FadeOutUp`                                                                                                                             |\n| Pinwheel (2) | `PinwheelIn`, `PinwheelOut`                                                                                                                                                                                                                  |\n| Roll (4)     | `RollInLeft`, `RollInRight`, `RollOutLeft`, `RollOutRight`                                                                                                                                                                                   |\n| Rotate (8)   | `RotateInDownLeft`, `RotateInDownRight`, `RotateInUpLeft`, `RotateInUpRight`, `RotateOutDownLeft`, `RotateOutDownRight`, `RotateOutUpLeft`, `RotateOutUpRight`                                                                               |\n| Slide (8)    | `SlideInDown`, `SlideInLeft`, `SlideInRight`, `SlideInUp`, `SlideOutDown`, `SlideOutLeft`, `SlideOutRight`, `SlideOutUp`                                                                                                                     |\n| Stretch (4)  | `StretchInX`, `StretchInY`, `StretchOutX`, `StretchOutY`                                                                                                                                                                                     |\n| Zoom (16)    | `ZoomIn`, `ZoomInDown`, `ZoomInEasyDown`, `ZoomInEasyUp`, `ZoomInLeft`, `ZoomInRight`, `ZoomInRotate`, `ZoomInUp`, `ZoomOut`, `ZoomOutDown`, `ZoomOutEasyDown`, `ZoomOutEasyUp`, `ZoomOutLeft`, `ZoomOutRight`, `ZoomOutRotate`, `ZoomOutUp` |\n\nThe 16 presets not implemented — the twelve `Flip*` and four `LightSpeed*`\n— are covered in [What is not implemented](#what-is-not-implemented) below.\n`rotate` on any preset or builder is carried as degrees rather than\nupstream's `'90deg'`/`'5rad'` strings — a numeric animation cannot carry a\nunit, and the matrix that reaches GTK is identical either way. A builder's\nown `.rotate()` and a `.withInitialValues()` angle still accept either\nspelling.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "`useAnimatedKeyboard`",
    text: "`useAnimatedKeyboard` returns real shared values — `height` and `state` —\nthat are honored and never updated, the same shape and the same reason as\nthe portable `Keyboard` API's own desktop semantics: every number this hook\nreports describes a software panel sliding over the app and taking screen\nspace from it, and a desktop has no such panel. `height` reads `0` because\nthe keyboard occupies nothing, and `state` reads `KeyboardState.CLOSED`\nbecause it is — deliberately not `UNKNOWN`, which upstream seeds only until\nthe native side reports and which would be false here permanently.\n\nBoth are real shared values, not frozen constants: a `useAnimatedStyle`\nreading them subscribes, computes and settles exactly once, so a layout\nthat offsets itself by `keyboard.height.value` lands where it should rather\nthan throwing. An app written for three platforms keeps one source and gets\nthe right answer on this one too. `options` (upstream's Android\ntranslucency configuration) is accepted and ignored — it describes how the\nkeyboard's rectangle relates to a system bar, and there is neither.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Version reporting, logging and reduced motion",
    text: "`reanimatedVersion` reports `\"4.5.3\"` — the upstream version this surface's\nAPI mirrors, not a claim to literally be that package. Libraries that gate\nbehavior on a version number read this and take the right branch.\n`isConfigured` and `isReanimated3` both return `true` — upstream's own\ndeprecated presence checks, and the honest answer here is yes.\n\n`configureReanimatedLogger` is accepted and does nothing: there is no second\nReanimated logger to configure here, and refusing the call would break\nstartup code that calls it for a setting that changes nothing.\n`ReanimatedLogLevel` is mirrored as plain data (`warn = 1`, `error = 2`).\n\n`ReduceMotion` is mirrored as an enum (`System`, `Always`, `Never`), and\nevery value behaves as `Never`; `useReducedMotion()` always returns `false`.\nNo reduce-motion source is wired up on this platform yet — GNOME's\n`gtk-enable-animations` setting is the signal to read once it is.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Test helpers",
    text: "`withReanimatedTimer`, `advanceAnimationByTime` and `advanceAnimationByFrame`\nare real, not an emulation: the frame driver every animation on this\nplatform runs on is the platform's own, so a test takes that same driver and\nsteps it directly, rather than upstream's approach of faking Jest's timers\nand synthesizing frames on top of them. `withReanimatedTimer` also accepts\nan async body.\n\nAssert against the widget once the clock has been stepped —\n`widget.getOpacity()`, `widget.computeBounds(stage)`, `widget.measure()` —\nrather than reading a style object back. Driven by `withReanimatedTimer` +\n`advanceAnimationByTime`, those reads are deterministic. See\n[What is not implemented](#what-is-not-implemented) for `getAnimatedStyle`\nand `setUpTests`, which read a style back and are refused.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "What is not implemented",
    text: "Each of these throws when called, rendered, or — for the handful that are\nplain values upstream — merely accessed, naming itself in the message. A\nsymbol not listed at all in the module fails earlier still, at bundle time,\nwith the bundler's own \"no export named X\".\n\n- **Color packing for a native module** — `processColor`, `DynamicColorIOS`.\n  Both exist to hand a value to a native module; there is no native module\n  here, and a GTK stylesheet takes strings, not packed integers.\n- **3D and skewed layout-animation presets** — the twelve `Flip*`\n  (`FlipInEasyX`/`Y`, `FlipInXDown`/`Up`, `FlipInYLeft`/`Right`,\n  `FlipOutEasyX`/`Y`, `FlipOutXDown`/`Up`, `FlipOutYLeft`/`Right`) and four\n  `LightSpeed*` (`LightSpeedInLeft`/`Right`, `LightSpeedOutLeft`/`Right`).\n  `Flip*` needs a real 3D rotation (`perspective` plus `rotateX`/\n  `rotateY`); this platform folds every transform into one 2D affine\n  matrix, which has no third axis. `LightSpeed*` needs `skewX`, which is\n  left out of the platform's whole transform surface on purpose, not only\n  from this catalogue.\n- **Shared element transitions** — `SharedTransition`,\n  `SharedTransitionBoundary`. Needs a `sharedTransitionTag` prop, an\n  overlay layer above the navigation stack, and a retention primitive\n  that reparents the leaving widget — none of which exist. The platform's\n  own retention primitive (used by `exiting`, above) deliberately holds a\n  widget in its own parent instead. Upstream's own web build does not\n  implement this either.\n- **Reanimated 4's CSS animations** — `css`, `createCSSAnimatedComponent`,\n  `cubicBezier`, `linear`, `steps`. Not reached by this surface.\n- **Sensor, composed-event and frame-callback hooks** —\n  `useAnimatedSensor`, `useComposedEventHandler`, `useFrameCallback`,\n  `useTimestamp`. No sensor source and no per-frame callback registry on\n  this platform.\n- **Worklet-runtime primitives** — `createWorkletRuntime`, `runOnRuntime`,\n  `executeOnUIRuntimeSync`. A second runtime is structural — there is one\n  thread here, and upstream's own non-native `runtimes.ts` throws for\n  these too on a single-runtime build.\n- **Native-module-only functions** — `dispatchCommand`,\n  `getRelativeCoords`, `setGestureState`, `setNativeProps`, `getViewProp`,\n  `createAnimatedPropAdapter`, `NativeEventsManager`,\n  `getUseOfValueInStyleWarning`. Each crosses to a native view manager\n  that does not exist here.\n- **Orientation and sensor enums** — `InterfaceOrientation`,\n  `IOSReferenceFrame`, `SensorType`. No source of truth for any of them on\n  a desktop.\n- **Screen transitions** — `ScreenTransition`, `startScreenTransition`,\n  `finishScreenTransition`. Not reached by this surface.\n- **Dev tooling** — `PerformanceMonitor`, `ReducedMotionConfig`,\n  `getDynamicFeatureFlag`, `getStaticFeatureFlag`, `setDynamicFeatureFlag`.\n  Not reached by this surface.\n- **Style read-back** — `getAnimatedStyle`, `setUpTests`. Upstream's\n  `getAnimatedStyle` returns the style object its updater produced, which\n  exists on mobile only because its Jest path mirrors it onto the\n  component. Here a style is taken apart at bind time — opacity to the\n  widget, colors to a private CSS provider, the whole `transform` array\n  folded into one matrix in the rect store — so there is no such object\n  left to return, at any point after bind time. `setUpTests` exists only\n  to install `toHaveAnimatedStyle`/`toHaveAnimatedProps`, both\n  `getAnimatedStyle` under a matcher.\n- **Definition helper** — `defineAnimation`. Not reached by this surface.\n- **Animated component** — `Animated.FlatList`. A composite with no widget\n  of its own to expose through a ref — see\n  [Animated.View, Animated.Text, Animated.Image, Animated.ScrollView](#animatedview-animatedtext-animatedimage-animatedscrollview)\n  above.",
  },
  {
    doc: "docs/reference/reanimated-compat.md",
    heading: "Worklets (`react-native-gtkx/worklets`)",
    text: "Reanimated 4 moved its worklet surface out of Reanimated and into its own\npackage, `react-native-worklets`, and libraries increasingly import it under\nthat name directly rather than through Reanimated. Aliasing\n`react-native-reanimated` alone leaves that import wall standing one\npackage over — and it is an import-time wall, not a runtime one:\n`react-native-reanimated-dnd` 2.0.0 pulls `scheduleOnRN` and `scheduleOnUI`\nout of `react-native-worklets` at module scope, in five of its hooks\n(`useDraggable`, `useDroppable`, `useSortable`, `useHorizontalSortable`,\n`useGridSortable`), with no `try { require } catch` guarding any of them —\nso an unaliased package name fails the whole module at import time rather\nthan at the point a function is called. Both the Vite and Metro presets\nalias `react-native-worklets` onto `react-native-gtkx/worklets`, so an app\nkeeps its source unchanged.\n\nThe surface itself already exists inside the Reanimated subpath; this\npackage adds the _name_. `runOnUI`, `scheduleOnUI`, `runOnJS` and\n`scheduleOnRN` reached through either package name are the same instance,\nnot two copies — a job queued through one lands in the same batch, in the\nsame order, as a job queued through the other. Upstream has this same\nproperty for the same reason: Reanimated re-exports these functions from\n`react-native-worklets` rather than keeping a second copy of them.\n\nWhat this package implements and what it refuses is decided by upstream's\nown non-native build — the `.ts` files `react-native-worklets` ships\nalongside its `.native.ts` ones, which is what react-native-windows and the\nweb run on. Where that build computes something, so does this subpath;\nwhere it throws, this subpath refuses by the same name. A worklet runtime is\na second JS runtime, and this platform has one thread, which is where the\nboundary actually is. Measured against `react-native-worklets` 0.11.3.\n\nOne thing upstream's non-native build does that is deliberately not copied:\nits UI hop waits for a `requestAnimationFrame`, standing in for a UI runtime\nthe web hasn't got. React Native's real UI thread does not wait for a\nframe, and neither does this platform.\n\n| Export                                                                                                                                                                                                    | Behavior                                                                                                                                                                                         |\n| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |\n| `runOnUI`, `scheduleOnUI`, `runOnJS`, `scheduleOnRN`                                                                                                                                                      | Deferred, not inlined, returning `void` — the same functions `react-native-gtkx/reanimated` exports (see [Threads](#threads-runonui--runonjs) above).                                            |\n| `runOnUIAsync`                                                                                                                                                                                            | Resolves with the worklet's return value once the UI hop runs it — the one thread-crossing function that hands anything back, because a promise can cross the deferral the others impose.        |\n| `isWorkletFunction`                                                                                                                                                                                       | Upstream's `__workletHash` check. This platform never runs the Babel plugin, so nothing is a worklet by that test and nothing needs to be — `'worklet'` is an inert string.                      |\n| `makeShareableCloneRecursive`, `createSerializable`, `makeShareable`, `makeShareableCloneOnUIRecursive`, `isSerializableRef`, `isShareableRef`                                                            | Identity, matching upstream's own non-native serializer: a value never leaves the runtime it was made in, so there is nothing to clone.                                                          |\n| `serializableMappingCache`, `shareableMappingCache`, `registerCustomSerializable`, `callMicrotasks`                                                                                                       | No-ops, matching upstream.                                                                                                                                                                       |\n| `isShareable`, `isSynchronizable`                                                                                                                                                                         | Upstream's structural checks, ported unchanged.                                                                                                                                                  |\n| `RuntimeKind`, `getRuntimeKind`, `isRNRuntime`, `isUIRuntime`, `isWorkerRuntime`, `isWorkletRuntime`, `UIRuntimeId`                                                                                       | Answer for the one runtime there is: `ReactNative`. Matches upstream's own non-native path, whose initializer sets that kind once and nothing ever changes it.                                   |\n| `getStaticFeatureFlag`, `getDynamicFeatureFlag`, `setDynamicFeatureFlag`, `isBundleModeEnabled`, `toggleSlowAnimationsOnUIRuntime`                                                                        | `false` and no-ops — these gate upstream's native experiments and its Babel bundle mode, neither of which exists here.                                                                           |\n| `createWorkletRuntime`, `runOnRuntime`, `runOnRuntimeSync`, `runOnRuntimeAsync` (and the `WithId` variants), `scheduleOnRuntime` (and its `WithId` variant), `getUIRuntimeHolder`, `getUISchedulerHolder` | Throw, naming themselves. A second runtime is structural; upstream's own `runtimes.ts` throws for every one of these on a single-runtime build too.                                              |\n| `runOnUISync`, `executeOnUIRuntimeSync`                                                                                                                                                                   | Throw. Both mean \"run this over there and give me the answer synchronously\"; deferring instead would be worse than refusing, since the caller wants a return value and a deferred call has none. |\n| `createShareable`, `createSynchronizable`                                                                                                                                                                 | Throw — both are memory shared between runtimes, and there is one runtime.                                                                                                                       |\n| `WorkletsModule`                                                                                                                                                                                          | Throws, naming itself — the one deliberate deviation from mirroring upstream exactly: upstream's non-native build exports this as `null`, which fails by naming nothing at the call site.        |\n\nTwo measurements, taken against the published packages rather than their\ndocumentation:\n\n- `react-native-reanimated-dnd` 2.0.0 imports exactly two symbols from\n  `react-native-worklets` — `scheduleOnRN` and `scheduleOnUI` — both\n  implemented here.\n- `@gorhom/bottom-sheet` 5.2.14 imports nothing from\n  `react-native-worklets`; it reaches `runOnJS`/`runOnUI` through\n  `react-native-reanimated` and does not depend on the worklets package at\n  all. `react-native-gesture-handler` 3.1.0 does use `scheduleOnUI` from\n  this package, but behind a `try { require } catch`, so it was never\n  exposed to the unaliased-import failure mode described above.\n\nA symbol not listed anywhere in this section fails at bundle time, with the\nbundler's own \"no export named X\" — the same behavior as the Reanimated\nsubpath.",
  },
  {
    doc: "docs/reference/styling.md",
    heading: "Layout (routed to Yoga)",
    text: "![The gallery's Layout section: flexDirection, justifyContent and alignItems arranging boxes under Yoga.](../shots/gallery/layout.png)\n\n`alignContent`, `alignItems`, `alignSelf`, `aspectRatio`, `bottom`,\n`columnGap`, `direction`, `display`, `flex`, `flexBasis`, `flexDirection`,\n`flexGrow`, `flexShrink`, `flexWrap`, `gap`, `height`, `justifyContent`,\n`left`, `margin`, `marginBottom`, `marginHorizontal`, `marginLeft`,\n`marginRight`, `marginTop`, `marginVertical`, `maxHeight`, `maxWidth`,\n`minHeight`, `minWidth`, `overflow`, `padding`, `paddingBottom`,\n`paddingHorizontal`, `paddingLeft`, `paddingRight`, `paddingTop`,\n`paddingVertical`, `position`, `right`, `rowGap`, `top`, `width` — all\n**supported**, with behavior defined by the layout engine itself.\n\n![The gallery's Clipping section: overflow: \"hidden\" cutting a View to its rounded shape, with hit-testing stopping at the same clip.](../shots/gallery/clipping.png)\n\n`overflow` is the one key that does not stop at Yoga: Yoga needs it while\nmeasuring (a scroll node's main axis is unconstrained), and the widget needs\nit to clip. GTK4 CSS has no `overflow` property, so this is a direct widget\ncall rather than a CSS declaration — the only style outside `transform` whose\nGTK half is not CSS. `hidden` clips paint and hit-testing to the widget's CSS\npadding box, rounded by `borderRadius`; `scroll` clips the same way and adds\nno scrolling of its own — matching RN, where only a `ScrollView` scrolls;\n`visible` (the default) lets children paint past the container, as in RN.",
  },
  {
    doc: "docs/reference/styling.md",
    heading: "Visual (routed to GTK CSS)",
    text: "- **`backgroundColor`** — supported: `background-color`.\n- **`opacity`** — supported: `opacity`, clamped to `[0, 1]`.\n- **`boxShadow`** — supported: `box-shadow`, from either RN form — a CSS\n  string or a `BoxShadowValue[]` array. A string is parsed rather than\n  forwarded, so colors go through the same color parser (a `PlatformColor`\n  works inside a shadow) and a malformed shadow is dropped with one\n  development warning instead of corrupting the declaration block. Lengths\n  follow RN's own grammar — a bare number or `px`, nothing else; blur may\n  not be negative. Differs from react-native: an omitted `color` renders as\n  black, not `currentColor` — RN's own documented deviation from CSS, kept\n  here on purpose. Shadow order is CSS's: the first one paints on top.\n- **`outlineWidth`** — supported: `outline-width`; an unset `outlineStyle`\n  becomes `solid` automatically once the width is greater than 0 (GTK, like\n  the web, otherwise defaults to `none`). Takes no layout space, so unlike\n  `borderWidth` it never reaches Yoga.\n- **`outlineColor` / `outlineOffset` / `outlineStyle`** — supported:\n  `outline-color` / `outline-offset` (px, negative allowed) /\n  `outline-style` (`solid`/`dotted`/`dashed`); an explicit style always wins\n  over the automatic solid.\n- **`borderWidth`** — supported: `border-width`; an unset `borderStyle`\n  becomes `solid` automatically once any border width is greater than 0\n  (GTK otherwise defaults to `none`).\n- **`borderTopWidth` / `borderRightWidth` / `borderBottomWidth` /\n  `borderLeftWidth`** — supported: per-side `border-*-width`, emitted after\n  the shorthand and overriding it; each also triggers the automatic solid\n  style.\n- **`borderColor`** — supported: `border-color`; with no width the border\n  stays invisible, since the default width is 0, as in RN.\n- **`borderTopColor` / `borderRightColor` / `borderBottomColor` /\n  `borderLeftColor`** — supported: per-side `border-*-color`, emitted after\n  the shorthand and overriding it.\n- **`borderStyle`** — supported: `border-style`\n  (`solid`/`dotted`/`dashed`); an explicit value wins over the automatic\n  solid.\n- **`borderRadius`** — supported: `border-radius`.\n- **`borderTopLeftRadius` / `borderTopRightRadius` /\n  `borderBottomRightRadius` / `borderBottomLeftRadius`** — supported:\n  per-corner `border-*-radius`, emitted after the shorthand and overriding\n  it.\n- **`color`** — supported: `color`.\n- **`fontFamily`** — supported: `font-family` (a name containing spaces is\n  quoted).\n- **`fontSize`** — supported: `font-size`, in px.\n- **`fontStyle`** — supported: `font-style`.\n- **`fontWeight`** — supported: `font-weight` (both keyword and\n  numeric-string forms, `\"100\"`–`\"900\"`).\n- **`letterSpacing`** — supported: `letter-spacing`, in px.\n- **`lineHeight`** — partial: `line-height`, in px (GTK ≥ 4.6). Matches\n  RN's \"line height in points\" semantics; RN's multiplier form is not\n  supported.\n- **`textAlign`** — partial: applied by `Text` directly rather than\n  through CSS, since GTK4 CSS has no `text-align` — resolved to a label's\n  own `xalign`/`justification` properties.\n- **`textDecorationLine`** — partial: applied by `Text` directly rather\n  than through CSS, since GTK4 has no widget-level `text-decoration` —\n  resolved to Pango's own `underline`/`strikethrough` attributes, which\n  also reserve room below the baseline for an underline where one is\n  measured.\n- **`transform`** — partial: never reaches CSS (GTK4 has no widget\n  `transform` property) — the array is folded into one matrix and handed\n  to the container's own allocation. `translateX`/`translateY`, `scale`,\n  `scaleX`, `scaleY`, `rotate`/`rotateZ` only; no 3D, no skew, no `matrix`,\n  no `transformOrigin` — see\n  [Components](components/index.md#layout-paint-and-hit-testing).",
  },
  {
    doc: "docs/reference/styling.md",
    heading: "Colors",
    text: '| Format                                     | Status    | Note                                                                                                                                             |\n| ------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |\n| named colors (CSS Color 4), `transparent`  | supported | normalized to `rgb()`/`rgba()`                                                                                                                   |\n| `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` | supported | normalized to `rgb()`/`rgba()`                                                                                                                   |\n| `rgb()` / `rgba()`                         | supported | both comma and space syntax (`rgb(255 0 0 / 0.5)`); channels as numbers or percentages                                                           |\n| `hsl()` / `hsla()`                         | supported | hue as a number or with `deg`; saturation/lightness strictly as percentages; converted to `rgb()`/`rgba()`                                       |\n| `PlatformColor("accent-bg-color", ...)`    | supported | resolves to `var(--accent-bg-color, ...)` — Adwaita theme variables (libadwaita ≥ 1.6); `@name` reaches a legacy GTK named color as the fallback |\n| `var(--...)` / `@name` as a plain string   | supported | passed through without normalization                                                                                                             |\n| an invalid string                          | ignored   | the color parses to nothing; the declaration is dropped, with one development warning per distinct value                                         |',
  },
  {
    doc: "docs/reference/styling.md",
    heading: "Not part of the style contract",
    text: "Any key outside `LayoutStyle`/`VisualStyle`/`BehavioralStyle` — `elevation`,\n`filter`, `mixBlendMode`, `textTransform`, `tintColor`, and the like — is\naccepted, warned about once per key, and dropped. `pointerEvents` and\n`zIndex` are `BehavioralStyle`: each is read by the component that implements\nthe behavior, not by either half of this pipeline (see\n[Components](components/index.md#layout-paint-and-hit-testing) for both).",
  },
  {
    doc: "docs/reference/svg.md",
    heading: "Import and aliasing",
    text: "`react-native-gtkx/svg` re-exports its component set in `react-native-svg`'s\nown shape: `Svg` as both the default and a named export, everything else\nnamed. The `react-native-gtkx/metro` and `react-native-gtkx/vite` presets\nalias the bare `react-native-svg` package name onto this subpath\nautomatically, the same way they alias `react-native` itself, so portable\ncode that imports from `react-native-svg` runs unmodified. Apps using\nneither preset can point their own bundler alias at `react-native-gtkx/svg`\nby hand. `react-native-svg` itself is never a dependency of this package and\ndoes not need to be installed — the alias works whether or not the real\npackage is present.\n\n`react-native-gtkx/dnd` follows the exact same aliasing pattern for\n`react-native-reanimated-dnd`; see [dnd.md](dnd.md) if drag-and-drop is also\npart of the app being ported.",
  },
  {
    doc: "docs/reference/svg.md",
    heading: "`Svg`",
    text: 'The root component. It is a Yoga leaf, sized entirely by style/flex — like\n`Image`, never by measuring the widget, so nothing here is intrinsic-sized.\n\n| Prop                  | Behaviour                                                                                                       |\n| --------------------- | --------------------------------------------------------------------------------------------------------------- |\n| `width` / `height`    | Convenience props layered onto `style`, sizing the leaf.                                                        |\n| `style`               | The general sizing/layout escape hatch, same as any other view.                                                 |\n| `viewBox`             | `"minX minY width height"`. Reshapes the internal coordinate system exactly like real SVG — Yoga never sees it. |\n| `preserveAspectRatio` | `xMin`/`xMid`/`xMax` × `YMin`/`YMid`/`YMax`, `meet`/`slice`, or `none`; defaults to `xMidYMid meet`.            |\n\nContent always clips to the allocated bounds. There is no `overflow: visible`\nopt-out.',
  },
  {
    doc: "docs/reference/svg.md",
    heading: "Shapes",
    text: '- **`Path`** — `d` is handed straight to `Gsk.Path.parse()`, which\n  understands SVG path syntax natively. There is no path parser of this\n  project\'s own.\n- **`Rect`** — `x`/`y`/`width`/`height`/`rx`/`ry`.\n- **`Circle`** — `cx`/`cy`/`r`.\n- **`Ellipse`** — `cx`/`cy`/`rx`/`ry`.\n- **`Line`** — `x1`/`y1`/`x2`/`y2`. Stroke-only: there is no `fill` prop at\n  all on `Line`, not even one that is silently ignored.\n- **`Polygon`** / **`Polyline`** — `points`, either `"x,y x,y …"` or a space\n  -separated equivalent; closed and open respectively.\n\nEvery shape other than `Path` is a small geometry helper away from the same\n`d` syntax, so all of them end up drawn through that one `Gsk.Path.parse()`\ncall.',
  },
  {
    doc: "docs/reference/svg.md",
    heading: "Paint props",
    text: 'Every shape accepts the same paint props:\n\n| Prop                                        | Behaviour                                                                                                                                                                      |\n| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |\n| `fill` / `stroke`                           | A static CSS color — hex, `rgb()`, `hsl()`, a named color, `transparent`, `none`, or `"url(#id)"` referencing a gradient. Defaults match SVG: `fill="black"`, `stroke="none"`. |\n| `fillRule`                                  | `nonzero` \\| `evenodd`.                                                                                                                                                        |\n| `fillOpacity` / `strokeOpacity` / `opacity` | Independent opacity channels.                                                                                                                                                  |\n| `strokeWidth`                               | Stroke thickness.                                                                                                                                                              |\n| `strokeLinecap` / `strokeLinejoin`          | Line cap and join style.                                                                                                                                                       |\n| `strokeDasharray` / `strokeDashoffset`      | Dash pattern and its offset.                                                                                                                                                   |\n\nAn unresolvable `url(#id)` reference paints nothing for that fill/stroke\nrather than throwing.',
  },
  {
    doc: "docs/reference/svg.md",
    heading: "Grouping and transforms (`G`)",
    text: "`G` groups children under an `opacity` and/or a `transform` string:\n`translate()`, `scale()`, `rotate()`, `rotate(a, cx, cy)`, and `matrix()` —\nthe plain SVG transform-list syntax. `matrix()` maps directly onto\n`Gsk.Transform.matrix2d()`.\n\nDiffers from react-native-svg: `skewX`/`skewY` and the structured\n`transform={[{ translateX: ... }]}` array form that `Animated.View` accepts\nelsewhere in this platform are not supported on `G` — only the string form.",
  },
  {
    doc: "docs/reference/svg.md",
    heading: "Gradients",
    text: '`<Defs>` holds gradient definitions and must be a direct child of `Svg`;\nnested `Defs` are not scanned.\n\n- **`<LinearGradient id x1 y1 x2 y2>`** and **`<RadialGradient id cx cy r>`**\n  take fractions from 0 to 1 by default (`gradientUnits="objectBoundingBox"`,\n  mapped against the shape\'s own `Gsk.Path.getBounds()`).\n  `gradientUnits="userSpaceOnUse"` uses the coordinates as-is instead.\n- Each gradient holds **`<Stop offset stopColor stopOpacity>`** children.\n  `offset` accepts either `0.5` or `"50%"`.\n\nDiffers from react-native-svg: there is no `gradientTransform`, and no\n`spreadMethod` beyond the default pad behavior.',
  },
  {
    doc: "docs/reference/svg.md",
    heading: "Animated values",
    text: "The numeric props above — shape geometry, `opacity`, `strokeWidth`,\n`strokeDashoffset` — accept an `Animated.Value` or interpolation in place of\na plain number. A tick mutates the widget's paint state directly and calls\n`queueDraw()`, the same bypass-React pattern `Animated.View` uses for\n`transform`, on its own invalidation channel, since none of this touches\nYoga.\n\n`G`'s `transform` string and `Path`'s `d` / `Polygon`/`Polyline`'s `points`\nare not Animated-aware — they are strings, not numbers.",
  },
  {
    doc: "docs/reference/svg.md",
    heading: "Differs from react-native-svg",
    text: "The shape set here — `Path`, `Rect`, `Circle`, `Ellipse`, `Line`, `Polygon`,\n`Polyline`, `G`, gradients — covers icons, charts and indicators, which is\nthe overwhelming majority of real SVG usage. The following are not part of\nthe surface:\n\n- No `SvgXml` / `SvgUri` — rasterizing an arbitrary SVG string or URI at\n  runtime. Loading `.svg` **files** is a different, already-covered\n  mechanism: `Image` loads them today, through its own rasterized-image\n  path rather than this vector widget tree. See the components reference\n  for that entry — it is not repeated here.\n- No `<Text>` / `<TSpan>` / `<TextPath>` — text laid out along or inside a\n  path.\n- No `<Mask>`, `<ClipPath>`, SVG filters, `<Use>`, `<Symbol>`, or\n  `<Pattern>`.\n\nNone of these have a real consumer yet in this platform's own apps.",
  },
  {
    doc: "docs/reference/components/index.md",
    heading: "Layout, paint and hit-testing",
    text: "A few rules apply across every component in this section rather than to one\nof them:\n\n![The gallery's Transforms section: a translated box painting over a neighbor without moving it, plus rotate/scale composed left to right.](../../shots/gallery/transforms.png)\n\n- **`zIndex` orders paint and picking, per sibling group.** GTK4 has no\n  z-order property, so the container widget provides it: children are\n  allocated in their Yoga order and painted (snapshotted) in `zIndex` order,\n  and a widget a higher-painting sibling covers declines to be hit-tested, so\n  input follows the pixels. Layout itself is untouched — only the paint pass\n  is sorted. The rules match RN, each checked rather than assumed: `zIndex`\n  applies whatever the component's `position` is (CSS requires a non-`static`\n  position; neither RN nor this platform does); equal values keep document\n  order (the sort is stable); `undefined` behaves as `0`, and negative values\n  are legal and paint below untagged siblings; and the ordering is **scoped to\n  one sibling group** — it creates no stacking context that escapes the\n  parent, so a child can never paint above its parent's own siblings. That\n  last rule is what to design around: to lift a dragged item over a drop\n  target, put the `zIndex` on the dragged item's row, exactly as on iOS and\n  Android. `Animated.View` and `useAnimatedStyle` reorder on the same terms as\n  `opacity` — one widget write, no Yoga pass.\n\n  One divergence from RN: an interactive native leaf inside a covered\n  sibling — a `TextInput`, a `Switch`, a `ScrollView` viewport, a raw GTK\n  widget in a slot — still receives a press even where a raised view visually\n  covers it, because GTK's per-point hit test is consulted after a widget's\n  children regardless of paint order. `Text` and `Image` do not have a press\n  prop of their own, so while something is raised above them they are\n  excluded from hit-testing and the press reaches their nearest `View`\n  instead — which is also why a `pointerEvents: \"box-none\"` `View` whose only\n  child is `Text` lets a press fall through to whatever is behind it, while a\n  sibling in that same container stays raised.\n\n- **`transform` is paint-only, like RN.** `translateX`/`translateY`, `scale`,\n  `scaleX`, `scaleY` and `rotate`/`rotateZ` apply to any component's style,\n  not just `Animated.View`; the array composes left to right, as in RN and\n  CSS, and the origin is always the component's own center. A transformed\n  child draws past its container and over siblings — later siblings stay on\n  top unless `zIndex` says otherwise — without moving any ancestor, and input\n  follows the transform: a rotated view is clickable in its rotated shape,\n  unless a container's `overflow: \"hidden\"` clips it at the edge exactly as it\n  clips an untransformed child. Not supported: 3D transforms (`rotateX`,\n  `rotateY`, `perspective`), `skewX`/`skewY`, `matrix`, and `transformOrigin`\n  (the origin is always centered).\n\n- **Animations never auto-stop.** The desktop's own \"reduce animations\"\n  preference is not applied automatically — GTK-side animations stay on to\n  match `Animated`, which runs on its own timers regardless of that setting.\n  Honoring reduced motion is an app-level opt-in, exactly as it is in RN.\n\nSee [Styling](../styling.md) for the full style-property reference (what\nreaches Yoga, what reaches GTK CSS, and what `overflow` does at the boundary\nbetween the two).",
  },
  {
    doc: "docs/architecture/overview.md",
    heading: "The path from JSX to a window",
    text: "A `View`, a `Text`, a `Pressable` are ordinary React function components —\nthis package has no reconciler of its own. Each one renders a gtkx host\nelement (a `GtkBox`, in `View`'s case) that gtkx's own reconciler mounts as a\nreal GTK widget through the FFI: a widget call is a synchronous, in-process\ncall, with no serialization step between it and the code that made it. That\nremoves the \"bridge tax\" that shaped classic React Native's architecture —\nthere is no batched JSON channel to a separate UI thread to cross.\n\nPosition and size are a second, independent handoff. Every RN-shaped\ncontainer widget installs a custom `Gtk.LayoutManager` subclass, registered\nfrom JS, whose `measure()` and `allocate()` vfuncs do nothing but ask this\npackage's own layout engine for a number and a set of child rectangles. GTK's\nlayout cycle is not synchronized with Yoga after the fact — for these\nwidgets, Yoga computes the layout GTK's allocation pass performs. The engine\nthat does this, the shadow tree it keeps, and the style split that feeds it\nare the subject of [Layout and styling](layout-and-styling).",
  },
  {
    doc: "docs/architecture/overview.md",
    heading: "Three subpaths beneath the portable surface",
    text: 'Everything reachable from plain `"react-native"` is portable. Underneath it,\nthree subpaths give you the platform itself, with nothing filtered out:\n\n```\nyour app\n   ├── react-native                    portable components\n   ├── react-native-gtkx/navigation    react-navigation adapter   (optional)\n   ├── react-native-gtkx/common        what this package wrote itself\n   ├── react-native-gtkx/adw           libadwaita widgets, bound directly\n   └── react-native-gtkx/gtk           GTK widgets, bound directly\n```\n\nThree rules make the rest of this page easy to reason about:\n\n1. **The import says what you\'re opting into.** Anything from\n   `react-native-gtkx/gtk` or `react-native-gtkx/adw` is Linux-only, which\n   shows up in review as a decision, not an accident.\n2. **A prefix tells you whose widget it is.** `AdwHeaderBar`, `GtkButton`,\n   `AdwNavigationView` — that IS the widget, bound by gtkx. No prefix —\n   `NavigationStack`, `SlotContent`, `Widget` — means this package wrote it.\n   A wrapper of ours never makes the underlying widget unreachable.\n3. **None of this knows about react-navigation.** No router is involved and\n   none is required. `react-native-gtkx/navigation` is a thin adapter built\n   on these primitives, the same way `@react-navigation/native-stack` is\n   built on `react-native-screens` — an app can skip the adapter entirely\n   and drive an `Adw.NavigationView` from its own state. See\n   [Window, navigation, and settings](integration) for that adapter and for\n   everything the three subpaths expose beyond a single widget.',
  },
  {
    doc: "docs/architecture/overview.md",
    heading: "The widget surface: wrapped, raw, and auxiliary",
    text: 'Every `Gtk.Widget` and `Adw.Widget` subclass gtkx binds is exported — 86 GTK\nwidgets and 46 Adwaita widgets at present, from `GtkBox` and `GtkButton` to\n`GtkColumnView` and `AdwToolbarView`. The list is generated, not hand-picked:\n`scripts/generate-widget-surface.ts` classifies gtkx\'s full binding by real\nGObject inheritance, and the classification is committed\n(`scripts/widget-surface/classification.json`) so it stays exact between\ngtkx upgrades — re-run the generator after one to pick up new widgets; it\ndiffs against its own previous output.\n\nMost of that surface is **wrapped**: it keeps every prop gtkx binds and gains\n`style`/`onLayout`, exactly like any other React Native component.\n\n```tsx\n<GtkEntry\n  style={{ flex: 1 }}\n  placeholderText="Filter"\n/>\n<GtkButton\n  style={{ width: 72, backgroundColor: "#3584e4", borderRadius: 6 }}\n  label="Go"\n/>\n```\n\nThe entry flexes, the button takes its own width and colour — the layout half\nof the style drives Yoga, the visual half becomes a GTK CSS class **on the\nwidget itself**, so the button really is blue rather than a blue box sitting\nbehind one.\n\nTwo families are exported **raw** instead, because a wrapper box around them\nwould be invalid GTK rather than a convenience:\n\n- **Toplevels** — everything implementing `GtkRoot`: `GtkWindow` and every\n  `Gtk*Dialog`, `GtkApplicationWindow`, `GtkAssistant`, `GtkShortcutsWindow`\n  and their Adwaita counterparts (`AdwWindow`, `AdwApplicationWindow`,\n  `AdwAboutWindow`, `AdwMessageDialog`, `AdwPreferencesWindow`), plus\n  `GtkDragIcon` — which derives `Gtk.Widget` directly and is a toplevel all\n  the same, which is why the rule is written against the `GtkRoot`\n  capability rather than against `Gtk.Window` as one familiar instance of\n  it. `GtkPopover` sits on the other side of that line — a `GtkNative` but\n  not a `GtkRoot`, parented with `gtk_popover_set_parent` — and stays\n  wrapped.\n- **Child-only widgets** — valid solely as the direct child of one specific\n  parent. `GtkListBoxRow` and `GtkFlowBoxChild` (plus everything deriving\n  them — every Adwaita preferences row, `AdwActionRow` included) are caught\n  mechanically, by inheritance. `AdwNavigationPage` and `AdwPreferencesPage`\n  derive `Gtk.Widget` directly with no shared base to catch them the same\n  way, so they\'re a small, doc-verified denylist instead — see\n  `scripts/widget-surface/classify.ts`.\n\nEvery raw export above is still exported, by name, from `react-native-gtkx/gtk`\nor `/adw`, exactly as gtkx binds it — reach the widget with a `ref` where you\nneed one directly. `GtkGestureClick` is a third, simpler case: an event\ncontroller, not a widget at all, so it was never a candidate for wrapping.\n\nA further set of exports are not `Gtk.Widget`/`Adw.Widget` subclasses at all,\nso the generator never sees them either: actions and menus (`GSimpleAction`,\n`GMenu`), a responsive breakpoint (`AdwBreakpoint`, detailed in\n[Layout and styling](layout-and-styling)), one option of an `AdwToggleGroup`\n(`AdwToggle`), the two leaf elements an `AdwShortcutsDialog` is built from,\na text buffer and an adjustment (`GtkTextBuffer`, `GtkAdjustment`), keyboard\nshortcuts (`GtkShortcut`, `GtkShortcutController`), and the two drag-and-drop\ncontrollers (`GtkDragSource`, `GtkDropTarget`):\n\n```tsx\n<GtkApplicationWindow\n  actions={\n    <GSimpleAction\n      name="new"\n      onActivate={onNew}\n    />\n  }\n  breakpoints={\n    <AdwBreakpoint\n      condition={Adw.BreakpointCondition.parse("max-width: 500sp")}\n      onApply={() => setCollapsed(true)}\n      onUnapply={() => setCollapsed(false)}\n    />\n  }\n/>\n```',
  },
  {
    doc: "docs/architecture/overview.md",
    heading: "`react-native-gtkx/common`: what has no upstream counterpart",
    text: "Nothing in this subpath carries an `Adw`/`Gtk` prefix, because none of it is\na binding — it's the plumbing between the two worlds:\n\n- **`Icon`** — a _named_ icon resolved against the desktop icon theme at\n  paint time, not a bundled asset like RN's `Image`. It recolours itself\n  with the label colour and follows the user's theme, which nothing in\n  `Image`'s contract can express, behind the same shape RN apps already use\n  (`<Icon name size />`).\n- **`SlotContent` / `IntrinsicContent`** — the boundary that lets React\n  Native content live inside a GTK widget's slot or content area. Detailed\n  in [Layout and styling](layout-and-styling), which is where the boundary\n  actually matters.\n- **`Widget` / `wrapReactNative` / `useWidgetLayout`** — the reverse\n  direction: giving a raw GTK widget a place in React Native layout. Also in\n  [Layout and styling](layout-and-styling).\n- **`NavigationStack` / `NavigationStackPage`** — a declarative layer over\n  `Adw.NavigationView`, which is imperative (`push`/`pop`/`pop_to_tag`) where\n  React is not. Detailed in\n  [Window, navigation, and settings](integration).\n\nThis platform does not re-implement Adwaita chrome in React Native — reach\nfor `AdwActionRow` and friends from `react-native-gtkx/adw`, inside a\n`GtkListBox` with `cssClasses={[\"boxed-list\"]}` (see the\n[Reference](../reference) for the full row family). The style layer's\n`boxShadow`, `outline*` and `textDecorationLine` properties exist precisely\nso that an Adwaita-looking list stays expressible in a plain `StyleSheet`\nwhen you do want to build one by hand — the frame is a three-part\n`box-shadow` rather than a border, the focus ring an `outline`, which takes\nno layout space. Drag-to-reorder goes through one module,\n`react-native-gtkx/dnd` (see the Reference) — a `Droppable` around a\n`Draggable` per row inside one `DropProvider` — rather than a bespoke\nreorder prop.",
  },
  {
    doc: "docs/architecture/overview.md",
    heading: "Namespaces",
    text: "`Adw`, `Gdk`, `Gio`, `Gtk` and `Pango` are exported as values from both\n`react-native-gtkx/gtk` and `/adw`, because code needs both the runtime enums\nand the types:\n\n```tsx\n;<GtkScrolledWindow hscrollbarPolicy={Gtk.PolicyType.NEVER} />\nconst viewRef = useRef<Adw.NavigationView | null>(null)\n```",
  },
  {
    doc: "docs/architecture/overview.md",
    heading: "Wrapping a widget this package hasn't caught up to yet",
    text: "`scripts/generate-widget-surface.ts` covers every `Gtk.Widget`/`Adw.Widget`\nsubclass gtkx binds as of its last run, but a gtkx release can add a widget\nbefore the generator has been re-run for it, and a non-widget GI class (an\nevent controller, a filter, an adjustment) was never a generator candidate in\nthe first place. `wrapReactNative` reaches either without waiting — it's\ngeneric, so the widget's own prop types survive:\n\n```tsx\nimport { GtkPopover } from \"@gtkx/jsx/gtk\"\nimport { wrapReactNative } from \"react-native-gtkx/common\"\n\nconst Popover = wrapReactNative(GtkPopover)\n// <Popover style={{ width: 240 }} autohide … /> — `autohide` still typed\n```\n\nThat's the same mechanism the generated surface itself uses under the hood,\napplied by hand. Two lower-level forms exist for cases even that doesn't fit:\n`<Widget style={…}>` wraps an element already in hand, and\n`useWidgetLayout(ref, { style })` attaches layout to a widget whose ref you\nalready own, with no wrapper component at all.",
  },
  {
    doc: "docs/architecture/overview.md",
    heading: "The escape hatch",
    text: "If something is still missing, reach the widget directly — every wrapper\nhere forwards its `ref` to the real GObject:\n\n```tsx\nconst viewRef = useRef<Adw.NavigationView | null>(null)\n<NavigationStack ref={viewRef} stack={stack}>…</NavigationStack>\n// viewRef.current is the real Adw.NavigationView\n```\n\nThere is deliberately no wall. A missing convenience should cost one line,\nnot a fork.\n\n---\n\nMeasured numbers behind these decisions (the Yoga/GTK feasibility spike,\nframe-budget studies, the navigation research) live in `docs/research/` —\nrepo-only working notes, not published here. The standing gtkx upstream\nagenda is `docs/upstream-gtkx.md`, and every RC-stage workaround the bridge\ncarries is cataloged in `docs/gtkx-rc4-notes.md`.",
  },
  {
    doc: "docs/architecture/overview.md",
    heading: "Related",
    text: "- [Reference](../reference) — the full component and API surface, GTK/Adw\n  by badge.\n- [Layout and styling](layout-and-styling) — the Yoga shadow tree, the\n  layout/visual style split, and the two ways to react to a resize.\n- [Window, navigation, and settings](integration) — `NavigationStack`,\n  window actions and controllers, `GSettings`.\n- [Gestures](gestures) — the responder system and `PanResponder` on GTK\n  event controllers.",
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "One Yoga engine per layout root",
    text: "A `LayoutEngine` owns one Yoga tree and batches every mutation — a style\nchange, a tree edit, a measurement invalidation — into a single Yoga\n`calculateLayout` pass per microtask, however many components touched the\ntree before the pass runs. After that pass, committing widget rectangles is\n**incremental**: the engine walks only the paths a mutation could have\nchanged, driven by two signals together —\n\n- Yoga's own per-node `hasNewLayout` flag, set on every node Yoga actually\n  re-laid out. It catches what a dirty set alone can't know: changing one\n  child re-lays out its _following siblings_ (they shift) and any ancestor\n  whose size followed, while an untouched subtree keeps its cached,\n  parent-relative layout even when its container moved.\n- the engine's own dirty set — which node each mutation actually came from —\n  which catches what Yoga's flag doesn't imply: a re-measured leaf whose\n  rectangle came out identical still has to recommit, because measuring it\n  reset its own widget size request.\n\nWidget moves are committed first for the whole pass, then `onLayout`\ncallbacks fire in a second pass over only the entries whose rect changed —\nmatching React Native's own two-phase order.",
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "GTK's allocation cycle IS the Yoga pass",
    text: "Every RN-shaped container widget (`View`'s `GtkBox`, and anything wrapped\nthrough `Widget`/`wrapReactNative`) runs a custom `Gtk.LayoutManager`\nsubclass, registered from JS, that does nothing but delegate: `measure()`\nreturns whatever the engine already computed for that node, and\n`allocate()` hands the container's final size to the engine, which places\nevery child at its computed rectangle synchronously, inside GTK's own\nallocation pass. GTK never queries children for their own size preferences\nthrough this path — Yoga already decided, and GTK is told, not asked. That\nis what removes the layout conflicts a naive integration would hit: a\nwindow's minimum-size ratchet, overflow children inflating their ancestors,\nwidget minimums pushing rectangles around.",
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "Three flavors of layout root",
    text: "A layout root is where a `LayoutEngine` is created. There are three, and the\ndifference is which side reports size to which:\n\n- **The window root**, created once by `AppRegistry.runApplication`. In the\n  ordinary case it adopts GTK's own window allocation as its Yoga viewport —\n  the window decides the size, layout fills it.\n- **`SlotContent`** (`NestedRoot`) — a full, independent Yoga engine mounted\n  inside _any_ GTK container slot: an `Adw.NavigationPage`'s content, a\n  toolbar view's body, a future container nobody has written yet. It follows\n  the slot's own allocation exactly like the window root follows the\n  window — the slot decides the size.\n- **`IntrinsicContent`** (`IntrinsicRoot`) — the other direction: this root's\n  own Yoga-computed content size becomes _its_ size request to GTK, so a\n  `HeaderBar` slot or a sidebar row can ask \"how big are you?\" and get an\n  answer built from real React Native content. Measuring runs a speculative,\n  uncommitted Yoga pass first (honoring GTK's width-for-height style\n  constraint), and the allocation pass that follows recomputes at the real\n  size and commits it.\n\nUse `SlotContent` for a page body, a pane, a dialog body — anything that\nshould fill the rectangle it's given. Use `IntrinsicContent` for a HeaderBar\nslot, a toolbar area, a list row — anything that should be sized by what it\nholds. `createSidebarNavigator`'s `sidebarRow` screen option wraps its\ncontent in exactly `IntrinsicContent`, because a sidebar row is sized by\nwhat it holds, not stretched to fill the list.",
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "Why the boundary matters",
    text: "A GTK widget hands out rectangles two ways: as ordinary children (a content\narea) and as slots — properties that take a widget, `titleWidget={…}`,\n`sheet={…}`. Which way a given area arrives is gtkx's own business, and it\nmoves between gtkx releases; it has never had anything to do with layout.\nBoth are GTK's territory, and both need the same thing on the way in: the\nenclosing React Native layout root is cleared, so a widget lands bare, and\nanything that should be React Native content again has to bring its own\nroot — one of these two:",
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "React Native content inside GTK slots",
    text: "| Export             | Sizing                       | Use for                                          |\n| ------------------ | ---------------------------- | ------------------------------------------------ |\n| `SlotContent`      | fills the slot               | a page body, a pane, a dialog body               |\n| `IntrinsicContent` | sized by its own Yoga layout | an AdwHeaderBar slot, a toolbar area, a list row |\n\nForget the wrapper, and the failure is not a wrong-looking window — it's\ncontent silently laid out against the _wrong_ rectangle. Without a root,\ncontent dropped into a widget's slot or child position would join the\n_enclosing_ Yoga tree, measured against the window's viewport, while GTK\nhands the widget only its own rectangle: laid out against one box, drawn in\nanother, quietly stealing space from a tree it was never in. The platform\ncatches this instead of letting it happen silently — every element-valued\nprop a wrapped widget is given, and its children, are put behind a boundary\nthat clears the layout root and remembers where the content was headed, so\nthe first read of a Yoga hook downstream throws a message naming the exact\nwidget and slot (\"`AdwBottomSheet`'s `sheet` slot\") and which of\n`SlotContent`/`IntrinsicContent` to wrap it in.\n\nWhich of the two is right cannot be inferred, and one widget proves why:\n`AdwBottomSheet` alone FILLS its content child but HUGS both `sheet` (a\nbottom sheet rises to the height of its own contents) and `bottomBar`. One\nwidget, three content areas, two answers, nothing in the name or the GI type\nto tell them apart — the answer lives in the widget's own layout code, not\nin a rule this platform could apply mechanically.\n\n```tsx\n<AdwBottomSheet\n  style={{ flex: 1 }}\n  sheet={\n    <IntrinsicContent>\n      <View style={{ padding: 20, gap: 10 }}>…</View>\n    </IntrinsicContent>\n  }\n  bottomBar={\n    <IntrinsicContent>\n      <View style={{ flexDirection: \"row\", gap: 8 }}>…</View>\n    </IntrinsicContent>\n  }\n>\n  <SlotContent>\n    <View style={{ flex: 1, justifyContent: \"center\" }}>…</View>\n  </SlotContent>\n</AdwBottomSheet>\n```\n\nNote the two independent sizes here: `style={{ flex: 1 }}` on `AdwBottomSheet`\nitself is the _widget's_ size in the surrounding React Native layout (a\nwrapped widget is a Yoga leaf at its own natural size until a style says\notherwise); the wrapper inside each content area sizes the _content_ within\nthe rectangle that widget then hands out.",
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "Giving a raw GTK widget a place in Yoga's tree",
    text: 'The reverse bridge — a GTK widget that should participate in React Native\nlayout rather than sit in a slot — is `Widget`, `wrapReactNative`, and\n`useWidgetLayout`. All three do the same thing: give the widget a Yoga leaf,\napply the layout half of a style to it, and — the part that matters — measure\nthe widget\'s own natural size, so it lands at the size the GTK theme wants\nrather than collapsing to zero.\n\n```tsx\n<View style={{ flexDirection: "row", gap: 8, padding: 12 }}>\n  <Widget style={{ flex: 1 }}>\n    <GtkEntry placeholderText="Search" />\n  </Widget>\n  <Widget>\n    <GtkButton iconName="edit-find-symbolic" />\n  </Widget>\n</View>\n```\n\n`wrapReactNative` additionally detects, at render time, whether there\'s a\nYoga tree to join at all. **Outside React Native layout it steps aside**: the\nsame `GtkButton` dropped into an `AdwHeaderBar`\'s `start` or an\n`AdwToolbarView`\'s `topBar` — where there is no enclosing root — renders as\nthe bare widget, with `style`/`onLayout` dropped rather than forwarded to a\nGObject property that doesn\'t exist. One exported symbol, both worlds, no\nflag to remember.',
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "The style split",
    text: "A flattened style is partitioned into three disjoint buckets, each consumed\nby exactly one part of the pipeline, and the split is exhaustive by\nconstruction — adding a new style key without classifying it fails\ncompilation, not a runtime check:\n\n- **Layout properties** (`flex`, `padding`, `gap`, `position`, and the rest\n  of Yoga's own vocabulary) drive the Yoga node directly.\n- **Visual properties** (`backgroundColor`, `borderRadius`, `boxShadow`,\n  `outline*`, `opacity`, the font properties, `transform`) compile to a GTK\n  CSS class applied to the widget itself — not a wrapper around it — except\n  `transform`, which is applied as the child's allocation transform rather\n  than through CSS, and `textAlign`/`textDecorationLine`, which Pango\n  carries and `Text` applies directly.\n- **Behavioral properties** (`pointerEvents`, `zIndex`) belong to neither\n  Yoga nor CSS and are consumed silently by the component that owns the\n  behavior: `pointerEvents` maps onto GTK's own hit-testing (`can-target`,\n  and a `contains()` override for `box-none`/`box-only`), and `zIndex`\n  becomes the enclosing container's paint and pick order. GTK4 CSS has no\n  `overflow` property either, so `overflow` is the one visual-shaped\n  property applied as a direct widget call rather than a class — it also\n  has to reach Yoga, since Yoga needs it while measuring, so it is the one\n  style property both halves of the pipeline read.\n\nAn unrecognized property warns once, by name, and is dropped — this is what\ncatches a typo or an unimplemented RN style property before it silently does\nnothing.",
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "Two ways to react to size",
    text: "Two mechanisms answer two different questions, and neither replaces the\nother.\n\n**\"Render different content at different widths\"** is `useWindowDimensions`\n— portable, and already how React Native answers this everywhere else. A\nresize triggers a React render, the component reads the new width, and\nreturns different JSX. This is the only tool for anything that changes\n_what_ is rendered: swapping a filter bar for a compact one, hiding a\ncolumn, changing text.\n\n**\"Flip a widget property natively at a threshold, with no render at all\"**\nis `AdwBreakpoint` + `AdwBreakpointBin`. `Adw.Breakpoint` is a condition — a\nsize or aspect-ratio threshold — plus a set of property setters: when the\ncondition starts holding, each setter writes its value onto its target\nobject's property directly, through GObject, inside GTK's own allocation\npass; when it stops holding, the setter restores whatever value the property\nheld before. No React commit, no Yoga pass, no JS callback runs for the flip\nitself — a resize costs nothing beyond what GTK's layout was already doing.\n\n`Adw.Breakpoint` is not a widget — its prototype chain bottoms out at plain\n`GObject.Object`, not `Gtk.Widget` — so it's exported raw, the same way\n`GtkGestureClick` is: running it through `wrapReactNative` would hand a Yoga\nnode to something that isn't a rectangle. `AdwBreakpointBin` **is** a real\nwidget — a container that scopes breakpoints to its own child subtree\ninstead of a whole window — and is wrapped normally. A breakpoint's setters\nmay only target widgets _inside_ the bin they're attached to, never the bin\nitself:\n\n```tsx\nconst splitViewRef = useRef<Adw.NavigationSplitView | null>(null)\nconst breakpointRef = useRef<Adw.Breakpoint | null>(null)\n\nuseEffect(() => {\n  if (!splitViewRef.current || !breakpointRef.current) return\n  const collapsed = new GObject.Value()\n  collapsed.init(GObject.typeFromName(\"gboolean\"))\n  collapsed.setBoolean(true)\n  breakpointRef.current.addSetter(splitViewRef.current, \"collapsed\", collapsed)\n}, [])\n\n<AdwBreakpointBin\n  breakpoints={\n    <AdwBreakpoint\n      ref={breakpointRef}\n      condition={Adw.BreakpointCondition.newLength(\n        Adw.BreakpointConditionLengthType.MAX_WIDTH,\n        500,\n        Adw.LengthUnit.SP,\n      )}\n    />\n  }\n>\n  <AdwNavigationSplitView ref={splitViewRef} …>…</AdwNavigationSplitView>\n</AdwBreakpointBin>\n```\n\n`addSetter` wants a genuine, boxed `GObject.Value` — a bare JS `true` fails a\n`G_IS_VALUE` assertion on the native side rather than silently coercing.\n`createSidebarNavigator`'s own `collapseWidth` option is built on exactly\nthis pair; reading `collapsed`/`showContent` back is a plain native property\nread through the same ref, not React state, so neither the flip nor a read\nof it costs a render.\n\nNo `useBreakpoint(condition) → boolean` hook exists. It would return a flag\nto JS and re-render on every crossing — a second name for\n`useWindowDimensions`, with none of the native setter's value. Reach for\n`useWindowDimensions` when the thing that should change is your component's\nJSX; reach for `AdwBreakpoint` only when the thing that should change is a\nwidget property GTK itself owns, and the change should cost nothing.\n\nOne limitation, stated as what it is rather than found along the way: under\nthis project's headless test compositor (sway), `AdwBreakpoint`'s\n`onApply`/`onUnapply` do not fire, even past a genuine resize past the\ncondition's threshold; they fire exactly as documented in a real GNOME\nsession. Treat this as a test-environment limitation, not a runtime defect.",
  },
  {
    doc: "docs/architecture/layout-and-styling.md",
    heading: "Related",
    text: "- [Overview](overview) — the widget surface this mechanism serves, and\n  where `Widget`/`wrapReactNative`/`SlotContent`/`IntrinsicContent` are\n  exported from.\n- [Window, navigation, and settings](integration) — `createSidebarNavigator`'s\n  `collapseWidth`, built on the breakpoint mechanism above.",
  },
  {
    doc: "docs/architecture/integration.md",
    heading: "Navigation without a router",
    text: "`NavigationStack` and `NavigationStackPage` are the two components this\npackage wraps a raw `Adw.NavigationView` in, because it's imperative\n(`push`/`pop`/`pop_to_tag`) where React is not:",
  },
  {
    doc: "docs/architecture/integration.md",
    heading: "Declarative primitives",
    text: '| Export                | What it is                                             |\n| --------------------- | ------------------------------------------------------ |\n| `NavigationStack`     | `Adw.NavigationView` driven by a `stack` array of tags |\n| `NavigationStackPage` | one page of that stack, identified by `tag`            |\n\nThey inherit every prop of the underlying widget and only add to it, so\nanything settable on `Adw.NavigationPage` is settable on `NavigationStackPage`\ntoo. The navigation state is an ordinary array of tags — change the array,\nthe widget animates:\n\n```tsx\nconst App = () => {\n  const [stack, setStack] = useState(["home"])\n\n  return (\n    <NavigationStack\n      stack={stack}\n      // The Adwaita back button, Escape, the back gesture and the\n      // back-history menu all arrive here. Follow them in your own state.\n      onPopped={(tag) => setStack((s) => s.filter((entry) => entry !== tag))}\n    >\n      <NavigationStackPage\n        tag="home"\n        title="Home"\n      >\n        <AdwToolbarView topBar={<AdwHeaderBar />}>\n          <SlotContent>\n            <Pressable onPress={() => setStack((s) => [...s, "detail"])}>\n              <Text>Open detail</Text>\n            </Pressable>\n          </SlotContent>\n        </AdwToolbarView>\n      </NavigationStackPage>\n\n      <NavigationStackPage\n        tag="detail"\n        title="Detail"\n      >\n        <AdwToolbarView topBar={<AdwHeaderBar />}>\n          <SlotContent>\n            <View />\n          </SlotContent>\n        </AdwToolbarView>\n      </NavigationStackPage>\n    </NavigationStack>\n  )\n}\n```\n\nPages not listed in `stack` are still accepted as children and simply aren\'t\nshown, so a router can hand over every screen it owns at once. As an app\'s\nroot — where GTK allocates it directly — `NavigationStack` needs nothing\nelse; nested anywhere inside a React Native layout it needs wrapping in\n`Widget`, because the component renders a raw `Adw.NavigationView`, which has\nno Yoga node of its own.\n\n`NavigationStack` inherits every prop of `Adw.NavigationView` and adds:\n\n| Prop                                        | Meaning                                                                                                                                                                         |\n| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `stack`                                     | ordered page tags, root first — the navigation state                                                                                                                            |\n| `animateTransitions`                        | forwarded to `Adw.NavigationView`\'s own property; default true. GTK has one transition style, so this is on/off                                                                 |\n| `onPopped(tag)`                             | the widget popped by itself — not called for pops caused by changing `stack`                                                                                                    |\n| `onPageClosed(tag)`                         | a closing page finished animating out and left the tree                                                                                                                         |\n| `onTransitionStart()` / `onTransitionEnd()` | a push/pop/replace began or finished, the latter driven by the transitioning page\'s own `shown`/`hidden` signal                                                                 |\n| `transitionDuration`                        | ms, default 400 — a fallback window for retention and the callbacks above, used only when a page\'s transition signal never arrives; not a measurement of real transition length |\n| `ref`                                       | the `Adw.NavigationView` itself                                                                                                                                                 |\n\n**Exit animations are handled for you.** When a tag leaves `stack`, the\nwidget still animates the page out — `NavigationStack` keeps a snapshot of\nthat page until its `hidden` signal, with a timer fallback for the two cases\nwhere that signal never arrives on its own (a compositor that never emits\nit, and a page skipped over entirely by a multi-hop pop), so nothing keeps\nrendering a page it already considers gone.\n\nReact Native content in native chrome is the same `IntrinsicContent`\nboundary the layout page describes, used against a HeaderBar slot:\n\n```tsx\n<AdwHeaderBar\n  start={\n    <IntrinsicContent>\n      <Text>{stack.length} deep</Text>\n    </IntrinsicContent>\n  }\n  end={[\n    <GtkButton\n      key="home"\n      iconName="go-home-symbolic"\n      onClicked={reset}\n    />,\n  ]}\n/>\n```',
  },
  {
    doc: "docs/architecture/integration.md",
    heading: "Mixing with react-navigation",
    text: "`react-native-gtkx/navigation` composes with everything above, because the\nnavigator is built on these same primitives — it is a convenience, not a\nceiling. Use it for an app's overall structure and drop to\n`react-native-gtkx/gtk`/`/adw` wherever a screen needs a widget the\nnavigator's options don't cover: a raw `GtkButton` in `headerButtons`, a\n`GtkListBox` inside a screen. Keep portable code portable with a `.linux.tsx`\nplatform extension or `Platform.select({ linux: … })` — an option a platform\ndoesn't understand is simply ignored, and in development the navigator warns\nwith the screen and option name rather than swallowing it silently.",
  },
  {
    doc: "docs/architecture/integration.md",
    heading: "Reaching the window and the application",
    text: '`useParentWindow` (the nearest `Gtk.Window` ancestor), `useApplication` (the\n`Adw.Application` — `.sendNotification(id, notification)` is the common\nreason to reach it), and `quit` (the same function `AppRegistry` wires to a\nwindow\'s own close button) let already-mounted code reach back into objects\n`AppRegistry.runApplication` already built, rather than construct them:\n\n```tsx\nconst window = useParentWindow()\nuseBindSetting({\n  schema,\n  key: "window-width",\n  object: window,\n  property: "defaultWidth",\n})\n```',
  },
  {
    doc: "docs/architecture/integration.md",
    heading: "Actions and shortcuts, declared in the tree",
    text: "`WindowActions`, `ApplicationActions` and `WindowControllers` register their\nchildren on the window or the application **from wherever they're written in\nthe component tree**. They render nothing where they sit — they're portals\nin React's own sense: the children stay part of the tree at that position,\nkeeping the context, state and effects they'd have there, while the\nregistration itself lands on the window or application object.\n\n```tsx\nconst NewTaskAction = () => {\n  const { addTask } = useStore() // an ordinary React context store\n  return (\n    <WindowActions>\n      <GSimpleAction\n        name=\"new\"\n        onActivate={() => addTask()}\n      />\n    </WindowActions>\n  )\n}\n```\n\nThat's `win.new` — what a HeaderBar button's `actionName`, a `GMenu` item and\nan `actionAccels` entry all target. `ApplicationActions` is the same\ncomponent against the application's action map (`app.*`); the two prefixes\nare not interchangeable — a `Gio.Notification`'s action button can only ever\nactivate an application action, and an application action outlives any one\nwindow. `WindowControllers` takes `Gtk.EventController` children; a\n`GtkShortcutController` with `scope={Gtk.ShortcutScope.GLOBAL}` is the\nreason it exists.\n\n**Reach for these, not `runApplication`'s `applicationActions`/\n`windowActions`/`windowControllers` options.** Those options build their\nchildren as props of the window `AppRegistry` creates, making them _siblings_\nof the app tree rather than descendants — no provider inside the app sits\nabove them, so an action declared there can't read a React context at all.\nThe components fix all three things the options can't:\n\n- **context works**, because the declaration is a descendant of its own\n  provider;\n- **registration is dynamic** — added on mount, removed on unmount, so one\n  screen can own actions for exactly its own lifetime;\n- **it composes** — two unrelated subtrees each declare their own without\n  meeting in one shared options object.\n\n`actionAccels` is not deprecated and stays a `runApplication` option: it's a\nflat name→keys table with no children and nothing to read from context, and\nit's deliberately process-wide — naming an action that isn't registered\nright now simply does nothing. A shortcut that should come and go with a\nscreen is a `GtkShortcutController` inside `WindowControllers` instead.\n\n**Two components, not one, because the two targets are different GObject\ninterfaces with different duplicate semantics.** Actions land on the window\nas a `Gio.ActionMap` (`addAction`/`removeAction`, keyed by name); controllers\nland on it as a `Gtk.Widget` (`addController`/`removeController`, keyed by\nthe controller object itself). One component sorting its children by type\nwould fail silently on a wrong child; two fail at the type level instead.\n\nA duplicated action name goes to the **first** declaration; a second one is\nignored, with a development warning naming it. This isn't an arbitrary\nchoice between first and last: `Gio.ActionMap` is name-keyed at both ends —\n`addAction` silently replaces a same-named action, and `removeAction` takes a\nname, not the action object. Under \"last wins,\" the first of two same-named\ndeclarations to unmount would remove whatever currently answers to that\nname, leaving the _other_ one mounted but dead. First-wins is the only order\nwhere release always precedes acquire: the loser never registers, and when\nthe winner unmounts (removing its own action, correctly) the claim passes to\nwhichever declaration is still mounted, registering in a later commit. To let\na screen override a shortcut, give it its own name, or move the declaration\nsomewhere both screens can reach.\n\nInside a `Modal`, the enclosing window is the modal's own, so actions and\ncontrollers declared there belong to it and go away with it — usually what a\ndialog wants. Under `chrome: \"content\"` and inside the navigators nothing\nchanges: the window is still the one `AppRegistry` built, the navigators own\nwidgets inside it rather than its action map, and a HeaderBar button in a\npage resolves `win.*` up through the widget hierarchy to that same window.\nOne consequence worth knowing: react-navigation keeps a popped screen\nmounted until its exit transition ends, so a screen's actions and\ncontrollers outlive the pop by the length of the animation.",
  },
  {
    doc: "docs/architecture/integration.md",
    heading:
      "`Controllers`: a GTK event controller on a React Native component",
    text: "The same idea one level down — `Controllers` attaches its children to the\nwidget of the _enclosing_ React Native component, `View`, `Pressable`,\n`ScrollView`, `Animated.View`, any of them:\n\n```tsx\n<Pressable onPress={open}>\n  <Controllers>\n    <GtkDragSource\n      actions={Gdk.DragAction.MOVE}\n      onPrepare={(x, y, self) =>\n        Gdk.ContentProvider.newForValue(\n          GObject.buildValue(GObject.TYPE_STRING, (v) => v.setString(id)),\n        )\n      }\n    />\n  </Controllers>\n  <Text>{title}</Text>\n</Pressable>\n```\n\n**Why it exists.** A `Pressable`'s `ref` is deliberately a `ViewHandle`\n(`measure`/`measureInWindow`/`measureLayout`) and not a `Gtk.Widget` — React\nNative's contract says nothing about widgets, and reaching a real GObject\nthrough a ref would pin every internal of this platform as public API. GTK\ncarries behavior no style and no RN prop expresses, drag-and-drop above all,\nand `Controllers` is how a row written in ordinary React Native reaches it.\n\n**Why a component, not a `controllers` prop on `View`.** A prop would sit on\na component an app shares with iOS and Android, imported from the _portable_\nentry point — the file would compile everywhere, the prop would be ignored\noff Linux, and the feature would vanish with no diagnostic. Here the import\nitself is the signal: `react-native-gtkx/gtk` is a line an app already knows\nit's crossing, one it already knows how to gate behind `Platform.OS` or a\n`.linux.tsx` split — and its absence is visible in the tree rather than\nsilently inert.\n\nTwo properties follow from `Controllers` being a portal: **it composes with\ncontext** (the handler that reorders a list is written where that list's\nstate already lives), and **it's lifecycle-bound** (attached on mount,\nremoved on unmount, so a screen's controllers leave with the screen).\n\nOne caveat, stated plainly: controllers attach **one commit after mount**.\nReact attaches host refs bottom-up, so the enclosing view's widget doesn't\nexist yet when a child's own layout effects run. For an event controller\nthis is unobservable in practice — no pointer reaches a widget in its first\nframe — but it does mean a test aiming a synthetic pointer at a freshly\nmounted tree has to let one commit land first.\n\nInside a GTK widget's own slot there's no enclosing React Native component\nand nothing to attach to; pass `controllers={…}` to the widget itself there\ninstead — the prop `Controllers` substitutes for everywhere else.\n\n`react-native-gtkx/dnd` mirrors `react-native-reanimated-dnd`'s API\n(`Draggable`, `Droppable`, `DropProvider`, `Sortable`) on top of exactly\nthese two controllers, and both bundler presets alias that package name onto\nit — so does `react-native-gesture-handler`, onto a shim keeping\n`GestureHandlerRootView` working — meaning a ported app's drag-and-drop\nsource runs unchanged.",
  },
  {
    doc: "docs/architecture/integration.md",
    heading: "GSettings",
    text: '`useSetting` and `useBindSetting` come from `@gtkx/react`, re-exported from\n`react-native-gtkx/gtk` next to the `Gio` namespace they read and write\nthrough:\n\n```tsx\nconst [value, setValue] = useSetting(schema, "color-scheme")\nuseBindSetting({\n  schema,\n  key: "window-width",\n  object: windowRef,\n  property: "defaultWidth",\n})\n```\n\nTurning a `.gschema.xml` file into the `SettingsSchema` object these hooks\nexpect (`{ id, path, keys }`) is a build-time concern, not something this\nsubpath does. It resolves for free on the `gtkx dev`/`gtkx build` toolchain —\nthe `gtkx:settings` vite plugin ships inside `@gtkx/cli` itself — but it is\nnot wired into the Metro toolchain (`react-native run-linux`) at all; an app\non that path constructs the `SettingsSchema` object by hand\n(`{ id, path, keys: { "key-name": "s" } }`, matching the schema\'s own type\nstrings) or adds its own build step.',
  },
  {
    doc: "docs/architecture/integration.md",
    heading: "Related",
    text: "- [Overview](overview) — where `NavigationStack`, `Widget`, and the rest of\n  `react-native-gtkx/common` come from, and the widget taxonomy `Controllers`\n  and the action components sit alongside.\n- [Layout and styling](layout-and-styling) — `SlotContent`/`IntrinsicContent`,\n  used throughout the navigation examples above.",
  },
  {
    doc: "docs/architecture/gestures.md",
    heading: "Three layers, in the order to reach for them",
    text: "**1. `Pressable`** — taps, long presses, hover and keyboard activation. It\nisn't built on the responder system, it takes no negotiation, and it's what\nalmost every interaction actually needs.\n\n```tsx\n<Pressable\n  onPress={open}\n  onLongPress={showMenu}\n  hitSlop={8}\n  style={({ pressed, hovered, focused }) => [\n    styles.row,\n    hovered && styles.rowHovered,\n    pressed && styles.rowPressed,\n    focused && styles.rowFocused,\n  ]}\n>\n  <Text>Open</Text>\n</Pressable>\n```\n\n`hitSlop` widens the target without changing layout; `pressRetentionOffset`\nsets how far the pointer may drift after pressing and still activate on\nrelease (RN's default rect, `{top: 20, left: 20, right: 20, bottom: 30}`, is\nalready generous). A release outside that rect cancels — dragging off a\ncontrol to change your mind works the way it does everywhere else.\n\n**2. The responder system and `PanResponder`** — drags, pans, swipes, and\nanything that needs to decide _which_ view owns an interaction.\n\n```tsx\nconst pan = useRef(new Animated.ValueXY()).current\nconst responder = useRef(\n  PanResponder.create({\n    // Claim on press, or wait for movement — the choice matters, see\n    // \"Claiming on press versus on move\" below.\n    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 8,\n    onPanResponderMove: (_event, gesture) => {\n      pan.setValue({ x: gesture.dx, y: gesture.dy })\n    },\n    onPanResponderRelease: () => {\n      // The continuing-drag idiom: fold where it ended into the offset so\n      // the next gesture's dx starts from zero instead of snapping back.\n      pan.extractOffset()\n      pan.setValue({ x: 0, y: 0 })\n    },\n  }),\n).current\n\nreturn (\n  <Animated.View\n    {...responder.panHandlers}\n    style={{ transform: pan.getTranslateTransform() }}\n  />\n)\n```\n\nResponder and touch props go on `View` and `Animated.View`; spreading\n`panHandlers` onto anything else compiles and does nothing, which is worth\nknowing because the idiomatic drag target is `Animated.View`.\n\n`PanResponder` here is react-native's own file, vendored unmodified, running\nagainst a reproduction of RN's `touchHistory` store — so `dx`/`dy`/`vx`/`vy`\nand the clustered-touch maths are upstream's, not a reimplementation.\n\n**3. GTK event controllers** — anything GTK does that React Native has no\nword for: drag-and-drop with real drag icons and content negotiation, zoom\nand rotate gestures, keyboard shortcut controllers. This is a Linux-only\nescape hatch, and the import says so:\n\n```tsx\nimport { Controllers, GtkDragSource } from \"react-native-gtkx/gtk\"\n\n;<Pressable onPress={open}>\n  <Controllers>\n    <GtkDragSource\n      actions={Gdk.DragAction.MOVE}\n      onPrepare={prepare}\n    />\n  </Controllers>\n  <Text>{task.title}</Text>\n</Pressable>\n```\n\nSee [Window, navigation, and settings](integration) for `Controllers` in\nfull. For drag-and-drop of any shape, including a reorderable list,\n`react-native-gtkx/dnd` (see the [Reference](../reference)) already wraps\nthis.",
  },
  {
    doc: "docs/architecture/gestures.md",
    heading: "How the negotiation works",
    text: "One interaction lock for the whole process, as in RN. On a press, the\n`*ShouldSetResponderCapture` handlers run from the root down and the\n`*ShouldSetResponder` handlers from the target up; the first to return\n`true` wins. While the pointer is down, the lock can move **upwards** — an\nancestor that returns `true` from `onMoveShouldSetResponder` takes it,\nprovided the current holder doesn't refuse with\n`onResponderTerminationRequest`. A descendant can never take it from an\nancestor.\n\nThe negotiation path stops at the layout root. A React Native tree here can\nbe an island inside a native GTK widget tree, so native widgets above or\nbetween views simply take no part.",
  },
  {
    doc: "docs/architecture/gestures.md",
    heading: "Claiming on press versus on move",
    text: "Claiming on press (`onStartShouldSetPanResponder`) tells GTK the interaction\nis yours before anything else can compete for it. Claiming on movement is\nthe more common shape, and slightly weaker: inside a scrolling list on a\ntouchscreen, the scroller can take the first few pixels before your\nthreshold is reached. Claim on press when the view is unambiguously a drag\nhandle.",
  },
  {
    doc: "docs/architecture/gestures.md",
    heading: "Where this differs from React Native",
    text: "**Terminations mostly cannot be refused.** In React Native and\nreact-native-web, `onResponderTerminationRequest` is consulted for a context\nmenu, an ancestor scroll, and a selection change. Here it's consulted in\nexactly two situations — a transfer to an ancestor, and an enclosing\n`ScrollView` scrolling. Everything else (a second mouse button, a native\nwidget or a `GtkDragSource` taking the sequence, text selection) reaches JS\nonly _after_ GTK has already taken the interaction away, and GTK's claim\ncan't be given back — those arrive as `onResponderTerminate` with no\nquestion asked. Window blur also terminates unconditionally, which is RN's\nbehavior too.\n\n**One pointer.** A mouse is one fabricated touch; `touches` never has more\nthan one entry, and multi-finger `gestureState` is single-touch. Pinch and\nrotate aren't available through the portable API — use `GtkGestureZoom` /\n`GtkGestureRotate` through `Controllers` for them on Linux.\n\n**ScrollView arbitration is touch-only.** All four gestures\n`GtkScrolledWindow` runs internally are touch-only, so under a mouse a child\npan never competes with scrolling at all. On touch, a view that takes the\nresponder suspends the enclosing scroller for the rest of the interaction\n(RN's `setIsJSResponder`). Scrolling with a **wheel** during a gesture isn't\nsuppressed — it terminates the responder instead, react-native-web's rule\nfor an ancestor scroll.\n\n**Hover fires from touch.** react-native-web filters hover events coming\nfrom a finger; GTK crossing events carry no device to filter on, GTK sends a\nmatching leave when a touch ends so no phantom hover sticks, and GTK's own\n`:hover` behaves the same way. Filtering here would make `Pressable` the odd\nwidget out in its own window.\n\n**`hitSlop` stops at a clip.** GTK stops picking at a clipping ancestor, so\nslop can't escape a `ScrollView` viewport, or any view whose style says\n`overflow: \"hidden\"` — the same limit RN documents on Android.\n\n**No `Animated.event`.** Write the value directly\n(`pan.setValue({x: gesture.dx, y: gesture.dy})`), which is what it would do\nanyway.",
  },
  {
    doc: "docs/architecture/gestures.md",
    heading: "Porting an app",
    text: "Both `react-native-reanimated` and `react-native-gesture-handler` are\naliased onto reimplementations by both bundler presets, so their imports\nresolve and their `Pan` code runs unedited. What's implemented of RNGH is\n`GestureHandlerRootView`, `GestureDetector`, `State`, `Pan`, `Tap`,\n`LongPress` and `Native` in both spellings (`Gesture.Pan()` and\n`usePanGesture()`, and so on), the `Race`/`Simultaneous`/`Exclusive`\ncomposers and the cross-gesture relations (`simultaneousWithExternalGesture`,\n`requireExternalGestureToFail`, `blocksExternalGesture` — arbitrated in a\nsecond, JS-only registry over the responder lock, because the lock has one\nholder by design and simultaneity is a set), plus the components it\nre-exports from `react-native` — `ScrollView`, `FlatList`, `TextInput`,\n`Switch`, `Pressable` and the three `Touchable`s.\n\nWhat isn't implemented throws where it's used, naming itself, rather than\nsilently doing nothing:\n\n- **`Pinch` and `Rotation`** — GTK feeds touchpad gestures properly, and\n  nothing in this project's test rig can produce one, so they wait for a\n  machine that can;\n- **`Fling`, `Hover`, `Manual`, `ForceTouch`**, the legacy `*GestureHandler`\n  components, and the button family (`RectButton` and friends — RNGH's own\n  native button views, not RN components with a handler attached).\n\n`react-native-draggable-flatlist` 4.0.3 and `@gorhom/bottom-sheet` 5.2.14\nboth run, and neither was stopped by this surface in the end: what they\nneeded was four `react-native` core exports (`findNodeHandle`, `LogBox`,\n`Keyboard`, `VirtualizedList`) and Reanimated's `useAnimatedScrollHandler`,\nall of which ship. This is verified by building both and driving them with a\nreal pointer, not by reading their imports — the probe app is\n`spike/core-exports`; the Reference has the per-library detail.\n\nWhat to do instead, where something is still missing:\n\n- a **drag** — `PanResponder` plus `Animated.ValueXY`, as above. Portable,\n  and what most RNGH usage in the wild amounts to;\n- **drag and drop between zones, or a sortable list** —\n  `react-native-gtkx/dnd` mirrors `react-native-reanimated-dnd`'s API on\n  GTK's own drag-and-drop, and both presets alias that package name onto it;\n- **swipeable rows** — by hand today: `PanResponder` for the gesture, plus\n  either `Animated` or `react-native-gtkx/reanimated` for the motion. A\n  **bottom sheet** no longer needs the hand-rolled version:\n  `@gorhom/bottom-sheet` runs (see above), and `AdwBottomSheet` is the\n  native one a Linux-first app reaches for instead.\n\n`examples/gallery`'s Gestures section is a working reference written\nentirely in portable `react-native`, with no platform-layer import in it at\nall.",
  },
  {
    doc: "docs/architecture/gestures.md",
    heading: "Related",
    text: "- [Overview](overview) — the widget and subpath structure `Controllers`\n  and `GtkDragSource` sit inside.\n- [Window, navigation, and settings](integration) — `Controllers` in full.",
  },
  {
    doc: "docs/guide/installation.md",
    heading: "Prerequisites",
    text: "- Linux (x64/arm64, glibc), GTK4 ≥ 4.20, libadwaita ≥ 1.8 — Ubuntu 26.04+\n  or Fedora 43+ satisfy both out of the box;\n- Node.js ≥ 24;\n- development headers for codegen: `sudo apt install libgtk-4-dev\nlibadwaita-1-dev` (Ubuntu; the equivalent `-devel` packages on other\n  distributions).\n\nRunning without libadwaita is also supported — see [Running without\nlibadwaita](plain-gtk.md) for what that changes.",
  },
  {
    doc: "docs/guide/installation.md",
    heading: "New project from the template",
    text: '```bash\nnpx degit itsmepetrov/react-native-gtkx/template my-app\ncd my-app\nnpm install\nnpm run dev        # a window opens, Fast Refresh applies edits live\n```\n\nProduction build:\n\n```bash\nnpm run build       # single bundle: dist/bundle.js\nnpm start            # node dist/bundle.js\n```\n\nMeasured in a clean Ubuntu 26.04 container, system dependencies\npreinstalled: 63 seconds from `npm install` to a window on screen.\n\nThe template\'s `vite.config.ts` wires the `react-native-gtkx/vite` preset\n(the `react-native` → `react-native-gtkx` alias, Metro-style platform\nextensions); `gtkx dev`/`gtkx build` pick it up automatically. Its\n`tsconfig.json` maps the `"react-native"` specifier through `paths` so\neditor types resolve too. The default entry is `src/index.tsx`, and\n`Comp.tsx` next to `Comp.linux.tsx` builds the Linux variant for an\nextensionless `import { Comp } from "./Comp"` — `Platform.select({ linux:\n…, native: …, default: … })` works exactly as it does in React Native and\nis tree-shaken out of the production build.',
  },
  {
    doc: "docs/guide/installation.md",
    heading: "Add Linux to an existing React Native app",
    text: 'Linux is an [out-of-tree\nplatform](https://reactnative.dev/docs/out-of-tree-platforms) — the same\nmodel react-native-windows and react-native-macos use. An app that\nalready has `ios/` and `android/` keeps them, keeps its Metro/Babel\ntoolchain, and gains one more target. Four steps:\n\n1. **Install the platform package:**\n\n   ```bash\n   npm install react-native-gtkx\n   ```\n\n   Its own `react-native.config.js` declares the `linux` platform and the\n   `run-linux` command — nothing to declare app-side.\n\n2. **Wrap the Metro config** (`metro.config.js`):\n\n   ```js\n   const { getDefaultConfig } = require("@react-native/metro-config")\n   const { withLinuxPlatform } = require("react-native-gtkx/metro")\n\n   module.exports = withLinuxPlatform(getDefaultConfig(__dirname))\n   ```\n\n   This adds the platform (`.linux.tsx` extensions, `Platform.OS ===\n"linux"`), redirects `react-native` imports to the platform package, and\n   keeps host-side modules (the GTK bindings, `react`, `yoga-layout`) out\n   of the bundle — Metro cannot bundle native addons, and the reconciler\n   needs to share one `react` instance with the app. Babel stays\n   completely stock.\n\n3. **Add `gtkx.config.ts`** with the GTK application id:\n\n   ```ts\n   import { defineConfig } from "@gtkx/config"\n\n   export default defineConfig({\n     libraries: ["Gtk-4.0", "Adw-1"],\n     applicationId: "com.example.myapp",\n   })\n   ```\n\n4. **Start the app from the entry** — on desktop the entry launches the\n   app itself, the same pattern react-native-web uses for\n   `index.web.js`:\n\n   ```js\n   // index.js, after AppRegistry.registerComponent(...)\n   if (Platform.OS === "linux") {\n     AppRegistry.runApplication(appName, {\n       title: "My App",\n       width: 800,\n       height: 600,\n     })\n   }\n   ```\n\nThat\'s the whole integration — see [Your first app](first-app.md) for\nrunning it. `examples/rn-app` in the repository is a complete cli-init\napp with all three platforms wired this way.',
  },
  {
    doc: "docs/guide/installation.md",
    heading: "Typed code",
    text: 'Add an `env.d.ts` with `import "react-native-gtkx/types"` — it augments\nthe stock `react-native` types so `Platform.select({ linux: ... })`\ntypechecks, and `Pressable`\'s state callback accepts `hovered` (declared\noptional, since a component shared with ios/android gets `undefined`\nthere — write `hovered && styles.hovered`). One thing augmentation cannot\nteach is `Platform.OS === "linux"` as a type guard (property types don\'t\nmerge across an augmentation) — use `Platform.select` where the branch\nneeds to typecheck. Deep imports (`react-native/Libraries/...`) are not\nsupported — only the public `react-native` surface is.\n\nBoth toolchains alias the bare `react-native-svg` import to\n`react-native-gtkx/svg` at build time — see [Toolchains: bundler\naliases](toolchains.md#bundler-aliases) for what that means for\nTypeScript, since the alias is invisible to the type checker.',
  },
  {
    doc: "docs/guide/first-app.md",
    heading: "How it works",
    text: "```\nyour code (react-native API)\n  └─ vite preset: aliases react-native → react-native-gtkx, platform\n     extensions .linux.tsx → .native.tsx → base\n      └─ react-native-gtkx: Yoga (WASM) computes flexbox; styles are split into\n         layout (Yoga) and visual (GTK CSS); coordinates are applied to\n         real GTK widgets\n          └─ gtkx: React reconciler → GTK4 via FFI\n```\n\nThe Metro path draws the same picture with the Metro preset instead of\nthe vite one in the first step — see [Toolchains](toolchains.md) for how\nthe two differ.",
  },
  {
    doc: "docs/guide/first-app.md",
    heading: "Hello, GNOME",
    text: 'The entry point looks exactly like a React Native entry:\n\n```tsx\nimport { AppRegistry, StyleSheet, Text, View } from "react-native"\n\nconst App = () => (\n  <View style={styles.screen}>\n    <Text style={styles.title}>Hello, GNOME!</Text>\n  </View>\n)\n\nconst styles = StyleSheet.create({\n  screen: { flex: 1, alignItems: "center", justifyContent: "center" },\n  title: { fontSize: 24, fontWeight: "700" },\n})\n\nAppRegistry.registerComponent("app", () => App)\nAppRegistry.runApplication("app", { title: "My App", width: 800, height: 600 })\n```\n\n`runApplication` accepts desktop parameters (`title`, `width`, `height`)\n— the only extension over the React Native signature.',
  },
  {
    doc: "docs/guide/first-app.md",
    heading: "Running the app",
    text: "A project started from the template runs with:\n\n```bash\nnpm run dev\n```\n\nAn app that added Linux to an existing React Native project runs\n`run-linux` next to the platforms it already had:\n\n```bash\nnpx react-native run-linux         # release bundle\nnpx react-native run-linux --dev   # Metro dev server + Fast Refresh\n\n# the platforms this app already had\nnpx react-native run-ios\nnpx react-native run-android\n```\n\n`run-linux` ensures the gtkx codegen store, bundles with Metro for\n`--platform linux`, and opens the window. With `--dev` it starts (or\nreuses) the Metro dev server; edits apply to the live window with\ncomponent state preserved, syntax errors print readably in the terminal,\nand the app recovers on the next successful build.\n\n**Ctrl+Shift+D** — the react-native-windows shortcut, the desktop\nstand-in for the shake gesture — opens the Dev Menu: Reload, plus any\nentries the app registers through `DevSettings.addMenuItem`.\n\n`run-linux` always runs what it builds. For a release build that stops\nshort of opening a window — packaging, CI, handing a bundle to someone\nelse's machine — see [Packaging](packaging.md) for `build-linux` instead.",
  },
  {
    doc: "docs/guide/first-app.md",
    heading: "The gallery: a tour of the platform",
    text: "`examples/gallery` in the repository is every capability this platform\nclaims, one per sidebar entry, in an app you run and poke at:\n\n```bash\nnpm install                # from the repo root (workspaces)\ncd examples/gallery\nnpm run dev                # gtkx dev — vite + Fast Refresh\n```\n\nThe chrome is the package's own sidebar navigator — a native\n`Adw.NavigationSplitView` with the sections in a real `GtkListBox` —\ngrouped in the order a reader meets the platform:\n\n- **React Native** — views, text and layout, clipping, inputs/buttons/\n  toggles, lists and media, Modal, Animated, interpolation, transforms,\n  gestures (the responder system and `PanResponder`), and the core APIs\n  (`Platform`, `Dimensions`, `Appearance`, `Alert`, `Linking`);\n- **gtkx** — widget hosting (React Native content inside a GTK widget's\n  child and slots) and the Adwaita stack (`Adw.NavigationView` driven\n  declaratively);\n- **Modules** — Reanimated (values, motion, layout animations, and the\n  measured boundary of what's driven off the render thread), gesture\n  handler (pan/tap/long-press, pinch/rotation, cross-gesture relations),\n  drag-and-drop, Svg, and three sections running the real upstream\n  `react-native-reanimated-dnd` and `react-native-drawer-layout`\n  packages unmodified.\n\n`GALLERY_SECTION=<id>` opens one section directly; `GALLERY_SCHEME=light`\nstarts in the light theme (the HeaderBar button toggles either way\nlive).",
  },
  {
    doc: "docs/guide/first-app.md",
    heading: "Other examples in the repository",
    text: "- `examples/profile` — a static layout; the same source also builds with\n  react-native-web (`examples/profile-web`);\n- `examples/rn-app` — a cli-init React Native app with ios, android and\n  linux side by side;\n- `examples/hn-app` — a Hacker News reader on the Metro path: live API\n  data over Node `fetch`, state-based two-screen navigation, a lazily\n  loaded comment tree.",
  },
  {
    doc: "docs/guide/toolchains.md",
    heading: "The vite path",
    text: "`gtkx dev` and `gtkx build` are the two commands a vite-path project\nruns day to day; both start vite themselves and pick up the project's\n`vite.config.ts` (with the `react-native-gtkx/vite` preset applied)\nautomatically.\n\n```bash\ngtkx dev [entry]      # dev server + Fast Refresh; entry defaults to\n                        # src/index{.tsx,.jsx,.ts,.js}\ngtkx build [entry]     # production bundle\n```\n\nBoth accept `--cwd=<path>` to run against a project root other than the\ncurrent directory. `gtkx build` also accepts `--asset-base=<path>`, an\nasset base path relative to the executable's directory, for layouts\nwhere the bundle and its assets don't sit side by side. `gtkx codegen`\n(with `--force` to wipe and regenerate a corrupted store) generates the\n`@gtkx/gi`/`@gtkx/jsx` bindings for the GIR libraries declared in\n`gtkx.config.ts` — `gtkx dev`/`gtkx build` run it automatically; a bare\n`vitest run` does not (see [Testing](#testing) below).",
  },
  {
    doc: "docs/guide/toolchains.md",
    heading: "The Metro path",
    text: "`run-linux` and `build-linux` are contributed to the React Native CLI by\n`react-native-gtkx`'s own `react-native.config.js` — no separate install,\nthey come with the package.\n\n```bash\nnpx react-native run-linux [--entry-file <path>] [--bundle-output <path>]\n                            [--skip-bundling] [--dev] [--port <number>]\n\nnpx react-native build-linux [--entry-file <path>] [--bundle-output <path>]\n                              [--standalone] [--sea] [--sea-output <path>]\n```\n\n`run-linux` bundles with Metro and opens the window; `--dev` starts (or\nreuses) the Metro dev server on `--port` (default `8081`) instead, for\nFast Refresh. `build-linux` bundles for distribution and stops short of\nrunning it — see [Packaging](packaging.md) for `--standalone`/`--sea`,\nthe two flags that turn the Metro bundle into something shippable.",
  },
  {
    doc: "docs/guide/toolchains.md",
    heading: "The React Compiler (vite path only)",
    text: "`gtkx dev` and `gtkx build` run the [React\nCompiler](https://react.dev/learn/react-compiler) over every source file\nin the project — never `node_modules`. It is on unless `gtkx.config.ts`\nturns it off:\n\n```ts\nexport default defineConfig({\n  libraries: [\"Gtk-4.0\", \"Adw-1\"],\n  applicationId: \"com.example.myapp\",\n  reactCompiler: false,\n})\n```\n\nOmitting the option and setting it to `true` mean the same thing — only\nan explicit `false` disables it. The Metro path (`run-linux`/\n`build-linux`) keeps the app's stock Babel preset and never runs the\ncompiler.\n\nIf a ported app misbehaves in a way that smells like stale rendering —\na value that should have updated didn't — set `reactCompiler: false` and\nsee whether the symptom goes away. That one line tells you which half of\nthe system to debug: if the symptom disappears, the underlying issue is\na [Rules of React](https://react.dev/reference/rules) violation the\ncompiler is compiling around correctly, and the real fix is moving the\noffending read into state, a ref, or a hook — not leaving the compiler\noff. A typical shape: a component reading mutable module-level state\nduring render has that read memoized by the compiler, so it renders\nfourteen times and shows the same value every time — it looks like a\nbroken counter and is in fact a working one behind a cached render.\n\nOn React Native the compiler is opt-in, so an app that doesn't follow the\nRules of React still works there. Here it's on by default, so the same\nviolations become visible misbehavior on a platform where everything\nelse is also new — which reads as a platform bug when it's a Rules-of-\nReact one.\n\nReanimated shared values have their own spelling for the same reason:\n`sharedValue.value = x` and `sharedValue.set(x)` both work, but only\n`.get()`/`.set()` passes compiler-aware lint (`react-hooks/immutability`\ntreats anything a hook returns as frozen). Prefer `.get()`/`.set()` in\nnew code; `.value` keeps working, so a ported app doesn't need a\nrewrite.",
  },
  {
    doc: "docs/guide/toolchains.md",
    heading: "Bundler aliases",
    text: 'Both presets rewrite the same six package names: `react-native` itself,\nplus `react-native-svg`, `react-native-reanimated`,\n`react-native-worklets`, `react-native-gesture-handler` and\n`react-native-reanimated-dnd` onto their compat subpaths. The\n`react-native-svg` alias is the one most projects notice at the type\nlevel: the alias is a bundler-time rewrite, so TypeScript still needs\nits own answer for the bare `"react-native-svg"` specifier — an\nunresolved import in the editor even though the build works. Which fix\napplies depends on the project:\n\n- **Also ships to iOS/Android/web**: install the real\n  `react-native-svg` — the app needs it there regardless, and it ships\n  its own `.d.ts`. The Linux build never executes that package\'s code\n  (the alias rewrites the import before Node sees it).\n- **Linux-only project** (the template, or an app with no mobile\n  target): install `react-native-svg` as a **devDependency purely for\n  its types** — `npm install -D react-native-svg`. The ordinary fix for\n  a bundler-alias setup with no real package installed.',
  },
  {
    doc: "docs/guide/toolchains.md",
    heading: "Testing",
    text: 'react-native-gtkx ships its GTK component-testing recipe as two\nsubpaths, so a consumer app doesn\'t have to rediscover it:\n\n- `react-native-gtkx/vitest` — `reactNativeGtkxTest()`, a ready Vitest\n  project config: the headless-compositor plugin, the `react-native`\n  alias and platform extensions, and the React act-environment setup;\n- `react-native-gtkx/testing` — re-exports `@gtkx/testing`\'s\n  render/screen/userEvent/fireEvent surface, plus `renderHookWithWindow`\n  for hooks that read the active window (`useWindowDimensions` and\n  similar).\n\n```ts\nimport { reactNativeGtkxTest } from "react-native-gtkx/vitest"\nimport { defineConfig } from "vitest/config"\n\nexport default defineConfig(reactNativeGtkxTest())\n```\n\nThe default test glob is `**/*.gtk.test.{ts,tsx}`. Component tests need a\nheadless Wayland compositor and D-Bus on `PATH` — `sway xwayland dbus` on\nUbuntu — and `gtkx codegen` must already have generated the project\'s\n`@gtkx/gi` bindings, since a bare `vitest run` doesn\'t trigger codegen\nitself the way `gtkx dev`/`gtkx build` do; wire that as a `pretest`\nscript. A missing compositor fails a test run with a readable error\nrather than hanging.\n\n```tsx\nimport { Root } from "react-native"\nimport { render, screen } from "react-native-gtkx/testing"\n\n// react-native-gtkx components need a layout root — AppRegistry.runApplication()\n// in the real app, <Root> in a test.\nawait render(\n  <Root\n    width={800}\n    height={600}\n  >\n    <App />\n  </Root>,\n)\nexpect(screen.getByText("Hello, GNOME!")).toBeTruthy()\n```',
  },
  {
    doc: "docs/guide/toolchains.md",
    heading: "MCP server for agents",
    text: 'An agent working inside a project that depends on react-native-gtkx can\nask the library about itself instead of guessing:\n`react-native-gtkx-mcp` is a [Model Context\nProtocol](https://modelcontextprotocol.io) server shipped as a `bin` on\nthe package. Register it project-level (Claude Code\'s `.mcp.json`, or\nthe equivalent config of any MCP-compatible client):\n\n```json\n{\n  "mcpServers": {\n    "react-native-gtkx": { "command": "npx", "args": ["react-native-gtkx-mcp"] }\n  }\n}\n```\n\n`npx react-native-gtkx-mcp` from the project root resolves the locally\ninstalled version, so it always answers for the exact react-native-gtkx\nversion the project has. Three tools:\n\n- `rn_gtkx_list_surface` — browse the surface without knowing a name\n  first (portable components/APIs, gtk/adw widgets, common), with\n  counts;\n- `rn_gtkx_describe_component` — the one to reach for first: does a\n  component/widget exist, which subpath it\'s exported from, what GTK\n  widget backs it, what differs from React Native, whether it takes\n  `style`/`onLayout` or is raw;\n- `rn_gtkx_search_docs` — free-text fallback for symptoms and\n  known-issue questions the other two can\'t answer by name.\n\nIt runs without GTK installed — no `@gtkx/*` import anywhere in it,\nreading only the package\'s own bundled docs/manifest data. That matters\nin practice: an agent is often reading the project from a machine with\nno GTK toolchain at all.',
  },
  {
    doc: "docs/guide/plain-gtk.md",
    heading: "Choosing the profile",
    text: 'Drop `"Adw-1"` from `gtkx.config.ts`\'s `libraries`:\n\n```ts\nimport { defineConfig } from "@gtkx/config"\n\nexport default defineConfig({\n  libraries: ["Gtk-4.0"],\n  applicationId: "com.example.myapp",\n})\n```\n\nAn app configured this way never links libadwaita: no Adwaita theming,\nno `Adw.StyleManager`, no Adwaita widgets. The choice is per-app, made\nonce, at the `gtkx.config.ts` level — there\'s no runtime flag to flip\nbetween the two profiles in a single build.\n\nreact-native-gtkx\'s own bridge is split to make this possible: a core\nmodule with zero Adw imports covers everything `View`/`Text`/\n`ScrollView`/`Modal`/`Animated`/gestures/`FlatList` and the rest of the\nportable surface need, and a separate Adw module is loaded only when the\napp\'s codegen store actually has Adw bindings.',
  },
  {
    doc: "docs/guide/plain-gtk.md",
    heading: "What still works",
    text: 'Three parts of the API fall back to a plain-GTK equivalent, so the same\napp code runs on both profiles without branching on which one it got:\n\n- **`AppRegistry`**\'s `chrome: "content"` falls back to the plain\n  `GtkApplicationWindow` chrome that `chrome: "system"` always uses,\n  instead of throwing. This is why requesting `chrome: "content"`\n  unconditionally is the right default for a portable app: HeaderBar-as-\n  chrome where Adw exists, an ordinary window chrome where it doesn\'t,\n  with no `if (adwAvailable())` branch of the app\'s own to write.\n  `breakpoints` degrades the same way `chrome: "content"` under the\n  wrong chrome always has — accepted, ignored, one dev warning — naming\n  `"Adw-1"` as the reason instead of the chrome mismatch.\n- **`Alert.alert`** falls back to `Gtk.AlertDialog` (GTK ≥ 4.10),\n  preserving button order, default/cancel mapping and callbacks. Lost:\n  `destructive`/`isPreferred` appearance, and `cancelable: false` with no\n  cancel-style button.\n- **`Appearance`/`useColorScheme`** fall back to the\n  `org.freedesktop.appearance` desktop portal\'s `color-scheme` setting\n  (with live updates via its `SettingChanged` signal), then to\n  `Gtk.Settings:gtk-application-prefer-dark-theme` when no portal\n  answers. The contract is identical either way: always `"light"`/\n  `"dark"`, change events still fire, and `setColorScheme` is local to\n  the process on both profiles, never a system-wide write.',
  },
  {
    doc: "docs/guide/plain-gtk.md",
    heading: "What refuses",
    text: 'Two subpaths need Adw unconditionally and refuse to import without it:\n`react-native-gtkx/adw` (the Adwaita widget bindings) and\n`react-native-gtkx/navigation` (built on `AdwHeaderBar`/\n`Adw.NavigationView`). Importing either on the plain-GTK profile throws,\nnaming the fix:\n\n```\n[react-native-gtkx] "@gtkx/jsx/adw" requires "Adw-1" in this app\'s\ngtkx.config.ts `libraries` — see the plain-GTK profile documentation for\nwhat needs Adw unconditionally and what falls back without it.\n```\n\n`react-native-gtkx/common`\'s `NavigationStack`/`NavigationStackPage` are\nthe same story at component granularity rather than import granularity:\nthe subpath itself imports fine (its barrel also carries Adw-free\nexports — `Widget`, `Icon`, `SlotContent`), and only actually\n**rendering** one of these two throws, naming the component instead of\nthe raw specifier. There\'s no fallback to degrade to for either one —\nthis platform ships no non-Adwaita stand-in for `Adw.NavigationView`.',
  },
  {
    doc: "docs/guide/plain-gtk.md",
    heading: "How the profile is detected",
    text: 'Nothing in application code needs to check which profile it\'s running\non — the three fallbacks above and the two refusals handle it — but the\nmechanism is worth knowing when debugging a build: the platform asks a\nsingle question, "does this app\'s codegen store actually have Adw\nbindings", answered differently on each toolchain:\n\n- On the Metro/SEA host, the run-linux host resolves every module\n  (including the Adw ones, when declared) into a global registry before\n  the bundle ever runs; a plain-GTK app simply has no Adw entry there,\n  which is the expected, normal shape rather than a broken install.\n- On the vite path (`gtkx dev`/`gtkx build`), a build-time constant is\n  set from whether `@gtkx/gi/adw` actually resolves out of the app\'s own\n  `node_modules` — decided once, when vite starts.\n- Anywhere else (a bare `vitest` project, for instance), a dynamic-\n  import probe answers the same question at runtime.\n\nAll three answer the one question the bridge asks internally —\n"is Adw available in this app" — consistently, regardless of which\ntoolchain built the app.',
  },
  {
    doc: "docs/guide/packaging.md",
    heading: "The vite path: one bundle",
    text: "```bash\ngtkx build\n```\n\nproduces `dist/bundle.js` — everything except the native GTK addon\ninlined into one file — plus `dist/gtkx.node` (and\n`dist/gschemas.compiled` alongside it, if the app declares a GSettings\nschema; the bundle's own banner points `GSETTINGS_SCHEMA_DIR` at its own\ndirectory). That pair is the whole runtime: copy it anywhere with Node\n≥ 24, GTK4 ≥ 4.20 and libadwaita ≥ 1.8 (or just GTK4, on the [plain-GTK\nprofile](plain-gtk.md)) and `node bundle.js` runs it — no `node_modules`\ninvolved.",
  },
  {
    doc: "docs/guide/packaging.md",
    heading: "The Metro path: `build-linux`",
    text: "```bash\nnpx react-native build-linux\n```\n\nwrites `dist/main.jsbundle` and stops — the release counterpart to\n`run-linux` that iOS, Android and react-native-windows already have.\nUnlike the vite bundle, this is **not** self-contained: Metro\ndeliberately keeps `@gtkx/*`, `react` and `yoga-layout` out of the\nbundle, since they have to be the exact instances the Node+GTK host\nloads, not a second copy Metro inlines. Running `dist/main.jsbundle`\nlater needs, on top of Node/GTK/libadwaita, a real `node_modules` with\n`react-native-gtkx` installed and the app's `gtkx.config.ts` at the\nworking directory:\n\n```bash\nnode node_modules/react-native-gtkx/dist/runner/host.js dist/main.jsbundle\n```\n\nThat's a fine way to run a release bundle from a checkout — any ordinary\n`npm install` of the app already has that `node_modules` — but a bad\nthing to ship: the closure is not the handful of runtime modules it\nsounds like. Packaging it that way once measured **10,515 files, 206\nMiB installed** to run a 369 KB bundle, because `react-native-gtkx`'s\ninstall drags its whole build toolchain along. `--standalone` and\n`--sea` exist to remove that closure entirely.",
  },
  {
    doc: "docs/guide/packaging.md",
    heading: "Choosing an artifact",
    text: "`build-linux` produces three shapes from the same Metro step; the choice\nbetween them is a distribution question, not a different build:\n\n| Flag           | Artifact                   | Needs installed                    | Size (`hn-app`, linux-arm64) |\n| -------------- | -------------------------- | ---------------------------------- | ---------------------------- |\n| _(none)_       | `dist/main.jsbundle`       | a `node_modules` tree **and** Node | 0.4 MB + the tree            |\n| `--standalone` | `dist/<name>.cjs`          | Node only                          | 6.9 MB                       |\n| `--sea`        | `dist/<name>` (executable) | nothing at all                     | 104 MB (30 MB compressed)    |\n\n```bash\nnpx react-native build-linux --standalone     # in the app root\nnode ./dist/<your-package-name>.cjs           # one script, system node\n\nnpx react-native build-linux --sea\n./dist/<your-package-name>                    # one executable, nothing else\n```\n\nBoth flags produce the jsbundle exactly as before, then one additional\nfile next to it. `--sea-output <path>` overrides where that file goes;\nthe default is `dist/<package name>` with any npm scope stripped (plus\n`.cjs` for `--standalone`).\n\nPick **`--standalone`** for anything installed through a package\nmanager — it's the same shape this project's own `.deb`s ship (a bundle\nplus a `nodejs` dependency), and the lightest of the three by any\nmeasure that counts: the plain jsbundle only looks smaller because its\n`node_modules` tree isn't weighed. Pick **`--sea`** for \"download this\none file and run it,\" where nothing can be assumed to be installed —\nit's `--standalone` with a copy of Node wrapped around it, and that copy\nis the entire ~97 MB difference between the two.\n\nThe vite path has no `--sea` equivalent: its bundle loads the native\naddon through a dynamically obtained `require` a bundler can't intercept\nthe way it intercepts a static import, and the bundle currently needs\ntop-level await, which the single-file SEA format can't run. Ship a\nvite-path app as its `bundle.js`/`gtkx.node` pair, or as a `.deb`.",
  },
  {
    doc: "docs/guide/packaging.md",
    heading: "What `--sea`/`--standalone` need that a plain build doesn't",
    text: "Both flags inline `virtual:gtkx-config` (which re-exports codegen\noutput), so — unlike a plain `build-linux`, which needs neither — they\nneed the gtkx codegen store already generated, and therefore GTK\ndevelopment headers on the build machine. The `--sea` build also fetches\n`postject` through `npx` the first time it runs, so that first build\nneeds network access.\n\nThe native addon (a real `dlopen`ed library) can't be plain bundled JS,\nso both artifacts carry it as bytes instead — a SEA asset in the\nexecutable, a base64 literal in the `.cjs` — and extract it to\n`$XDG_CACHE_HOME/react-native-gtkx-sea` on first run, keyed by content\nhash (falling back to a temp directory if `$HOME` is read-only). Repeat\nlaunches reuse the extracted file.\n\nThe `--sea` executable is large mostly because it carries a full copy of\nNode: on linux-arm64, `hn-app` measures 104 MB (30 MB zstd-compressed),\nof which roughly 98 MB is Node itself — the app code and native addon\ntogether are under 7 MB. The build strips Node's own debug symbols as\npart of assembling the executable (best-effort: a build machine without\n`binutils` gets a larger executable and a warning, not a failed build),\nwhich is most of what keeps that number from being worse — an\nunstripped `node` binary carries about 19 MB of debug information\nnothing in a shipped app can use.",
  },
  {
    doc: "docs/guide/packaging.md",
    heading: "What a release actually ships",
    text: 'A tagged release builds `.deb` packages for each example app (both\ntoolchain shapes, per the [Choosing an artifact](#choosing-an-artifact)\nnote above) plus one `--sea` executable, zstd-compressed, uploaded\nalongside them. The `.deb`s remain how these apps are installed; the\nloose executable is there for a machine with no Node to depend on at\nall — download it, `zstd -d` it, and run it.\n\nA `.deb` built this way stages either the vite pair (`bundle.js` +\n`gtkx.node`, launched with `exec node "/opt/<pkg>/bundle.js"`) or the\n`--standalone` script (`exec node "/opt/<pkg>/<name>.cjs"`) under `/opt`,\nalongside a `.desktop` entry and an icon, and declares:\n\n```\nDepends: nodejs (>= 24), libgtk-4-1 (>= 4.20), libadwaita-1-0 (>= 1.8), gir1.2-gtk-4.0, gir1.2-adw-1\n```\n\nPackage a [plain-GTK](plain-gtk.md) app the same way and drop\n`libadwaita-1-0`/`gir1.2-adw-1` from that line — every example this\nproject ships today uses the Adwaita profile, so its own release\npipeline always declares both.',
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "Live workarounds",
    text: "| Name                       | What rc.4 does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Our workaround                                                                                                                                                                                                                                              | Removal condition                                                                |\n| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |\n| `use-signal-stale-handler` | `useSignal` still routes the handler through React's `useEffectEvent`; `react-reconciler@0.33.0` only refreshes it in `commitBeforeMutationEffects` for `case 0` (FunctionComponent) — `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed, so any `useEffectEvent` in a `memo`/`forwardRef` component is pinned to its mount closure forever (our `ScrollView` is a `forwardRef` with the `useSignal` calls inside it) — a fetch-fed FlatList empties itself on the first scroll. **rc.4 did not bump React and did not change the path** — see below | `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx's                                                                                                         | A stable React 19.3 (React fixed the refresh on the 19.3 line)                   |\n| `runtime-dedupe`           | Two bundled copies of the gtkx runtime still double-init GLib and abort; nothing guards against it. Reproduced on rc.4: `g_log_set_writer_func() called multiple times`, SIGABRT                                                                                                                                                                                                                                                                                                                                                                                                       | `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits                                                                                                             | Idempotent runtime init upstream, or an error that names the duplicate           |\n| `prop-portal`              | `createPortal(children, container, key?)` is byte-for-byte the rc.3 signature and can still only target a container's DEFAULT slot (\"children\"). Every other slot an object exposes declaratively — a window's `Gio.ActionMap` (`actions`), a widget's `controllers`, an `AdwApplicationWindow`'s `breakpoints` — is reached only by passing an element-valued PROP, which the reconciler routes through an internal `\"gtkx:prop\"` element. rc.4 exports that element from neither `@gtkx/react` nor `/internal`, and its `exports` map now refuses the deep path outright             | `gtkx/bridge/slot-portal.ts` restates the `\"gtkx:prop\"` element name and wraps it in `createSlotPortal(children, target, slot)` — the one line that would move if gtkx renames it. `WindowActions`/`ApplicationActions`/`WindowControllers` are built on it | gtkx exports a slot-aware portal (or the prop element) from a public entry point |\n| `renderhook-no-window`     | `renderHook` still mounts into a bare `Gtk.Box` — rc.4's `render-hook.js` is byte-identical to rc.3's, which was byte-identical to rc.2's — so window-dependent APIs have no toplevel to read                                                                                                                                                                                                                                                                                                                                                                                          | Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`)                                                                                     | `renderHook` mounts into the same harness window `render` uses                   |",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading:
      "`use-signal-stale-handler` is a decision upstream made, not an oversight",
    text: "We shipped the fix as a PR (gtkx-org/gtkx#469) and it was **closed unmerged\non purpose**. @eugeniodepalo: _\"closing this in favour of waiting for\nupstream… Since React fixes this properly on 19.3 for all fiber tags, I'd\nrather take the version bump than carry a workaround I'd revert.\"_ So this\nrow does not move on any gtkx release — only a stable React 19.3 retires it,\nand the hazard is wider than `useSignal`: any hook built on `useEffectEvent`\ninherits it until then.\n\nrc.4 was checked against that condition anyway, because the condition names a\nReact version and a release could satisfy it by bumping one: it does not.\n`@gtkx/react@1.0.0-rc.4` peers `react: ^19.2` and depends on\n`react-reconciler: ^0.33.0` — character-identical to rc.3 — and React's own\n`latest` is still 19.2.8, with 19.3.0 published only as canaries. rc.4 did\ntouch `useSignal`, but only to rename its options (`after`/`immediate` →\n`isAfter`/`isImmediate`); the body still calls `useEffectEvent`, and its\ndoc comment still says React fixes this on the 19.3 line.",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "How each was checked against rc.4",
    text: 'The rule is that a changelog entry is a claim and the removal condition is\nthe test, so each row was re-run on the real runtime rather than read about.\n\n- **`use-signal-stale-handler`** — `tests/gtk/bridge/use-signal-upstream.gtk.test.tsx`\n  calls gtkx\'s own hook directly on a `memo` component; it is an `it.fails`\n  guard that starts passing the day the defect is gone. On rc.4 it still\n  fails, and it is the "1 expected fail" the whole suite reports.\n- **`runtime-dedupe`** — the first two attempts at a probe both said "no\n  abort", and both were wrong, which is worth recording: Node caches a native\n  addon by the resolved path of the `.node` FILE, so a second copy of the thin\n  `@gtkx/native` JS wrapper shares one addon instance and one Rust static, and\n  a second `init()` on it returns normally — on rc.3 exactly as on rc.4. The\n  failure needs two DISTINCT `.node` files in one process (an app with its own\n  `@gtkx/native-linux-*-gnu` plus a nested one under the library), each\n  carrying its own `glib::log::WRITER_FUNC`. Built that way, rc.4 dies:\n  `gtkx: GLib-ERROR: g_log_set_writer_func() called multiple times`, exit 134,\n  core dumped. Neither half of the condition is met — the init is not\n  idempotent, and while the error names the symbol it does not name the\n  duplicate package, which is the part that would make it debuggable.\n\n  **Not the only SIGABRT out of this subsystem.** A second, separate crash —\n  a Rust panic inside the `writer_trampoline` `log_set_writer_func` installs\n  (registered fine, once) rather than a double-registration — twice took\n  down a CI worker fork under `tests/gtk/dnd/collision-thresholds.gtk.test.tsx`\n  (2026-08-04, runs 30903167960 and 30904467362). Not a new\n  `RC4-WORKAROUND` row: the trigger was our own bug (`scroll-view.tsx`\'s\n  `syncAdjustmentRange` calling `Gtk.Adjustment.configure()` with an invalid\n  range, retried every frame), now fixed, not gtkx drift to absorb in the\n  bridge. Full backtrace and the upstream ask (harden `writer_trampoline`\n  with `catch_unwind`) are in\n  [docs/upstream-gtkx.md](upstream-gtkx.md#2-a-panic-inside-the-glib-log-writer-trampoline-aborts-the-whole-process-not-just-the-offending-log-call).\n\n- **`prop-portal`** — enumerated the real module objects on the runtime rather\n  than reading the `.d.ts`. `@gtkx/react` exports exactly `createPortal`,\n  `createRoot`, `quit`, `rootElement`, `useApplication`, `useBindSetting`,\n  `useParentWindow`, `useProperty`, `useSetting`, `useSignal`;\n  `@gtkx/react/internal` exports `applyWrite`, `createApplicationComponent`,\n  `createElementComponent`, `createReconcilerRoot`, `createWindowComponent`,\n  `getAccessibleMetadata`, `isRootElement`, `setReconcilerErrorHandler`,\n  `useMergedRef`. No value in either is `"gtkx:prop"`, and there is no\n  slot-aware portal. rc.4 also made the fallback worse rather than better:\n  importing `@gtkx/react/dist/components/element.js` now fails with _"not\n  exported under the conditions [node, development, import]"_, so restating\n  the literal is the only route left. The literal itself did not move —\n  `const Prop = "gtkx:prop"` is unchanged in rc.4\'s `components/element.tsx`\n  (only a doc comment above it was deleted), which the passing\n  `WindowActions`/`WindowControllers`/breakpoint suites confirm functionally.\n- **`renderhook-no-window`** — `RenderHookOptions` still carries only\n  `wrapper` and `initialProps`, no `container`, and on the runtime\n  `renderHook` took the toplevel count from 0 to 0 while `render` took it\n  from 0 to 1 in the same file.',
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "What rc.4 renamed under us",
    text: "rc.4 is a naming-convention sweep. Nothing below changed behaviour, but each\none is a compile error or a silent runtime miss for a consumer of the RC.\n\n- **`@gtkx/react` moved the settings types off its public entry point.**\n  `SettingsSchema`, `SettingsSchemaKeys` and `SettingValue` are now exported\n  from `/internal` only, while the hooks they type (`useSetting`,\n  `useBindSetting`) stay public — so an app that wants to name the type of a\n  setting has no supported import for it. The bridge re-exports them from\n  `/internal`; the ask to put them back is in\n  [docs/upstream-gtkx.md](upstream-gtkx.md). (`MenuItem` and `VflConstraints`\n  left the public entry too; nothing here used them.)\n- **`@gtkx/codegen`'s `runCodegen` result renamed `regenerated` →\n  `isRegenerated`** (`src/runner/index.ts`), and the package dropped its\n  `./gi` and `./jsx` subpath exports in favour of a new `./internal`.\n- **`@gtkx/vitest` renamed `GtkxPluginOptions` → `PluginOptions`**\n  (`src/vitest/index.ts`).\n- **The element config renamed `lazy` → `isLazy` and `omitProps` →\n  `omittedProps`.** This is the one with no compiler behind it: our three\n  hosts synthesize `virtual:gtkx-config` as SOURCE TEXT\n  (`src/runner/host.ts`, `src/runner/host-dev.ts`,\n  `src/sea/gtkx-config-module.ts`), so a stale key typechecks perfectly and\n  simply stops marking elements lazy at runtime. Caught by diffing rc.4's own\n  `renderConfigModule` against ours and proven by the headless `run-linux`\n  proof, not by a gate.\n- **`virtual:gtkx-config`'s metadata constants** went `SIGNALS` → `signals`,\n  `CONSTRUCT_PROPS` → `constructProps`, `CONSTRUCT_ONLY_PROPS` →\n  `constructOnlyProps`, `DEFAULT_PROPS` → `defaultProps`. Free for us: all\n  three hosts re-export the module wholesale\n  (`export * from \"@gtkx/jsx/metadata\"`) rather than naming its members.\n- **`@gtkx/testing` renamed `GtkxElementError` → `ElementError`,\n  `render`'s `animations`/`reactStrictMode` → `areAnimationsEnabled`/\n  `isReactStrictMode`, and `prettyWidget`'s `highlight` → `shouldHighlight`.**\n  We use none of them, but a consumer's test suite will.\n- **`defineBehavior`'s `createContext` → `initialize`**, and\n  `@gtkx/utils` dropped its `./function` subpath. Neither reaches us.",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "Fixed in rc.3 (history, one line each)",
    text: '- **`gsk-colorstop-boxed-write`** — constructing a `Gsk.ColorStop` threw in\n  the native addon, so SVG gradients had zero constructible stops and painted\n  nothing. **Fixed upstream by us** (gtkx-org/gtkx#473, closing #472): a\n  record field write converts through `toNative` now.\n- **`graphene-rect-nested-boxed-props`** — the same native bug reached through\n  `new Graphene.Rect({ origin, size })`; same upstream fix, so `svg-node.ts`\n  uses the plain constructor again.\n- **The codegen freshness lie** — rc.2\'s `@gtkx/cli` could report "bindings up\n  to date" over a store `npm install` had pruned. Fixed upstream in\n  gtkx-org/gtkx#470 (also ours); separately `src/runner` calls the\n  programmatic `@gtkx/codegen` API rather than the CLI.',
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "Fixed in rc.2 (history, one line each)",
    text: "- **`vitest-compositor`** — rc.1 defaulted the headless display to weston;\n  rc.2's default IS sway, so `vitest.config.ts` calls the plugin with no\n  arguments.\n- **`no-virtual-seat`** — rc.1 had no input seat under sway, so windows never\n  activated and `userEvent` was impossible; rc.2 starts a virtual seat.\n- **`fixed-layout-child`** — rc.1's declarative `<GtkFixedLayoutChild>`\n  created a detached object; moot since containers moved to our own\n  `RnGtkxLayout` manager and GtkFixed left the codebase.\n- **`controllers-as-children`** — rc.1 silently ignored controllers passed as\n  JSX; rc.2 has a `controllers` slot on `GtkWidget`. Pressable and TextInput\n  still attach theirs imperatively on purpose — a choice now, not a\n  workaround.",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "Behaviour rc.4 changed under us",
    text: "Nothing measurable. The suite is **166 files, 1601 passed + 1 expected fail**\non rc.4 — identical to main's own CI run on rc.3 (251c353), file for file and\ntest for test. The renames above are the whole of the release as far as this\nrepo can observe it: the reconciler's commit-time signal handling, the\nharness window, the accessibility tree and the codegen output all behave as\nthey did on rc.3, and the regenerated bindings typecheck clean.\n\nTwo things worth knowing before debugging something odd on rc.4:\n\n- **A first codegen after a version bump is slow enough to look like a hang.**\n  The store fingerprint includes the app's own config, so each example\n  regenerates once on top of the root's run — ~45 s for the gallery on the\n  VM. `scripts/gtkx-dev-headless.ts` sleeps 25 s before its first shot and\n  will report `FAST-REFRESH-FAIL` on a cold store; run `npx gtkx codegen` in\n  the example first.\n- **`gtkx dev` still binds vite's HMR websocket on the fixed port 24678**, and\n  the CLI exposes no way to move it. A second `gtkx dev` anywhere on the\n  machine logs `WebSocket server error: Port 24678 is already in use` and the\n  edit never reaches the app, while the supervisor still prints \"Fast Refresh\n  complete\" — so the log marker alone is not proof the refresh applied.\n  Verified identical on rc.3, so this is not new, but it makes the dev-path\n  proof unreliable when another app is running.",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "Behaviour rc.3 changed under us (still true)",
    text: "- **Blockable signals are no longer suppressed for a whole React commit** —\n  rc.3 wraps each framework write individually, so an emission the framework\n  did not cause (one raised from a `useLayoutEffect`, or aimed at another\n  `createRoot` tree) reaches its handler. Our navigators lean on this.\n- **`render`'s harness window is undecorated**, so role queries see only what\n  the test rendered.\n- **A widget with `accessibleLabelledBy` reports the relation as its\n  accessible name**, ahead of its own text — the precedence ARIA defines.\n- **`toHaveTextContent` no longer falls back to the accessible name**;\n  **`toHaveDisplayValue` throws** on a widget without one; **checked state is\n  tri-state**.\n- **Records are constructible only when their bytes can be copied.** Neither\n  `Gsk.ColorStop` nor `Graphene.Rect` is caught by it.\n- **Single-child widgets have no `content`/`child` props** (pass the widget as\n  a child instead).",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "Non-workarounds (quirks that stay)",
    text: '- 64-bit FFI values arrive as BigInt → `toNumber()` at the boundary\n  (`gtkx/bridge/measure.ts`);\n- signal names are kebab-case ("value-changed"); signals do not pass the\n  emitter (get the widget from a ref);\n- role queries in tests use the `Gtk.AccessibleRole` enum, not strings;\n- `npm install` prunes the codegen store (`node_modules/.gtkx` is not in the\n  lockfile) → run `npm run codegen` after installing — npm behavior, not gtkx;\n- measuring unmapped widgets yields 0 (offscreen Label probes are the\n  exception) → re-measure on the `map` signal + re-commit measured leaves on\n  every flush (`layout/node.ts`);\n- mixed-session setups only: running an app on a bare compositor (headless\n  sway) while `XDG_RUNTIME_DIR` points at a full GNOME session can segfault in\n  a GTK signal handler when the GNOME settings portal pushes updates into the\n  app (`g_cclosure_marshal_VOID__OBJECTv` via the FFI emit path); cutting\n  `DBUS_SESSION_BUS_ADDRESS` avoids it, which is why the headless scripts do.\n  Normal desktop and container runs are unaffected. The portal-push crash\n  needs a live settings change to trigger and stays on the list unconfirmed.',
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "Procedure when the next release ships",
    text: "1. Update the `@gtkx/*` pins (root, spike, examples, template), then\n   `npm install && rm -rf node_modules/.gtkx && npm run codegen`;\n2. Run everything on Linux: `npm run typecheck && npm test`, `build:dist`,\n   `check:package`, plus the headless example proofs;\n3. Walk the live-workaround table: for each row check the removal condition,\n   delete the tag and the row together when it is met, and move the entry into\n   the history section above — **with a probe that proves the fix on the real\n   runtime**, not just the release notes claiming it. And make the probe\n   reproduce the ORIGINAL failure first: two of the three `runtime-dedupe`\n   probes written for rc.4 reported a fix that was not there, because they\n   were not actually building the duplicate;\n4. Re-tag whatever survives (`RC4-WORKAROUND` → the new release), rename this\n   file to match the new pin, and update `docs/upstream-gtkx.md` if an ask was\n   answered.",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "1. The two layers",
    text: "```\nyour app\n   ├── react-native                    portable components\n   ├── react-native-gtkx/navigation    react-navigation adapter   (optional)\n   └── react-native-gtkx/adwaita       GTK widgets and primitives\n```\n\n**`react-native-gtkx/gtk` and `react-native-gtkx/adw`** owns the widget: diffing a requested stack\nof tags into `pushByTag` / `popToTag` / `replaceWithTags`, holding a popped\npage alive until its exit animation ends, bracketing transitions, reporting\nnative pops. It imports nothing from `@react-navigation/*`. `NavigationStack`\ntakes the visible stack as a prop, so a `useState` is a complete router.\n\n**`react-native-gtkx/navigation`** is an adapter: react-navigation state to\nan array of tags, a native pop to `StackActions.pop` (only when the tag is\nstill in state, otherwise it would double-pop), descriptors to titles, header\ncontent and `canPop`, plus dev warnings for options we ignore.\n\nThis is the same split the React Native ecosystem already uses:\n`react-native-screens` exposes primitives, `@react-navigation/native-stack`\nbinds them to a router. It is also what React Navigation's maintainer\nrecommended when he saw the project (u/satya164, on the r/reactnative\nannouncement): _keep your own navigator so you can provide options specific\nto GTK, unless you plan to match native stack API 1:1._\n\nThe consequence that matters: **the ceiling of react-navigation's model is\nnow only in the adapter, never in the primitive.** A GTK capability with no\ncounterpart in React Native does not have to be squeezed into someone\nelse's abstraction — it lives in the primitive layer and is reachable\ndirectly. See [../architecture/overview.md](../architecture/overview.md).",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "2. What an app can reach today",
    text: "Everything below the HeaderBar: each page hosts a full RN tree in its own\nlayout root. All of react-navigation's state mechanics: params,\n`setOptions`, dispatch, resets.\n\nStack options: `title`, `headerShown`, `headerButtons` (declarative native\nicon buttons), `headerLeft` / `headerRight` (ordinary RN content rendered\n_inside_ the HeaderBar), `gestureEnabled`.\n\nPast the options, the primitives: any GTK widget we bind, taking `style` so\nReact Native drives its position and its appearance, plus `wrapReactNative`\nfor widgets we do not re-export, plus a `ref` to the underlying\n`Adw.NavigationView`. There is no wall — a missing convenience costs a line,\nnot a fork.\n\n**Resolved since the first snapshot.** Kept here because the reasons are\nstill instructive:\n\n- _RN content could not size a chrome slot_ (HeaderBar start/end, sidebar\n  rows) — one root cause behind the whole `headerLeft`/`headerRight` class.\n  Fixed by the intrinsic-size root, now public as `IntrinsicContent`.\n- _`usePreventRemove` / `beforeRemove` desynced_, because the native pop had\n  already happened when state heard about it. Fixed through\n  `AdwNavigationPage:can-pop`: a prevented route cannot be popped by the\n  user at all, so there is nothing to race. Covered by\n  `tests/gtk/navigation/prevent-remove.gtk.test.tsx`.\n- _Unsupported options were ignored silently._ Fixed:\n  `src/navigation/option-warnings.ts` names the screen and the option in\n  development.\n- _Screen props and options had to be hand-rolled._ Fixed:\n  `createStackNavigator<ParamList>()` types `Stack.Screen`, its options and\n  the screen props (`examples/hn-app` relies on it).\n\n`createSidebarNavigator`'s own gaps — sidebar row rendering, collapsed\nmode and the static content header — are covered in §3 below, alongside\nthe `examples/tasks-app`/`examples/tasks-nav` narrative that found and\nthen closed them.\n\nOn typing, one clarification worth recording, since it was raised publicly.\nThe complaint was never that custom navigators cannot be typed — the docs\nshow how, and we follow them. It is that the upstream v7 signature is\n`createNavigatorFactory(Navigator: ComponentType<any>): (config?: any) => any`,\nso nothing flows out of the factory itself and the types have to come from\nannotating the navigator. React Navigation 8 replaces this with a real typed\nAPI (`NavigatorTypeBagBase`, `createScreenFactory`); adopting it is the\n`react-navigation-8` epic.",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "3. Still open",
    text: "Meaningful on this platform and not done yet: toolbar top-bar style (the\n`headerTransparent`/`headerShadowVisible` analogue), search-bar options\n(`Gtk.SearchBar` / `headerSearchBarOptions` — note v8 renamed its\n`onChangeText` to `onChange`), and deep links (they parse, but nothing\ndelivers a URL on the desktop yet). `animation: \"none\"` is done (a screen\noption, see docs/api.md).\n\n**Resolved by building `examples/tasks-app` (the gtkx tutorial's Tasks app,\nported), each with a small library change, not a workaround:**\n\n- _`Adw.Dialog` presentation_ — confirmed working. `AdwAboutDialog`/\n  `AdwAlertDialog`/`AdwPreferencesDialog`/`AdwShortcutsDialog` are already\n  `wrapReactNative`-wrapped; mounted with no Yoga ancestor anywhere in the\n  tree (this app has none — see the example's README), they hit\n  `wrapReactNative`'s \"bare\" branch and present correctly, verified live\n  with real screenshots (Preferences, Shortcuts). Nothing to fix here —\n  this item can be dropped from \"still open\" entirely.\n- _Breakpoints_ — a real `Adw.Breakpoint`, verified live collapsing the\n  window at a narrow width, but not through the navigator: through a new\n  `AppRegistry.runApplication({ breakpoints })` parameter instead (the\n  navigator itself still had no collapsed-mode concept at the time —\n  closed by `navigation-depth-2`, see below). Also found and recorded:\n  `AdwBreakpoint`'s `onApply`/`onUnapply` never fire under the\n  `@gtkx/vitest` headless-sway gtk test project, in any form tried (JSX\n  prop, imperative `Adw.Breakpoint`+`addBreakpoint`, a genuine `swaymsg`\n  resize) — but fire immediately in a real GNOME session. Treat it as\n  untestable headless today, not broken; see\n  `packages/react-native-gtkx/tests/gtk/bridge/auxiliary-elements.gtk.test.tsx`.\n  (`navigation-depth-2`'s own `collapseWidth`, below, sidesteps this\n  entirely — it drives `Adw.Breakpoint.addSetter` rather than\n  `onApply`/`onUnapply`, and that IS testable headless, see\n  `tests/gtk/adw/breakpoint.gtk.test.tsx`.)\n- _Actions and menus_ were never on this list by name, but turned out to\n  be the same kind of gap: `AppRegistry.runApplication` had no way to\n  attach a `GSimpleAction`, `actionAccels` or a `GtkShortcutController` to\n  the app/window it builds — required for a `Gio.Notification` action\n  button to route anywhere at all. Closed the same way, with\n  `applicationActions`/`actionAccels`/`windowActions`/`windowControllers`.\n\n**Resolved by building `examples/tasks-nav` (`navigation-depth-2` epic),\nclosing exactly what the tasks-app port above found still narrow:**\n\n- _Sidebar row rendering and collapsed mode_ — `createSidebarNavigator`'s\n  `SidebarNavigationOptions` was `{ title }` only: no per-row icon/color/\n  count, and no collapsed/breakpoint wiring of its own (tasks-app had to\n  reach `AppRegistry`'s `breakpoints` directly and drive `collapsed`\n  itself). Fixed: `icon`/`color`/`count` (rendered as `AdwActionRow`, the\n  same widget tasks-app's own hand-rolled sidebar used) and an opt-in\n  `collapseWidth` prop, driving collapse through the navigator itself via\n  a native `Adw.Breakpoint` — not a `useWindowDimensions` conditional; see\n  [../architecture/layout-and-styling.md](../architecture/layout-and-styling.md),\n  \"Two ways to react to size\", for the mechanism and why no `useBreakpoint`\n  hook exists.\n- _One static content header shared by the whole navigator_ — the same\n  port's other finding: a filter toggle group vs. a back button,\n  depending on selection, did not fit one static header. The\n  `navigation-depth-2` PRD explicitly allowed this turning out to be a\n  structural gap; it wasn't — descriptor options already merge\n  navigator-level `screenOptions` with a screen's own `options` and\n  re-resolve on `navigation.setOptions()`, core react-navigation behavior.\n  `SidebarNavigationOptions` gained `headerLeft`/`headerRight`/\n  `headerTitle`, mirroring the stack navigator's own `headerLeft`/\n  `headerRight`; a screen that toggles local state and calls\n  `setOptions` in an effect gets a header that changes shape with its own\n  selection, no stack involved — confirming tasks-app's own conclusion\n  that a stack was never the right tool for the \"open an item\" case.\n  Caveat found while testing this: `setOptions` merges into the\n  previously resolved options rather than replacing them (see\n  docs/api.md).\n\n`examples/tasks-nav` is the same navigational shape as `examples/tasks-app`\n— smart views, colored user lists, an open-item editor — now written\nthrough `createSidebarNavigator` instead of directly on\n`AdwNavigationSplitView`/`AdwActionRow`.\n\n**Resolved by `collapse-nav` (a live bug report on `examples/tasks-nav`),\none property lower than `collapseWidth` itself:** `collapseWidth` flips\n`AdwNavigationSplitView.collapsed` correctly, but `showContent` — WHICH\npane is visible while collapsed — was only half-wired: a row click already\nrevealed content, but nothing observed the split view's own back\naffordance putting it back, and a plain programmatic `navigate()` (no row\nclick) did not reveal content at all. On read, this looked like it might\nbe the same \"the breakpoint effect sets only `collapsed`\" gap all over\nagain; it mostly was not — see `sidebar.tsx`'s own file header for what was\nalready there. Three questions were settled empirically, with a throwaway\nGTK test written BEFORE any implementation code, rather than assumed from\nlibadwaita's docs:\n\n- _Does a cold-started, already-collapsed window default to content or the\n  sidebar?_ Sidebar — `showContent` defaults to `false`, confirmed by\n  mounting a window already narrower than `collapseWidth` and reading the\n  property on first layout, before any code (ours or the app's) ever wrote\n  to it. No fix needed.\n- _Does resizing back above `collapseWidth` and back below it need to\n  reset `showContent` or the selection?_ No — both persist across the\n  round trip, confirmed the same way (resize wide, resize narrow again,\n  read the property). This is deliberate, not an oversight: it is the same\n  size-class persistence a mobile master-detail app relies on (open an\n  item, rotate to landscape and back, still on that item), which is\n  exactly the \"the way a mobile app does\" behavior the bug report asked\n  for. Resetting it would have fought the platform's own default for no\n  benefit.\n- _Does an app need to observe or control the collapsed pane at all?_ One\n  direction, yes: going back. TabRouter's `state` never changes when the\n  user backs out of collapsed content (nothing is removed, the same route\n  stays focused), so there is no existing react-navigation mechanism for\n  an app to notice it happened — unlike a stack pop, which state itself\n  already reveals through the route array shrinking. A new event,\n  `sidebarShown` (`SidebarNavigationEventMap`, the same `navigation.emit`/\n  `addListener` protocol `StackNavigationEventMap`'s `transitionStart`/\n  `transitionEnd` already established — not a second protocol), fires on\n  the active route for exactly this. The forward direction (content being\n  revealed) got no event: it is already an ordinary state change an app\n  can observe the normal way, so an event there would be pure duplication.\n\nThe echo risk this raises — state → widget and widget → state both touch\nthe same property, could they retrigger each other? — resolved the same\nway the stack navigator's own doc warns about it: by a value asymmetry, not\na flag. State → widget only ever WRITES `true`; widget → state only ever\nREACTS to `false`. Two disjoint values, so neither side can mistake the\nother's write for the other direction.\n\nFixed: `sidebar.tsx`'s `state.index` effect now also calls\n`showContentIfCollapsed()` (previously only `onRowActivated` did, so a\nclick worked but a programmatic navigation left the user stranded on the\nsidebar exactly like the report — a real, reproducible gap, not merely a\ntheoretical one); `onNotifyShowContent` is observed and re-emitted as\n`sidebarShown`. `examples/gallery` (no `collapseWidth`) is untouched by\nconstruction — every changed path checks `getCollapsed()` /\n`collapseWidth !== undefined` live first. See\n`tests/gtk/navigation/sidebar-collapse.gtk.test.tsx` for the automated\nversion of all four findings above, and docs/api.md for the public shape.\n\n**Found while building `examples/tasks-nav`, narrower, still open:**\n\n- _The sidebar PANE's own chrome has no customization hook_ — its\n  `AdwToolbarView`'s `AdwHeaderBar` is hard-coded\n  (`src/navigation/sidebar.tsx`); a navigator consumer can set\n  `sidebarTitle` (a string) on it and nothing else. `examples/tasks-nav`'s\n  \"New List\" action wanted to live there (matching tasks-app's own\n  `SidebarHeader` component) but had to go on the content header instead,\n  via the navigator-level `headerButtons` prop. Not on the PRD's\n  checklist, so not built.\n- _Toasts_ — no `AdwToastOverlay`/`Adw.Toast` convenience exists anywhere\n  in `react-native-gtkx` (upstream's own tutorial reaches for\n  `@gtkx/components/adw`'s `ToastProvider`/`useToast`, a package this repo\n  does not depend on). `examples/tasks-app/src/toast.tsx` is a local\n  stand-in; the toast's underlying state change works and is verified live,\n  but the toast's own visual appearance could not be confirmed on screen\n  in that session, for a reason not yet root-caused. Worth a real fix (or\n  at least a live confirmation) before another app leans on it.\n\n**Meaningless on desktop, skip forever:** status-bar and home-indicator\noptions, large titles, blur effects, gesture direction, form sheets,\nback-button labels. `headerBackButtonMenuEnabled` is free — libadwaita's\nback button already shows a history menu.",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "4. Porting an existing react-navigation app",
    text: "Compatible by construction: a real `@react-navigation/native` v8 peer, the\nofficial `useNavigationBuilder` and routers, a real `NavigationContainer`.\nEverything from react-navigation is imported from `@react-navigation/native`\ndirectly. We used to re-export a partial set from our navigation entry point\nand dropped it: the set was incomplete, so consumers ended up importing from\nboth places and could not tell which symbol came from where.\n\nMandatory changes: swap `createNativeStackNavigator` for our\n`createStackNavigator`; drop `react-native-screens`,\n`react-native-safe-area-context` and `react-native-gesture-handler` (all\nthree are mobile-native dependencies with nothing to bind to here).\n\nKeeping shared code portable: Linux-only options go behind a `.linux.tsx`\nplatform extension or `Platform.select({ linux: … })`. Options a platform\ndoes not understand are ignored — and here, warned about in development.",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "5. The desktop-RN landscape",
    text: "No other desktop React Native platform has native navigation integration:\n\n- **react-native-screens** lists Windows support, but it is a thin\n  old-architecture module; native-stack on modern react-native-windows\n  fails, because screens has no new-architecture Windows implementation and\n  RNW 0.82 removed the old one. Microsoft's own react-native-gallery falls\n  back to the JS drawer.\n- **react-native-macos** is not supported by react-native-screens at all —\n  AppKit has no navigation-stack primitive to bind to.\n\nOur path — a real `Adw.NavigationView` driven from a custom navigator, with\nreact-navigation state as the source of truth and native pops reported back\ninto it — is structurally the iOS native-stack / `UINavigationController`\nmodel, which neither desktop platform reached. GTK's advantage is that the\nprimitive exists at all: back button, Escape, back gesture, history menu and\ntransitions ship with the widget.\n\nThe trade: a JS stack can render anything into its fake header, while our\nchrome is real and had to be opened up deliberately — which is what the\nintrinsic-size root does.\n\nSources: react-native-screens README and discussions #1575 / #2541, RNW\ndiscussions #14273 / issue #4152 / new-architecture docs / 0.82 release\npost, microsoft/react-native-gallery, reactnavigation.org native-stack docs.",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "RC4-WORKAROUND(use-signal-stale-handler)",
    text: "`useSignal` still routes the handler through React's `useEffectEvent`; `react-reconciler@0.33.0` only refreshes it in `commitBeforeMutationEffects` for `case 0` (FunctionComponent) — `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed, so any `useEffectEvent` in a `memo`/`forwardRef` component is pinned to its mount closure forever (our `ScrollView` is a `forwardRef` with the `useSignal` calls inside it) — a fetch-fed FlatList empties itself on the first scroll. **rc.4 did not bump React and did not change the path** — see below — our workaround: `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx's — removed when: A stable React 19.3 (React fixed the refresh on the 19.3 line)",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "RC4-WORKAROUND(runtime-dedupe)",
    text: "Two bundled copies of the gtkx runtime still double-init GLib and abort; nothing guards against it. Reproduced on rc.4: `g_log_set_writer_func() called multiple times`, SIGABRT — our workaround: `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits — removed when: Idempotent runtime init upstream, or an error that names the duplicate",
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "RC4-WORKAROUND(prop-portal)",
    text: '`createPortal(children, container, key?)` is byte-for-byte the rc.3 signature and can still only target a container\'s DEFAULT slot ("children"). Every other slot an object exposes declaratively — a window\'s `Gio.ActionMap` (`actions`), a widget\'s `controllers`, an `AdwApplicationWindow`\'s `breakpoints` — is reached only by passing an element-valued PROP, which the reconciler routes through an internal `"gtkx:prop"` element. rc.4 exports that element from neither `@gtkx/react` nor `/internal`, and its `exports` map now refuses the deep path outright — our workaround: `gtkx/bridge/slot-portal.ts` restates the `"gtkx:prop"` element name and wraps it in `createSlotPortal(children, target, slot)` — the one line that would move if gtkx renames it. `WindowActions`/`ApplicationActions`/`WindowControllers` are built on it — removed when: gtkx exports a slot-aware portal (or the prop element) from a public entry point',
  },
  {
    doc: "docs/gtkx-rc4-notes.md",
    heading: "RC4-WORKAROUND(renderhook-no-window)",
    text: "`renderHook` still mounts into a bare `Gtk.Box` — rc.4's `render-hook.js` is byte-identical to rc.3's, which was byte-identical to rc.2's — so window-dependent APIs have no toplevel to read — our workaround: Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`) — removed when: `renderHook` mounts into the same harness window `render` uses",
  },
  {
    doc: "docs/reference/components/view.md",
    heading: "View",
    text: "View — GTK implementation: `GtkBox` (a custom paintable box). Supported: `style`, `onLayout`, `testID`, children. `pointerEvents` — `auto` / `none` / `box-none` / `box-only`, mapped onto GTK picking (a can-target flag plus a `contains()` override). Also honored from `style.pointerEvents`, with the prop taking precedence. `focusable` plus `onFocus` / `onBlur` — off by default, as in RN. A ref exposing `measure` / `measureInWindow` / `measureLayout` (`ViewHandle`, RN's own argument order — window coordinates come from `gtk_widget_compute_point`, so they read correctly inside a scrolled viewport). The full responder and touch prop set — `onStartShouldSetResponder(Capture)`, `onMoveShouldSetResponder(Capture)`, `onResponderGrant/Start/Move/End/Release/Terminate`, `onTouchStart/Move/End/Cancel` plus `Capture`; `PanResponder`'s `panHandlers` spread here too. See [Gestures](../../gestures.md).. Differences from RN: Input is single-pointer: a mouse is one fabricated touch, and `touches` never exceeds one. Responder negotiation is RN's model in full — capture-then-bubble, mid-gesture transfer through `onResponderTerminationRequest` / `onResponderReject`, one lock per process — but the negotiation path stops at the layout root, so native GTK widgets between or above views take no part in it. GTK settles most terminations before JS is consulted: a context menu, a native widget or `GtkDragSource` taking the sequence, and text selection all arrive as an already-cancelled gesture and terminate **without** consulting `onResponderTerminationRequest` — GTK's claim is irrevocable. Window blur terminates unconditionally (as on react-native-web). An enclosing `ScrollView` scrolling under the gesture is the one termination the responder may still refuse. `overflow: \"hidden\"` (and `\"scroll\"`, which clips identically) clips both the paint and the picking of children — including transformed ones and children an animation drives outside the box. `borderRadius` shapes that clip. A container never clips its own background, border, shadow or outline — only its children's.",
  },
  {
    doc: "docs/reference/components/text.md",
    heading: "Text",
    text: "Text — GTK implementation: `GtkLabel` (Pango). Supported: wrapping, `numberOfLines` (end ellipsis), `textAlign`, font styles, `onLayout`, `testID`, and a ref exposing the geometry methods (`TextHandle` — a label needs no wrapping `View` to be measurable).. Differences from RN: Nested `Text` elements are concatenated without per-span styling. Text is always ellipsizable — it shrinks in a narrow window rather than overflowing.",
  },
  {
    doc: "docs/reference/components/image.md",
    heading: "Image",
    text: "Image — GTK implementation: `GtkPicture`. Supported: `source={{ uri }}` or a string — local paths, `file://` and `http(s)` (fetched through Node and cached to disk by URL, with in-flight requests de-duplicated). `resizeMode` — `cover` / `contain` / `stretch` / `center`. `onLoad` / `onError`; a ref exposing the geometry methods (`ImageHandle`). `.svg` files load like any other image (rasterized through librsvg). Building vector graphics from state instead of a file is a separate import — see [Svg](../svg.md).. Differences from RN: A remote image has no synchronous size — `style` sets the size, as in RN. The disk cache is not size-limited yet.",
  },
  {
    doc: "docs/reference/components/safe-area-view.md",
    heading: "SafeAreaView",
    text: "SafeAreaView — GTK implementation: = `View`. Supported: —. Differences from RN: A desktop window has no notch, so this renders exactly as `View`.",
  },
  {
    doc: "docs/reference/components/status-bar.md",
    heading: "StatusBar",
    text: "StatusBar — GTK implementation: renders nothing. Supported: —. Differences from RN: There is no status bar on a desktop window, so every prop is accepted and ignored.",
  },
  {
    doc: "docs/reference/components/activity-indicator.md",
    heading: "ActivityIndicator",
    text: "ActivityIndicator — GTK implementation: `GtkSpinner`. Supported: `animating`, `size` (`small` / `large` / a number).. Differences from RN: `color` is not supported yet.",
  },
  {
    doc: "docs/reference/components/root.md",
    heading: "Root",
    text: "Root — GTK implementation: an internal layout root. Supported: `width`, `height`.. Differences from RN: Extension: the root the test harness renders a tree into.",
  },
  {
    doc: "docs/reference/components/nested-root.md",
    heading: "NestedRoot",
    text: "NestedRoot — GTK implementation: an internal layout root. Supported: —. Differences from RN: Extension: a Yoga layout root inside any GTK container slot (a navigation page, a custom container) — the slot's own allocation is the viewport.",
  },
  {
    doc: "docs/reference/components/intrinsic-root.md",
    heading: "IntrinsicRoot",
    text: "IntrinsicRoot — GTK implementation: an internal layout root. Supported: —. Differences from RN: Extension: a content-sized Yoga root for chrome slots (a header bar's start/end content) — it reports its content size to GTK instead of receiving an allocation.",
  },
  {
    doc: "docs/reference/components/text-input.md",
    heading: "TextInput",
    text: "TextInput — GTK implementation: `GtkEntry` (single line) / `GtkTextView` (multiline). Supported: Controlled and uncontrolled use (`value` / `defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus` / `onBlur`. `placeholder` — its own dim overlay in multiline mode, since `GtkTextView` has none built in. `secureTextEntry`, `editable`, `keyboardType`, `multiline`. `clearButtonMode` — `GtkEntry`'s built-in clear icon (RN only ships this on iOS). The visual half of `style` — background, border and radius all reach the widget, rather than being computed and dropped.. Differences from RN: Multiline needs an explicit `height` in its style, exactly as RN recommends. A real `GtkTextView` wraps words, scrolls internally, and inserts a newline on Enter rather than firing `onSubmitEditing` — RN's own multiline semantics.",
  },
  {
    doc: "docs/reference/components/switch.md",
    heading: "Switch",
    text: "Switch — GTK implementation: `GtkSwitch`. Supported: `value` / `onValueChange`, `disabled`.. Differences from RN: Sized by the GTK theme, not by iOS metrics.",
  },
  {
    doc: "docs/reference/components/pressable.md",
    heading: "Pressable",
    text: "Pressable — GTK implementation: `View` + click/motion event controllers. Supported: `onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn` / `onHoverOut`, `onFocus` / `onBlur`, `focusable`, `disabled`. A function-form `style` / `children` receiving `{ pressed, hovered, focused }` (react-native-web's own state shape). Keyboard-operable: `focusable` defaults to `true` whenever `onPress` is set (react-native-web's rule), which puts the view in the GTK focus chain — Tab and the arrow keys reach it, and Enter/Space fire `onPress` as they do on web and Android. The `PressEvent` payload matches RN's shape (`locationX/Y` target-relative, `pageX/Y` window-relative, `identifier`, `target`, `force`, a monotonic `timestamp`, single-element `touches`/`changedTouches`). `hitSlop` and `pressRetentionOffset` each take a number or a per-edge object; the press rect defaults to RN's own `{ top: 20, left: 20, right: 20, bottom: 30 }` around the hit rect, and releasing outside it cancels rather than presses.. Differences from RN: `hitSlop` cannot escape a clipping ancestor — a `ScrollView` viewport or any view with `overflow: \"hidden\"` — because GTK stops hit-testing at the clip; RN documents the identical limit on Android for the same reason. Hover fires from touch input as well as from a mouse (react-native-web filters that out; here a crossing event carries no device to filter on) — GTK also sends a matching leave when a touch sequence ends, so the stuck phantom hover the filter guards against does not arise; GTK's own `:hover` behaves the same way.",
  },
  {
    doc: "docs/reference/components/touchable-opacity.md",
    heading: "TouchableOpacity",
    text: "TouchableOpacity — GTK implementation: built on `Pressable`. Supported: `activeOpacity`.. Differences from RN: —",
  },
  {
    doc: "docs/reference/components/touchable-highlight.md",
    heading: "TouchableHighlight",
    text: "TouchableHighlight — GTK implementation: built on `Pressable`. Supported: `underlayColor` (default `black`, as in RN), `activeOpacity`, `onShowUnderlay` / `onHideUnderlay`.. Differences from RN: RN renders a separate underlay view behind the child and dims the child onto it. Here the highlight is the view's own `backgroundColor` while pressed — an extra box would change flex layout and what `measureLayout` measures relative to, the same reason `GestureDetector` and `createAnimatedComponent` add none either. Give the child a translucent background for RN's exact blend.",
  },
  {
    doc: "docs/reference/components/touchable-without-feedback.md",
    heading: "TouchableWithoutFeedback",
    text: "TouchableWithoutFeedback — GTK implementation: built on `Pressable`. Supported: the same press/hover/focus props as `Pressable`, with no visual reaction.. Differences from RN: RN clones its single child rather than rendering a box of its own — its own documentation calls that a compatibility artifact. This renders the `Pressable` box instead. Prefer `Pressable` directly, as RN's own docs recommend.",
  },
  {
    doc: "docs/reference/components/scroll-view.md",
    heading: "ScrollView",
    text: "ScrollView — GTK implementation: `GtkScrolledWindow`. Supported: Vertical and `horizontal` scrolling. `contentContainerStyle` — the content container is a plain `View`, so `alignItems` defaults to `stretch` as it does in RN. `onScroll` (`contentOffset`, `contentSize`, `layoutMeasurement`), the four scroll-phase callbacks `onScrollBeginDrag`/`onScrollEndDrag`/ `onMomentumScrollBegin`/`onMomentumScrollEnd`, `onContentSizeChange`. `stickyHeaderIndices` — the real child is translated and painted on top, no duplicate node. A ref exposing `scrollTo`/`scrollToEnd` plus the geometry methods `measure`/`measureInWindow`/`measureLayout` (`ScrollViewHandle`). A child that takes the responder suspends the scroller's own gestures for the rest of the interaction, so a pan gesture is reachable inside a scrolling list.. Differences from RN: `animated` in `scrollTo` is ignored. **The scroll phases are input-device aware**: a mouse wheel gives GTK isolated detents, so a burst is grouped into one begin/end session (a 120&nbsp;ms idle boundary) and reports no momentum; a touchpad glide reports all four phases from its native GTK sequence, and content really keeps moving once the fingers lift. RN has no wheel input, so the wheel session is a desktop-only extension rather than a parity claim. `onScrollBeginDrag`/`onScrollEndDrag` map onto the user-driven scroll _session_ (a touchpad's begin/end signal, or the grouped wheel burst) rather than a finger literally touching the content — the closest true statement available, since a touchpad never touches the content directly. The momentum pair reflects the adjustment actually continuing to move after the session ends rather than a generic \"decelerate\" signal that fires on every lift — a glide that stops dead reports the drag pair with no momentum pair, as RN does. None of this installs until a handler is attached: with all four phase callbacks attached, a scroll event costs 6.93&nbsp;µs versus 7.17&nbsp;µs with none attached — inside the noise; the GTK controller itself costs 0.31&nbsp;µs per event once any phase handler is present, and a begin/end consumer specifically adds 0.235&nbsp;µs per wheel detent for the session state machine. Scroll arbitration between a scroller and a child gesture is touch-only: `GtkScrolledWindow`'s own gestures are touch-only, so under a mouse a child pan never competes with scrolling at all. Two known edges under touch: a child gesture that claims on a move rather than on the initial press can lose the first ~8&nbsp;px to the scroller (GTK's claim is irrevocable, the same artifact iOS has); and a mouse wheel during an active gesture terminates the responder rather than being suppressed. **The scroller carries RN's own base style**, `flexGrow: 1, flexShrink: 1`, composed under the app's `style` the same way RN's `StyleSheet.compose` composes it, on the same node `style` lands on — `FlatList`, `SectionList` and `VirtualizedList` inherit it. This is what makes an unstyled scrollable a viewport rather than a box grown to its content, and it has one consequence worth knowing: an explicit main-axis `height` on the scroller is only its flex _basis_ — inside a taller flex parent, `flexGrow` still expands it past that height. That is parity with RN's own Yoga behavior, not a deviation. To bound the viewport, bound the _parent_ (`<View style={{ height: 200 }}><FlatList /></View>`, what an RN app already writes) or cancel the base style with `flexGrow: 0`.",
  },
  {
    doc: "docs/reference/components/flat-list.md",
    heading: "FlatList",
    text: "FlatList — GTK implementation: a windowed core over `ScrollView`. Supported: Virtualization (`estimatedItemSize` or `getItemLayout`, `windowSize`/ `initialNumToRender` as the primary scroll-performance knobs, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`). `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`. `CellRendererComponent` — RN's per-cell wrapper. The list still hands it the cell's absolute `style` and the `onLayout` that measures it, and both must be applied, which is what `react-native-draggable-flatlist` builds its design on. `ListHeader`/`Footer`/`EmptyComponent`, `onEndReached(-Threshold)`. `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`). `inverted` — RN's chat semantics: the list opens at `data[0]` and stays pinned on prepend. `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`. A ref exposing `scrollToIndex`/`scrollToItem`/`scrollToOffset` plus `scrollTo`/`scrollToEnd` (`FlatListHandle`) — the scroll half of a `ScrollView` ref, not the geometry half: a windowed list is a composite over `ScrollView` and owns no widget of its own, so measure the `ScrollView` or a cell instead.. Differences from RN: 1000 rows mount windowed in roughly 120&nbsp;ms. `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure, and a wider window means fewer mount-and-reflow bursts per scrolled pixel (measured: 21% less churn, late frames down from 10/s to 7.7/s). Rows beyond the visible ones mount `maxToRenderPerBatch` (10) at a time, every `updateCellsBatchingPeriod` (50)&nbsp;ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one. There is no pull gesture — `onRefresh` is always app-triggered. An inverted list shorter than its viewport anchors to the top, not the bottom. `CellRendererComponent` does not apply to a sticky cell (`stickyHeaderIndices`), because pinning reorders the cell's real GTK widget — the sticky container has to _be_ the cell.",
  },
  {
    doc: "docs/reference/components/section-list.md",
    heading: "SectionList",
    text: "SectionList — GTK implementation: built on `FlatList`. Supported: `sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`).. Differences from RN: Viewability props are not exposed yet (section-aware `ViewToken`s are not implemented).",
  },
  {
    doc: "docs/reference/components/virtualized-list.md",
    heading: "VirtualizedList",
    text: "VirtualizedList — GTK implementation: the same windowed core. Supported: RN's opaque data-source shape over the same windowed core `FlatList` sits on — `data` is read only through `getItemCount(data)` and `getItem(data, index)`, both called lazily; only the rows the window actually mounts are ever asked for. Everything else matches [FlatList](flat-list.md), `CellRendererComponent` included.. Differences from RN: The accessors are optional here and required upstream — one component serves both the opaque-source and plain-array shapes, which is why `FlatList` needs no separate implementation. `scrollToItem` scans the source through `getItem`, as upstream does — an opaque source has no index to look up directly. Every `FlatList` difference above applies unchanged.",
  },
  {
    doc: "docs/reference/components/modal.md",
    heading: "Modal",
    text: "Modal — GTK implementation: a modal `GtkWindow` (a portal). Supported: `visible`, `onRequestClose` (Escape or the window's close button), `title`, `width`/`height`; independently resizable, with relayout.. Differences from RN: This is a real, separate desktop window rather than an overlay drawn above the current one. `transparent` and `animationType` are accepted and have no effect.",
  },
] as const satisfies readonly DocChunk[]
