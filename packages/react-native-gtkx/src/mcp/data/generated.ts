// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-mcp-data.mjs from docs/api.md,
// docs/platform-layer.md, docs/gtkx-rc2-notes.md, docs/getting-started.md,
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
    gtkImplementation: "GtkBox (RnGtkxViewBox)",
    supported:
      "`style`, `onLayout`, `testID`, children, `pointerEvents` (auto/none/box-none/box-only — mapped onto GTK picking: can-target + a contains() vfunc override; also honored from `style.pointerEvents`, the prop wins)",
    differences:
      "nesting another pointerEvents inside a box-only view is not supported",
  },
  {
    name: "Text",
    subpath: "react-native",
    gtkImplementation: "GtkLabel (Pango)",
    supported:
      "wrap, `numberOfLines` (ellipsize END), `textAlign`, font styles, `onLayout`, `testID`",
    differences:
      "nested `Text` elements are concatenated without per-span styles; text is always ellipsizable (shrinkable in narrow windows)",
  },
  {
    name: "Image",
    subpath: "react-native",
    gtkImplementation: "GtkPicture",
    supported:
      '`source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`; **`.svg` files load like any other image** — `Gdk.Texture.newFromFilename` rasterizes them via librsvg, no extra code needed (for building vector graphics from state instead of a file, see the "Svg" section below — a separate import, not part of this table)',
    differences:
      "no synchronous size from remote images (style sets the size, as in RN); cache is not size-limited yet",
  },
  {
    name: "TextInput",
    subpath: "react-native",
    gtkImplementation: "GtkEntry / GtkTextView",
    supported:
      "controlled/uncontrolled (`value`/`defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus`/`onBlur`, `placeholder` (own dim overlay in multiline — GtkTextView has none), `secureTextEntry`, `editable`, `keyboardType`, `multiline`, `clearButtonMode` (GtkEntry's built-in clear icon; RN ships this on iOS only) (real GtkTextView: word wrap, internal scroll, Enter inserts a newline and never fires onSubmitEditing — RN semantics)",
    differences: "multiline needs a height in the style (as RN recommends)",
  },
  {
    name: "Pressable",
    subpath: "react-native",
    gtkImplementation: "GtkFixed + GestureClick/Motion",
    supported:
      "`onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn/Out`, `disabled`, function-form `style`/`children` receiving `{pressed, hovered}`",
    differences: "—",
  },
  {
    name: "TouchableOpacity",
    subpath: "react-native",
    gtkImplementation: "on top of Pressable",
    supported: "`activeOpacity`",
    differences: "—",
  },
  {
    name: "ScrollView",
    subpath: "react-native",
    gtkImplementation: "GtkScrolledWindow",
    supported:
      "vertical/`horizontal`, `contentContainerStyle`, `onScroll`, `onContentSizeChange`, `stickyHeaderIndices` (RN model: the REAL child is translated and painted on top — no duplicate), ref: `scrollTo`/`scrollToEnd` (`ScrollViewHandle`)",
    differences: "`animated` in scrollTo is ignored",
  },
  {
    name: "FlatList",
    subpath: "react-native",
    gtkImplementation: "windowed core on ScrollView",
    supported:
      "virtualization (`estimatedItemSize` or `getItemLayout`, **`windowSize`/`initialNumToRender` — the primary scroll-performance knobs**, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`), `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`, `ListHeader/Footer/EmptyComponent`, `onEndReached(-Threshold)`, `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`), `inverted` (RN chat semantics: opens at `data[0]`, stays pinned on prepend), `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`, ref: `scrollToIndex`/`scrollToItem`/`scrollToOffset` + ScrollView methods (`FlatListHandle`)",
    differences:
      "1000 rows mount windowed in ~120 ms (v1 full mount was 879 ms); `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure and a wider window means fewer mount+reflow bursts per scrolled pixel (measured: −21% churn, late frames 10/s → 7.7/s); rows beyond the visible ones are mounted `maxToRenderPerBatch` (10) at a time every `updateCellsBatchingPeriod` (50) ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one; no pull gesture — `onRefresh` must be app-triggered; an inverted list shorter than its viewport anchors to the top, not the bottom",
  },
  {
    name: "SectionList",
    subpath: "react-native",
    gtkImplementation: "on top of FlatList",
    supported:
      "`sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`)",
    differences:
      "viewability props are not exposed (section-aware ViewTokens pending)",
  },
  {
    name: "Switch",
    subpath: "react-native",
    gtkImplementation: "GtkSwitch",
    supported: "`value`/`onValueChange`, `disabled`",
    differences: "sized by the GTK theme, not iOS metrics",
  },
  {
    name: "ActivityIndicator",
    subpath: "react-native",
    gtkImplementation: "GtkSpinner",
    supported: "`animating`, `size` (small/large/number)",
    differences: "no `color` yet",
  },
  {
    name: "Modal",
    subpath: "react-native",
    gtkImplementation: "modal GtkWindow (portal)",
    supported:
      "`visible`, `onRequestClose` (Escape/close button), `title`, `width`/`height`; independently resizable with relayout",
    differences:
      "desktop semantics: a separate window, not an overlay; `transparent`/`animationType` are no-ops",
  },
  {
    name: "Animated.View",
    subpath: "react-native",
    gtkImplementation: "direct widget calls",
    supported:
      "`opacity` and the whole `transform` array — `translateX/Y`, `scale`, `scaleX`, `scaleY`, `rotate`/`rotateZ` — driven by Animated nodes, bypassing React (an angle comes from `interpolate` with a `deg`/`rad` outputRange)",
    differences:
      "`rotateX`/`rotateY`/`perspective` (3D), `skewX`/`skewY` and `matrix` are not supported, and the transform origin is always the view's centre (no `transformOrigin`)",
  },
  {
    name: "SafeAreaView",
    subpath: "react-native",
    gtkImplementation: "= View",
    supported: "—",
    differences: "no notches on desktop",
  },
  {
    name: "StatusBar",
    subpath: "react-native",
    gtkImplementation: "null",
    supported: "—",
    differences: "no status bar",
  },
  {
    name: "Root",
    subpath: "react-native",
    gtkImplementation: "internal root",
    supported: "`width`/`height`",
    differences: "extension: required by the test harness",
  },
  {
    name: "NestedRoot",
    subpath: "react-native",
    gtkImplementation: "internal root",
    supported: "—",
    differences:
      "extension: a Yoga root inside any GTK container slot (navigation pages, custom containers); the slot allocation is the viewport",
  },
  {
    name: "IntrinsicRoot",
    subpath: "react-native",
    gtkImplementation: "internal root",
    supported: "—",
    differences:
      "extension: a content-sized Yoga root for chrome slots (HeaderBar start/end) — reports its content size to GTK",
  },
] as const satisfies readonly PortableRecord[]

export const PORTABLE_APIS = [
  {
    name: "StyleSheet",
    subpath: "react-native",
    supported:
      "`create`, `flatten`, `compose`, `absoluteFill(Object)`, `hairlineWidth`",
    differences: "—",
  },
  {
    name: "PlatformColor",
    subpath: "react-native",
    supported:
      'Adwaita variables: `PlatformColor("accent-bg-color")` → `var(--...)`, `@named`',
    differences: "names are Adwaita, not iOS/Android",
  },
  {
    name: "AppRegistry",
    subpath: "react-native",
    supported:
      "`registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome,applicationActions,actionAccels,windowActions,windowControllers,breakpoints})`, `getAppKeys`",
    differences:
      'desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app\'s HeaderBars (navigation) become the chrome. `applicationActions`/`actionAccels` reach the underlying `GtkApplication` (`app.*` actions — what a `Gio.Notification` action button targets); `windowActions`/`windowControllers` reach the window (`win.*` actions, a window-scoped `GtkShortcutController`); `breakpoints` reaches `AdwApplicationWindow`\'s own prop and only does anything under `chrome: "content"` (a dev warning fires otherwise)',
  },
  {
    name: "Platform",
    subpath: "react-native",
    supported:
      '`OS: "linux"`, `Version` (GTK), `select` (linux → native → default), `isTV`, `isTesting`',
    differences: "—",
  },
  {
    name: "Dimensions",
    subpath: "react-native",
    supported: '`get("window"/"screen")`, `addEventListener("change")`',
    differences: "main window only (transient windows are ignored)",
  },
  {
    name: "useWindowDimensions",
    subpath: "react-native",
    supported: "reactive main-window dimensions",
    differences: "—",
  },
  {
    name: "Appearance",
    subpath: "react-native",
    supported:
      "`getColorScheme`, `setColorScheme` (AdwStyleManager), `addChangeListener`",
    differences: "—",
  },
  {
    name: "useColorScheme",
    subpath: "react-native",
    supported: "reactive theme",
    differences: "—",
  },
  {
    name: "AppState",
    subpath: "react-native",
    supported: "`currentState` active/background, `addEventListener`",
    differences: "driven by the window's `is-active`",
  },
  {
    name: "Alert",
    subpath: "react-native",
    supported: "`alert(title, message, buttons, options)` → Adw.AlertDialog",
    differences: "`cancel`/`destructive`/`isPreferred` styles",
  },
  {
    name: "Linking",
    subpath: "react-native",
    supported:
      '`openURL`, `canOpenURL` (http/https/mailto/file), `getInitialURL` (null), `addEventListener("url")`',
    differences:
      'system launcher; no deep-link delivery on desktop yet — "url" subscriptions never fire',
  },
  {
    name: "InteractionManager",
    subpath: "react-native",
    supported:
      "`runAfterInteractions(task?)` (cancellable, then-able), `createInteractionHandle`/`clearInteractionHandle`, `addListener`",
    differences:
      "navigation transitions register interactions, so screen work deferred with `runAfterInteractions` waits for the push/pop slide",
  },
  {
    name: "DevSettings",
    subpath: "react-native",
    supported:
      "`addMenuItem(title, handler)` (entries in the Dev Menu — Ctrl+Shift+D in `run-linux --dev`, the react-native-windows shortcut), `reload(reason?)`",
    differences: "silent no-ops in release builds, like RN",
  },
  {
    name: "I18nManager",
    subpath: "react-native",
    supported:
      "`isRTL` (live: GTK's read of the locale text direction), `doLeftAndRightSwapInRTL`, `getConstants`",
    differences:
      "`allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops (mobile persistence has no desktop store)",
  },
  {
    name: "BackHandler",
    subpath: "react-native",
    supported: '`addEventListener("hardwareBackPress")`, `exitApp`',
    differences:
      "no hardware back key on desktop — subscriptions are honored but nothing fires them yet",
  },
  {
    name: "Animated",
    subpath: "react-native",
    supported:
      "`Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`, `loop`, `interpolate` (numbers and deg/rad strings, clamp/extend/identity)",
    differences:
      "`useNativeDriver` is ignored (with a warning); the direct path is native-speed anyway",
  },
  {
    name: "Easing",
    subpath: "react-native",
    supported: "linear/ease/quad/cubic/in/out/inOut/bezier",
    differences: "—",
  },
  {
    name: "version",
    subpath: "react-native",
    supported: "package version",
    differences: "extension",
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
  { name: "GtkDragIcon", subpath: "react-native-gtkx/gtk", wrapped: true },
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
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkAppChooserDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkApplicationWindow",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkAssistant",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkColorChooserDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkFileChooserDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
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
    reason: "toplevel (derives Gtk.Window)",
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
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkPageSetupUnixDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkPrintUnixDialog",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkShortcutsWindow",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
  },
  {
    name: "GtkWindow",
    subpath: "react-native-gtkx/gtk",
    wrapped: false,
    reason: "toplevel (derives Gtk.Window)",
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
    reason: "toplevel (derives Gtk.Window)",
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
    reason: "toplevel (derives Gtk.Window)",
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
    reason: "toplevel (derives Gtk.Window)",
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
    reason: "toplevel (derives Gtk.Window)",
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
    reason: "toplevel (derives Gtk.Window)",
  },
] as const satisfies readonly WidgetRecord[]

