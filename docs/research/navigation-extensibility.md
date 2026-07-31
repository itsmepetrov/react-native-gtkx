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

`createSidebarNavigator`'s own gaps — sidebar row rendering, collapsed
mode and the static content header — are covered in §3 below, alongside
the `examples/tasks-app`/`examples/tasks-nav` narrative that found and
then closed them.

On typing, one clarification worth recording, since it was raised publicly.
The complaint was never that custom navigators cannot be typed — the docs
show how, and we follow them. It is that the upstream v7 signature is
`createNavigatorFactory(Navigator: ComponentType<any>): (config?: any) => any`,
so nothing flows out of the factory itself and the types have to come from
annotating the navigator. React Navigation 8 replaces this with a real typed
API (`NavigatorTypeBagBase`, `createScreenFactory`); adopting it is the
`react-navigation-8` epic.

## 3. Still open

Meaningful on this platform and not done yet: toolbar top-bar style (the
`headerTransparent`/`headerShadowVisible` analogue), search-bar options
(`Gtk.SearchBar` / `headerSearchBarOptions` — note v8 renamed its
`onChangeText` to `onChange`), and deep links (they parse, but nothing
delivers a URL on the desktop yet). `animation: "none"` is done (a screen
option, see docs/api.md).

**Resolved by building `examples/tasks-app` (the gtkx tutorial's Tasks app,
ported), each with a small library change, not a workaround:**

