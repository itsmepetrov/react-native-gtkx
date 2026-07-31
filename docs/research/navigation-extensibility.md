# Navigation: two layers, react-navigation compatibility, and the desktop-RN landscape

Subject: how navigation is built on this platform, what an app can reach,
and why no other out-of-tree React Native platform has native navigation.

This started (2026-07-30) as a list of what react-navigation would not let
us express. That framing is gone: the answer turned out not to be "ask
react-navigation for more", but to stop routing everything through it.

## 1. The two layers

```
your app
   ├── react-native                    portable components
   ├── react-native-gtkx/navigation    react-navigation adapter   (optional)
   └── react-native-gtkx/adwaita       GTK widgets and primitives
```

**`react-native-gtkx/gtk` and `react-native-gtkx/adw`** owns the widget: diffing a requested stack
of tags into `pushByTag` / `popToTag` / `replaceWithTags`, holding a popped
page alive until its exit animation ends, bracketing transitions, reporting
native pops. It imports nothing from `@react-navigation/*`. `NavigationStack`
takes the visible stack as a prop, so a `useState` is a complete router.

**`react-native-gtkx/navigation`** is an adapter: react-navigation state to
an array of tags, a native pop to `StackActions.pop` (only when the tag is
still in state, otherwise it would double-pop), descriptors to titles, header
content and `canPop`, plus dev warnings for options we ignore.

This is the same split the React Native ecosystem already uses:
`react-native-screens` exposes primitives, `@react-navigation/native-stack`
binds them to a router. It is also what React Navigation's maintainer
recommended when he saw the project (u/satya164, on the r/reactnative
announcement): _keep your own navigator so you can provide options specific
to GTK, unless you plan to match native stack API 1:1._

The consequence that matters: **the ceiling of react-navigation's model is
now only in the adapter, never in the primitive.** A GTK capability with no
counterpart in React Native does not have to be squeezed into someone
else's abstraction — it lives in the primitive layer and is reachable
directly. See [../platform-layer.md](../platform-layer.md).

## 2. What an app can reach today

Everything below the HeaderBar: each page hosts a full RN tree in its own
layout root. All of react-navigation's state mechanics: params,
`setOptions`, dispatch, resets.

Stack options: `title`, `headerShown`, `headerButtons` (declarative native
icon buttons), `headerLeft` / `headerRight` (ordinary RN content rendered
_inside_ the HeaderBar), `gestureEnabled`.

Past the options, the primitives: any GTK widget we bind, taking `style` so
React Native drives its position and its appearance, plus `wrapReactNative`
for widgets we do not re-export, plus a `ref` to the underlying
`Adw.NavigationView`. There is no wall — a missing convenience costs a line,
not a fork.

**Resolved since the first snapshot.** Kept here because the reasons are
still instructive:

- _RN content could not size a chrome slot_ (HeaderBar start/end, sidebar
  rows) — one root cause behind the whole `headerLeft`/`headerRight` class.
  Fixed by the intrinsic-size root, now public as `IntrinsicContent`.
- _`usePreventRemove` / `beforeRemove` desynced_, because the native pop had
  already happened when state heard about it. Fixed through
  `AdwNavigationPage:can-pop`: a prevented route cannot be popped by the
  user at all, so there is nothing to race. Covered by
  `tests/gtk/navigation/prevent-remove.gtk.test.tsx`.
- _Unsupported options were ignored silently._ Fixed:
  `src/navigation/option-warnings.ts` names the screen and the option in
  development.
- _Screen props and options had to be hand-rolled._ Fixed:
  `createStackNavigator<ParamList>()` types `Stack.Screen`, its options and
  the screen props (`examples/hn-app` relies on it).

On typing, one clarification worth recording, since it was raised publicly.
The complaint was never that custom navigators cannot be typed — the docs
show how, and we follow them. It is that the upstream v7 signature is
`createNavigatorFactory(Navigator: ComponentType<any>): (config?: any) => any`,
so nothing flows out of the factory itself and the types have to come from
annotating the navigator. React Navigation 8 replaces this with a real typed
API (`NavigatorTypeBagBase`, `createScreenFactory`); adopting it is the
`react-navigation-8` epic.

## 3. Still open

Meaningful on this platform and not done yet: `animation: "none"`
(`animate-transitions`), toolbar top-bar style (the
`headerTransparent`/`headerShadowVisible` analogue), `Adw.Dialog`
presentation, search-bar options (`Gtk.SearchBar` /
`headerSearchBarOptions` — note v8 renamed its `onChangeText` to
`onChange`), sidebar row rendering, collapsed mode and breakpoints, and
deep links (they parse, but nothing delivers a URL on the desktop yet).

**Meaningless on desktop, skip forever:** status-bar and home-indicator
options, large titles, blur effects, gesture direction, form sheets,
back-button labels. `headerBackButtonMenuEnabled` is free — libadwaita's
back button already shows a history menu.

## 4. Porting an existing react-navigation app

Compatible by construction: a real `@react-navigation/native` peer, the
official `useNavigationBuilder` and routers, a real `NavigationContainer`.
Anything we do not re-export is imported from `@react-navigation/native`
directly — and after the v8 migration that will be everything, because the
partial re-export we ship today only creates confusion about where a symbol
comes from.

Mandatory changes: swap `createNativeStackNavigator` for our
`createStackNavigator`; drop `react-native-screens`,
`react-native-safe-area-context` and `react-native-gesture-handler` (all
three are mobile-native dependencies with nothing to bind to here).

Keeping shared code portable: Linux-only options go behind a `.linux.tsx`
platform extension or `Platform.select({ linux: … })`. Options a platform
does not understand are ignored — and here, warned about in development.

## 5. The desktop-RN landscape

No other desktop React Native platform has native navigation integration:

- **react-native-screens** lists Windows support, but it is a thin
  old-architecture module; native-stack on modern react-native-windows
  fails, because screens has no new-architecture Windows implementation and
  RNW 0.82 removed the old one. Microsoft's own react-native-gallery falls
  back to the JS drawer.
- **react-native-macos** is not supported by react-native-screens at all —
  AppKit has no navigation-stack primitive to bind to.

Our path — a real `Adw.NavigationView` driven from a custom navigator, with
react-navigation state as the source of truth and native pops reported back
into it — is structurally the iOS native-stack / `UINavigationController`
model, which neither desktop platform reached. GTK's advantage is that the
primitive exists at all: back button, Escape, back gesture, history menu and
transitions ship with the widget.

The trade: a JS stack can render anything into its fake header, while our
chrome is real and had to be opened up deliberately — which is what the
intrinsic-size root does.

Sources: react-native-screens README and discussions #1575 / #2541, RNW
discussions #14273 / issue #4152 / new-architecture docs / 0.82 release
post, microsoft/react-native-gallery, reactnavigation.org native-stack docs.
