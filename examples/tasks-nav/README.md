# tasks-nav — a task manager, written entirely through `createSidebarNavigator`

The proof for the `navigation-depth-2` epic: a task manager of navigational
complexity comparable to [`examples/tasks-app`](../tasks-app/README.md#why-this-is-not-built-on-createsidebarnavigatorcreatestacknavigator)
(PR #18) — smart views and colored user lists in a sidebar, a content pane
that shows a task list or an open task's editor — built **entirely through
`createSidebarNavigator`**, with no direct
`AdwNavigationSplitView`/`AdwNavigationPage`/`AdwActionRow` in the app code.

That other example is a separate, unmerged branch (`epic/tasks-app`); this
one does not depend on it, copy from it, or share a directory name with it.
It is independent: the same application twice, one built by hand from
Adwaita widgets and one from the navigator, which is only a useful
comparison if they are actually the same application — so the features
that were parked while the navigator was still being proven (drag-reorder,
due dates, sorting, dialogs, shortcuts) are here too now. See
"Out of scope" for the short list that remains deliberately tasks-app's.

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

## Drag-and-drop reorder

Rows are dragged into a new order with GTK4's own drag-and-drop —
`GtkDragSource`/`GtkDropTarget` on each `AdwActionRow`, reached through
`react-native-gtkx/gtk` (`src/components/task-row.tsx`). The drag icon is
`Gtk.WidgetPaintable` of the row itself, the payload is the task id as a
`GObject` string value, and the drop calls the store's `reorder`.

| ![The task list before the drag: Water the plants, Renew passport, Book dentist appointment, Review the navigation-depth-2 PR, Update the sprint board.](../../docs/shots/tasks-nav-dnd-before.png) | ![The same list after dragging the last row onto the first: Update the sprint board is now at the top.](../../docs/shots/tasks-nav-dnd-after.png) |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------: |
|                                                                         before — the last row is "Update the sprint board"                                                                          |                                 after dragging it onto the first row, with a real pointer in a real GNOME session                                 |

**Why not a React Native drag library.** `react-native-draggable-flatlist`
and every relative of it are built on `react-native-gesture-handler` plus
`react-native-reanimated`. This platform implements neither, and neither is
shimmed or aliased — `docs/research/gestures.md` names draggable-flatlist
by name as blocked on Reanimated, and puts Reanimated-dependent consumers
out of scope. They would fail at import, not at runtime. A hand-rolled JS
drag is blocked one level lower: `View` has no touch or responder props at
all (only `Pressable`'s discrete press/hover, whose event carries just
`{x, y}`), and there is no `measure()`/`measureInWindow` to turn a row's
rect into window coordinates — the two things any JS drag needs. So the
choice was not "native vs. library", it was "native or build the RN gesture
stack first".

Even with both available, GTK's own drag-and-drop would still be the right
call for this app: it brings a real drag icon, correct cursors and GDK's
content negotiation (so a drop can cross widgets, or come from another
application) for free. The honest cost is portability — this path is
Linux-only, and an app sharing this screen with iOS/Android would have to
take the RN route instead. It costs this example nothing, because its whole
body is already a GTK widget tree (`contentLayout: "widget"`), but that is
a property of this app, not a general argument.

**When dragging is off.** `isReorderable` (`src/selectors.ts`) attaches the
controllers only where a drop means something: manual sort order, no active
search, not Trash. A drop under "sort by due date" would be overwritten by
the sort on the very next render; a search result is a projection with gaps,
so "put it here" has no single answer; and Trash is not a place to arrange
things. Same three conditions as `examples/tasks-app`'s own predicate, and
they are unit-tested (`tests/unit/selectors.test.ts`) rather than left to a
screenshot.

## Out of scope

Still deliberately smaller than `examples/tasks-app` — but only where the
difference is tasks-app's own subject rather than the navigator's:

- No desktop notifications, reminders or toasts.
- No "New List" dialog with a text field — a new list gets an
  auto-generated name and the next color in a fixed palette
  (`src/store.ts`'s `LIST_COLOR_PALETTE`), added immediately. The point
  being proven is that adding a screen at runtime works, not dialog UX.
- No "Today" smart view — only All Tasks, Important and Trash, plus user
  lists. Three smart views is already enough to show icon rows distinct
  from colored-dot rows, and tasks have due dates now regardless.
- No task notes, and no created/completed timestamps in the editor.
- Task storage is in-memory (see `src/store.ts`) — closing the app loses
  the tasks. PREFERENCES do persist, through GSettings
  (`data/dev.rngtkx.tasksnav.gschema.xml`): theme and sort order are
  settings, which is a different thing from the document being edited.
  `examples/tasks-app` demonstrates file-backed task persistence; that is
  not what this example is about.

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

### The parity pass (drag-reorder, due dates, sorting, dialogs, shortcuts)

Driven with a real pointer this time, not the keyboard, because a drag
cannot be proven any other way. The "HiDPI coordinate-scaling issue" the
pass above (and `examples/tasks-app`'s README) recorded turned out to be
ydotool's own documented requirement rather than anything about this
session: `mousemove --absolute` is implemented as a homing move plus a
relative one, so pointer acceleration bends it — its `--help` says so
outright. With `org.gnome.desktop.peripherals.mouse accel-profile` set to
`flat`, absolute coordinates land exactly, in LOGICAL desktop pixels
(this session: a 2560×1600 mode at scale 1.25, so a 2048×1280 space).
Calibrated by clicking a sidebar row and checking the app switched to it.
Anyone repeating this should set the flat profile first and restore it
afterwards.

- **Drag reorder**: dragged the last row ("Update the sprint board") onto
  the first — button down on the row, relative moves up the list, release
  over the target. It landed first, and its star/trash state came with
  it. Both screenshots are the pair shown under "Drag-and-drop reorder"
  above.
- **The drag gate**: with Sort order switched to "Due date" in
  Preferences, the byte-identical drag changed nothing — no
  `GtkDragSource` is attached at all in that state.
- **Sorting**: switching to "Due date" re-sorted the list live
  (yesterday → today → tomorrow → next week → undated last), through
  GSettings, and survived the dialog closing.
- **Preferences / Shortcuts / delete confirmation**: all opened and
  worked. `Ctrl+?` opened the Shortcuts window (so `actionAccels` and the
  `win.*` actions are really registered, not just declared); the Trash
  row's permanent-delete button raised the confirmation, and confirming
  emptied Trash down to its empty state.
- **`Ctrl+N` and `Escape`**: Ctrl+N added a task and opened its editor;
  Escape closed the editor back to the list.

**Two things this pass found that no test had:**

1. `Ctrl+N` added a task and then opened **the wrong one** — "Water the
   plants" instead of the task it had just created. The id counter starts
   at zero, so the first generated id was `task-1`, which was already a
   seeded task's id, and `tasks.find(id)` matched the seed first. A
   pre-existing bug in this example, invisible until something actually
   created a task and navigated to it. Fixed by giving seeds their own
   `seed-*` namespace, disjoint from generated ids by construction rather
   than by counting.
2. `windowActions`/`windowControllers` render as props of the window
   `AppRegistry.runApplication` builds — **siblings of the app's own tree,
   not descendants**. No React context from inside the app can reach them,
   so this example's Context store had to become a module-level external
   store (`useSyncExternalStore`) before `Ctrl+N` could add a task at all.
   Not a defect — those elements have to exist before the app mounts — but
   a real constraint on any app that wants window actions, and one
   `examples/tasks-app` never met because zustand is module-global anyway.
   Worth a line in `docs/api.md` if it bites a third app.

## Attribution

Application concept (smart views, colored lists, a task editor) inspired by
the [gtkx tutorial](https://gtkx.dev/tutorial/)'s Tasks app, the same
public source `examples/tasks-app` ports — no code or assets are shared
between the two examples or copied from either upstream project.
