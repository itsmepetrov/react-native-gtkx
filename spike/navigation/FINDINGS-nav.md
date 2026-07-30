# Navigation spike — findings

Probes for the three risks of the navigation epic (task 001). Verdict at
the end. Artifacts: `src/adw-spike.tsx` (risks 1+3, `NAV_SPIKE_MODE`
unset), `src/rn-probe.tsx` (risk 2, `NAV_SPIKE_MODE=rn`),
`run-headless.sh` (auto-driven push/pop shot sequence at two window
sizes).

## Risk 1 — nested Root inside a NavigationPage: WORKS AS-IS

`Root followAllocation` (the exact mechanism AppRegistry uses for the
window) mounts unchanged inside `Adw.NavigationPage` content: the page's
content-area allocation becomes the layout viewport, one `LayoutEngine`
per page. Measured live: window 720×520 → page viewport 720×474 (GTK
subtracts the 46 px headerbar itself); a window resize reallocates the
visible page and the nested Root reflows synchronously (sway retile to
1000×700 → viewport 996×627 in the same session). Hidden stack pages
reflow on their next allocation after push — no manual invalidation
needed.

Transition caveat for task 002: during the pop crossfade both pages get
intermediate allocations (e.g. 496×627 while sharing the width); the
final allocation is always correct, but layout-reactive code should not
latch onto mid-transition values.

## Risk 2 — @react-navigation/native: MOUNTS

The "stub list" is three items, all now real package APIs.

Build-time missing exports and the one runtime gap, found empirically
(vite fails the build on missing named exports — an honest catalog):

| Needed by react-navigation              | Resolution                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `I18nManager` (NavigationContainer)     | implemented: `isRTL` live from `Gtk.Widget.getDefaultDirection()`, writers no-op |
| `BackHandler` (useBackButton)           | implemented: subscription registry + `dispatchBackPress` chain, `exitApp` → quit |
| `Linking.addEventListener` (useLinking) | implemented: "url" subscription contract honored; nothing delivers events yet    |

`NavigationContainer` + `useNavigationContainerRef` mount and render
children on the linux surface (screenshot `rn-probe-shot.png`). Note:
`onReady` does not fire with zero navigators inside the container —
expected react-navigation behavior (ready = first navigator state), not
a platform gap. Everything else it touches (`Platform.OS`,
`Platform.select`, `Text`, `Linking.getInitialURL`) already existed.

## Risk 3 — NavigationView / HeaderBar via rc.1 codegen: FULLY DRIVABLE

- Every needed widget exists in the rc.1 store: `AdwNavigationView`,
  `AdwNavigationPage`, `AdwHeaderBar`, `AdwToolbarView`,
  `AdwApplicationWindow` (plus `AdwNavigationSplitView` and
  `AdwBreakpoint` for later).
- Container semantics come from `ELEMENT_PROPS` metadata:
  `AdwToolbarView` takes `topBar={<AdwHeaderBar/>}` (→ `addTopBar`) and
  children → `setContent`; `AdwNavigationView` children → `add` (the
  stack); `AdwNavigationPage` children → `setChild`.
- push/pop from React: a widget ref exposes `pushByTag(tag)` / `pop()`;
  Adwaita renders the back button in the pushed page's HeaderBar and the
  slide animation for free. RN Pressables inside the nested Root drive
  it without event-system conflicts.
- **The window must be `AdwApplicationWindow`, not
  `GtkApplicationWindow`**: with the Gtk window the app shows two
  headers (the window's own CSD titlebar + the page HeaderBar). With the
  Adw window the page HeaderBar IS the titlebar (drag + window controls
  live in it). AppRegistry hard-codes GtkApplicationWindow today —
  task 002 needs either a switch to Adw windows across the board or a
  navigation-aware window mode.

## Infrastructure gotchas

- A `file:`-installed react-native-gtkx next to direct `@gtkx/*` imports
  bundles TWO copies of the gtkx runtime; the second init aborts GLib
  (`g_log_set_writer_func() called multiple times`). Fixed with vite
  `resolve.dedupe` over `@gtkx/*` + `react` — the vite preset should
  ship this dedupe by default (matters for the gtk-components epic too).
- Dynamic `import()` in the entry makes vite emit split chunks, breaking
  the single-bundle contract of `gtkx build` — keep entries static.

## Verdict: GO

Both integration halves are proven independently. Requirements handed to
tasks 002–003: Adw window mode, a NavigationView-backed custom navigator
(`useNavigationBuilder` + `StackRouter`) mapping push/pop to
`pushByTag`/`pop`, one nested Root per screen, back-button →
`dispatchBackPress` wiring, and transition-safe layout reads.