- _`Adw.Dialog` presentation_ — confirmed working. `AdwAboutDialog`/
  `AdwAlertDialog`/`AdwPreferencesDialog`/`AdwShortcutsDialog` are already
  `wrapReactNative`-wrapped; mounted with no Yoga ancestor anywhere in the
  tree (this app has none — see the example's README), they hit
  `wrapReactNative`'s "bare" branch and present correctly, verified live
  with real screenshots (Preferences, Shortcuts). Nothing to fix here —
  this item can be dropped from "still open" entirely.
- _Breakpoints_ — a real `Adw.Breakpoint`, verified live collapsing the
  window at a narrow width, but not through the navigator: through a new
  `AppRegistry.runApplication({ breakpoints })` parameter instead (the
  navigator itself still had no collapsed-mode concept at the time —
  closed by `navigation-depth-2`, see below). Also found and recorded:
  `AdwBreakpoint`'s `onApply`/`onUnapply` never fire under the
  `@gtkx/vitest` headless-sway gtk test project, in any form tried (JSX
  prop, imperative `Adw.Breakpoint`+`addBreakpoint`, a genuine `swaymsg`
  resize) — but fire immediately in a real GNOME session. Treat it as
  untestable headless today, not broken; see
  `packages/react-native-gtkx/tests/gtk/bridge/auxiliary-elements.gtk.test.tsx`.
  (`navigation-depth-2`'s own `collapseWidth`, below, sidesteps this
  entirely — it drives `Adw.Breakpoint.addSetter` rather than
  `onApply`/`onUnapply`, and that IS testable headless, see
  `tests/gtk/adw/breakpoint.gtk.test.tsx`.)
- _Actions and menus_ were never on this list by name, but turned out to
  be the same kind of gap: `AppRegistry.runApplication` had no way to
  attach a `GSimpleAction`, `actionAccels` or a `GtkShortcutController` to
  the app/window it builds — required for a `Gio.Notification` action
  button to route anywhere at all. Closed the same way, with
  `applicationActions`/`actionAccels`/`windowActions`/`windowControllers`.

**Resolved by building `examples/tasks-nav` (`navigation-depth-2` epic),
closing exactly what the tasks-app port above found still narrow:**

- _Sidebar row rendering and collapsed mode_ — `createSidebarNavigator`'s
  `SidebarNavigationOptions` was `{ title }` only: no per-row icon/color/
  count, and no collapsed/breakpoint wiring of its own (tasks-app had to
  reach `AppRegistry`'s `breakpoints` directly and drive `collapsed`
  itself). Fixed: `icon`/`color`/`count` (rendered as `AdwActionRow`, the
  same widget tasks-app's own hand-rolled sidebar used) and an opt-in
  `collapseWidth` prop, driving collapse through the navigator itself via
  a native `Adw.Breakpoint` — not a `useWindowDimensions` conditional; see
  [../platform-layer.md](../platform-layer.md), "Two ways to react to
  size", for the mechanism and why no `useBreakpoint` hook exists.
- _One static content header shared by the whole navigator_ — the same
  port's other finding: a filter toggle group vs. a back button,
  depending on selection, did not fit one static header. The
  `navigation-depth-2` PRD explicitly allowed this turning out to be a
  structural gap; it wasn't — descriptor options already merge
  navigator-level `screenOptions` with a screen's own `options` and
  re-resolve on `navigation.setOptions()`, core react-navigation behavior.
  `SidebarNavigationOptions` gained `headerLeft`/`headerRight`/
  `headerTitle`, mirroring the stack navigator's own `headerLeft`/
  `headerRight`; a screen that toggles local state and calls
  `setOptions` in an effect gets a header that changes shape with its own
  selection, no stack involved — confirming tasks-app's own conclusion
  that a stack was never the right tool for the "open an item" case.
  Caveat found while testing this: `setOptions` merges into the
  previously resolved options rather than replacing them (see
  docs/api.md).

`examples/tasks-nav` is the same navigational shape as `examples/tasks-app`
— smart views, colored user lists, an open-item editor — now written
through `createSidebarNavigator` instead of directly on
`AdwNavigationSplitView`/`AdwActionRow`.

**Resolved by `collapse-nav` (a live bug report on `examples/tasks-nav`),
one property lower than `collapseWidth` itself:** `collapseWidth` flips
`AdwNavigationSplitView.collapsed` correctly, but `showContent` — WHICH
pane is visible while collapsed — was only half-wired: a row click already
revealed content, but nothing observed the split view's own back
affordance putting it back, and a plain programmatic `navigate()` (no row
click) did not reveal content at all. On read, this looked like it might
be the same "the breakpoint effect sets only `collapsed`" gap all over
again; it mostly was not — see `sidebar.tsx`'s own file header for what was
already there. Three questions were settled empirically, with a throwaway
GTK test written BEFORE any implementation code, rather than assumed from
libadwaita's docs:

- _Does a cold-started, already-collapsed window default to content or the
  sidebar?_ Sidebar — `showContent` defaults to `false`, confirmed by
  mounting a window already narrower than `collapseWidth` and reading the
  property on first layout, before any code (ours or the app's) ever wrote
  to it. No fix needed.
- _Does resizing back above `collapseWidth` and back below it need to
  reset `showContent` or the selection?_ No — both persist across the
  round trip, confirmed the same way (resize wide, resize narrow again,
  read the property). This is deliberate, not an oversight: it is the same
  size-class persistence a mobile master-detail app relies on (open an
  item, rotate to landscape and back, still on that item), which is
  exactly the "the way a mobile app does" behavior the bug report asked
  for. Resetting it would have fought the platform's own default for no
  benefit.
- _Does an app need to observe or control the collapsed pane at all?_ One
  direction, yes: going back. TabRouter's `state` never changes when the
  user backs out of collapsed content (nothing is removed, the same route
  stays focused), so there is no existing react-navigation mechanism for
  an app to notice it happened — unlike a stack pop, which state itself
  already reveals through the route array shrinking. A new event,
  `sidebarShown` (`SidebarNavigationEventMap`, the same `navigation.emit`/
  `addListener` protocol `StackNavigationEventMap`'s `transitionStart`/
  `transitionEnd` already established — not a second protocol), fires on
  the active route for exactly this. The forward direction (content being
  revealed) got no event: it is already an ordinary state change an app
  can observe the normal way, so an event there would be pure duplication.

The echo risk this raises — state → widget and widget → state both touch
the same property, could they retrigger each other? — resolved the same
way the stack navigator's own doc warns about it: by a value asymmetry, not
a flag. State → widget only ever WRITES `true`; widget → state only ever
REACTS to `false`. Two disjoint values, so neither side can mistake the
other's write for the other direction.

Fixed: `sidebar.tsx`'s `state.index` effect now also calls
`showContentIfCollapsed()` (previously only `onRowActivated` did, so a
click worked but a programmatic navigation left the user stranded on the
sidebar exactly like the report — a real, reproducible gap, not merely a
theoretical one); `onNotifyShowContent` is observed and re-emitted as
`sidebarShown`. `examples/gallery` (no `collapseWidth`) is untouched by
construction — every changed path checks `getCollapsed()` /
`collapseWidth !== undefined` live first. See
`tests/gtk/navigation/sidebar-collapse.gtk.test.tsx` for the automated
version of all four findings above, and docs/api.md for the public shape.

**Found while building `examples/tasks-nav`, narrower, still open:**

- _The sidebar PANE's own chrome has no customization hook_ — its
  `AdwToolbarView`'s `AdwHeaderBar` is hard-coded
  (`src/navigation/sidebar.tsx`); a navigator consumer can set
  `sidebarTitle` (a string) on it and nothing else. `examples/tasks-nav`'s
  "New List" action wanted to live there (matching tasks-app's own
  `SidebarHeader` component) but had to go on the content header instead,
  via the navigator-level `headerButtons` prop. Not on the PRD's
  checklist, so not built.
- _Toasts_ — no `AdwToastOverlay`/`Adw.Toast` convenience exists anywhere
  in `react-native-gtkx` (upstream's own tutorial reaches for
  `@gtkx/components/adw`'s `ToastProvider`/`useToast`, a package this repo
  does not depend on). `examples/tasks-app/src/toast.tsx` is a local
  stand-in; the toast's underlying state change works and is verified live,
  but the toast's own visual appearance could not be confirmed on screen
  in that session, for a reason not yet root-caused. Worth a real fix (or
  at least a live confirmation) before another app leans on it.

**Meaningless on desktop, skip forever:** status-bar and home-indicator
options, large titles, blur effects, gesture direction, form sheets,
back-button labels. `headerBackButtonMenuEnabled` is free — libadwaita's
back button already shows a history menu.

## 4. Porting an existing react-navigation app

Compatible by construction: a real `@react-navigation/native` v8 peer, the
official `useNavigationBuilder` and routers, a real `NavigationContainer`.
Everything from react-navigation is imported from `@react-navigation/native`
directly. We used to re-export a partial set from our navigation entry point
and dropped it: the set was incomplete, so consumers ended up importing from
both places and could not tell which symbol came from where.

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
