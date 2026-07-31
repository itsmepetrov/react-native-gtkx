# tasks-nav — a task manager, written entirely through `createSidebarNavigator`

The proof for the `navigation-depth-2` epic: a task manager of navigational
complexity comparable to [`examples/tasks-app`](../tasks-app/README.md#why-this-is-not-built-on-createsidebarnavigatorcreatestacknavigator)
(PR #18) — smart views and colored user lists in a sidebar, a content pane
that shows a task list or an open task's editor — built **entirely through
`createSidebarNavigator`**, with no direct
`AdwNavigationSplitView`/`AdwNavigationPage`/`AdwActionRow` in the app code.

That other example is a separate, unmerged branch (`epic/tasks-app`); this
one does not depend on it, copy from it, or share a directory name with it.
It is independent, and intentionally smaller — see "Out of scope" below.

| ![Tasks (nav): a sidebar with smart views and colored lists next to a task list with a filter toggle group.](../../docs/shots/tasks-nav.png) | ![The same window narrower than 500sp, collapsed to the sidebar alone.](../../docs/shots/tasks-nav-collapsed.png) |
| :------------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------: |
|                                                                     wide                                                                     |                                       collapsed below `collapseWidth={500}`                                       |

## Run it

```sh
npm install          # from the repo root (workspaces)
cd examples/tasks-nav
npm run dev           # gtkx dev — vite + Fast Refresh
npm run build && npm start   # release bundle
```

## What it demonstrates

Every one of the three gaps `examples/tasks-app`'s README named, closed on
`createSidebarNavigator` itself (see `docs/api.md` and
`docs/research/navigation-extensibility.md` for the mechanism behind each):

- **Sidebar row metadata**: `SidebarNavigationOptions.icon`/`color`/`count`.
  Smart views (All Tasks, Important, Trash) carry an Adwaita symbolic icon;
  user lists carry a colored dot instead; every row's count is a live badge
  recomputed from the store on every render.
- **Dynamic screens**: user lists are genuinely dynamic — pressing the "New
  List" button (content HeaderBar, top-right) adds a `Sidebar.Screen` the
  very next render. `createSidebarNavigator` is built on `TabRouter`, and
  this is the proof it tolerates a changing screen set, not just a fixed
  tab bar.
- **Native collapse**: `collapseWidth={500}` — below 500sp the split view
  collapses to one column through a native `Adw.Breakpoint`, not a
  `useWindowDimensions` conditional (see `docs/platform-layer.md`, "Two
  ways to react to size"). Selecting a row while collapsed reveals content;
  the native back button that appears returns to the sidebar.
- **A content header that changes with selection**: one screen component
  (`src/screens/content-screen.tsx`) renders THREE different header shapes
  depending on its own local state — a filter toggle group (All/Open/Done)
  for a list, a plain title for Trash, a back button plus star/delete for
  an open task — all through `SidebarNavigationOptions.headerLeft`/
  `headerRight`/`headerTitle` and `navigation.setOptions()` called from an
  effect. Opening a task is a conditional render inside this ONE screen,
  never a push — exactly how `examples/tasks-app`'s own tutorial-derived
  content pane works, and exactly why `createStackNavigator` was never the
  right tool for it. No stack is used anywhere in this app.

## Out of scope

Deliberately smaller than `examples/tasks-app`, because the point of this
example is the navigator, not feature parity with the gtkx tutorial:

- No GSettings-backed preferences, desktop notifications, toasts, or
  drag-reorder.
- No "New List" dialog with a text field — a new list gets an
  auto-generated name and the next color in a fixed palette
  (`src/store.tsx`'s `LIST_COLOR_PALETTE`), added immediately. The point
  being proven is that adding a screen at runtime works, not dialog UX.
- No due dates or a "Today" smart view — only All Tasks, Important and
  Trash, plus user lists. Three smart views is already enough to show
  icon rows distinct from colored-dot rows.
- Task storage is in-memory (a `useReducer`, see `src/store.tsx`) — closing
  the app loses data. `examples/tasks-app` demonstrates file-backed
  persistence; that is not what this example is about.

## What this could not do

Everything the PRD's checklist named — row metadata, a dynamically
changing screen set, native collapse, and a per-selection content
header — was expressible through `createSidebarNavigator`'s options after
this epic's work.

One smaller thing was not, and this app worked around it rather than
leaving it unmentioned: **the sidebar PANE's own chrome is not
customizable** — its `AdwToolbarView`'s `AdwHeaderBar` is hard-coded
(`<AdwHeaderBar />`, no props), so the only thing a navigator consumer can
set on it at all is `sidebarTitle` (a plain string). This app's "New List"
action wanted to live there (matching upstream's own tutorial, where the
sidebar header carries the "add list" button) but had to go on the
CONTENT header instead, via the navigator-level `headerButtons` prop
(shows on every screen, which is a reasonable place for a persistent
global action, just not where this app would have put it first). Recorded
in `docs/research/navigation-extensibility.md` as an open item; not fixed
here because it was not on the PRD's checklist and a workaround existed.

## Verified live

Built and launched in the VM's real GNOME session
(`node scripts/vm.ts app examples/tasks-nav`), not just headless tests —
and it caught a real bug headless tests did not: the first live screenshot
showed every row's task title missing, only the list-name badge visible.
Root cause: `ScrollView`'s content defaults to `alignItems: "flex-start"`,
so each row hugged its own content width instead of stretching to the
screen's width, and the title `Text`'s `flex: 1` (`flexBasis: 0`) had no
free space to grow into inside a non-stretched parent — the exact gotcha
`examples/gallery`'s own styles already document for its ScrollView
sections. Fixed with `contentContainerStyle={{ alignItems: "stretch" }}`;
confirmed fixed with a second screenshot (both above are post-fix).

Mouse-driven verification hit the same HiDPI coordinate-scaling issue
`examples/tasks-app`'s README already recorded for this VM session, so
interaction was driven by keyboard instead (`Tab`/`Enter`, GTK's own
focus-follows-tab through the sidebar's `GtkListBox`), the same workaround
that example used successfully for its own live pass:

- **Sidebar navigation**: tabbing between rows changes the active screen
  live (confirmed twice, deterministically) — counts, colors and the
  content pane all update correctly.
- **Dynamic screens**: activating the header's "New List" button added a
  new colored row (`List 3`, the next palette color) immediately, live —
  the `createSidebarNavigator`/`TabRouter` dynamic-screen-set claim, not
  just asserted in `examples/tasks-nav`'s design but actually exercised.
- **Trash / restore**: tabbing into Trash's content and activating a row
  restored it live — the count moved from Trash back into All Tasks and
  its list, and the empty state ("Trash is empty") rendered correctly
  once Trash had nothing left in it.
- **Collapse**: launched at a width below `collapseWidth={500}` (400),
  the split view showed the sidebar alone, matching the automated GTK
  test's headless resize exactly (`tests/gtk/navigation/sidebar-collapse.gtk.test.tsx`).
- **Collapsed selection and back** (the `collapse-nav` epic — the
  maintainer-reported bug this fixed): launched already below
  `collapseWidth` (420), confirmed sidebar-only, no content — matching the
  "cold start defaults to the sidebar" finding in
  `docs/research/navigation-extensibility.md`. Pressed Down twice
  (keyboard, no mouse): the active screen changed to "Important" AND the
  content pane opened with the native back chevron, live — this is the
  `state.index` effect's `showContentIfCollapsed()` call, the actual fix
  (a plain `navigate()` with no row click reveals content, where it
  previously did not). Pressed Escape: back to the sidebar, "Important"
  still the selected row — the split view's own back affordance, with
  react-navigation state provably untouched. Both states screenshotted.

**Not verified live in this pass**, for lack of a reliable pointer in this
VM session rather than any known defect: opening a task's detail editor
and the header swapping to back/star/delete. That exact mechanism
(`navigation.setOptions` swapping `headerLeft`/`headerRight`/`headerTitle`)
is covered by
`tests/gtk/navigation/sidebar-dynamic-header.gtk.test.tsx`, which drives
the identical code path this screen uses — it asserts the header content
itself changes, not just that the option was accepted — but that is a
headless assertion, not a live one. Re-activating the SAME already-selected
row after going back (needs re-focusing the row first, which the keyboard
sequence used for the collapse pass above did not do) is likewise only
covered headlessly, by the pre-existing
`tests/gtk/navigation/sidebar-collapse.gtk.test.tsx` test for it.

**Found live, unrelated to collapse-nav, not fixed**: a small `+`-only
control renders in its own thin strip above both the sidebar's and the
content's own `AdwHeaderBar`s, under `chrome: "content"`. Present on the
very first paint at the default width, before any collapsing or
navigation, so it predates and is independent of the `collapseWidth`
work — most likely a `chrome: "content"` window-chrome detail, not
anything in `createSidebarNavigator` itself. Not investigated further;
recorded here rather than silently left unmentioned.

## Attribution

Application concept (smart views, colored lists, a task editor) inspired by
the [gtkx tutorial](https://gtkx.dev/tutorial/)'s Tasks app, the same
public source `examples/tasks-app` ports — no code or assets are shared
between the two examples or copied from either upstream project.