export const DOC_CHUNKS = [
  {
    doc: "docs/api.md",
    heading: "Components",
    text: "| Export              | GTK implementation             | Supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Differences from RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |\n| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `View`              | GtkBox (RnGtkxViewBox)         | `style`, `onLayout`, `testID`, children, `pointerEvents` (auto/none/box-none/box-only — mapped onto GTK picking: can-target + a contains() vfunc override; also honored from `style.pointerEvents`, the prop wins)                                                                                                                                                                                                                                                                                                                                                                                                                       | nesting another pointerEvents inside a box-only view is not supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |\n| `Text`              | GtkLabel (Pango)               | wrap, `numberOfLines` (ellipsize END), `textAlign`, font styles, `onLayout`, `testID`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | nested `Text` elements are concatenated without per-span styles; text is always ellipsizable (shrinkable in narrow windows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |\n| `Image`             | GtkPicture                     | `source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`; **`.svg` files load like any other image** — `Gdk.Texture.newFromFilename` rasterizes them via librsvg, no extra code needed (for building vector graphics from state instead of a file, see the \"Svg\" section below — a separate import, not part of this table)                                                                                                                                                                        | no synchronous size from remote images (style sets the size, as in RN); cache is not size-limited yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |\n| `TextInput`         | GtkEntry / GtkTextView         | controlled/uncontrolled (`value`/`defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus`/`onBlur`, `placeholder` (own dim overlay in multiline — GtkTextView has none), `secureTextEntry`, `editable`, `keyboardType`, `multiline`, `clearButtonMode` (GtkEntry's built-in clear icon; RN ships this on iOS only) (real GtkTextView: word wrap, internal scroll, Enter inserts a newline and never fires onSubmitEditing — RN semantics)                                                                                                                                                                                           | multiline needs a height in the style (as RN recommends)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |\n| `Pressable`         | GtkFixed + GestureClick/Motion | `onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn/Out`, `disabled`, function-form `style`/`children` receiving `{pressed, hovered}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |\n| `TouchableOpacity`  | on top of Pressable            | `activeOpacity`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |\n| `ScrollView`        | GtkScrolledWindow              | vertical/`horizontal`, `contentContainerStyle`, `onScroll`, `onContentSizeChange`, `stickyHeaderIndices` (RN model: the REAL child is translated and painted on top — no duplicate), ref: `scrollTo`/`scrollToEnd` (`ScrollViewHandle`)                                                                                                                                                                                                                                                                                                                                                                                                  | `animated` in scrollTo is ignored                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |\n| `FlatList`          | windowed core on ScrollView    | virtualization (`estimatedItemSize` or `getItemLayout`, **`windowSize`/`initialNumToRender` — the primary scroll-performance knobs**, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`), `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`, `ListHeader/Footer/EmptyComponent`, `onEndReached(-Threshold)`, `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`), `inverted` (RN chat semantics: opens at `data[0]`, stays pinned on prepend), `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`, ref: `scrollToIndex`/`scrollToItem`/`scrollToOffset` + ScrollView methods (`FlatListHandle`) | 1000 rows mount windowed in ~120 ms (v1 full mount was 879 ms); `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure and a wider window means fewer mount+reflow bursts per scrolled pixel (measured: −21% churn, late frames 10/s → 7.7/s); rows beyond the visible ones are mounted `maxToRenderPerBatch` (10) at a time every `updateCellsBatchingPeriod` (50) ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one; no pull gesture — `onRefresh` must be app-triggered; an inverted list shorter than its viewport anchors to the top, not the bottom |\n| `SectionList`       | on top of FlatList             | `sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | viewability props are not exposed (section-aware ViewTokens pending)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |\n| `Switch`            | GtkSwitch                      | `value`/`onValueChange`, `disabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | sized by the GTK theme, not iOS metrics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |\n| `ActivityIndicator` | GtkSpinner                     | `animating`, `size` (small/large/number)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no `color` yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |\n| `Modal`             | modal GtkWindow (portal)       | `visible`, `onRequestClose` (Escape/close button), `title`, `width`/`height`; independently resizable with relayout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | desktop semantics: a separate window, not an overlay; `transparent`/`animationType` are no-ops                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |\n| `Animated.View`     | direct widget calls            | `opacity` and the whole `transform` array — `translateX/Y`, `scale`, `scaleX`, `scaleY`, `rotate`/`rotateZ` — driven by Animated nodes, bypassing React (an angle comes from `interpolate` with a `deg`/`rad` outputRange)                                                                                                                                                                                                                                                                                                                                                                                                               | `rotateX`/`rotateY`/`perspective` (3D), `skewX`/`skewY` and `matrix` are not supported, and the transform origin is always the view's centre (no `transformOrigin`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |\n| `SafeAreaView`      | = View                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no notches on desktop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |\n| `StatusBar`         | null                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no status bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |\n| `Root`              | internal root                  | `width`/`height`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | extension: required by the test harness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |\n| `NestedRoot`        | internal root                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | extension: a Yoga root inside any GTK container slot (navigation pages, custom containers); the slot allocation is the viewport                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |\n| `IntrinsicRoot`     | internal root                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | extension: a content-sized Yoga root for chrome slots (HeaderBar start/end) — reports its content size to GTK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |",
  },
  {
    doc: "docs/api.md",
    heading: "API modules",
    text: '| Export                | Supported                                                                                                                                                                         | Differences                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |\n| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `StyleSheet`          | `create`, `flatten`, `compose`, `absoluteFill(Object)`, `hairlineWidth`                                                                                                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |\n| `PlatformColor`       | Adwaita variables: `PlatformColor("accent-bg-color")` → `var(--...)`, `@named`                                                                                                    | names are Adwaita, not iOS/Android                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |\n| `AppRegistry`         | `registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome,applicationActions,actionAccels,windowActions,windowControllers,breakpoints})`, `getAppKeys` | desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app\'s HeaderBars (navigation) become the chrome. `applicationActions`/`actionAccels` reach the underlying `GtkApplication` (`app.*` actions — what a `Gio.Notification` action button targets); `windowActions`/`windowControllers` reach the window (`win.*` actions, a window-scoped `GtkShortcutController`); `breakpoints` reaches `AdwApplicationWindow`\'s own prop and only does anything under `chrome: "content"` (a dev warning fires otherwise) |\n| `Platform`            | `OS: "linux"`, `Version` (GTK), `select` (linux → native → default), `isTV`, `isTesting`                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |\n| `Dimensions`          | `get("window"/"screen")`, `addEventListener("change")`                                                                                                                            | main window only (transient windows are ignored)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |\n| `useWindowDimensions` | reactive main-window dimensions                                                                                                                                                   | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |\n| `Appearance`          | `getColorScheme`, `setColorScheme` (AdwStyleManager), `addChangeListener`                                                                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |\n| `useColorScheme`      | reactive theme                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |\n| `AppState`            | `currentState` active/background, `addEventListener`                                                                                                                              | driven by the window\'s `is-active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |\n| `Alert`               | `alert(title, message, buttons, options)` → Adw.AlertDialog                                                                                                                       | `cancel`/`destructive`/`isPreferred` styles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |\n| `Linking`             | `openURL`, `canOpenURL` (http/https/mailto/file), `getInitialURL` (null), `addEventListener("url")`                                                                               | system launcher; no deep-link delivery on desktop yet — "url" subscriptions never fire                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |\n| `InteractionManager`  | `runAfterInteractions(task?)` (cancellable, then-able), `createInteractionHandle`/`clearInteractionHandle`, `addListener`                                                         | navigation transitions register interactions, so screen work deferred with `runAfterInteractions` waits for the push/pop slide                                                                                                                                                                                                                                                                                                                                                                                                                                      |\n| `DevSettings`         | `addMenuItem(title, handler)` (entries in the Dev Menu — Ctrl+Shift+D in `run-linux --dev`, the react-native-windows shortcut), `reload(reason?)`                                 | silent no-ops in release builds, like RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |\n| `I18nManager`         | `isRTL` (live: GTK\'s read of the locale text direction), `doLeftAndRightSwapInRTL`, `getConstants`                                                                                | `allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops (mobile persistence has no desktop store)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |\n| `BackHandler`         | `addEventListener("hardwareBackPress")`, `exitApp`                                                                                                                                | no hardware back key on desktop — subscriptions are honored but nothing fires them yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |\n| `Animated`            | `Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`, `loop`, `interpolate` (numbers and deg/rad strings, clamp/extend/identity)                                          | `useNativeDriver` is ignored (with a warning); the direct path is native-speed anyway                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |\n| `Easing`              | linear/ease/quad/cubic/in/out/inOut/bezier                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |\n| `version`             | package version                                                                                                                                                                   | extension                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |\n\nStyles (which keys go where and what is unsupported) — [style system table](../packages/react-native-gtkx/src/style/README.md).',
  },
  {
    doc: "docs/api.md",
    heading: "Key differences from React Native (summary)",
    text: "1. **Desktop, not mobile**: `Modal` is a real window; `runApplication` accepts a title and dimensions; gestures are mouse-driven (hover works, no touch gestures);\n2. **Node.js runtime**: all of npm/Node is available (fs, sqlite, napi) — \"native modules\" are written as regular Node modules; RN libraries with iOS/Android code do not work;\n3. **Layout is exactly RN's**: every container runs a custom GtkLayoutManager that obeys only the Yoga engine — GTK widget minimums never leak into the layout, windows shrink freely, and `Dimensions.get(\"window\")` reports the app viewport (the window's content area under the headerbar, like RN's app window);\n4. **Text**: the ellipsis is opt-in via `numberOfLines`, exactly like RN; plain text wraps naturally and an unbreakable word wider than its box clips to it (text leaves clip; containers keep paint-overflow);\n5. **transform** is paint-only, like RN: `translateX/Y`, `scale`, `scaleX`, `scaleY` and `rotate`/`rotateZ` apply to any component's style (not just `Animated.View`), the array composes left to right as in RN and CSS, and the origin is the view's centre. A transformed child honestly draws past its container over siblings (later siblings stay on top, RN's default z-order) without moving any ancestor, and GTK routes input through the transform, so a rotated view is clickable in its rotated shape. Rotation and scale reach the widget as the `GskTransform` of its allocation (`docs/research/transforms.md`); 3D (`rotateX`/`rotateY`/`perspective`), `skewX`/`skewY`, `matrix` and `transformOrigin` are not supported;\n6. **Animations never auto-stop**: the desktop \"reduce animations\" hint is not applied automatically (GTK-side animations are kept on to match `Animated`, which runs on its own timers) — honoring reduced motion stays an app-level opt-in, as in RN;\n7. **Lists are windowed like RN's**: FlatList/SectionList mount only the rows around the viewport (prefix-sum offsets, `estimatedItemSize` refined by real measurements or exact `getItemLayout`); sticky headers translate the REAL widget (no duplicate) and `inverted` follows the RN chat contract — `contentOffset` counts from the end where `data[0]` renders. The one RefreshControl compromise: desktop has no pull gesture, so `refreshing`/`onRefresh` are API-compatible but the trigger is app chrome (a button/shortcut);\n8. The package ships compiled (`dist/`: ESM + `.d.ts` alongside, sources embedded in the maps); consumers — Metro (`react-native-gtkx/metro` preset) and vite (preset) — both consume the built output. Requires Node ≥ 24 (the gtkx runtime floor; the run-linux host also relies on `module.registerHooks`).",
  },
  {
    doc: "docs/api.md",
    heading: "Navigation (`react-native-gtkx/navigation`)",
    text: 'A [react-navigation](https://reactnavigation.org) stack navigator backed by\n`Adw.NavigationView` — native Adwaita page transitions, the HeaderBar back\nbutton and back gestures stay in sync with react-navigation state (the\nreact-native-windows / native-stack model). Requires the optional peer\n`@react-navigation/native` (v8).\n\n`@react-navigation/native@8` itself peers on `react-native: "*"` (unlike\n`@react-navigation/core@8`, which has no react-native peer at all). If your\napp has no `react-native` package anywhere in its tree — a vite+gtkx app\nwith no Metro side, exactly what `examples/gallery` demonstrates —\n`npm install` will print an unmet-peer-dependency warning for it. This is\nharmless: react-native-gtkx never imports anything from the `react-native`\npackage, so nothing actually needs it at runtime; the warning is npm being\nstrict about a peer range upstream declared loosely (`"*"` — any version\nsatisfies it, npm just wants the package present at all).\n\n```tsx\nimport { NavigationContainer } from "@react-navigation/native"\nimport { createStackNavigator } from "react-native-gtkx/navigation"\n\n// Run the app with chrome: "content" — the navigator\'s HeaderBars ARE the\n// window chrome (the default system chrome would add a second titlebar):\n// AppRegistry.runApplication(name, { ..., chrome: "content" })\n\nconst Stack = createStackNavigator()\n\nconst App = () => (\n  <NavigationContainer>\n    <Stack.Navigator>\n      <Stack.Screen\n        name="Home"\n        component={HomeScreen}\n      />\n      <Stack.Screen\n        name="Details"\n        component={DetailsScreen}\n        options={{ title: "Details page" }}\n      />\n    </Stack.Navigator>\n  </NavigationContainer>\n)\n```\n\n- Screen `options`: `title` (HeaderBar title, defaults to the route name),\n  `headerShown` (default true).\n- `createSidebarNavigator` — the desktop drawer equivalent on\n  `Adw.NavigationSplitView`: a persistent native sidebar (`AdwActionRow`\n  per screen, in a GtkListBox with Adwaita `navigation-sidebar` styling)\n  selects between parallel screens (TabRouter semantics). Navigator prop\n  `sidebarTitle`; screen `options`: `title`, `icon` (Adwaita symbolic icon\n  name for the row\'s prefix), `color` (a CSS color for a colored-dot\n  prefix instead of `icon` — the two are mutually exclusive per row,\n  `color` wins if both are set), `count` (a badge suffix, hidden when 0 or\n  unset). Run the app with `chrome: "content"` so the split view\'s\n  HeaderBars are the window chrome (`examples/gallery` is built on it).\n  Navigator prop `headerButtons` packs declarative native buttons into the\n  content HeaderBar end (`{id, icon, tooltip, onPress}`, `icon` is an\n  Adwaita symbolic name) — the gallery\'s color-scheme toggle uses it.\n  Navigator prop `collapseWidth` (sp): below this width the split view\n  collapses to the sidebar or the content pane alone, through a native\n  `Adw.Breakpoint` wrapping the view in an `AdwBreakpointBin` — NOT a\n  `useWindowDimensions` conditional (see docs/platform-layer.md, "Two ways\n  to react to size"); the property flip happens inside GTK\'s own\n  allocation pass, costing no React render for the resize itself. Unset by\n  default — no `AdwBreakpointBin` is mounted at all, so existing consumers\n  see no behavior change. Any route becoming active while collapsed\n  reveals content (`AdwNavigationSplitView.showContent`, a plain native\n  property write, not React state) — a row click OR a programmatic\n  `navigate()`/`jumpTo()`; the native back button that then appears\n  reverses it. Re-selecting the same, already-active row after that also\n  reveals content again — GTK\'s `row-selected` does not refire for a\n  re-click with no selection change, so this is driven by `row-activated`\n  (fires on every click) in addition. The reverse direction — the split\n  view\'s own back button, Escape or back gesture hiding content again — is\n  observed too: it fires a `sidebarShown` event\n  (`navigation.addListener("sidebarShown", …)`) on the currently active\n  route, the same event-map protocol `createStackNavigator`\'s\n  `transitionStart`/`transitionEnd` use. Nothing in react-navigation state\n  changes when this fires — TabRouter has no "closed" concept, the same\n  route stays focused, only the pane did — so it exists purely for an app\n  that wants to react (`examples/tasks-nav`\'s `ContentScreen` resets its\n  own in-screen "open task" state on it). Never fired for content being\n  revealed (that direction is already an ordinary state change) or when\n  `collapseWidth` is unset. Resizing back above `collapseWidth` and then\n  back below it again does NOT reset `showContent` or the selection —\n  confirmed empirically, not assumed — both simply persist across the\n  round trip, the same size-class behavior a mobile master-detail app\n  relies on; see docs/research/navigation-extensibility.md for the\n  evidence.\n- Sidebar screen options `headerLeft` / `headerRight` / `headerTitle`:\n  `() => ReactNode` — the content HeaderBar\'s own start/end/title, per\n  screen, on top of the one navigator-wide default. This is what lets one\n  screen\'s header change shape with ITS OWN selection (a filter toggle\n  group for a list, a back button plus star/trash for an open item):\n  call `navigation.setOptions({ headerLeft, headerRight, headerTitle })`\n  from inside the screen, in an effect keyed on whatever local state\n  decides its shape — no stack involved, and no new navigator API beyond\n  the options themselves (`useNavigationBuilder` already re-resolves\n  descriptor options on every `setOptions` call). `headerTitle` replaces\n  the HeaderBar\'s title widget outright (unset, the page\'s own title\n  shows automatically, as before). A screen\'s own `headerButtons`\n  (`HeaderButton[]`, same shape as the navigator prop) replaces the\n  navigator-level default entirely for that screen. **Caveat, found\n  while testing this**: `setOptions` MERGES into the previously resolved\n  options rather than replacing them — a call that omits `headerRight`\n  does not clear a `headerRight` a PREVIOUS call set, it leaves it in\n  place. A screen that flips between shapes must give every one of these\n  four keys an explicit value (`undefined` counts as a real overwrite; an\n  absent key does not) on every call, not just the ones currently in use.\n- Sidebar screen option `sidebarRow`: `() => ReactNode` — draw the row\n  yourself instead of letting `title`/`icon`/`color`/`count` compose one.\n  Those four are a convenience, not the ceiling: they build an\n  `AdwActionRow`, which brings Adwaita\'s own row metrics with it, so an app\n  wanting a different shape, density or height had nothing to reach for.\n  Return anything a `GtkListBoxRow` can hold — React Native content, GTK\n  widgets, a differently-configured Adwaita row. The navigator keeps owning\n  row BEHAVIOUR (selection, click → `jumpTo`, staying in step with\n  navigation state, the collapsed reveal), so a custom row cannot drift out\n  of sync with the router; only what is drawn changes. A screen that passes\n  none of `icon`/`color`/`count` gets a compact `GtkListBoxRow` + label\n  automatically — `AdwActionRow`\'s height is right when there IS a prefix\n  and a count to lay out and pure cost when there is not.\n- Sidebar screen option `contentLayout`: `"react-native"` (default) or\n  `"widget"` — what the screen\'s body IS. The default mounts it in a Yoga\n  layout root that fills the pane, so `<View style={{ flex: 1 }}>` behaves\n  the way it does anywhere else. `"widget"` packs the body into the page\n  directly, with no layout root in between, for a screen whose body is a\n  GTK widget tree (a `GtkScrolledWindow` around an `AdwClamp` around a\n  `.boxed-list` `GtkListBox`, say): GTK\'s own sizing — `vexpand`, a list\'s\n  natural height — then applies normally. **Under the default a widget tree\n  collapses instead**, and quietly: every widget becomes a single Yoga LEAF\n  measured for its own natural size, so a container renders its first child,\n  drops the rest, and reports the ~1px it can shrink to, with no error\n  anywhere. `examples/tasks-nav` is built this way. Mixing is per screen,\n  not per subtree — a `"widget"` screen that wants React Native content\n  somewhere inside it wraps that part in `SlotContent` itself.\n- Stack screen options `headerLeft` / `headerRight`: `() => ReactNode` —\n  real RN content in the HeaderBar (inputs included), hosted by an\n  intrinsic-size root; `headerButtons` render after `headerRight`\n  (hn-app\'s header search filter is the demo).\n- Stack screen option `gestureEnabled: false` disables the native back\n  button, Escape and the back gesture for that screen (the page\'s\n  Adwaita `can-pop`); a programmatic `goBack` still pops. `usePreventRemove`\n  works through the same mechanism — a prevented route reports\n  `can-pop: false`, so no native pop can race react-navigation state; the\n  route pops once the app lifts the guard (e.g. after its own\n  confirmation dialog).\n- Stack screen option `animation` maps onto `Adw.NavigationView`\'s\n  `animate-transitions` — GTK has exactly one transition style, not a\n  choice of styles like iOS/Android, so the option collapses to a\n  boolean: `"none"` turns transitions off, any other value (including\n  native-stack\'s own style names, e.g. `"slide_from_bottom"`, `"fade"`)\n  turns them on, with the standard Adwaita transition rather than the\n  one asked for. Requesting a specific type still animates — it is not\n  silently treated as `"none"` — and warns once in development.\n  `animate-transitions` is a property of the whole view, not a per-page\n  one, so there is no per-screen granularity to offer: the value used is\n  read from whichever screen is currently on top of the visible stack,\n  recomputed on every navigation. Setting it once via `screenOptions`\n  (the same value for every screen) is the reliable way to use this —\n  the per-screen case only matters if different screens genuinely\n  disagree, and even then only the active one\'s value is observed.\n  Interactive swipe-back gestures always animate regardless of this\n  setting — Adwaita\'s own behavior, not overridable here.\n- The factories are typed: `createStackNavigator<ParamList>()` gives\n  typed `Screen` configs and `StackScreenProps<ParamList, Route>` for\n  screen components (`SidebarScreenProps` likewise).\n- The stack navigator emits `transitionStart` / `transitionEnd` on a\n  screen\'s `navigation` object, matching `@react-navigation/stack` and\n  `@react-navigation/native-stack` exactly: `{ data: { closing: boolean } }`,\n  `closing: false` for the screen being pushed in, `closing: true` for the\n  screen being popped out. A screen that stays mounted without actually\n  entering or leaving (e.g. the screen underneath a push) gets neither\n  event, same as upstream. Two things worth knowing before relying on\n  timing:\n  - **`transitionEnd` is tied to `AdwNavigationPage`\'s own `shown`/`hidden`\n    signals** — contrary to an earlier version of this page, Adwaita DOES\n    expose a transition-finished signal (four of them, in fact: `showing`,\n    `shown`, `hiding`, `hidden`, all per-page). `transitionEnd` on the\n    entering screen fires on that screen\'s `shown`; on the leaving screen\n    it fires on `hidden`. `transitionDuration` (default 400 ms) is a\n    fallback only, used when a page\'s own signal never arrives — a\n    signal-less environment, or a page skipped entirely by a multi-hop\n    pop (popping past an intermediate screen never fires anything on it,\n    since it was never the one actually on screen during the transition).\n    When transitions are not animated, the real signals still fire —\n    immediately — so `transitionEnd` is not delayed by the fallback\n    window either.\n  - **Native pops do not fire these events at all today.** A user-driven\n    pop (the Adwaita back button, Escape, the back gesture) is handled by\n    the widget itself before this package\'s code is told about it, so\n    there is nothing to hook a `transitionStart` into. Only\n    programmatic navigation (`navigate`, `goBack`, `dispatch`, …) fires\n    `transitionStart`/`transitionEnd`.\n- The sidebar navigator emits `sidebarShown` (`{ data: undefined }`) on a\n  screen\'s `navigation` object — the collapsed-mode counterpart of a native\n  pop, and the one case where a native, user-driven interaction (the split\n  view\'s own back button, Escape, the back gesture) DOES get an event: the\n  widget-level property that changes (`showContent`) has no\n  react-navigation state behind it at all, so there is no state change for\n  an app to observe any other way. Fired on the active route only when\n  `showContent` goes from shown back to hidden, and only while\n  `collapseWidth` is set; never fired for content being revealed (that\n  already shows up as an ordinary focused-route change).\n- The rest of the react-navigation surface — `useNavigation`, `useRoute`,\n  `useFocusEffect`, `useIsFocused`, `useNavigationContainerRef`,\n  `CommonActions`, `StackActions`, `usePreventRemove`, `NavigationContainer`\n  and everything else — comes from `@react-navigation/native` directly, not\n  from this package. **Breaking change**: earlier versions re-exported a\n  subset of these names from `react-native-gtkx/navigation`; the re-export\n  was removed because it was never complete (anything beyond the subset\n  still required importing from `@react-navigation/native`, so it was one\n  more place to look rather than a convenience). This package\'s navigation\n  entry point now exports exactly its own surface: `createStackNavigator`,\n  `createSidebarNavigator`, and the option/prop types around them.\n- Each screen mounts its own layout root inside the page: the page\'s\n  content allocation is that screen\'s viewport.\n- Differences from `@react-navigation/native-stack`: `headerRight`/custom\n  header widgets are not supported yet; deep-link "url" events never fire\n  on desktop (see `Linking`).',
  },
  {
    doc: "docs/api.md",
    heading: "Svg",
    text: 'Vector graphics built from state, modeled on\n[react-native-svg](https://github.com/software-mansion/react-native-svg) (the\nde-facto standard RN mirrors) rather than invented from scratch — portable\ncode costs nothing to bring over. Drawing goes through `Gsk.Path`/\n`Gtk.Snapshot` on a single custom widget (`RnGtkxSvgNode`, `registerClass` +\nan overridden `snapshot()` vfunc — the same mechanism `RnGtkxLayout` and\n`RnGtkxViewBox` already use), not a rasterized image: for that, `Image`\nalready loads `.svg` files today (see the `Image` row above).\n\n**Not part of the main `react-native-gtkx` export surface** — unlike every\ncomponent in the table above, `Svg` and everything below are exported only\nfrom `react-native-gtkx/svg`, in the shape of the `react-native-svg` package\nitself. `react-native-svg` is a separate package on every other platform (RN\nhas no built-in `Svg`), so this project mirrors that split instead of adding\n`Svg` to the main entry, which would make code written against it fail to\ncompile anywhere else. See "`react-native-svg` compatibility" below for the\nexact import and how the alias resolves it.\n\n```tsx\nimport Svg, { Circle, G, Path, Rect } from "react-native-svg"\n\nconst Icon = () => (\n  <Svg\n    width={24}\n    height={24}\n    viewBox="0 0 24 24"\n  >\n    <Circle\n      cx={12}\n      cy={12}\n      r={10}\n      fill="#1c71d8"\n    />\n    <Path\n      d="M8 12 l3 3 l5 -6"\n      stroke="white"\n      strokeWidth={2}\n      fill="none"\n    />\n  </Svg>\n)\n```\n\n- **`Svg`**: `width`/`height` (or `style`) size it — a Yoga leaf like\n  `Image`, sized entirely by style/flex, never by measuring the widget\n  (nothing here is intrinsic-sized). `viewBox="minX minY width height"` and\n  `preserveAspectRatio` (`xMin/xMid/xMax` × `YMin/YMid/YMax`, `meet`/`slice`,\n  `none`; default `xMidYMid meet`) reshape the internal coordinate system\n  exactly like real SVG — Yoga never sees them. Content always clips to the\n  allocated bounds (no `overflow: visible` opt-out).\n- **`Path`**: `d` is handed straight to `Gsk.Path.parse()`, which understands\n  SVG path syntax natively — there is no path parser of our own.\n- **`Rect`** (`x`/`y`/`width`/`height`/`rx`/`ry`), **`Circle`**\n  (`cx`/`cy`/`r`), **`Ellipse`** (`cx`/`cy`/`rx`/`ry`), **`Line`**\n  (`x1`/`y1`/`x2`/`y2`, stroke-only — no `fill` prop at all, not even\n  ignored), **`Polygon`**/**`Polyline`** (`points`, `"x,y x,y …"` or\n  space-separated, closed/open respectively): each is a small geometry\n  helper away from the same `d` syntax, so every shape ends up drawn through\n  that one `Gsk.Path.parse()` call.\n- Every shape accepts `fill`/`stroke` (a static CSS color — hex/`rgb()`/\n  `hsl()`/named/`transparent`/`none`, or `"url(#id)"` referencing a\n  gradient; default `fill="black"`, `stroke="none"`, matching SVG),\n  `fillRule` (`nonzero` | `evenodd`), `fillOpacity`/`strokeOpacity`/\n  `opacity`, `strokeWidth`, `strokeLinecap`/`strokeLinejoin`,\n  `strokeDasharray`, `strokeDashoffset`.\n- **`G`** groups children under an `opacity` and/or a `transform` string —\n  `translate()`/`scale()`/`rotate()`/`rotate(a,cx,cy)`/`matrix()`, the plain\n  SVG transform-list syntax (`matrix()` maps directly onto\n  `Gsk.Transform.matrix2d()`); `skewX`/`skewY` and the structured\n  `transform={[{translateX:...}]}` array form `Animated.View` accepts are\n  not supported here.\n- **Gradients**: `<Defs>` holds `<LinearGradient id x1 y1 x2 y2>` /\n  `<RadialGradient id cx cy r>` (fractions 0–1 by default —\n  `gradientUnits="objectBoundingBox"`, mapped against the shape\'s own\n  `Gsk.Path.getBounds()`; `gradientUnits="userSpaceOnUse"` uses the\n  coordinates as-is instead), each with `<Stop offset stopColor\nstopOpacity>` children (`offset` accepts `0.5` or `"50%"`). `Defs` must be\n  a direct child of `Svg` (nested `Defs` are not scanned). No\n  `gradientTransform`, no `spreadMethod` beyond the default pad behavior.\n  **Known limitation**: constructing a `Gsk.ColorStop` currently crashes in\n  gtkx-rc2\'s native addon — verified through three independent construction\n  paths (the generated constructor, its property setters, and a bypass that\n  skips `ColorStop` entirely), all failing in the same compiled native code,\n  so this is not fixable from application code. A gradient reference\n  degrades to painting nothing for that fill/stroke (the same safe path as\n  an unresolvable `url(#id)`) rather than crashing the app; the coordinate\n  math itself is unaffected and unit-tested\n  (`packages/react-native-gtkx/tests/unit/svg/gradient-geometry.test.ts`) —\n  gradients will render as soon as this is fixed upstream, with no changes\n  needed on either side.\n- **Animated**: the numeric props above (shape geometry, `opacity`,\n  `strokeWidth`, `strokeDashoffset`) accept an `Animated.Value`/\n  interpolation in place of a number. A tick mutates the widget\'s paint\n  state directly and calls `queueDraw()` — the same bypass-React pattern\n  `Animated.View` uses for `transform` (`setStoredTransform` +\n  `queueAllocate`), just on its own invalidation channel since none of this\n  touches Yoga. `G`\'s `transform` string and `d`/`points` are not\n  Animated-aware (they are strings, not numbers).\n- Not in scope: `<Text>`/`<TSpan>` on a path, `<Mask>`, `<ClipPath>`, SVG\n  filters, `<Use>`/`<Symbol>`/`<Pattern>`, and rasterizing arbitrary SVG\n  strings at runtime (`SvgXml` — `Image` already covers SVG **files**). None\n  of these have a real consumer yet; `Path`/`Rect`/`Circle`/`Ellipse`/\n  `Line`/`Polygon`/`Polyline`/`G` cover icons, charts and indicators, the\n  overwhelming majority of real usage.',
  },
  {
    doc: "docs/api.md",
    heading: "`react-native-svg` compatibility (`react-native-gtkx/svg`)",
    text: '`react-native-gtkx/svg` re-exports the same set in `react-native-svg`\'s\nshape (`Svg` as both the default and a named export). The `react-native-gtkx/\nmetro` and `react-native-gtkx/vite` presets alias the bare `react-native-svg`\npackage name to it automatically, the same way they alias `react-native`\nitself — so portable code that imports from `react-native-svg` runs\nunmodified:\n\n```tsx\nimport Svg, { Circle, Path } from "react-native-svg"\n```\n\nApps using neither preset can point their own bundler alias at\n`react-native-gtkx/svg` by hand. `react-native-svg` itself is never a\ndependency of this package and does not need to be installed — the alias\nworks whether or not the real package is present.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Why you would reach for it",
    text: "- A GTK capability that React Native has no concept of: a real\n  `Adw.NavigationView` stack, a `GtkListBox` row, a native `GtkEntry`.\n- Your own router, or no router: drive navigation from `useState`, a reducer,\n  a URL, a state machine.\n- A property we did not think to surface in the navigator's options. Every\n  widget below is re-exported straight from the gtkx bindings, so the full\n  GObject property and signal surface is yours — including properties added\n  to gtkx after this page was written.",
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Declarative primitives",
    text: "These are the two components we wrap, because a raw `Adw.NavigationView` is\nimperative (`push`, `pop`, `pop_to_tag`) and React is not.\n\n| Export                | What it is                                             |\n| --------------------- | ------------------------------------------------------ |\n| `NavigationStack`     | `Adw.NavigationView` driven by a `stack` array of tags |\n| `NavigationStackPage` | one page of that stack, identified by `tag`            |\n\nThey **inherit every prop of the underlying widget** and only add to it, so\nanything you could set on `Adw.NavigationPage` you can set on\n`NavigationStackPage`.",
  },
  {
    doc: "docs/platform-layer.md",
    heading: "React Native content inside GTK slots",
    text: "| Export             | Sizing                       | Use for                                          |\n| ------------------ | ---------------------------- | ------------------------------------------------ |\n| `SlotContent`      | fills the slot               | a page body, a pane, a dialog body               |\n| `IntrinsicContent` | sized by its own Yoga layout | an AdwHeaderBar slot, a toolbar area, a list row |",
  },
  {
    doc: "docs/platform-layer.md",
    heading: "GTK widgets, driven by React Native",
    text: 'Every `GtkWidget` subclass gtkx binds — 87 of them at last count, from\n`GtkBox` and `GtkButton` to `GtkColumnView` and `GtkEmojiChooser`. The list is\ngenerated, not hand-picked: `scripts/generate-widget-surface.ts` classifies\ngtkx\'s full binding by real GObject inheritance (see\n`scripts/widget-surface/classification.json` for the exact list gtkx binds\ntoday) and `src/gtk/widgets.generated.ts` is the committed result. Re-run the\ngenerator after a gtkx upgrade to pick up new widgets — it diffs against its\nown previous output and prints what changed.\n\nThey keep **every prop gtkx binds** and gain `style` and `onLayout`. Position\nand appearance both come from the style prop, exactly like anywhere else in\nReact Native:\n\n```tsx\n<View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>\n  <GtkEntry\n    style={{ flex: 1 }}\n    placeholderText="Filter"\n  />\n  <GtkButton\n    style={{ width: 72, backgroundColor: "#3584e4", borderRadius: 6 }}\n    label="Go"\n  />\n</View>\n```\n\nThe entry flexes, the button takes its width and its colour. The layout half\nof the style drives Yoga; the visual half becomes a GTK CSS class **on the\nwidget itself**, so the button really is blue, not a blue box behind a button.\nSet no size and the widget\'s own natural size wins.\n\n**Outside React Native layout they step aside.** The same `GtkButton` dropped\ninto a `AdwHeaderBar`\'s `start` or a `AdwToolbarView`\'s `topBar` — where there is no\nYoga tree to join — renders as the bare widget. One symbol, both worlds, no\nflag to remember.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Unwrapped by necessity",
    text: "Two families of widget are exported **raw** instead of wrapped, because a\nwrapper box around them would be invalid GTK rather than a convenience:\n\n- **toplevels** — `GtkWindow` and everything that derives it: every\n  `Gtk*Dialog`, `GtkApplicationWindow`, `GtkAssistant`, `GtkShortcutsWindow`,\n  and their Adwaita counterparts (`AdwWindow`, `AdwApplicationWindow`,\n  `AdwAboutWindow`, `AdwMessageDialog`, `AdwPreferencesWindow`). A wrapper box\n  around a window is not a layout, it is two windows.\n- **child-only widgets** — valid solely as the direct child of one specific\n  parent. `GtkListBoxRow` and `GtkFlowBoxChild` (plus everything that derives\n  them — every Adwaita preferences row, `AdwActionRow` included) are caught\n  mechanically, by real inheritance. `AdwNavigationPage` and\n  `AdwPreferencesPage` derive `Gtk.Widget` directly with no shared base to\n  catch them mechanically, so they are a two-entry, doc-verified denylist\n  instead — see `scripts/widget-surface/classify.ts` for the exact reasoning\n  behind each.\n\n`GtkGestureClick` is a third, simpler case: an event controller, not a\nwidget at all, so it was never a candidate for wrapping in the first place.\n\nNothing here is unreachable — every raw export above is still exported,\nby name, from `react-native-gtkx/gtk` or `/adw`, exactly as gtkx binds it.",
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Auxiliary objects, not widgets at all",
    text: 'A further set of real JSX elements gtkx provides are not `Gtk.Widget` or\n`Adw.Widget` subclasses either, so `scripts/generate-widget-surface.ts`\nnever sees them at all — same reason `GtkGestureClick` above is hand-kept\nrather than generated, just a wider set: actions and menus (`GSimpleAction`,\n`GMenu`), a responsive breakpoint (`AdwBreakpoint`), one option of an\n`AdwToggleGroup` (`AdwToggle` — a segmented-control entry, not a widget of\nits own) and the two leaf elements an `AdwShortcutsDialog` is built from\n(`AdwShortcutsSection`, `AdwShortcutsItem`), a text buffer and an\nadjustment — the model objects `GtkTextView`/spin- and scale-style widgets\nbind to (`GtkTextBuffer`, `GtkAdjustment`), keyboard shortcuts\n(`GtkShortcut`, `GtkShortcutController`), and the two drag-and-drop\ncontrollers (`GtkDragSource`, `GtkDropTarget`). All of them are exported, by\nname, from `react-native-gtkx/gtk` or `/adw`, next to `GtkApplication` and\n`GtkGestureClick`.\n\n```tsx\n<GtkApplicationWindow\n  actions={\n    <GSimpleAction\n      name="new"\n      onActivate={onNew}\n    />\n  }\n  breakpoints={\n    <AdwBreakpoint\n      condition={Adw.BreakpointCondition.parse("max-width: 500sp")}\n      onApply={() => setCollapsed(true)}\n      onUnapply={() => setCollapsed(false)}\n    />\n  }\n/>\n```\n\n**One caveat found while building `examples/tasks-app`, worth knowing before\nyou rely on it in a test:** `AdwBreakpoint`\'s `onApply`/`onUnapply` never\nfired in the `@gtkx/vitest` headless-sway gtk test project, even with a\ngenuine `swaymsg` resize past the condition\'s threshold (see\n`packages/react-native-gtkx/tests/gtk/bridge/auxiliary-elements.gtk.test.tsx`)\n— but it works exactly as documented in a real GNOME session (verified with\na throwaway app launched via `node scripts/vm.ts app`). Treat it as untestable\nunder headless sway today, not as broken.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "The window and application AppRegistry built",
    text: '`useParentWindow` (the `Gtk.Window` ancestor), `useApplication` (the\n`Adw.Application` — `.sendNotification(id, notification)` is the common\nreason to reach it) and `quit` (the same function `AppRegistry` wires to a\nwindow\'s own close button) are re-exported from `react-native-gtkx/gtk`.\nNone of these give you the window or application object ITSELF to build —\n`AppRegistry.runApplication` already did that — they let already-mounted\ncode reach back into it, the same way `useBindSetting` needs a `Gtk.Window`\nto bind a `defaultWidth` property on:\n\n```tsx\nconst window = useParentWindow()\nuseBindSetting({\n  schema,\n  key: "window-width",\n  object: window,\n  property: "defaultWidth",\n})\n```',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "GSettings",
    text: '`useSetting` and `useBindSetting` come straight from `@gtkx/react`, re-\nexported from `react-native-gtkx/gtk` next to the `Gio` namespace they read\nand write through:\n\n```tsx\nconst [value, setValue] = useSetting(schema, "color-scheme")\nuseBindSetting({\n  schema,\n  key: "window-width",\n  object: windowRef,\n  property: "defaultWidth",\n})\n```\n\nTurning a `.gschema.xml` file into the `SettingsSchema` object these hooks\nexpect (`{ id, path, keys }`) is a build-time concern, not something this\nsubpath does — `#data/your-schema.gschema.xml` resolves for free on the\n`gtkx dev`/`gtkx build` toolchain (the `gtkx:settings` vite plugin ships\ninside `@gtkx/cli` itself), the same way `examples/tasks-app` uses it. It is\nnot wired into the Metro toolchain (`react-native run-linux`) at all — an\napp on that path has to construct the `SettingsSchema` object by hand\n(`{ id, path, keys: { "key-name": "s" } }`, matching the schema\'s own type\nstrings) or add its own build step.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Adwaita structure",
    text: 'Every `Adw.Widget` subclass gtkx binds — 46 wrapped the same way as the GTK\nwidgets above, from `AdwAvatar` and `AdwCarousel` to `AdwToolbarView` and\n`AdwViewSwitcher`. `AdwHeaderBar` and `AdwToolbarView` now take `style` too,\nand still step aside into the bare widget in a slot that has no Yoga tree —\n`AdwToolbarView`\'s own `topBar` is exactly that kind of slot:\n\n```tsx\n<View style={{ flex: 1 }}>\n  <AdwToolbarView\n    style={{ flex: 1 }}\n    topBar={<AdwHeaderBar showTitle={false} />}\n  >\n    <SlotContent>{/* … */}</SlotContent>\n  </AdwToolbarView>\n</View>\n```\n\n`AdwNavigationView` and `AdwNavigationSplitView` are wrapped the same way;\n`NavigationStack` above is a declarative layer on top of the former, not a\nreplacement for it — the raw widget is always one import away.\n\n`AdwApplicationWindow` (a toplevel) and `AdwNavigationPage` (valid only as a\ndirect child of `AdwNavigationView`/`AdwNavigationSplitView`) are exported\nraw — see "Unwrapped by necessity" above.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Namespaces",
    text: "`Adw`, `Gdk`, `Gio`, `Gtk`, `Pango` — exported as values, because you need\nboth the runtime enums and the types:\n\n```tsx\n;<GtkScrolledWindow hscrollbarPolicy={Gtk.PolicyType.NEVER} />\nconst viewRef = useRef<Adw.NavigationView | null>(null)\n```",
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Navigation without a router",
    text: 'The stack is an array of tags. Change the array, the widget animates.\n\n```tsx\nimport { useState } from "react"\nimport { Pressable, Text, View } from "react-native"\nimport {\n  AdwHeaderBar,\n  AdwToolbarView,\n  NavigationStack,\n  NavigationStackPage,\n  SlotContent,\n} from "react-native-gtkx/gtk` and `react-native-gtkx/adw"\n\nconst App = () => {\n  const [stack, setStack] = useState(["home"])\n\n  return (\n    <NavigationStack\n      stack={stack}\n      // The Adwaita back button, Escape, the back gesture and the\n      // back-history menu all arrive here. Follow them in your own state.\n      onPopped={(tag) => setStack((s) => s.filter((entry) => entry !== tag))}\n    >\n      <NavigationStackPage\n        tag="home"\n        title="Home"\n      >\n        <AdwToolbarView topBar={<AdwHeaderBar />}>\n          <SlotContent>\n            <Pressable onPress={() => setStack((s) => [...s, "detail"])}>\n              <Text>Open detail</Text>\n            </Pressable>\n          </SlotContent>\n        </AdwToolbarView>\n      </NavigationStackPage>\n\n      <NavigationStackPage\n        tag="detail"\n        title="Detail"\n      >\n        <AdwToolbarView topBar={<AdwHeaderBar />}>\n          <SlotContent>\n            <View />\n          </SlotContent>\n        </AdwToolbarView>\n      </NavigationStackPage>\n    </NavigationStack>\n  )\n}\n```\n\nA runnable version is `examples/adwaita-primitives` — three levels deep, with\nReact Native content in the header bar and a raw `GtkButton` beside it.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "`NavigationStack` props",
    text: "Everything `Adw.NavigationView` has, plus:\n\n| Prop                                        | Meaning                                                                                                                                                                                 |\n| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `stack`                                     | ordered page tags, root first. This is the navigation state                                                                                                                             |\n| `animateTransitions`                        | forwarded straight to `Adw.NavigationView`'s own property. Default true — GTK has one transition style, so this is only ever on/off                                                     |\n| `onPopped(tag)`                             | the WIDGET popped by itself. Not called for pops you caused by changing `stack`                                                                                                         |\n| `onPageClosed(tag)`                         | a closing page finished animating out and left the tree                                                                                                                                 |\n| `onTransitionStart()` / `onTransitionEnd()` | a push/pop/replace began / finished, the latter driven by the transitioning page's own `shown`/`hidden` signal                                                                          |\n| `transitionDuration`                        | ms, default 400 — a fallback window for retention and the callbacks above, used only when a page's own transition signal never arrives; not a measurement of the real transition length |\n| `ref`                                       | the `Adw.NavigationView` itself, for anything not modelled here                                                                                                                         |\n\nPages not listed in `stack` are still accepted as children and simply are not\nshown, so a router may hand over all of its screens at once.\n\n**Exit animations are handled for you.** When a tag leaves `stack`, the widget\nstill animates the page out. `NavigationStack` keeps a snapshot of that page\nuntil its `hidden` signal (with a timer fallback for two cases where that\nsignal never arrives on its own: compositors that never emit it, and a page\nskipped over entirely by a multi-hop pop — see `transitionDuration` above),\nso you never have to keep rendering pages you already consider gone.",
  },
  {
    doc: "docs/platform-layer.md",
    heading: "React Native content in native chrome",
    text: 'An AdwHeaderBar slot wants a widget that knows its own size, which is what\n`IntrinsicContent` provides:\n\n```tsx\n<AdwHeaderBar\n  start={\n    <IntrinsicContent>\n      <Text>{stack.length} deep</Text>\n    </IntrinsicContent>\n  }\n  end={[\n    <GtkButton\n      key="home"\n      iconName="go-home-symbolic"\n      onClicked={reset}\n    />,\n  ]}\n/>\n```',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Two ways to react to size",
    text: 'Two mechanisms answer two different questions, and neither is a replacement\nfor the other:\n\n- **"Render different content at different widths"** — `useWindowDimensions`\n  (from `react-native`, portable, already exists). A resize triggers a React\n  render, your component reads the new width, you return different JSX.\n  This is the right and ONLY tool for anything that changes what is\n  rendered — swapping a filter bar for a compact one, hiding a column,\n  changing text.\n- **"Flip a widget property natively at a threshold, with no render at all"**\n  — `AdwBreakpoint` + `AdwBreakpointBin`. `Adw.Breakpoint` is a condition\n  (a size/aspect-ratio threshold) plus a set of property setters: when the\n  condition starts holding, each setter writes its value onto its target\n  object\'s property directly, through GObject, inside GTK\'s own allocation\n  pass; when the condition stops holding, the setter puts the property back\n  to whatever it held before. **No React commit, no Yoga pass, no JS\n  callback runs for the flip itself** — a resize costs nothing beyond what\n  GTK\'s layout was already doing.\n\n  `Adw.Breakpoint` is not a widget — verified against the real binding,\n  `Adw.Breakpoint.prototype instanceof Gtk.Widget` is `false`; its\n  prototype chain bottoms out at plain `GObject.Object`. It draws nothing\n  and occupies no space, so it is exported raw (`AdwBreakpoint`, from\n  `react-native-gtkx/adw`), the same way `GtkGestureClick` is: running it\n  through `wrapReactNative` would hand it a Yoga node for something that\n  is not a rectangle, which is a layout bug, not a convenience.\n  `Adw.BreakpointBin` (`AdwBreakpointBin`) IS a real widget — a container\n  that scopes breakpoints to its own child subtree instead of a whole\n  window — and is wrapped normally, taking `style`/flex like anything else\n  here.\n\n  A breakpoint\'s setters may only target widgets INSIDE the\n  `AdwBreakpointBin` they are attached to, never the bin itself — so the\n  widget whose property you want to flip must be the bin\'s child:\n\n  ```tsx\n  import { Adw, AdwBreakpoint, AdwBreakpointBin } from "react-native-gtkx/adw"\n\n  const splitViewRef = useRef<Adw.NavigationSplitView | null>(null)\n  const breakpointRef = useRef<Adw.Breakpoint | null>(null)\n\n  useEffect(() => {\n    if (!splitViewRef.current || !breakpointRef.current) return\n    const collapsed = new GObject.Value()\n    collapsed.init(GObject.typeFromName("gboolean"))\n    collapsed.setBoolean(true)\n    breakpointRef.current.addSetter(splitViewRef.current, "collapsed", collapsed)\n  }, [])\n\n  <AdwBreakpointBin\n    breakpoints={\n      <AdwBreakpoint\n        ref={breakpointRef}\n        condition={Adw.BreakpointCondition.newLength(\n          Adw.BreakpointConditionLengthType.MAX_WIDTH,\n          500,\n          Adw.LengthUnit.SP,\n        )}\n      />\n    }\n  >\n    <AdwNavigationSplitView ref={splitViewRef} …>…</AdwNavigationSplitView>\n  </AdwBreakpointBin>\n  ```\n\n  `addSetter` wants a genuine, boxed `GObject.Value` — found empirically: a\n  bare JS `true` fails a `G_IS_VALUE` assertion on the native side, it does\n  not silently coerce. `createSidebarNavigator`\'s own `collapseWidth` (see\n  below) is built on exactly this pair; reading `collapsed`/`showContent`\n  back (e.g. to decide whether a click should also reveal content) is a\n  plain native property read through the same ref, not React state — so\n  neither the flip nor a read of it costs a render.\n\nNo `useBreakpoint(condition) → boolean` hook exists, and none is planned:\nit would return a flag to JS and trigger a re-render on every crossing,\nwhich is precisely what `useWindowDimensions` already does — a second name\nfor the first mechanism, with none of the second\'s native-setter value.\nIf what you want is "my component\'s JSX changes", reach for\n`useWindowDimensions`; only reach for `AdwBreakpoint` when the thing that\nshould change is a widget property GTK itself owns, and you want that\nchange to cost nothing.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Mixing with react-navigation",
    text: "They compose, because the navigator is built on these primitives. Use\n`react-native-gtkx/navigation` for the app's structure and drop to\n`react-native-gtkx/gtk` and `react-native-gtkx/adw` where you need a widget the options do not cover —\nfor example a raw `GtkButton` in `headerButtons`, or a `GtkListBox` inside a\nscreen.\n\nKeeping portable code portable: put Linux-only UI behind a `.linux.tsx`\nplatform extension, or behind `Platform.select({ linux: … })`. Options a\nplatform does not understand are ignored, and in development the navigator\nwarns with the screen and option name rather than swallowing them silently.",
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Wrapping a widget we do not export",
    text: 'The generated surface above covers every current `Gtk.Widget`/`Adw.Widget`\nsubclass gtkx binds, but "current" is doing work in that sentence: a gtkx\nrelease can add a widget before this package\'s generator has been re-run for\nit, and non-widget GI classes (an event controller, a filter, an adjustment)\nwere never candidates for the widget surface in the first place even though\na handful of them are occasionally worth putting inside RN layout too.\n`wrapReactNative` is how you reach either without waiting on us — it is\ngeneric, so the widget\'s own props keep their types:\n\n```tsx\nimport { GtkPopover } from "@gtkx/jsx/gtk"\nimport { wrapReactNative } from "react-native-gtkx/gtk` and `react-native-gtkx/adw"\n\nconst Popover = wrapReactNative(GtkPopover)\n// <Popover style={{ width: 240 }} autohide … /> — `autohide` still typed\n```\n\n(`GtkPopover` here is already part of the generated surface — this is the\nsame mechanism `src/gtk/widgets.generated.ts` uses under the hood, just\napplied by hand. It stays useful the day gtkx binds something this package\nhas not regenerated for yet.)\n\nTwo lower-level forms exist for cases the wrapper does not fit:\n\n- `<Widget style={…}>` — wrap an element you already have in hand;\n- `useWidgetLayout(ref, { style })` — attach layout to a widget whose ref you\n  own, with no wrapper component at all. Returns the GTK CSS class from the\n  style\'s visual half, for you to pass to `cssClasses`.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "The escape hatch",
    text: "If something is missing, reach the widget directly:\n\n```tsx\nconst viewRef = useRef<Adw.NavigationView | null>(null)\n<NavigationStack ref={viewRef} stack={stack}>…</NavigationStack>\n// viewRef.current is the real Adw.NavigationView\n```\n\nThere is deliberately no wall here. A missing convenience should cost you one\nline, not a fork.",
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Related",
    text: "- [API v1](api.md) — the portable React Native surface.\n- [Navigation research](research/navigation-extensibility.md) — how the\n  adapter maps react-navigation onto these primitives.\n- [What we need from gtkx](upstream-gtkx.md) — the upstream agenda.",
  },
  {
    doc: "docs/getting-started.md",
    heading: "Requirements",
    text: "- Linux (x64/arm64, glibc), GTK4 ≥ 4.20, libadwaita ≥ 1.8 (Ubuntu 26.04+, Fedora 43+);\n- Node.js ≥ 24;\n- dev packages: `sudo apt install libgtk-4-dev libadwaita-1-dev` (Ubuntu).",
  },
  {
    doc: "docs/getting-started.md",
    heading: "New project from the template",
    text: "```bash\nnpx degit itsmepetrov/react-native-gtkx/template my-app && cd my-app\nnpm install\nnpm run dev        # window with Fast Refresh (edits apply without a restart)\nnpm run build && npm start   # production bundle, runs with plain node\n```\n\nMeasured in a clean Ubuntu 26.04 container: 63 seconds from install to a window on screen.",
  },
  {
    doc: "docs/getting-started.md",
    heading: "How it works",
    text: '```\nyour code (react-native API)\n  └─ vite preset: aliases react-native → react-native-gtkx, platform\n     extensions .linux.tsx → .native.tsx → base\n      └─ react-native-gtkx: Yoga (WASM) computes flexbox; styles are split into\n         layout (Yoga) and visual (GTK CSS); coordinates are applied to\n         real GTK widgets\n          └─ gtkx: React reconciler → GTK4 via FFI\n```\n\nThe entry point is the same as in RN:\n\n```tsx\nimport { AppRegistry, StyleSheet, Text, View } from "react-native"\n\nconst App = () => (\n  <View style={styles.screen}>\n    <Text style={styles.title}>Hello, GNOME!</Text>\n  </View>\n)\n\nconst styles = StyleSheet.create({\n  screen: { flex: 1, alignItems: "center", justifyContent: "center" },\n  title: { fontSize: 24, fontWeight: "700" },\n})\n\nAppRegistry.registerComponent("app", () => App)\nAppRegistry.runApplication("app", { title: "My App", width: 800, height: 600 })\n```\n\n`runApplication` accepts desktop parameters (`title`, `width`, `height`) — the only extension over the RN signature.',
  },
  {
    doc: "docs/getting-started.md",
    heading: "Add Linux to an existing React Native app",
    text: 'Linux is an [out-of-tree platform](https://reactnative.dev/docs/out-of-tree-platforms)\n(the react-native-windows/macOS model): your app keeps its ios/ and\nandroid/ folders, its Metro/Babel toolchain, and gains one more target.\nFour steps:\n\n1. **Install the platform package:**\n\n   ```bash\n   npm install react-native-gtkx\n   ```\n\n   Its own `react-native.config.js` declares the `linux` platform and the\n   `run-linux` command — nothing to declare app-side.\n\n2. **Wrap your Metro config** (`metro.config.js`):\n\n   ```js\n   const { getDefaultConfig } = require("@react-native/metro-config")\n   const { withLinuxPlatform } = require("react-native-gtkx/metro")\n\n   module.exports = withLinuxPlatform(getDefaultConfig(__dirname))\n   ```\n\n   The wrap adds the platform (`.linux.tsx` extensions,\n   `Platform.OS === "linux"`), redirects `react-native` imports to the\n   platform package, and keeps host-side modules (GTK bindings, react,\n   yoga) out of the bundle. Babel stays completely stock.\n\n3. **Add `gtkx.config.ts`** with the GTK application id:\n\n   ```ts\n   import { defineConfig } from "@gtkx/config"\n\n   export default defineConfig({\n     libraries: ["Gtk-4.0", "Adw-1"],\n     applicationId: "com.example.myapp",\n   })\n   ```\n\n4. **Start the app from the entry** — on desktop the entry launches the\n   app itself (the same pattern as react-native-web\'s `index.web.js`):\n\n   ```js\n   // index.js, after AppRegistry.registerComponent(...)\n   if (Platform.OS === "linux") {\n     AppRegistry.runApplication(appName, {\n       title: "My App",\n       width: 800,\n       height: 600,\n     })\n   }\n   ```\n\nRun it:\n\n```bash\nnpx react-native run-linux         # release bundle\nnpx react-native run-linux --dev   # Metro dev server + Fast Refresh\n```\n\nThe command ensures the gtkx codegen store, bundles with Metro for\n`--platform linux` and opens the window. With `--dev` it starts (or\nreuses) the Metro dev server and edits apply to the live window with\ncomponent state preserved; syntax errors print readably in the terminal\nand the app recovers on the next successful build. **Ctrl+Shift+D** (the\nreact-native-windows shortcut — the desktop stand-in for the shake\ngesture) opens the Dev Menu: Reload plus any entries the app registers\nvia `DevSettings.addMenuItem`. `examples/rn-app` is a complete cli-init\napp with all three platforms wired this way.\n\n`run-linux` always runs what it builds — for a release build that stops\nshort of opening a window (packaging, CI, handing a bundle to someone\nelse\'s machine), use `build-linux` instead; see\n[Shipping an app](#shipping-an-app) below for what it produces and what\nrunning it later needs.\n\nNotes for typed code: add an `env.d.ts` with\n`import "react-native-gtkx/types"` — it augments the stock `react-native`\ntypes so `Platform.select({ linux: ... })` typechecks, and `Pressable`\'s\nstate callback accepts `hovered` (declared optional — a component shared\nwith ios/android gets `undefined` there, so write\n`hovered && styles.hovered`). Future platform-specific props land in the\nsame file. One thing augmentation\ncannot teach is `Platform.OS === "linux"` (property types do not merge) —\nuse `Platform.select` in typed code. Deep imports\n(`react-native/Libraries/...`) are not supported — only the public\n`react-native` surface.',
  },
  {
    doc: "docs/getting-started.md",
    heading: "Navigation",
    text: "Multi-screen apps use the standard react-navigation API with a native\nAdwaita stack navigator: install `@react-navigation/native` and import\n`createStackNavigator` from `react-native-gtkx/navigation` — pages render\nas `Adw.NavigationPage` with the HeaderBar back button wired to\nreact-navigation state. See [docs/api.md](api.md#navigation-react-native-gtkxnavigation), and\n[docs/research/navigation-extensibility.md](research/navigation-extensibility.md)\nfor porting an existing react-navigation app (which options carry over,\nwhich are silently ignored today, and what the desktop cannot mean).",
  },
  {
    doc: "docs/getting-started.md",
    heading: "Svg",
    text: '`<Svg>`/`<Path>`/`<Circle>` and the rest of the vector-graphics API come from\n`react-native-svg`, not from `react-native-gtkx` itself — matching every\nother platform, where `react-native-svg` is a separate package too (RN has\nno built-in `Svg`). See [docs/api.md](api.md#svg) for the component set and\n[the compat-subpath section](api.md#react-native-svg-compatibility-react-native-gtkxsvg)\nfor how both presets alias the bare `react-native-svg` import to it.\n\nThat alias is a bundler-level rewrite, so TypeScript still needs its own\nanswer for the specifier `"react-native-svg"` — an unresolved import in the\neditor even though the build works fine. Which fix applies depends on what\nthe project targets:\n\n- **Also ships to iOS/Android/web**: install the real `react-native-svg` —\n  the app needs it on those platforms regardless. `react-native-svg` ships\n  its own `.d.ts` (no separate `@types` package exists or is needed), so\n  TypeScript resolves real, complete types for the specifier; the Linux\n  build never actually executes that package\'s code — the preset rewrites\n  the import to `react-native-gtkx/svg` before it reaches Node. Nothing\n  react-native-gtkx-specific to configure.\n- **Linux-only project** (the template, or an app with no mobile target):\n  add `react-native-svg` as a **devDependency purely for its types** —\n  `npm install -D react-native-svg`. This is the ordinary fix for a\n  bundler-alias setup once the aliased name has no real package installed —\n  the same shape as react-native-web\'s own TypeScript guidance (install a\n  real, type-bearing package alongside the alias rather than fabricate\n  one). Side benefit: if this package\'s compat surface ever drifts from\n  upstream `react-native-svg`\'s props (see the "Deliberate gaps" note in\n  `packages/react-native-gtkx/src/svg-compat/index.ts`), the mismatch shows\n  up as a type error instead of compiling silently.\n\nWe deliberately did not ship an ambient `declare module "react-native-svg"`\n— the trick `react-native-gtkx/types` uses to teach the stock `react-native`\ntypes about the `linux` platform. That works there because it only\n_augments_ an already-resolved module (interfaces merge). Here the module\ndoes not resolve at all without one of the two installs above, so the shim\nwould have to declare the whole module unconditionally to help — and a\nproject that installs the real `react-native-svg` later (adding a mobile\ntarget) would then carry two declarations of the same module, the shim and\nthe real package\'s own, colliding. Installing the real package, even only\nas a devDependency, never has that problem: there is only ever one\ndeclaration of `"react-native-svg"` in play.',
  },
  {
    doc: "docs/getting-started.md",
    heading: "Metro or vite?",
    text: "- **Adding Linux to an existing RN app** (ios/android + Metro): the\n  section above — standard RN toolchain end to end,\n  `run-linux --dev` for Fast Refresh.\n- **Linux-first project**: the template with the vite preset\n  (`react-native-gtkx/vite`; `gtkx dev` gives Fast Refresh, builds are\n  single-file bundles). Both paths consume the same published package.",
  },
  {
    doc: "docs/getting-started.md",
    heading: "Shipping an app",
    text: "The two paths get you from source to something installable differently,\nbecause they take different positions on what stays out of the bundle.\n\n**vite path** (`gtkx build`): everything except the native GTK addon is\ninlined into one file. `dist/bundle.js` + `dist/gtkx.node` (plus\n`dist/gschemas.compiled` if the app declares a GSettings schema — the\nbundle's own banner points `GSETTINGS_SCHEMA_DIR` at its own directory) is\nthe whole runtime: copy those anywhere with Node ≥24, GTK4 ≥4.20 and\nlibadwaita ≥1.8, and `node bundle.js` runs it. No `node_modules` involved.\n\n**Metro path** (`react-native build-linux`): the release counterpart to\n`run-linux` that iOS, Android and react-native-windows already have and\nthis platform did not until now — it bundles with Metro and stops, instead\nof bundling and immediately running like `run-linux` does:\n\n```bash\nnpx react-native build-linux         # writes dist/main.jsbundle\n```\n\nThis is **not** self-contained, unlike the vite path. Metro deliberately\nkeeps `@gtkx/*`, `react` and `yoga-layout` out of the bundle — they have to\nbe the exact instances the Node+GTK host loads, not a second copy Metro\ninlines (see `packages/react-native-gtkx/src/metro/index.ts`,\n`HOST_MODULE_EXTERNALS`, for why). So running `dist/main.jsbundle` needs,\non top of Node ≥24/GTK4/libadwaita, a real `node_modules` with\n`react-native-gtkx` installed and the app's `gtkx.config.ts` present at the\nworking directory:\n\n```bash\nnode node_modules/react-native-gtkx/dist/runner/host.js dist/main.jsbundle\n```\n\n(run from the app root — the config loader reads `gtkx.config.ts` from the\ncurrent directory, exactly like `run-linux` itself). Any ordinary\n`npm install` of the app already has that `node_modules`; the difference\nfrom the vite path only matters when packaging for a machine that never\nran one — see `scripts/build-deb.ts`'s Metro branch, which builds that\nclosure itself: a fresh, isolated install of the locally-packed\n`react-native-gtkx` plus `gtkx codegen`, never a copy of a monorepo's own\nhoisted `node_modules` (which would prove nothing about what a real install\nneeds).\n\nThat is the **default** artifact, and it is the only one that carries the\n`node_modules` caveat. `--standalone` below removes it entirely: the same\nMetro build, emitted as one self-contained file that runs on a system Node\nwith nothing installed beside it — the vite path's shape, on the Metro\npath.",
  },
  {
    doc: "docs/getting-started.md",
    heading: "One file (Metro path)",
    text: "`build-linux` produces three artifacts. Which one you want is a question\nabout the delivery channel, not about the build — they share the same\nMetro step and differ only in how much of the runtime travels with the\napp:\n\n| Flag           | Artifact                   | Needs installed                    | Size (`hn-app`, linux-arm64) |\n| -------------- | -------------------------- | ---------------------------------- | ---------------------------- |\n| _(none)_       | `dist/main.jsbundle`       | a `node_modules` tree **and** Node | 0.4 MB + the tree            |\n| `--standalone` | `dist/<name>.cjs`          | Node only (`Depends: nodejs`)      | 6.9 MB                       |\n| `--sea`        | `dist/<name>` (executable) | nothing at all                     | 104 MB (30 MB compressed)    |\n\n```bash\nnpx react-native build-linux --standalone     # in the app root\nnode ./dist/<your-package-name>.cjs           # one script, system node\n\nnpx react-native build-linux --sea\n./dist/<your-package-name>                    # one executable, nothing else\n```\n\nBoth flags produce the jsbundle exactly as before, then one additional\nfile next to it. `--sea-output <path>` overrides where it goes; the\ndefault is `dist/<package name>` with any npm scope stripped (plus `.cjs`\nfor `--standalone`).\n\n**Pick `--standalone` for anything installed through a package manager.**\nIt is the same shape gtkx's own packaging produces and the same shape the\nvite path already ships in its `.deb` — a bundle plus a `nodejs`\ndependency — and it is the lightest of the three by any measure that\ncounts: the plain jsbundle looks smaller only because its `node_modules`\ntree is not weighed. **Pick `--sea` for \"download this one file and run\nit\"**, where nothing can be assumed to be installed. They are not\ncompeting implementations: `--sea` is `--standalone` with a copy of Node\nwrapped around it, and that copy is the entire 97 MB between them.\n\nThat copy is stripped of its debug symbols as part of the build, which is\nnot a micro-optimisation: the `node` binary NodeSource distributes for\nUbuntu ships `with debug_info, not stripped` — 117 MB, 98 MB after\n`strip --strip-all` — so 19 MB of every unstripped SEA is debug\ninformation for Node's own C++, which nothing in a shipped app can use.\nThe step is best-effort: a build machine without binutils gets a warning\nand a larger executable, not a failed build. It also runs strictly before\npostject, since `--strip-all` removes exactly the kind of non-allocated\nsection the injected blob is. What remains after that is Node itself, and\nit does not compress away either — but it does compress: 30 MB with\n`zstd -19`, which is what a download actually costs.\n\nThe native addon (`@gtkx/native-*.node`, a real `dlopen`ed library) cannot\nbe JavaScript, so both artifacts carry it as bytes — a SEA asset in the\nexecutable, a base64 literal in the `.cjs` — and extract it to\n`$XDG_CACHE_HOME/react-native-gtkx-sea` on first run, keyed by content\nhash. That is what keeps \"one file\" honest in both cases.\n\nNothing extra to install to bundle it. That work is done by **rolldown**,\nwhich is vite's own engine — vite 8 depends on it outright, `@gtkx/cli`\ndepends on vite, and this package depends on `@gtkx/cli`, so it is already\nin every install. (esbuild, which gtkx's tutorial uses for the same job,\nwould have been the one genuinely new bundler in the tree: vite 8 lists it\nas an _optional_ peer and does not install it.)\n\nOne thing `--sea` does need that a plain `build-linux` does not: **the\ngtkx codegen store**, and therefore GTK development headers on the build\nmachine. A plain `build-linux` deliberately needs neither — Metro\nexternalizes every GTK module — but the SEA inlines `virtual:gtkx-config`,\nwhich re-exports `@gtkx/jsx/metadata`, a codegen product. `build-linux\n--sea` runs `gtkx codegen` itself; it just can't do so on a machine\nwithout the headers.\n\n`postject` is fetched through `npx` at build time, so the first run needs\nnetwork access.\n\nThis follows gtkx's own tutorial (`gtkx-org/gtkx examples/tutorial`:\nbundle to CJS, `node --experimental-sea-config`, postject injects the blob\ninto a copy of the `node` binary) for the SEA/postject mechanics.\nIt diverges on the two hard parts specific to this project — full\nreasoning, including everything found empirically while building it (not\njust designed on paper), lives in\n`packages/react-native-gtkx/src/sea/bundle.ts` and `native-shim.ts`; the\nshort version:\n\n- **The native addon** (`@gtkx/native-<platform>-<libc>`, loaded through\n  dlopen) cannot be embedded as bundled code — a SEA is a V8 code cache\n  blob, dlopen needs a real file. The tutorial's own answer is to keep it\n  BESIDE the executable; that's two files, which is exactly what this\n  build exists to stop being. This build embeds it as a Node SEA \"asset\"\n  instead and extracts it to a per-user cache directory\n  (`$XDG_CACHE_HOME/react-native-gtkx-sea`, falling back to `os.tmpdir()`\n  for a read-only `$HOME`) on first run, keyed by a content hash so\n  repeat launches reuse the extracted file. Loading it back turned out to\n  need `process.dlopen()`, not `require()` — a SEA's main script can only\n  `require()` built-ins and embedded assets (confirmed empirically:\n  `require(anyAbsolutePath)` throws `ERR_UNKNOWN_BUILTIN_MODULE`) — and,\n  found only by actually running the result, an explicit\n  `nativeModule.exports.init()` call right after `dlopen()`: without it\n  the first GTK-driven callback into JS panics on the Rust side (\"the\n  Node environment was accessed from a thread it is not installed on\").\n- **Metro's externals** (`HOST_MODULE_EXTERNALS`) are inlined by a\n  generated entry — a third host implementation alongside `host.ts` and\n  `host-dev.ts` — that `await import()`s every externalized name and\n  assembles `globalThis.__hostModules` before running the jsbundle text,\n  instead of the app needing a runtime `node_modules` to load them from.\n  `gtkx.config.ts` is resolved once, at bundle time (like the vite path\n  already does), not on every process start (like `host.ts` does) — a SEA\n  has no \"app root\" to read a config file from at runtime.\n\nSize, measured on the one platform this was built and proven on\n(linux-arm64): **104 MB** for `hn-app`, 30 MB compressed. Stripped Node is\n~98 MB of that — the bundled app code plus the embedded native addon is\nunder 7 MB. Worth saying plainly: that is still a heavy download for what\na Hacker News reader needs, and it will not shrink further while the\nartifact carries a full Node binary. That is the trade `--sea` exists to\nmake, and `--standalone` is the answer whenever it isn't worth it.\n\n**Proof, not just a build**: copied the executable alone (no `node_modules`,\nno source tree) to an isolated directory on the VM, removed `/usr/bin/node`\nfrom the system (confirmed `command -v node` found nothing), launched the\nbinary under a headless Wayland compositor, and screenshotted a live,\nworking \"Hacker News\" window with real fetched data — not a build log, not\na run from the source tree.\n\n**vite path — not done here.** Investigated, and it does not generalize\nthe same way: the vite bundle loads the native addon through\n`createRequire(import.meta.url)(\"./gtkx.node\")` — a dynamically obtained\n`require`, not a literal `require(...)` call — which a bundler does not\nintercept the way it intercepts a static import (verified: the resolve\nhook never fires for it in a real rebuild of `dist/bundle.js`). The vite\nbundle also has its own top-level await, incompatible with the CJS format\na Node SEA main script requires. Both are fixable in principle (a\ntext-level rewrite of the compiled `require` call before re-bundling,\nversion-coupled to `@gtkx/cli`'s vite plugin), but that is a different,\nmore fragile technique than the Metro path's, and wasn't built or proven\nhere. If a true single file is wanted for the vite path too, that rewrite\nis where to start — not a repeat of this approach.",
  },
  {
    doc: "docs/getting-started.md",
    heading: "Examples in the repository",
    text: "- `examples/profile` — a static layout; the same source also builds with react-native-web (`examples/profile-web`);\n- `examples/playground` — interactive: Pressable, TextInput, Switch, FlatList, Modal, Animated, responsive via flexWrap;\n- `examples/gallery` — a gallery of the entire v1 surface;\n- `examples/rn-app` — a cli-init React Native app with ios + android + linux;\n- `examples/hn-app` — a Hacker News reader on the Metro path: live API data over Node fetch, state-based two-screen navigation, a lazily loaded comment tree.",
  },
  {
    doc: "docs/getting-started.md",
    heading: "Tests",
    text: 'Unit logic is plain vitest — no special setup, runs anywhere. Component\ntests render real GTK widgets under a headless Wayland compositor, and\nreact-native-gtkx ships the whole recipe as two subpaths so a consumer app\ndoes not have to rediscover it:\n\n- `react-native-gtkx/vitest` — `reactNativeGtkxTest()`, a ready Vitest\n  project config: the headless-compositor plugin, the `react-native` alias\n  and Metro-style platform extensions, an inline-deps default for RN\n  libraries that import `react-native` themselves (`@react-navigation`),\n  and the React act-environment setup;\n- `react-native-gtkx/testing` — re-exports `@gtkx/testing`\'s\n  render/screen/userEvent/fireEvent surface (already RN-shaped: `getByText`\n  finds a `Text`, `userEvent.click` walks up to a `Pressable`\'s gesture\n  controller — no wrapper needed) plus `renderHookWithWindow`, for hooks\n  that read the active window (`useWindowDimensions` and similar) —\n  `renderHook` alone mounts into a windowless container.\n\nMinimal `vitest.config.ts`:\n\n```ts\nimport { reactNativeGtkxTest } from "react-native-gtkx/vitest"\nimport { defineConfig } from "vitest/config"\n\nexport default defineConfig(reactNativeGtkxTest())\n```\n\nThe default test glob is `**/*.gtk.test.{ts,tsx}`; override `include` (and\n`name`, `headless`, `platform`, `inlineDeps`, `setupFiles`,\n`fileParallelism`) through `reactNativeGtkxTest`\'s options. For a project\nthat also has portable unit tests, use the result as one entry of\n`test.projects` instead of the whole config — `vitest.config.ts` at this\nrepo\'s root is the reference (`process.platform === "linux"` guards the\ngtk project so `npm test` still works on a non-Linux dev machine, running\nonly the unit project there).\n\n```tsx\nimport { Root } from "react-native"\nimport { render, screen } from "react-native-gtkx/testing"\nimport { expect, it } from "vitest"\nimport { App } from "../src/App"\n\nit("renders the greeting", async () => {\n  // react-native-gtkx components need a layout root — AppRegistry.runApplication()\n  // in the real app, <Root> in a test.\n  await render(\n    <Root\n      width={800}\n      height={600}\n    >\n      <App />\n    </Root>,\n  )\n  expect(screen.getByText("Hello, GNOME!")).toBeTruthy()\n})\n```\n\nRequirements: a headless Wayland compositor and D-Bus on PATH — the same\nsystem packages CI installs, `sway xwayland dbus` (Ubuntu:\n`apt install sway xwayland dbus`). A missing compositor fails a test run\nwith a readable error (`Cannot find the "sway" executable on PATH`) rather\nthan hanging. `gtkx codegen` must already have generated the project\'s\n`@gtkx/gi` bindings before the first test run — a bare `vitest run` does\nnot trigger codegen itself, unlike `gtkx dev`/`gtkx build`; the template\'s\nown `package.json` wires this as a `pretest` script.\n\n`packages/react-native-gtkx/tests/gtk/` is this repo\'s own suite, built on\nthe same `@gtkx/testing` surface directly (it tests source, not the\npublished package) — a good place to see more query and `userEvent`\npatterns in context. Query roles with `Gtk.AccessibleRole` enums (see\ndocs/gtkx-rc2-notes.md for the live workarounds still baked into that\nrecipe).',
  },
  {
    doc: "docs/getting-started.md",
    heading: "MCP server for agents",
    text: 'An agent working inside a project that depends on react-native-gtkx can\nask the library about itself instead of guessing: `react-native-gtkx-mcp`\nis a [Model Context Protocol](https://modelcontextprotocol.io) server that\nships as a `bin` on this package. Register it in `.mcp.json` (Claude\nCode, project-level) or the equivalent config of any MCP-compatible\nclient:\n\n```json\n{\n  "mcpServers": {\n    "react-native-gtkx": { "command": "npx", "args": ["react-native-gtkx-mcp"] }\n  }\n}\n```\n\nRunning it as `npx react-native-gtkx-mcp` from the project root resolves\nthe locally installed `node_modules/.bin` entry — no separate install,\nand it always answers for the exact react-native-gtkx version the\nproject actually has.\n\nThree tools:\n\n- `rn_gtkx_list_surface` — browse the surface without knowing a name\n  first (portable components/APIs, gtk/adw widgets, common) with counts;\n- `rn_gtkx_describe_component` — the one to reach for first: does a\n  component/widget exist, which subpath it is exported from, what GTK\n  widget backs it, what differs from React Native, whether a gtk/adw\n  widget is wrapped (takes `style`/`onLayout`) or raw;\n- `rn_gtkx_search_docs` — free-text fallback for symptoms and known-issue\n  questions the other two cannot answer by name.\n\nIt works without GTK installed — plain Node, no `@gtkx/*` import\nanywhere in it, reading only the package\'s own bundled docs/manifest data.\nThat matters in practice: the agent is often reading the project from a\nMac, with no GTK toolchain around at all.',
  },
  {
    doc: "docs/getting-started.md",
    heading: "Next steps",
    text: "- [docs/api.md](api.md) — the entire v1 surface and differences from RN;\n- [CONTRIBUTING.md](../CONTRIBUTING.md) — developing the library itself (from macOS — via the UTM VM);\n- [docs/gtkx-rc2-notes.md](gtkx-rc2-notes.md) — the gtkx rc.2 baseline: workarounds, what it fixed, quirks that stay.",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "Live workarounds",
    text: '| Name                               | What rc.2 does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Our workaround                                                                                                                                                                                                                                                                                                                             | Removal condition                                                                                       |\n| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |\n| `use-signal-stale-handler`         | `useSignal` routes the handler through React\'s `useEffectEvent`; `react-reconciler@0.33.0` only refreshes it in `commitBeforeMutationEffects` for `case 0` (FunctionComponent) — `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed, so any `useEffectEvent` in a `memo`/`forwardRef` component is pinned to its mount closure forever (our `ScrollView` is a `forwardRef` with the `useSignal` calls inside it — confirmed upstream, gtkx-org/gtkx#467) — a fetch-fed FlatList empties itself on the first scroll | `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx\'s                                                                                                                                                                                        | A stable React 19.3 (React fixed the refresh on the 19.3 line; no stable gtkx 0.34.x yet)               |\n| `runtime-dedupe`                   | Two bundled copies of the gtkx runtime still double-init GLib and abort (`g_log_set_writer_func` called twice); nothing guards against it                                                                                                                                                                                                                                                                                                                                                                                                           | `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits                                                                                                                                                                                            | Idempotent runtime init upstream, or an error that names the duplicate                                  |\n| `renderhook-no-window`             | `renderHook` still mounts into a bare `Gtk.Box`, so window-dependent APIs have no toplevel to read                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`)                                                                                                                                                                    | `renderHook` mounts into the same harness window `render` uses                                          |\n| `graphene-rect-nested-boxed-props` | `new Graphene.Rect({ origin: new Graphene.Point(...), size: new Graphene.Size(...) })` hits the same native "Expected an Object for Boxed field write type, got Object" as the `gsk-colorstop-boxed-write` row below — a boxed struct\'s constructor writing another boxed value into one of its own fields                                                                                                                                                                                                                                          | `gtkx/bridge/svg-node.ts` builds the clip rect through `Graphene.Rect.alloc().init(x, y, w, h)` instead — a working escape hatch `Gsk.ColorStop` does not have                                                                                                                                                                             | Upstream fixes boxed-struct fields that are themselves another boxed type                               |\n| `gsk-colorstop-boxed-write`        | Constructing a `Gsk.ColorStop` (an inline `{ float offset; GdkRGBA color; }` boxed struct) crashes in the native addon writing the `color` field — "Expected an Object for Boxed field write type, got Object". Verified through three independent paths (constructor props, the property setter, and skipping `ColorStop` for a plain `{offset, color}` object, which fails differently with "No native handle associated with Object" — the array marshaling genuinely needs a native-backed instance per element)                                | `gtkx/bridge/svg-node.ts`\'s `makeColorStop` catches the throw and returns `null`; a gradient with zero constructible stops paints nothing for that fill/stroke instead of crashing (the same path as an unresolved `url(#missing)` reference) — SVG `<LinearGradient>`/`<RadialGradient>` ship with this degradation, not cut from the API | Upstream fixes boxed-struct fields that are themselves another boxed type (nested embed, not a pointer) |',
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "Fixed in rc.2 (rc.1 history, one line each)",
    text: "- **`vitest-compositor`** — rc.1 defaulted the headless display to weston and\n  took sway through an option; rc.2's default IS sway, so `vitest.config.ts`\n  calls the plugin with no arguments.\n- **`no-virtual-seat`** — rc.1 had no input seat under sway, so windows never\n  activated and `userEvent` was impossible; rc.2 starts a virtual seat for sway\n  (`needsVirtualSeat: true`), a rendered toplevel now reports `is-active: true`,\n  and coordinate-level input is on the table.\n- **`fixed-layout-child`** — rc.1's declarative `<GtkFixedLayoutChild>` created\n  a detached object (Gtk-CRITICAL, positions never applied); moot for us since\n  containers moved to our own `RnGtkxLayout` manager and GtkFixed left the\n  codebase entirely.\n- **`controllers-as-children`** — rc.1 silently ignored controllers passed as\n  JSX; rc.2 has a `controllers` slot on `GtkWidget`. Pressable and TextInput\n  still attach theirs imperatively on purpose (wired once per widget, handlers\n  read from a ref) — a choice now, not a workaround.",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "New in the rc.2 era",
    text: "Two regressions/gaps first seen on rc.2, both with reproductions and both\nwritten up for upstream in [docs/upstream-gtkx.md](upstream-gtkx.md):\n\n- **The `useSignal` freeze.** Not a `useSignal` bug and not about tree depth:\n  `react-reconciler@0.33.0` refreshes `useEffectEvent` in\n  `commitBeforeMutationEffects` only for `case 0` (FunctionComponent) —\n  `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through\n  unrefreshed, so any `useEffectEvent` inside a `memo`/`forwardRef` component\n  is pinned to its mount closure permanently (confirmed upstream,\n  gtkx-org/gtkx#467). It reproduced for us because our `ScrollView` is a\n  `forwardRef` with the `useSignal` calls inside it; simple, shallow\n  components refresh correctly, which is why it survives casual testing. The\n  visible symptom was a virtualized list that blanked on the first scroll.\n  Repro: `tests/gtk/components/list-late-data.gtk.test.tsx`, plus the contract\n  test in `tests/gtk/bridge.smoke.test.tsx`.\n- **The codegen freshness lie — resolved.** `npm install` prunes\n  `node_modules/.gtkx` (npm sees `@gtkx/gi`/`@gtkx/jsx` as extraneous), and on\n  rc.2 `@gtkx/cli`'s codegen could report \"bindings up to date\" over a store\n  that was not there; fixed upstream in gtkx-org/gtkx#470 (the freshness check\n  now verifies both stores' manifests and self-links, not just one). Separately,\n  we were never supposed to be exposed to this: `@gtkx/cli` is meant for apps,\n  not libraries generating bindings on a consumer's behalf, so `src/runner`\n  now calls the programmatic `@gtkx/codegen` API directly (see\n  `docs/upstream-gtkx.md` bug 2) — no CLI subprocess, no cwd, no stamp to\n  misread. `rm -rf node_modules/.gtkx` before `npm run codegen` at the repo\n  root is still the right sequence for our own monorepo tooling, which still\n  runs the CLI.",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "Non-workarounds (quirks that stay)",
    text: '- 64-bit FFI values arrive as BigInt → `toNumber()` at the boundary\n  (`gtkx/bridge/measure.ts`);\n- signal names are kebab-case ("value-changed"); signals do not pass the\n  emitter (get the widget from a ref);\n- role queries in tests use the `Gtk.AccessibleRole` enum, not strings;\n- `npm install` prunes the codegen store (`node_modules/.gtkx` is not in the\n  lockfile) → run `npm run codegen` after installing — npm behavior, not gtkx;\n- measuring unmapped widgets yields 0 (offscreen Label probes are the\n  exception) → re-measure on the `map` signal + re-commit measured leaves on\n  every flush (`layout/node.ts`);\n- mixed-session setups only: running an app on a bare compositor (headless\n  sway) while `XDG_RUNTIME_DIR` points at a full GNOME session can segfault in\n  a GTK signal handler when the GNOME settings portal pushes updates into the\n  app (`g_cclosure_marshal_VOID__OBJECTv` via the FFI emit path); cutting\n  `DBUS_SESSION_BUS_ADDRESS` avoids it, which is why the headless scripts do.\n  Normal desktop and container runs are unaffected. Retested on rc.2 (gallery\n  under headless sway with the real session bus attached): the app ran clean\n  and SIGTERM teardown exited 143, so the exit-time segfault we saw on rc.1 no\n  longer reproduces; the portal-push crash needs a live settings change to\n  trigger and stays on the list unconfirmed.',
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "Procedure when the next release ships",
    text: "1. Update the `@gtkx/*` pins (root, spike, examples, template), then\n   `npm install && rm -rf node_modules/.gtkx && npm run codegen`;\n2. Run everything on Linux: `npm run typecheck && npm test`, `build:dist`,\n   `check:package`, plus the headless example proofs;\n3. Walk the live-workaround table: for each row check the removal condition,\n   delete the tag and the row together when it is met, and move the entry into\n   the history section above;\n4. Re-tag whatever survives (`RC2-WORKAROUND` → the new release) and update\n   `docs/upstream-gtkx.md` if an ask was answered.",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "1. The two layers",
    text: "```\nyour app\n   ├── react-native                    portable components\n   ├── react-native-gtkx/navigation    react-navigation adapter   (optional)\n   └── react-native-gtkx/adwaita       GTK widgets and primitives\n```\n\n**`react-native-gtkx/gtk` and `react-native-gtkx/adw`** owns the widget: diffing a requested stack\nof tags into `pushByTag` / `popToTag` / `replaceWithTags`, holding a popped\npage alive until its exit animation ends, bracketing transitions, reporting\nnative pops. It imports nothing from `@react-navigation/*`. `NavigationStack`\ntakes the visible stack as a prop, so a `useState` is a complete router.\n\n**`react-native-gtkx/navigation`** is an adapter: react-navigation state to\nan array of tags, a native pop to `StackActions.pop` (only when the tag is\nstill in state, otherwise it would double-pop), descriptors to titles, header\ncontent and `canPop`, plus dev warnings for options we ignore.\n\nThis is the same split the React Native ecosystem already uses:\n`react-native-screens` exposes primitives, `@react-navigation/native-stack`\nbinds them to a router. It is also what React Navigation's maintainer\nrecommended when he saw the project (u/satya164, on the r/reactnative\nannouncement): _keep your own navigator so you can provide options specific\nto GTK, unless you plan to match native stack API 1:1._\n\nThe consequence that matters: **the ceiling of react-navigation's model is\nnow only in the adapter, never in the primitive.** A GTK capability with no\ncounterpart in React Native does not have to be squeezed into someone\nelse's abstraction — it lives in the primitive layer and is reachable\ndirectly. See [../platform-layer.md](../platform-layer.md).",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "2. What an app can reach today",
    text: "Everything below the HeaderBar: each page hosts a full RN tree in its own\nlayout root. All of react-navigation's state mechanics: params,\n`setOptions`, dispatch, resets.\n\nStack options: `title`, `headerShown`, `headerButtons` (declarative native\nicon buttons), `headerLeft` / `headerRight` (ordinary RN content rendered\n_inside_ the HeaderBar), `gestureEnabled`.\n\nPast the options, the primitives: any GTK widget we bind, taking `style` so\nReact Native drives its position and its appearance, plus `wrapReactNative`\nfor widgets we do not re-export, plus a `ref` to the underlying\n`Adw.NavigationView`. There is no wall — a missing convenience costs a line,\nnot a fork.\n\n**Resolved since the first snapshot.** Kept here because the reasons are\nstill instructive:\n\n- _RN content could not size a chrome slot_ (HeaderBar start/end, sidebar\n  rows) — one root cause behind the whole `headerLeft`/`headerRight` class.\n  Fixed by the intrinsic-size root, now public as `IntrinsicContent`.\n- _`usePreventRemove` / `beforeRemove` desynced_, because the native pop had\n  already happened when state heard about it. Fixed through\n  `AdwNavigationPage:can-pop`: a prevented route cannot be popped by the\n  user at all, so there is nothing to race. Covered by\n  `tests/gtk/navigation/prevent-remove.gtk.test.tsx`.\n- _Unsupported options were ignored silently._ Fixed:\n  `src/navigation/option-warnings.ts` names the screen and the option in\n  development.\n- _Screen props and options had to be hand-rolled._ Fixed:\n  `createStackNavigator<ParamList>()` types `Stack.Screen`, its options and\n  the screen props (`examples/hn-app` relies on it).\n\n`createSidebarNavigator`'s own gaps — sidebar row rendering, collapsed\nmode and the static content header — are covered in §3 below, alongside\nthe `examples/tasks-app`/`examples/tasks-nav` narrative that found and\nthen closed them.\n\nOn typing, one clarification worth recording, since it was raised publicly.\nThe complaint was never that custom navigators cannot be typed — the docs\nshow how, and we follow them. It is that the upstream v7 signature is\n`createNavigatorFactory(Navigator: ComponentType<any>): (config?: any) => any`,\nso nothing flows out of the factory itself and the types have to come from\nannotating the navigator. React Navigation 8 replaces this with a real typed\nAPI (`NavigatorTypeBagBase`, `createScreenFactory`); adopting it is the\n`react-navigation-8` epic.",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "3. Still open",
    text: "Meaningful on this platform and not done yet: toolbar top-bar style (the\n`headerTransparent`/`headerShadowVisible` analogue), search-bar options\n(`Gtk.SearchBar` / `headerSearchBarOptions` — note v8 renamed its\n`onChangeText` to `onChange`), and deep links (they parse, but nothing\ndelivers a URL on the desktop yet). `animation: \"none\"` is done (a screen\noption, see docs/api.md).\n\n**Resolved by building `examples/tasks-app` (the gtkx tutorial's Tasks app,\nported), each with a small library change, not a workaround:**\n\n- _`Adw.Dialog` presentation_ — confirmed working. `AdwAboutDialog`/\n  `AdwAlertDialog`/`AdwPreferencesDialog`/`AdwShortcutsDialog` are already\n  `wrapReactNative`-wrapped; mounted with no Yoga ancestor anywhere in the\n  tree (this app has none — see the example's README), they hit\n  `wrapReactNative`'s \"bare\" branch and present correctly, verified live\n  with real screenshots (Preferences, Shortcuts). Nothing to fix here —\n  this item can be dropped from \"still open\" entirely.\n- _Breakpoints_ — a real `Adw.Breakpoint`, verified live collapsing the\n  window at a narrow width, but not through the navigator: through a new\n  `AppRegistry.runApplication({ breakpoints })` parameter instead (the\n  navigator itself still had no collapsed-mode concept at the time —\n  closed by `navigation-depth-2`, see below). Also found and recorded:\n  `AdwBreakpoint`'s `onApply`/`onUnapply` never fire under the\n  `@gtkx/vitest` headless-sway gtk test project, in any form tried (JSX\n  prop, imperative `Adw.Breakpoint`+`addBreakpoint`, a genuine `swaymsg`\n  resize) — but fire immediately in a real GNOME session. Treat it as\n  untestable headless today, not broken; see\n  `packages/react-native-gtkx/tests/gtk/bridge/auxiliary-elements.gtk.test.tsx`.\n  (`navigation-depth-2`'s own `collapseWidth`, below, sidesteps this\n  entirely — it drives `Adw.Breakpoint.addSetter` rather than\n  `onApply`/`onUnapply`, and that IS testable headless, see\n  `tests/gtk/adw/breakpoint.gtk.test.tsx`.)\n- _Actions and menus_ were never on this list by name, but turned out to\n  be the same kind of gap: `AppRegistry.runApplication` had no way to\n  attach a `GSimpleAction`, `actionAccels` or a `GtkShortcutController` to\n  the app/window it builds — required for a `Gio.Notification` action\n  button to route anywhere at all. Closed the same way, with\n  `applicationActions`/`actionAccels`/`windowActions`/`windowControllers`.\n\n**Resolved by building `examples/tasks-nav` (`navigation-depth-2` epic),\nclosing exactly what the tasks-app port above found still narrow:**\n\n- _Sidebar row rendering and collapsed mode_ — `createSidebarNavigator`'s\n  `SidebarNavigationOptions` was `{ title }` only: no per-row icon/color/\n  count, and no collapsed/breakpoint wiring of its own (tasks-app had to\n  reach `AppRegistry`'s `breakpoints` directly and drive `collapsed`\n  itself). Fixed: `icon`/`color`/`count` (rendered as `AdwActionRow`, the\n  same widget tasks-app's own hand-rolled sidebar used) and an opt-in\n  `collapseWidth` prop, driving collapse through the navigator itself via\n  a native `Adw.Breakpoint` — not a `useWindowDimensions` conditional; see\n  [../platform-layer.md](../platform-layer.md), \"Two ways to react to\n  size\", for the mechanism and why no `useBreakpoint` hook exists.\n- _One static content header shared by the whole navigator_ — the same\n  port's other finding: a filter toggle group vs. a back button,\n  depending on selection, did not fit one static header. The\n  `navigation-depth-2` PRD explicitly allowed this turning out to be a\n  structural gap; it wasn't — descriptor options already merge\n  navigator-level `screenOptions` with a screen's own `options` and\n  re-resolve on `navigation.setOptions()`, core react-navigation behavior.\n  `SidebarNavigationOptions` gained `headerLeft`/`headerRight`/\n  `headerTitle`, mirroring the stack navigator's own `headerLeft`/\n  `headerRight`; a screen that toggles local state and calls\n  `setOptions` in an effect gets a header that changes shape with its own\n  selection, no stack involved — confirming tasks-app's own conclusion\n  that a stack was never the right tool for the \"open an item\" case.\n  Caveat found while testing this: `setOptions` merges into the\n  previously resolved options rather than replacing them (see\n  docs/api.md).\n\n`examples/tasks-nav` is the same navigational shape as `examples/tasks-app`\n— smart views, colored user lists, an open-item editor — now written\nthrough `createSidebarNavigator` instead of directly on\n`AdwNavigationSplitView`/`AdwActionRow`.\n\n**Resolved by `collapse-nav` (a live bug report on `examples/tasks-nav`),\none property lower than `collapseWidth` itself:** `collapseWidth` flips\n`AdwNavigationSplitView.collapsed` correctly, but `showContent` — WHICH\npane is visible while collapsed — was only half-wired: a row click already\nrevealed content, but nothing observed the split view's own back\naffordance putting it back, and a plain programmatic `navigate()` (no row\nclick) did not reveal content at all. On read, this looked like it might\nbe the same \"the breakpoint effect sets only `collapsed`\" gap all over\nagain; it mostly was not — see `sidebar.tsx`'s own file header for what was\nalready there. Three questions were settled empirically, with a throwaway\nGTK test written BEFORE any implementation code, rather than assumed from\nlibadwaita's docs:\n\n- _Does a cold-started, already-collapsed window default to content or the\n  sidebar?_ Sidebar — `showContent` defaults to `false`, confirmed by\n  mounting a window already narrower than `collapseWidth` and reading the\n  property on first layout, before any code (ours or the app's) ever wrote\n  to it. No fix needed.\n- _Does resizing back above `collapseWidth` and back below it need to\n  reset `showContent` or the selection?_ No — both persist across the\n  round trip, confirmed the same way (resize wide, resize narrow again,\n  read the property). This is deliberate, not an oversight: it is the same\n  size-class persistence a mobile master-detail app relies on (open an\n  item, rotate to landscape and back, still on that item), which is\n  exactly the \"the way a mobile app does\" behavior the bug report asked\n  for. Resetting it would have fought the platform's own default for no\n  benefit.\n- _Does an app need to observe or control the collapsed pane at all?_ One\n  direction, yes: going back. TabRouter's `state` never changes when the\n  user backs out of collapsed content (nothing is removed, the same route\n  stays focused), so there is no existing react-navigation mechanism for\n  an app to notice it happened — unlike a stack pop, which state itself\n  already reveals through the route array shrinking. A new event,\n  `sidebarShown` (`SidebarNavigationEventMap`, the same `navigation.emit`/\n  `addListener` protocol `StackNavigationEventMap`'s `transitionStart`/\n  `transitionEnd` already established — not a second protocol), fires on\n  the active route for exactly this. The forward direction (content being\n  revealed) got no event: it is already an ordinary state change an app\n  can observe the normal way, so an event there would be pure duplication.\n\nThe echo risk this raises — state → widget and widget → state both touch\nthe same property, could they retrigger each other? — resolved the same\nway the stack navigator's own doc warns about it: by a value asymmetry, not\na flag. State → widget only ever WRITES `true`; widget → state only ever\nREACTS to `false`. Two disjoint values, so neither side can mistake the\nother's write for the other direction.\n\nFixed: `sidebar.tsx`'s `state.index` effect now also calls\n`showContentIfCollapsed()` (previously only `onRowActivated` did, so a\nclick worked but a programmatic navigation left the user stranded on the\nsidebar exactly like the report — a real, reproducible gap, not merely a\ntheoretical one); `onNotifyShowContent` is observed and re-emitted as\n`sidebarShown`. `examples/gallery` (no `collapseWidth`) is untouched by\nconstruction — every changed path checks `getCollapsed()` /\n`collapseWidth !== undefined` live first. See\n`tests/gtk/navigation/sidebar-collapse.gtk.test.tsx` for the automated\nversion of all four findings above, and docs/api.md for the public shape.\n\n**Found while building `examples/tasks-nav`, narrower, still open:**\n\n- _The sidebar PANE's own chrome has no customization hook_ — its\n  `AdwToolbarView`'s `AdwHeaderBar` is hard-coded\n  (`src/navigation/sidebar.tsx`); a navigator consumer can set\n  `sidebarTitle` (a string) on it and nothing else. `examples/tasks-nav`'s\n  \"New List\" action wanted to live there (matching tasks-app's own\n  `SidebarHeader` component) but had to go on the content header instead,\n  via the navigator-level `headerButtons` prop. Not on the PRD's\n  checklist, so not built.\n- _Toasts_ — no `AdwToastOverlay`/`Adw.Toast` convenience exists anywhere\n  in `react-native-gtkx` (upstream's own tutorial reaches for\n  `@gtkx/components/adw`'s `ToastProvider`/`useToast`, a package this repo\n  does not depend on). `examples/tasks-app/src/toast.tsx` is a local\n  stand-in; the toast's underlying state change works and is verified live,\n  but the toast's own visual appearance could not be confirmed on screen\n  in that session, for a reason not yet root-caused. Worth a real fix (or\n  at least a live confirmation) before another app leans on it.\n\n**Meaningless on desktop, skip forever:** status-bar and home-indicator\noptions, large titles, blur effects, gesture direction, form sheets,\nback-button labels. `headerBackButtonMenuEnabled` is free — libadwaita's\nback button already shows a history menu.",
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
    doc: "docs/gtkx-rc2-notes.md",
    heading: "RC2-WORKAROUND(use-signal-stale-handler)",
    text: "`useSignal` routes the handler through React's `useEffectEvent`; `react-reconciler@0.33.0` only refreshes it in `commitBeforeMutationEffects` for `case 0` (FunctionComponent) — `case 11` (ForwardRef) and `case 15` (SimpleMemoComponent) fall through unrefreshed, so any `useEffectEvent` in a `memo`/`forwardRef` component is pinned to its mount closure forever (our `ScrollView` is a `forwardRef` with the `useSignal` calls inside it — confirmed upstream, gtkx-org/gtkx#467) — a fetch-fed FlatList empties itself on the first scroll — our workaround: `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx's — removed when: A stable React 19.3 (React fixed the refresh on the 19.3 line; no stable gtkx 0.34.x yet)",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "RC2-WORKAROUND(runtime-dedupe)",
    text: "Two bundled copies of the gtkx runtime still double-init GLib and abort (`g_log_set_writer_func` called twice); nothing guards against it — our workaround: `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits — removed when: Idempotent runtime init upstream, or an error that names the duplicate",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "RC2-WORKAROUND(renderhook-no-window)",
    text: "`renderHook` still mounts into a bare `Gtk.Box`, so window-dependent APIs have no toplevel to read — our workaround: Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`); packaged for consumers as `renderHookWithWindow` (`react-native-gtkx/testing`) — removed when: `renderHook` mounts into the same harness window `render` uses",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "RC2-WORKAROUND(graphene-rect-nested-boxed-props)",
    text: '`new Graphene.Rect({ origin: new Graphene.Point(...), size: new Graphene.Size(...) })` hits the same native "Expected an Object for Boxed field write type, got Object" as the `gsk-colorstop-boxed-write` row below — a boxed struct\'s constructor writing another boxed value into one of its own fields — our workaround: `gtkx/bridge/svg-node.ts` builds the clip rect through `Graphene.Rect.alloc().init(x, y, w, h)` instead — a working escape hatch `Gsk.ColorStop` does not have — removed when: Upstream fixes boxed-struct fields that are themselves another boxed type',
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "RC2-WORKAROUND(gsk-colorstop-boxed-write)",
    text: 'Constructing a `Gsk.ColorStop` (an inline `{ float offset; GdkRGBA color; }` boxed struct) crashes in the native addon writing the `color` field — "Expected an Object for Boxed field write type, got Object". Verified through three independent paths (constructor props, the property setter, and skipping `ColorStop` for a plain `{offset, color}` object, which fails differently with "No native handle associated with Object" — the array marshaling genuinely needs a native-backed instance per element) — our workaround: `gtkx/bridge/svg-node.ts`\'s `makeColorStop` catches the throw and returns `null`; a gradient with zero constructible stops paints nothing for that fill/stroke instead of crashing (the same path as an unresolved `url(#missing)` reference) — SVG `<LinearGradient>`/`<RadialGradient>` ship with this degradation, not cut from the API — removed when: Upstream fixes boxed-struct fields that are themselves another boxed type (nested embed, not a pointer)',
  },
  {
    doc: "docs/api.md",
    heading: "View",
    text: "View — GTK implementation: GtkBox (RnGtkxViewBox). Supported: `style`, `onLayout`, `testID`, children, `pointerEvents` (auto/none/box-none/box-only — mapped onto GTK picking: can-target + a contains() vfunc override; also honored from `style.pointerEvents`, the prop wins). Differences from RN: nesting another pointerEvents inside a box-only view is not supported",
  },
  {
    doc: "docs/api.md",
    heading: "Text",
    text: "Text — GTK implementation: GtkLabel (Pango). Supported: wrap, `numberOfLines` (ellipsize END), `textAlign`, font styles, `onLayout`, `testID`. Differences from RN: nested `Text` elements are concatenated without per-span styles; text is always ellipsizable (shrinkable in narrow windows)",
  },
  {
    doc: "docs/api.md",
    heading: "Image",
    text: 'Image — GTK implementation: GtkPicture. Supported: `source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`; **`.svg` files load like any other image** — `Gdk.Texture.newFromFilename` rasterizes them via librsvg, no extra code needed (for building vector graphics from state instead of a file, see the "Svg" section below — a separate import, not part of this table). Differences from RN: no synchronous size from remote images (style sets the size, as in RN); cache is not size-limited yet',
  },
  {
    doc: "docs/api.md",
    heading: "TextInput",
    text: "TextInput — GTK implementation: GtkEntry / GtkTextView. Supported: controlled/uncontrolled (`value`/`defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus`/`onBlur`, `placeholder` (own dim overlay in multiline — GtkTextView has none), `secureTextEntry`, `editable`, `keyboardType`, `multiline`, `clearButtonMode` (GtkEntry's built-in clear icon; RN ships this on iOS only) (real GtkTextView: word wrap, internal scroll, Enter inserts a newline and never fires onSubmitEditing — RN semantics). Differences from RN: multiline needs a height in the style (as RN recommends)",
  },
  {
    doc: "docs/api.md",
    heading: "Pressable",
    text: "Pressable — GTK implementation: GtkFixed + GestureClick/Motion. Supported: `onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn/Out`, `disabled`, function-form `style`/`children` receiving `{pressed, hovered}`. Differences from RN: —",
  },
  {
    doc: "docs/api.md",
    heading: "TouchableOpacity",
    text: "TouchableOpacity — GTK implementation: on top of Pressable. Supported: `activeOpacity`. Differences from RN: —",
  },
  {
    doc: "docs/api.md",
    heading: "ScrollView",
    text: "ScrollView — GTK implementation: GtkScrolledWindow. Supported: vertical/`horizontal`, `contentContainerStyle`, `onScroll`, `onContentSizeChange`, `stickyHeaderIndices` (RN model: the REAL child is translated and painted on top — no duplicate), ref: `scrollTo`/`scrollToEnd` (`ScrollViewHandle`). Differences from RN: `animated` in scrollTo is ignored",
  },
  {
    doc: "docs/api.md",
    heading: "FlatList",
    text: "FlatList — GTK implementation: windowed core on ScrollView. Supported: virtualization (`estimatedItemSize` or `getItemLayout`, **`windowSize`/`initialNumToRender` — the primary scroll-performance knobs**, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`), `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`, `ListHeader/Footer/EmptyComponent`, `onEndReached(-Threshold)`, `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`), `inverted` (RN chat semantics: opens at `data[0]`, stays pinned on prepend), `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`, ref: `scrollToIndex`/`scrollToItem`/`scrollToOffset` + ScrollView methods (`FlatListHandle`). Differences from RN: 1000 rows mount windowed in ~120 ms (v1 full mount was 879 ms); `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure and a wider window means fewer mount+reflow bursts per scrolled pixel (measured: −21% churn, late frames 10/s → 7.7/s); rows beyond the visible ones are mounted `maxToRenderPerBatch` (10) at a time every `updateCellsBatchingPeriod` (50) ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one; no pull gesture — `onRefresh` must be app-triggered; an inverted list shorter than its viewport anchors to the top, not the bottom",
  },
  {
    doc: "docs/api.md",
    heading: "SectionList",
    text: "SectionList — GTK implementation: on top of FlatList. Supported: `sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`). Differences from RN: viewability props are not exposed (section-aware ViewTokens pending)",
  },
  {
    doc: "docs/api.md",
    heading: "Switch",
    text: "Switch — GTK implementation: GtkSwitch. Supported: `value`/`onValueChange`, `disabled`. Differences from RN: sized by the GTK theme, not iOS metrics",
  },
  {
    doc: "docs/api.md",
    heading: "ActivityIndicator",
    text: "ActivityIndicator — GTK implementation: GtkSpinner. Supported: `animating`, `size` (small/large/number). Differences from RN: no `color` yet",
  },
  {
    doc: "docs/api.md",
    heading: "Modal",
    text: "Modal — GTK implementation: modal GtkWindow (portal). Supported: `visible`, `onRequestClose` (Escape/close button), `title`, `width`/`height`; independently resizable with relayout. Differences from RN: desktop semantics: a separate window, not an overlay; `transparent`/`animationType` are no-ops",
  },
  {
    doc: "docs/api.md",
    heading: "Animated.View",
    text: "Animated.View — GTK implementation: direct widget calls. Supported: `opacity` and the whole `transform` array — `translateX/Y`, `scale`, `scaleX`, `scaleY`, `rotate`/`rotateZ` — driven by Animated nodes, bypassing React (an angle comes from `interpolate` with a `deg`/`rad` outputRange). Differences from RN: `rotateX`/`rotateY`/`perspective` (3D), `skewX`/`skewY` and `matrix` are not supported, and the transform origin is always the view's centre (no `transformOrigin`)",
  },
  {
    doc: "docs/api.md",
    heading: "SafeAreaView",
    text: "SafeAreaView — GTK implementation: = View. Supported: —. Differences from RN: no notches on desktop",
  },
  {
    doc: "docs/api.md",
    heading: "StatusBar",
    text: "StatusBar — GTK implementation: null. Supported: —. Differences from RN: no status bar",
  },
  {
    doc: "docs/api.md",
    heading: "Root",
    text: "Root — GTK implementation: internal root. Supported: `width`/`height`. Differences from RN: extension: required by the test harness",
  },
  {
    doc: "docs/api.md",
    heading: "NestedRoot",
    text: "NestedRoot — GTK implementation: internal root. Supported: —. Differences from RN: extension: a Yoga root inside any GTK container slot (navigation pages, custom containers); the slot allocation is the viewport",
  },
  {
    doc: "docs/api.md",
    heading: "IntrinsicRoot",
    text: "IntrinsicRoot — GTK implementation: internal root. Supported: —. Differences from RN: extension: a content-sized Yoga root for chrome slots (HeaderBar start/end) — reports its content size to GTK",
  },
  {
    doc: "docs/api.md",
    heading: "StyleSheet",
    text: "StyleSheet — Supported: `create`, `flatten`, `compose`, `absoluteFill(Object)`, `hairlineWidth`. Differences: —",
  },
  {
    doc: "docs/api.md",
    heading: "PlatformColor",
    text: 'PlatformColor — Supported: Adwaita variables: `PlatformColor("accent-bg-color")` → `var(--...)`, `@named`. Differences: names are Adwaita, not iOS/Android',
  },
  {
    doc: "docs/api.md",
    heading: "AppRegistry",
    text: 'AppRegistry — Supported: `registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome,applicationActions,actionAccels,windowActions,windowControllers,breakpoints})`, `getAppKeys`. Differences: desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app\'s HeaderBars (navigation) become the chrome. `applicationActions`/`actionAccels` reach the underlying `GtkApplication` (`app.*` actions — what a `Gio.Notification` action button targets); `windowActions`/`windowControllers` reach the window (`win.*` actions, a window-scoped `GtkShortcutController`); `breakpoints` reaches `AdwApplicationWindow`\'s own prop and only does anything under `chrome: "content"` (a dev warning fires otherwise)',
  },
  {
    doc: "docs/api.md",
    heading: "Platform",
    text: 'Platform — Supported: `OS: "linux"`, `Version` (GTK), `select` (linux → native → default), `isTV`, `isTesting`. Differences: —',
  },
  {
    doc: "docs/api.md",
    heading: "Dimensions",
    text: 'Dimensions — Supported: `get("window"/"screen")`, `addEventListener("change")`. Differences: main window only (transient windows are ignored)',
  },
  {
    doc: "docs/api.md",
    heading: "useWindowDimensions",
    text: "useWindowDimensions — Supported: reactive main-window dimensions. Differences: —",
  },
  {
    doc: "docs/api.md",
    heading: "Appearance",
    text: "Appearance — Supported: `getColorScheme`, `setColorScheme` (AdwStyleManager), `addChangeListener`. Differences: —",
  },
  {
    doc: "docs/api.md",
    heading: "useColorScheme",
    text: "useColorScheme — Supported: reactive theme. Differences: —",
  },
  {
    doc: "docs/api.md",
    heading: "AppState",
    text: "AppState — Supported: `currentState` active/background, `addEventListener`. Differences: driven by the window's `is-active`",
  },
  {
    doc: "docs/api.md",
    heading: "Alert",
    text: "Alert — Supported: `alert(title, message, buttons, options)` → Adw.AlertDialog. Differences: `cancel`/`destructive`/`isPreferred` styles",
  },
  {
    doc: "docs/api.md",
    heading: "Linking",
    text: 'Linking — Supported: `openURL`, `canOpenURL` (http/https/mailto/file), `getInitialURL` (null), `addEventListener("url")`. Differences: system launcher; no deep-link delivery on desktop yet — "url" subscriptions never fire',
  },
  {
    doc: "docs/api.md",
    heading: "InteractionManager",
    text: "InteractionManager — Supported: `runAfterInteractions(task?)` (cancellable, then-able), `createInteractionHandle`/`clearInteractionHandle`, `addListener`. Differences: navigation transitions register interactions, so screen work deferred with `runAfterInteractions` waits for the push/pop slide",
  },
  {
    doc: "docs/api.md",
    heading: "DevSettings",
    text: "DevSettings — Supported: `addMenuItem(title, handler)` (entries in the Dev Menu — Ctrl+Shift+D in `run-linux --dev`, the react-native-windows shortcut), `reload(reason?)`. Differences: silent no-ops in release builds, like RN",
  },
  {
    doc: "docs/api.md",
    heading: "I18nManager",
    text: "I18nManager — Supported: `isRTL` (live: GTK's read of the locale text direction), `doLeftAndRightSwapInRTL`, `getConstants`. Differences: `allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops (mobile persistence has no desktop store)",
  },
  {
    doc: "docs/api.md",
    heading: "BackHandler",
    text: 'BackHandler — Supported: `addEventListener("hardwareBackPress")`, `exitApp`. Differences: no hardware back key on desktop — subscriptions are honored but nothing fires them yet',
  },
  {
    doc: "docs/api.md",
    heading: "Animated",
    text: "Animated — Supported: `Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`, `loop`, `interpolate` (numbers and deg/rad strings, clamp/extend/identity). Differences: `useNativeDriver` is ignored (with a warning); the direct path is native-speed anyway",
  },
  {
    doc: "docs/api.md",
    heading: "Easing",
    text: "Easing — Supported: linear/ease/quad/cubic/in/out/inOut/bezier. Differences: —",
  },
  {
    doc: "docs/api.md",
    heading: "version",
    text: "version — Supported: package version. Differences: extension",
  },
] as const satisfies readonly DocChunk[]
