# Navigation extensibility, react-navigation compatibility and the desktop-RN landscape

Research snapshot (2026-07-30) behind the navigation epic's follow-up
tasks. Subject: `react-native-gtkx/navigation` — `createStackNavigator`
on `Adw.NavigationView`, `createSidebarNavigator` on
`Adw.NavigationSplitView`.

## 1. What an app can customize today, and the walls

Open: everything below the HeaderBar (each page hosts a full RN tree in
its own layout root), all of react-navigation state mechanics (params,
`setOptions`, dispatch, resets), stack options `title` / `headerShown` /
`headerButtons` (declarative native icon buttons).

Walls, by root cause:

- **Zero-minimum roots**: RN content cannot size a chrome slot
  (HeaderBar start/end/title-widget, sidebar rows) — one root cause for
  the whole `headerLeft`/`headerRight`/`headerTitle`-as-component class.
  Fixed by the intrinsic-size root (task 006).
- **Unexposed Adwaita levers**: `AdwNavigationPage:can-pop` (per-screen
  back blocking — also the correct mechanism for
  `usePreventRemove`/`beforeRemove`, which today desyncs: the native pop
  has already happened when state hears about it), `animate-transitions`
  (`animation: "none"`), `AdwToolbarView` top-bar-style
  (`headerTransparent`/`headerShadowVisible` analogue), HeaderBar
  `start` slot, `Adw.Dialog` (`presentation: "modal"`), `Gtk.SearchBar`
  (`headerSearchBarOptions`), sidebar row rendering / collapsed mode /
  breakpoints.
- **Meaningless on desktop** (skip forever): status-bar and
  home-indicator options, large titles, blur effects, gesture direction,
  form sheets, back-button labels. Notably `headerBackButtonMenuEnabled`
  is free: libadwaita's back button already shows a history menu.

## 2. Porting an existing react-navigation app

The architecture is compatible by construction: real
`@react-navigation/native` v7 peer, official `useNavigationBuilder` +
routers, real `NavigationContainer`. Anything we do not re-export can be
imported from `@react-navigation/native` directly.

Mandatory changes: swap `createNativeStackNavigator` for our
`createStackNavigator`; remove `react-native-screens`,
`react-native-safe-area-context`, `react-native-gesture-handler`;
rewrite component-based header options to `headerButtons` (until 006);
hand-roll screen prop types (until typed factories land).

Silent traps (ranked): unsupported options are ignored WITHOUT warning
(and `createNavigatorFactory` is untyped upstream, so TS will not catch
them either); prevent-remove is actively broken (see above); deep links
parse but never fire (no url delivery on desktop yet); a drop-in
`@react-navigation/native-stack` alias subpath is feasible once the
warning + types + can-pop land — positioned as a porting aid.

## 3. Consumption ergonomics

Subpath + optional peer is idiomatic for an out-of-tree platform. The
sharpest newcomer papercuts: the untyped factory (`Stack.Screen` options
and screen props are `any` — mirror native-stack's typed-factory
pattern), the optional-peer failure mode (raw module-not-found), and
`chrome: "content"` discoverability (double header bars with no runtime
hint when forgotten). API asymmetries to iron out: `headerButtons` is
per-screen on the stack but navigator-level on the sidebar; sidebar
sections unmount on switch (RN tabs keep screens mounted).

## 4. The desktop-RN landscape

No desktop RN platform has native navigation integration:

- react-native-screens lists Windows support, but it is a thin old-arch
  module; native-stack on modern RNW fails (screens has no
  new-architecture Windows implementation, and RNW 0.82 removed the old
  arch). Microsoft's own react-native-gallery uses the JS drawer.
- react-native-macos is not supported by react-native-screens at all —
  AppKit has no navigation-stack primitive.

Our path — driving a real `Adw.NavigationView` from a custom navigator
with react-navigation state as the source of truth and native pops
reported back — is structurally the iOS native-stack /
UINavigationController model, which neither desktop platform achieved.
GTK's advantage is that the primitive exists: back button, Esc, back
gestures, history menu and transitions ship with the widget. The trade:
JS-stack fallbacks can render anything into their fake headers; our
chrome is native and needs task 006 to open up.

Sources: react-native-screens README and discussions #1575/#2541, RNW
discussions #14273 / issue #4152 / new-architecture docs / 0.82 release
post, microsoft/react-native-gallery, reactnavigation.org native-stack
docs.

## Follow-ups distilled into the epic

Tasks 008 (dev warnings for ignored options + content-chrome hint), 009
(typed navigator factories), 010 (can-pop: gestureEnabled +
prevent-remove) — plus the epic backlog: native-stack compat alias,
sidebar parity pass, `animation: "none"`, modal presentation on
Adw.Dialog, search-bar options.
