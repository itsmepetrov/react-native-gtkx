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
      "`source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`",
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
      "`opacity` and `transform: [{translateX/translateY}]` driven by Animated nodes, bypassing React",
    differences:
      "scale/rotate — planned branch (rc.2); translate is clamped to the parent's bounds — an animation cannot change layout (paint overflow returns with branch B)",
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
      "`registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome})`, `getAppKeys`",
    differences:
      'desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app\'s HeaderBars (navigation) become the chrome',
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
    reason: "child-only (denylist — see scripts/widget-surface/classify.mjs)",
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
    reason: "child-only (denylist — see scripts/widget-surface/classify.mjs)",
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
    text: "| Export              | GTK implementation             | Supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Differences from RN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |\n| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `View`              | GtkBox (RnGtkxViewBox)         | `style`, `onLayout`, `testID`, children, `pointerEvents` (auto/none/box-none/box-only — mapped onto GTK picking: can-target + a contains() vfunc override; also honored from `style.pointerEvents`, the prop wins)                                                                                                                                                                                                                                                                                                                                                                                                                       | nesting another pointerEvents inside a box-only view is not supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |\n| `Text`              | GtkLabel (Pango)               | wrap, `numberOfLines` (ellipsize END), `textAlign`, font styles, `onLayout`, `testID`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | nested `Text` elements are concatenated without per-span styles; text is always ellipsizable (shrinkable in narrow windows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |\n| `Image`             | GtkPicture                     | `source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`                                                                                                                                                                                                                                                                                                                                                                                                                                           | no synchronous size from remote images (style sets the size, as in RN); cache is not size-limited yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |\n| `TextInput`         | GtkEntry / GtkTextView         | controlled/uncontrolled (`value`/`defaultValue`), `onChangeText`, `onSubmitEditing`, `onFocus`/`onBlur`, `placeholder` (own dim overlay in multiline — GtkTextView has none), `secureTextEntry`, `editable`, `keyboardType`, `multiline`, `clearButtonMode` (GtkEntry's built-in clear icon; RN ships this on iOS only) (real GtkTextView: word wrap, internal scroll, Enter inserts a newline and never fires onSubmitEditing — RN semantics)                                                                                                                                                                                           | multiline needs a height in the style (as RN recommends)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |\n| `Pressable`         | GtkFixed + GestureClick/Motion | `onPress(In/Out)`, `onLongPress` (`delayLongPress`), `onHoverIn/Out`, `disabled`, function-form `style`/`children` receiving `{pressed, hovered}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |\n| `TouchableOpacity`  | on top of Pressable            | `activeOpacity`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |\n| `ScrollView`        | GtkScrolledWindow              | vertical/`horizontal`, `contentContainerStyle`, `onScroll`, `onContentSizeChange`, `stickyHeaderIndices` (RN model: the REAL child is translated and painted on top — no duplicate), ref: `scrollTo`/`scrollToEnd` (`ScrollViewHandle`)                                                                                                                                                                                                                                                                                                                                                                                                  | `animated` in scrollTo is ignored                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |\n| `FlatList`          | windowed core on ScrollView    | virtualization (`estimatedItemSize` or `getItemLayout`, **`windowSize`/`initialNumToRender` — the primary scroll-performance knobs**, `maxToRenderPerBatch`/`updateCellsBatchingPeriod`), `data`/`renderItem`/`keyExtractor`/`extraData`, `ItemSeparatorComponent`, `ListHeader/Footer/EmptyComponent`, `onEndReached(-Threshold)`, `onViewableItemsChanged`/`viewabilityConfig` (`ViewToken`), `inverted` (RN chat semantics: opens at `data[0]`, stays pinned on prepend), `refreshing`/`onRefresh`, `horizontal`, `stickyHeaderIndices`, ref: `scrollToIndex`/`scrollToItem`/`scrollToOffset` + ScrollView methods (`FlatListHandle`) | 1000 rows mount windowed in ~120 ms (v1 full mount was 879 ms); `windowSize` defaults to **11**, not RN's 5 — desktop has no mobile memory pressure and a wider window means fewer mount+reflow bursts per scrolled pixel (measured: −21% churn, late frames 10/s → 7.7/s); rows beyond the visible ones are mounted `maxToRenderPerBatch` (10) at a time every `updateCellsBatchingPeriod` (50) ms, so a flick or a long `scrollToOffset` fills its window over several frames instead of stalling one; no pull gesture — `onRefresh` must be app-triggered; an inverted list shorter than its viewport anchors to the top, not the bottom |\n| `SectionList`       | on top of FlatList             | `sections`, `renderSectionHeader`, sticky section headers by default (`stickySectionHeadersEnabled`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | viewability props are not exposed (section-aware ViewTokens pending)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |\n| `Switch`            | GtkSwitch                      | `value`/`onValueChange`, `disabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | sized by the GTK theme, not iOS metrics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |\n| `ActivityIndicator` | GtkSpinner                     | `animating`, `size` (small/large/number)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no `color` yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |\n| `Modal`             | modal GtkWindow (portal)       | `visible`, `onRequestClose` (Escape/close button), `title`, `width`/`height`; independently resizable with relayout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | desktop semantics: a separate window, not an overlay; `transparent`/`animationType` are no-ops                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |\n| `Animated.View`     | direct widget calls            | `opacity` and `transform: [{translateX/translateY}]` driven by Animated nodes, bypassing React                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | scale/rotate — planned branch (rc.2); translate is clamped to the parent's bounds — an animation cannot change layout (paint overflow returns with branch B)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |\n| `SafeAreaView`      | = View                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no notches on desktop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |\n| `StatusBar`         | null                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no status bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |\n| `Root`              | internal root                  | `width`/`height`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | extension: required by the test harness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |\n| `NestedRoot`        | internal root                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | extension: a Yoga root inside any GTK container slot (navigation pages, custom containers); the slot allocation is the viewport                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |\n| `IntrinsicRoot`     | internal root                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | extension: a content-sized Yoga root for chrome slots (HeaderBar start/end) — reports its content size to GTK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |",
  },
  {
    doc: "docs/api.md",
    heading: "API modules",
    text: '| Export                | Supported                                                                                                                                         | Differences                                                                                                                                               |\n| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `StyleSheet`          | `create`, `flatten`, `compose`, `absoluteFill(Object)`, `hairlineWidth`                                                                           | —                                                                                                                                                         |\n| `PlatformColor`       | Adwaita variables: `PlatformColor("accent-bg-color")` → `var(--...)`, `@named`                                                                    | names are Adwaita, not iOS/Android                                                                                                                        |\n| `AppRegistry`         | `registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome})`, `getAppKeys`                                             | desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app\'s HeaderBars (navigation) become the chrome |\n| `Platform`            | `OS: "linux"`, `Version` (GTK), `select` (linux → native → default), `isTV`, `isTesting`                                                          | —                                                                                                                                                         |\n| `Dimensions`          | `get("window"/"screen")`, `addEventListener("change")`                                                                                            | main window only (transient windows are ignored)                                                                                                          |\n| `useWindowDimensions` | reactive main-window dimensions                                                                                                                   | —                                                                                                                                                         |\n| `Appearance`          | `getColorScheme`, `setColorScheme` (AdwStyleManager), `addChangeListener`                                                                         | —                                                                                                                                                         |\n| `useColorScheme`      | reactive theme                                                                                                                                    | —                                                                                                                                                         |\n| `AppState`            | `currentState` active/background, `addEventListener`                                                                                              | driven by the window\'s `is-active`                                                                                                                        |\n| `Alert`               | `alert(title, message, buttons, options)` → Adw.AlertDialog                                                                                       | `cancel`/`destructive`/`isPreferred` styles                                                                                                               |\n| `Linking`             | `openURL`, `canOpenURL` (http/https/mailto/file), `getInitialURL` (null), `addEventListener("url")`                                               | system launcher; no deep-link delivery on desktop yet — "url" subscriptions never fire                                                                    |\n| `InteractionManager`  | `runAfterInteractions(task?)` (cancellable, then-able), `createInteractionHandle`/`clearInteractionHandle`, `addListener`                         | navigation transitions register interactions, so screen work deferred with `runAfterInteractions` waits for the push/pop slide                            |\n| `DevSettings`         | `addMenuItem(title, handler)` (entries in the Dev Menu — Ctrl+Shift+D in `run-linux --dev`, the react-native-windows shortcut), `reload(reason?)` | silent no-ops in release builds, like RN                                                                                                                  |\n| `I18nManager`         | `isRTL` (live: GTK\'s read of the locale text direction), `doLeftAndRightSwapInRTL`, `getConstants`                                                | `allowRTL`/`forceRTL`/`swapLeftAndRightInRTL` are accepted no-ops (mobile persistence has no desktop store)                                               |\n| `BackHandler`         | `addEventListener("hardwareBackPress")`, `exitApp`                                                                                                | no hardware back key on desktop — subscriptions are honored but nothing fires them yet                                                                    |\n| `Animated`            | `Value`, `timing`, `spring`, `sequence`, `parallel`, `delay`, `loop`, `interpolate` (numbers and deg/rad strings, clamp/extend/identity)          | `useNativeDriver` is ignored (with a warning); the direct path is native-speed anyway                                                                     |\n| `Easing`              | linear/ease/quad/cubic/in/out/inOut/bezier                                                                                                        | —                                                                                                                                                         |\n| `version`             | package version                                                                                                                                   | extension                                                                                                                                                 |\n\nStyles (which keys go where and what is unsupported) — [style system table](../packages/react-native-gtkx/src/style/README.md).',
  },
  {
    doc: "docs/api.md",
    heading: "Key differences from React Native (summary)",
    text: '1. **Desktop, not mobile**: `Modal` is a real window; `runApplication` accepts a title and dimensions; gestures are mouse-driven (hover works, no touch gestures);\n2. **Node.js runtime**: all of npm/Node is available (fs, sqlite, napi) — "native modules" are written as regular Node modules; RN libraries with iOS/Android code do not work;\n3. **Layout is exactly RN\'s**: every container runs a custom GtkLayoutManager that obeys only the Yoga engine — GTK widget minimums never leak into the layout, windows shrink freely, and `Dimensions.get("window")` reports the app viewport (the window\'s content area under the headerbar, like RN\'s app window);\n4. **Text**: the ellipsis is opt-in via `numberOfLines`, exactly like RN; plain text wraps naturally and an unbreakable word wider than its box clips to it (text leaves clip; containers keep paint-overflow);\n5. **transform** currently supports only translate, in `Animated.View` — and it is paint-only, like RN: an animated child honestly draws past its container over siblings (later siblings stay on top, RN\'s default z-order) without moving any ancestor;\n6. **Animations never auto-stop**: the desktop "reduce animations" hint is not applied automatically (GTK-side animations are kept on to match `Animated`, which runs on its own timers) — honoring reduced motion stays an app-level opt-in, as in RN;\n7. **Lists are windowed like RN\'s**: FlatList/SectionList mount only the rows around the viewport (prefix-sum offsets, `estimatedItemSize` refined by real measurements or exact `getItemLayout`); sticky headers translate the REAL widget (no duplicate) and `inverted` follows the RN chat contract — `contentOffset` counts from the end where `data[0]` renders. The one RefreshControl compromise: desktop has no pull gesture, so `refreshing`/`onRefresh` are API-compatible but the trigger is app chrome (a button/shortcut);\n8. The package ships compiled (`dist/`: ESM + `.d.ts` alongside, sources embedded in the maps); consumers — Metro (`react-native-gtkx/metro` preset) and vite (preset) — both consume the built output. Requires Node ≥ 24 (the gtkx runtime floor; the run-linux host also relies on `module.registerHooks`).',
  },
  {
    doc: "docs/api.md",
    heading: "Navigation (`react-native-gtkx/navigation`)",
    text: 'A [react-navigation](https://reactnavigation.org) stack navigator backed by\n`Adw.NavigationView` — native Adwaita page transitions, the HeaderBar back\nbutton and back gestures stay in sync with react-navigation state (the\nreact-native-windows / native-stack model). Requires the optional peer\n`@react-navigation/native` (v8).\n\n`@react-navigation/native@8` itself peers on `react-native: "*"` (unlike\n`@react-navigation/core@8`, which has no react-native peer at all). If your\napp has no `react-native` package anywhere in its tree — a vite+gtkx app\nwith no Metro side, exactly what `examples/gallery` demonstrates —\n`npm install` will print an unmet-peer-dependency warning for it. This is\nharmless: react-native-gtkx never imports anything from the `react-native`\npackage, so nothing actually needs it at runtime; the warning is npm being\nstrict about a peer range upstream declared loosely (`"*"` — any version\nsatisfies it, npm just wants the package present at all).\n\n```tsx\nimport { NavigationContainer } from "@react-navigation/native"\nimport { createStackNavigator } from "react-native-gtkx/navigation"\n\n// Run the app with chrome: "content" — the navigator\'s HeaderBars ARE the\n// window chrome (the default system chrome would add a second titlebar):\n// AppRegistry.runApplication(name, { ..., chrome: "content" })\n\nconst Stack = createStackNavigator()\n\nconst App = () => (\n  <NavigationContainer>\n    <Stack.Navigator>\n      <Stack.Screen\n        name="Home"\n        component={HomeScreen}\n      />\n      <Stack.Screen\n        name="Details"\n        component={DetailsScreen}\n        options={{ title: "Details page" }}\n      />\n    </Stack.Navigator>\n  </NavigationContainer>\n)\n```\n\n- Screen `options`: `title` (HeaderBar title, defaults to the route name),\n  `headerShown` (default true).\n- `createSidebarNavigator` — the desktop drawer equivalent on\n  `Adw.NavigationSplitView`: a persistent native sidebar (GtkListBox with\n  Adwaita `navigation-sidebar` styling) selects between parallel screens\n  (TabRouter semantics). Navigator prop `sidebarTitle`; screen `options`:\n  `title`. Run the app with `chrome: "content"` so the split view\'s\n  HeaderBars are the window chrome (`examples/gallery` is built on it).\n  Navigator prop `headerButtons` packs declarative native buttons into the\n  content HeaderBar end (`{id, icon, tooltip, onPress}`, `icon` is an\n  Adwaita symbolic name) — the gallery\'s color-scheme toggle uses it.\n- Stack screen options `headerLeft` / `headerRight`: `() => ReactNode` —\n  real RN content in the HeaderBar (inputs included), hosted by an\n  intrinsic-size root; `headerButtons` render after `headerRight`\n  (hn-app\'s header search filter is the demo).\n- Stack screen option `gestureEnabled: false` disables the native back\n  button, Escape and the back gesture for that screen (the page\'s\n  Adwaita `can-pop`); a programmatic `goBack` still pops. `usePreventRemove`\n  works through the same mechanism — a prevented route reports\n  `can-pop: false`, so no native pop can race react-navigation state; the\n  route pops once the app lifts the guard (e.g. after its own\n  confirmation dialog).\n- Stack screen option `animation` maps onto `Adw.NavigationView`\'s\n  `animate-transitions` — GTK has exactly one transition style, not a\n  choice of styles like iOS/Android, so the option collapses to a\n  boolean: `"none"` turns transitions off, any other value (including\n  native-stack\'s own style names, e.g. `"slide_from_bottom"`, `"fade"`)\n  turns them on, with the standard Adwaita transition rather than the\n  one asked for. Requesting a specific type still animates — it is not\n  silently treated as `"none"` — and warns once in development.\n  `animate-transitions` is a property of the whole view, not a per-page\n  one, so there is no per-screen granularity to offer: the value used is\n  read from whichever screen is currently on top of the visible stack,\n  recomputed on every navigation. Setting it once via `screenOptions`\n  (the same value for every screen) is the reliable way to use this —\n  the per-screen case only matters if different screens genuinely\n  disagree, and even then only the active one\'s value is observed.\n  Interactive swipe-back gestures always animate regardless of this\n  setting — Adwaita\'s own behavior, not overridable here.\n- The factories are typed: `createStackNavigator<ParamList>()` gives\n  typed `Screen` configs and `StackScreenProps<ParamList, Route>` for\n  screen components (`SidebarScreenProps` likewise).\n- The stack navigator emits `transitionStart` / `transitionEnd` on a\n  screen\'s `navigation` object, matching `@react-navigation/stack` and\n  `@react-navigation/native-stack` exactly: `{ data: { closing: boolean } }`,\n  `closing: false` for the screen being pushed in, `closing: true` for the\n  screen being popped out. A screen that stays mounted without actually\n  entering or leaving (e.g. the screen underneath a push) gets neither\n  event, same as upstream. Two things worth knowing before relying on\n  timing:\n  - **`transitionEnd` is tied to `AdwNavigationPage`\'s own `shown`/`hidden`\n    signals** — contrary to an earlier version of this page, Adwaita DOES\n    expose a transition-finished signal (four of them, in fact: `showing`,\n    `shown`, `hiding`, `hidden`, all per-page). `transitionEnd` on the\n    entering screen fires on that screen\'s `shown`; on the leaving screen\n    it fires on `hidden`. `transitionDuration` (default 400 ms) is a\n    fallback only, used when a page\'s own signal never arrives — a\n    signal-less environment, or a page skipped entirely by a multi-hop\n    pop (popping past an intermediate screen never fires anything on it,\n    since it was never the one actually on screen during the transition).\n    When transitions are not animated, the real signals still fire —\n    immediately — so `transitionEnd` is not delayed by the fallback\n    window either.\n  - **Native pops do not fire these events at all today.** A user-driven\n    pop (the Adwaita back button, Escape, the back gesture) is handled by\n    the widget itself before this package\'s code is told about it, so\n    there is nothing to hook a `transitionStart` into. Only\n    programmatic navigation (`navigate`, `goBack`, `dispatch`, …) fires\n    `transitionStart`/`transitionEnd`.\n- The rest of the react-navigation surface — `useNavigation`, `useRoute`,\n  `useFocusEffect`, `useIsFocused`, `useNavigationContainerRef`,\n  `CommonActions`, `StackActions`, `usePreventRemove`, `NavigationContainer`\n  and everything else — comes from `@react-navigation/native` directly, not\n  from this package. **Breaking change**: earlier versions re-exported a\n  subset of these names from `react-native-gtkx/navigation`; the re-export\n  was removed because it was never complete (anything beyond the subset\n  still required importing from `@react-navigation/native`, so it was one\n  more place to look rather than a convenience). This package\'s navigation\n  entry point now exports exactly its own surface: `createStackNavigator`,\n  `createSidebarNavigator`, and the option/prop types around them.\n- Each screen mounts its own layout root inside the page: the page\'s\n  content allocation is that screen\'s viewport.\n- Differences from `@react-navigation/native-stack`: `headerRight`/custom\n  header widgets are not supported yet; deep-link "url" events never fire\n  on desktop (see `Linking`).',
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
    text: 'Every `GtkWidget` subclass gtkx binds — 87 of them at last count, from\n`GtkBox` and `GtkButton` to `GtkColumnView` and `GtkEmojiChooser`. The list is\ngenerated, not hand-picked: `scripts/generate-widget-surface.mjs` classifies\ngtkx\'s full binding by real GObject inheritance (see\n`scripts/widget-surface/classification.json` for the exact list gtkx binds\ntoday) and `src/gtk/widgets.generated.ts` is the committed result. Re-run the\ngenerator after a gtkx upgrade to pick up new widgets — it diffs against its\nown previous output and prints what changed.\n\nThey keep **every prop gtkx binds** and gain `style` and `onLayout`. Position\nand appearance both come from the style prop, exactly like anywhere else in\nReact Native:\n\n```tsx\n<View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>\n  <GtkEntry\n    style={{ flex: 1 }}\n    placeholderText="Filter"\n  />\n  <GtkButton\n    style={{ width: 72, backgroundColor: "#3584e4", borderRadius: 6 }}\n    label="Go"\n  />\n</View>\n```\n\nThe entry flexes, the button takes its width and its colour. The layout half\nof the style drives Yoga; the visual half becomes a GTK CSS class **on the\nwidget itself**, so the button really is blue, not a blue box behind a button.\nSet no size and the widget\'s own natural size wins.\n\n**Outside React Native layout they step aside.** The same `GtkButton` dropped\ninto a `AdwHeaderBar`\'s `start` or a `AdwToolbarView`\'s `topBar` — where there is no\nYoga tree to join — renders as the bare widget. One symbol, both worlds, no\nflag to remember.',
  },
  {
    doc: "docs/platform-layer.md",
    heading: "Unwrapped by necessity",
    text: "Two families of widget are exported **raw** instead of wrapped, because a\nwrapper box around them would be invalid GTK rather than a convenience:\n\n- **toplevels** — `GtkWindow` and everything that derives it: every\n  `Gtk*Dialog`, `GtkApplicationWindow`, `GtkAssistant`, `GtkShortcutsWindow`,\n  and their Adwaita counterparts (`AdwWindow`, `AdwApplicationWindow`,\n  `AdwAboutWindow`, `AdwMessageDialog`, `AdwPreferencesWindow`). A wrapper box\n  around a window is not a layout, it is two windows.\n- **child-only widgets** — valid solely as the direct child of one specific\n  parent. `GtkListBoxRow` and `GtkFlowBoxChild` (plus everything that derives\n  them — every Adwaita preferences row, `AdwActionRow` included) are caught\n  mechanically, by real inheritance. `AdwNavigationPage` and\n  `AdwPreferencesPage` derive `Gtk.Widget` directly with no shared base to\n  catch them mechanically, so they are a two-entry, doc-verified denylist\n  instead — see `scripts/widget-surface/classify.mjs` for the exact reasoning\n  behind each.\n\n`GtkGestureClick` is a third, simpler case: an event controller, not a\nwidget at all, so it was never a candidate for wrapping in the first place.\n\nNothing here is unreachable — every raw export above is still exported,\nby name, from `react-native-gtkx/gtk` or `/adw`, exactly as gtkx binds it.",
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
    text: 'Linux is an [out-of-tree platform](https://reactnative.dev/docs/out-of-tree-platforms)\n(the react-native-windows/macOS model): your app keeps its ios/ and\nandroid/ folders, its Metro/Babel toolchain, and gains one more target.\nFour steps:\n\n1. **Install the platform package:**\n\n   ```bash\n   npm install react-native-gtkx\n   ```\n\n   Its own `react-native.config.js` declares the `linux` platform and the\n   `run-linux` command — nothing to declare app-side.\n\n2. **Wrap your Metro config** (`metro.config.js`):\n\n   ```js\n   const { getDefaultConfig } = require("@react-native/metro-config")\n   const { withLinuxPlatform } = require("react-native-gtkx/metro")\n\n   module.exports = withLinuxPlatform(getDefaultConfig(__dirname))\n   ```\n\n   The wrap adds the platform (`.linux.tsx` extensions,\n   `Platform.OS === "linux"`), redirects `react-native` imports to the\n   platform package, and keeps host-side modules (GTK bindings, react,\n   yoga) out of the bundle. Babel stays completely stock.\n\n3. **Add `gtkx.config.ts`** with the GTK application id:\n\n   ```ts\n   import { defineConfig } from "@gtkx/config"\n\n   export default defineConfig({\n     libraries: ["Gtk-4.0", "Adw-1"],\n     applicationId: "com.example.myapp",\n   })\n   ```\n\n4. **Start the app from the entry** — on desktop the entry launches the\n   app itself (the same pattern as react-native-web\'s `index.web.js`):\n\n   ```js\n   // index.js, after AppRegistry.registerComponent(...)\n   if (Platform.OS === "linux") {\n     AppRegistry.runApplication(appName, {\n       title: "My App",\n       width: 800,\n       height: 600,\n     })\n   }\n   ```\n\nRun it:\n\n```bash\nnpx react-native run-linux         # release bundle\nnpx react-native run-linux --dev   # Metro dev server + Fast Refresh\n```\n\nThe command ensures the gtkx codegen store, bundles with Metro for\n`--platform linux` and opens the window. With `--dev` it starts (or\nreuses) the Metro dev server and edits apply to the live window with\ncomponent state preserved; syntax errors print readably in the terminal\nand the app recovers on the next successful build. **Ctrl+Shift+D** (the\nreact-native-windows shortcut — the desktop stand-in for the shake\ngesture) opens the Dev Menu: Reload plus any entries the app registers\nvia `DevSettings.addMenuItem`. `examples/rn-app` is a complete cli-init\napp with all three platforms wired this way.\n\nNotes for typed code: add an `env.d.ts` with\n`import "react-native-gtkx/types"` — it augments the stock `react-native`\ntypes so `Platform.select({ linux: ... })` typechecks, and `Pressable`\'s\nstate callback accepts `hovered` (declared optional — a component shared\nwith ios/android gets `undefined` there, so write\n`hovered && styles.hovered`). Future platform-specific props land in the\nsame file. One thing augmentation\ncannot teach is `Platform.OS === "linux"` (property types do not merge) —\nuse `Platform.select` in typed code. Deep imports\n(`react-native/Libraries/...`) are not supported — only the public\n`react-native` surface.',
  },
  {
    doc: "docs/getting-started.md",
    heading: "Navigation",
    text: "Multi-screen apps use the standard react-navigation API with a native\nAdwaita stack navigator: install `@react-navigation/native` and import\n`createStackNavigator` from `react-native-gtkx/navigation` — pages render\nas `Adw.NavigationPage` with the HeaderBar back button wired to\nreact-navigation state. See [docs/api.md](api.md#navigation-react-native-gtkxnavigation), and\n[docs/research/navigation-extensibility.md](research/navigation-extensibility.md)\nfor porting an existing react-navigation app (which options carry over,\nwhich are silently ignored today, and what the desktop cannot mean).",
  },
  {
    doc: "docs/getting-started.md",
    heading: "Metro or vite?",
    text: "- **Adding Linux to an existing RN app** (ios/android + Metro): the\n  section above — standard RN toolchain end to end,\n  `run-linux --dev` for Fast Refresh.\n- **Linux-first project**: the template with the vite preset\n  (`react-native-gtkx/vite`; `gtkx dev` gives Fast Refresh, builds are\n  single-file bundles). Both paths consume the same published package.",
  },
  {
    doc: "docs/getting-started.md",
    heading: "Examples in the repository",
    text: "- `examples/profile` — a static layout; the same source also builds with react-native-web (`examples/profile-web`);\n- `examples/playground` — interactive: Pressable, TextInput, Switch, FlatList, Modal, Animated, responsive via flexWrap;\n- `examples/gallery` — a gallery of the entire v1 surface;\n- `examples/rn-app` — a cli-init React Native app with ios + android + linux;\n- `examples/hn-app` — a Hacker News reader on the Metro path: live API data over Node fetch, state-based two-screen navigation, a lazily loaded comment tree.",
  },
  {
    doc: "docs/getting-started.md",
    heading: "Tests",
    text: "Unit logic is plain vitest. Component tests use `@gtkx/testing` (render/screen/fireEvent) under headless Wayland: see `packages/react-native-gtkx/tests/gtk/` and `npm run test:gtk`. In tests, click via `fireEvent` and query roles with `Gtk.AccessibleRole` enums (see docs/gtkx-rc2-notes.md).",
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
    text: '| Name                       | What rc.2 does                                                                                                                                                                                                                                     | Our workaround                                                                                                                                      | Removal condition                                                           |\n| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |\n| `use-signal-stale-handler` | `useSignal` routes the handler through React\'s `useEffectEvent`, whose ref stops refreshing for components deep in the tree (a ScrollView at its 8th render still ran the mount closure) — a fetch-fed FlatList empties itself on the first scroll | `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx\'s | Upstream restores its documented "handler from the latest render" contract  |\n| `codegen-cwd`              | `gtkx codegen` run with a cwd inside `node_modules` prints "bindings up to date" and creates no store at all (re-verified on rc.2 with the store removed)                                                                                          | `src/runner/index.ts` resolves the project that OWNS the hosting `node_modules` and runs the CLI from there                                         | The CLI validates the store instead of a stamp, or fails loudly on that cwd |\n| `runtime-dedupe`           | Two bundled copies of the gtkx runtime still double-init GLib and abort (`g_log_set_writer_func` called twice); nothing guards against it                                                                                                          | `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits     | Idempotent runtime init upstream, or an error that names the duplicate      |\n| `renderhook-no-window`     | `renderHook` still mounts into a bare `Gtk.Box`, so window-dependent APIs have no toplevel to read                                                                                                                                                 | Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`)                                                             | `renderHook` mounts into the same harness window `render` uses              |',
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "Fixed in rc.2 (rc.1 history, one line each)",
    text: "- **`vitest-compositor`** — rc.1 defaulted the headless display to weston and\n  took sway through an option; rc.2's default IS sway, so `vitest.config.ts`\n  calls the plugin with no arguments.\n- **`no-virtual-seat`** — rc.1 had no input seat under sway, so windows never\n  activated and `userEvent` was impossible; rc.2 starts a virtual seat for sway\n  (`needsVirtualSeat: true`), a rendered toplevel now reports `is-active: true`,\n  and coordinate-level input is on the table.\n- **`fixed-layout-child`** — rc.1's declarative `<GtkFixedLayoutChild>` created\n  a detached object (Gtk-CRITICAL, positions never applied); moot for us since\n  containers moved to our own `RnGtkxLayout` manager and GtkFixed left the\n  codebase entirely.\n- **`controllers-as-children`** — rc.1 silently ignored controllers passed as\n  JSX; rc.2 has a `controllers` slot on `GtkWidget`. Pressable and TextInput\n  still attach theirs imperatively on purpose (wired once per widget, handlers\n  read from a ref) — a choice now, not a workaround.",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "New in the rc.2 era",
    text: 'Two regressions/gaps first seen on rc.2, both with reproductions and both\nwritten up for upstream in [docs/upstream-gtkx.md](upstream-gtkx.md):\n\n- **The `useSignal` freeze.** Instrumented: `closure_render=1`,\n  `effectEvent_render=1`, `ref_render=8` in the same component. Shallow\n  components refresh correctly, which is why it survives casual testing; the\n  visible symptom was a virtualized list that blanked on the first scroll.\n  Repro: `tests/gtk/components/list-late-data.gtk.test.tsx`, plus the contract\n  test in `tests/gtk/bridge.smoke.test.tsx`.\n- **The codegen freshness lie.** `npm install` prunes `node_modules/.gtkx` (npm\n  sees `@gtkx/gi`/`@gtkx/jsx` as extraneous), and afterwards codegen can report\n  "bindings up to date" over a store that is not there — from the project root\n  because a stamp outlives the store, and unconditionally when the cwd is\n  inside `node_modules`. `rm -rf node_modules/.gtkx` before `npm run codegen`\n  is the reliable sequence.',
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
    text: "Everything below the HeaderBar: each page hosts a full RN tree in its own\nlayout root. All of react-navigation's state mechanics: params,\n`setOptions`, dispatch, resets.\n\nStack options: `title`, `headerShown`, `headerButtons` (declarative native\nicon buttons), `headerLeft` / `headerRight` (ordinary RN content rendered\n_inside_ the HeaderBar), `gestureEnabled`.\n\nPast the options, the primitives: any GTK widget we bind, taking `style` so\nReact Native drives its position and its appearance, plus `wrapReactNative`\nfor widgets we do not re-export, plus a `ref` to the underlying\n`Adw.NavigationView`. There is no wall — a missing convenience costs a line,\nnot a fork.\n\n**Resolved since the first snapshot.** Kept here because the reasons are\nstill instructive:\n\n- _RN content could not size a chrome slot_ (HeaderBar start/end, sidebar\n  rows) — one root cause behind the whole `headerLeft`/`headerRight` class.\n  Fixed by the intrinsic-size root, now public as `IntrinsicContent`.\n- _`usePreventRemove` / `beforeRemove` desynced_, because the native pop had\n  already happened when state heard about it. Fixed through\n  `AdwNavigationPage:can-pop`: a prevented route cannot be popped by the\n  user at all, so there is nothing to race. Covered by\n  `tests/gtk/navigation/prevent-remove.gtk.test.tsx`.\n- _Unsupported options were ignored silently._ Fixed:\n  `src/navigation/option-warnings.ts` names the screen and the option in\n  development.\n- _Screen props and options had to be hand-rolled._ Fixed:\n  `createStackNavigator<ParamList>()` types `Stack.Screen`, its options and\n  the screen props (`examples/hn-app` relies on it).\n\nOn typing, one clarification worth recording, since it was raised publicly.\nThe complaint was never that custom navigators cannot be typed — the docs\nshow how, and we follow them. It is that the upstream v7 signature is\n`createNavigatorFactory(Navigator: ComponentType<any>): (config?: any) => any`,\nso nothing flows out of the factory itself and the types have to come from\nannotating the navigator. React Navigation 8 replaces this with a real typed\nAPI (`NavigatorTypeBagBase`, `createScreenFactory`); adopting it is the\n`react-navigation-8` epic.",
  },
  {
    doc: "docs/research/navigation-extensibility.md",
    heading: "3. Still open",
    text: 'Meaningful on this platform and not done yet: `animation: "none"`\n(`animate-transitions`), toolbar top-bar style (the\n`headerTransparent`/`headerShadowVisible` analogue), `Adw.Dialog`\npresentation, search-bar options (`Gtk.SearchBar` /\n`headerSearchBarOptions` — note v8 renamed its `onChangeText` to\n`onChange`), sidebar row rendering, collapsed mode and breakpoints, and\ndeep links (they parse, but nothing delivers a URL on the desktop yet).\n\n**Meaningless on desktop, skip forever:** status-bar and home-indicator\noptions, large titles, blur effects, gesture direction, form sheets,\nback-button labels. `headerBackButtonMenuEnabled` is free — libadwaita\'s\nback button already shows a history menu.',
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
    text: "`useSignal` routes the handler through React's `useEffectEvent`, whose ref stops refreshing for components deep in the tree (a ScrollView at its 8th render still ran the mount closure) — a fetch-fed FlatList empties itself on the first scroll — our workaround: `gtkx/bridge/use-signal.ts` re-pins the latest handler (insertion effect) and hands gtkx a stable wrapper; the bridge exports that hook, not gtkx's — removed when: Upstream restores its documented \"handler from the latest render\" contract",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "RC2-WORKAROUND(codegen-cwd)",
    text: '`gtkx codegen` run with a cwd inside `node_modules` prints "bindings up to date" and creates no store at all (re-verified on rc.2 with the store removed) — our workaround: `src/runner/index.ts` resolves the project that OWNS the hosting `node_modules` and runs the CLI from there — removed when: The CLI validates the store instead of a stamp, or fails loudly on that cwd',
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "RC2-WORKAROUND(runtime-dedupe)",
    text: "Two bundled copies of the gtkx runtime still double-init GLib and abort (`g_log_set_writer_func` called twice); nothing guards against it — our workaround: `src/vite/index.ts` puts `resolve.dedupe` over `@gtkx/*` + `react` (+ `@react-navigation/*` for its context) into the preset every app inherits — removed when: Idempotent runtime init upstream, or an error that names the duplicate",
  },
  {
    doc: "docs/gtkx-rc2-notes.md",
    heading: "RC2-WORKAROUND(renderhook-no-window)",
    text: "`renderHook` still mounts into a bare `Gtk.Box`, so window-dependent APIs have no toplevel to read — our workaround: Hook tests create a window with `render()` first (`tests/gtk/apis/dimensions.test.tsx`) — removed when: `renderHook` mounts into the same harness window `render` uses",
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
    text: "Image — GTK implementation: GtkPicture. Supported: `source={{uri}}`/string — local paths, file:// and **http(s)** (Node fetch → disk cache keyed by URL, in-flight de-duplication), `resizeMode` cover/contain/stretch/center, `onLoad`/`onError`. Differences from RN: no synchronous size from remote images (style sets the size, as in RN); cache is not size-limited yet",
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
    text: "Animated.View — GTK implementation: direct widget calls. Supported: `opacity` and `transform: [{translateX/translateY}]` driven by Animated nodes, bypassing React. Differences from RN: scale/rotate — planned branch (rc.2); translate is clamped to the parent's bounds — an animation cannot change layout (paint overflow returns with branch B)",
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
    text: 'AppRegistry — Supported: `registerComponent`, `runApplication(appKey, {title,width,height,initialProps,chrome})`, `getAppKeys`. Differences: desktop window parameters; `chrome: "content"` uses an AdwApplicationWindow with no window titlebar — the app\'s HeaderBars (navigation) become the chrome',
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
