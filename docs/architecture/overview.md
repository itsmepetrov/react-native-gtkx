# Overview

react-native-gtkx renders the `react-native` API as real GTK4 and libadwaita
widgets. Two dependencies do the heavy lifting: [gtkx](https://github.com/gtkx-org/gtkx)
is a React reconciler for GTK4 with an in-process FFI into libgtk (NAPI-RS),
and [Yoga](https://yogalayout.dev) — the same flexbox engine React Native
itself uses — computes layout. This package is the layer between them: it
gives GTK widgets React Native's component shapes, drives their position and
size from Yoga, and turns the visual half of a React Native style into GTK
CSS.

## The path from JSX to a window

A `View`, a `Text`, a `Pressable` are ordinary React function components —
this package has no reconciler of its own. Each one renders a gtkx host
element (a `GtkBox`, in `View`'s case) that gtkx's own reconciler mounts as a
real GTK widget through the FFI: a widget call is a synchronous, in-process
call, with no serialization step between it and the code that made it. That
removes the "bridge tax" that shaped classic React Native's architecture —
there is no batched JSON channel to a separate UI thread to cross.

Position and size are a second, independent handoff. Every RN-shaped
container widget installs a custom `Gtk.LayoutManager` subclass, registered
from JS, whose `measure()` and `allocate()` vfuncs do nothing but ask this
package's own layout engine for a number and a set of child rectangles. GTK's
layout cycle is not synchronized with Yoga after the fact — for these
widgets, Yoga computes the layout GTK's allocation pass performs. The engine
that does this, the shadow tree it keeps, and the style split that feeds it
are the subject of [Layout and styling](layout-and-styling).

## Three subpaths beneath the portable surface

Everything reachable from plain `"react-native"` is portable. Underneath it,
three subpaths give you the platform itself, with nothing filtered out:

```
your app
   ├── react-native                    portable components
   ├── react-native-gtkx/navigation    react-navigation adapter   (optional)
   ├── react-native-gtkx/common        what this package wrote itself
   ├── react-native-gtkx/adw           libadwaita widgets, bound directly
   └── react-native-gtkx/gtk           GTK widgets, bound directly
```

Three rules make the rest of this page easy to reason about:

1. **The import says what you're opting into.** Anything from
   `react-native-gtkx/gtk` or `react-native-gtkx/adw` is Linux-only, which
   shows up in review as a decision, not an accident.
2. **A prefix tells you whose widget it is.** `AdwHeaderBar`, `GtkButton`,
   `AdwNavigationView` — that IS the widget, bound by gtkx. No prefix —
   `NavigationStack`, `SlotContent`, `Widget` — means this package wrote it.
   A wrapper of ours never makes the underlying widget unreachable.
3. **None of this knows about react-navigation.** No router is involved and
   none is required. `react-native-gtkx/navigation` is a thin adapter built
   on these primitives, the same way `@react-navigation/native-stack` is
   built on `react-native-screens` — an app can skip the adapter entirely
   and drive an `Adw.NavigationView` from its own state. See
   [Window, navigation, and settings](integration) for that adapter and for
   everything the three subpaths expose beyond a single widget.

## The widget surface: wrapped, raw, and auxiliary

Every `Gtk.Widget` and `Adw.Widget` subclass gtkx binds is exported — 86 GTK
widgets and 46 Adwaita widgets at present, from `GtkBox` and `GtkButton` to
`GtkColumnView` and `AdwToolbarView`. The list is generated, not hand-picked:
`scripts/generate-widget-surface.ts` classifies gtkx's full binding by real
GObject inheritance, and the classification is committed
(`scripts/widget-surface/classification.json`) so it stays exact between
gtkx upgrades — re-run the generator after one to pick up new widgets; it
diffs against its own previous output.

Most of that surface is **wrapped**: it keeps every prop gtkx binds and gains
`style`/`onLayout`, exactly like any other React Native component.

```tsx
<GtkEntry
  style={{ flex: 1 }}
  placeholderText="Filter"
/>
<GtkButton
  style={{ width: 72, backgroundColor: "#3584e4", borderRadius: 6 }}
  label="Go"
/>
```

The entry flexes, the button takes its own width and color — the layout half
of the style drives Yoga, the visual half becomes a GTK CSS class **on the
widget itself**, so the button really is blue rather than a blue box sitting
behind one.

Two families are exported **raw** instead, because a wrapper box around them
would be invalid GTK rather than a convenience:

- **Toplevels** — everything implementing `GtkRoot`: `GtkWindow` and every
  `Gtk*Dialog`, `GtkApplicationWindow`, `GtkAssistant`, `GtkShortcutsWindow`
  and their Adwaita counterparts (`AdwWindow`, `AdwApplicationWindow`,
  `AdwAboutWindow`, `AdwMessageDialog`, `AdwPreferencesWindow`), plus
  `GtkDragIcon` — which derives `Gtk.Widget` directly and is a toplevel all
  the same, which is why the rule is written against the `GtkRoot`
  capability rather than against `Gtk.Window` as one familiar instance of
  it. `GtkPopover` sits on the other side of that line — a `GtkNative` but
  not a `GtkRoot`, parented with `gtk_popover_set_parent` — and stays
  wrapped.
- **Child-only widgets** — valid solely as the direct child of one specific
  parent. `GtkListBoxRow` and `GtkFlowBoxChild` (plus everything deriving
  them — every Adwaita preferences row, `AdwActionRow` included) are caught
  mechanically, by inheritance. `AdwNavigationPage` and `AdwPreferencesPage`
  derive `Gtk.Widget` directly with no shared base to catch them the same
  way, so they're a small, doc-verified denylist instead — see
  `scripts/widget-surface/classify.ts`.

Every raw export above is still exported, by name, from `react-native-gtkx/gtk`
or `/adw`, exactly as gtkx binds it — reach the widget with a `ref` where you
need one directly. `GtkGestureClick` is a third, simpler case: an event
controller, not a widget at all, so it was never a candidate for wrapping.

A further set of exports are not `Gtk.Widget`/`Adw.Widget` subclasses at all,
so the generator never sees them either: actions and menus (`GSimpleAction`,
`GMenu`), a responsive breakpoint (`AdwBreakpoint`, detailed in
[Layout and styling](layout-and-styling)), one option of an `AdwToggleGroup`
(`AdwToggle`), the two leaf elements an `AdwShortcutsDialog` is built from,
a text buffer and an adjustment (`GtkTextBuffer`, `GtkAdjustment`), keyboard
shortcuts (`GtkShortcut`, `GtkShortcutController`), and the two drag-and-drop
controllers (`GtkDragSource`, `GtkDropTarget`):

```tsx
<GtkApplicationWindow
  actions={
    <GSimpleAction
      name="new"
      onActivate={onNew}
    />
  }
  breakpoints={
    <AdwBreakpoint
      condition={Adw.BreakpointCondition.parse("max-width: 500sp")}
      onApply={() => setCollapsed(true)}
      onUnapply={() => setCollapsed(false)}
    />
  }
/>
```

## `react-native-gtkx/common`: what has no upstream counterpart

Nothing in this subpath carries an `Adw`/`Gtk` prefix, because none of it is
a binding — it's the plumbing between the two worlds:

- **`Icon`** — a _named_ icon resolved against the desktop icon theme at
  paint time, not a bundled asset like RN's `Image`. It recolors itself
  with the label color and follows the user's theme, which nothing in
  `Image`'s contract can express, behind the same shape RN apps already use
  (`<Icon name size />`).
- **`SlotContent` / `IntrinsicContent`** — the boundary that lets React
  Native content live inside a GTK widget's slot or content area. Detailed
  in [Layout and styling](layout-and-styling), which is where the boundary
  actually matters.
- **`Widget` / `wrapReactNative` / `useWidgetLayout`** — the reverse
  direction: giving a raw GTK widget a place in React Native layout. Also in
  [Layout and styling](layout-and-styling).
- **`NavigationStack` / `NavigationStackPage`** — a declarative layer over
  `Adw.NavigationView`, which is imperative (`push`/`pop`/`pop_to_tag`) where
  React is not. Detailed in
  [Window, navigation, and settings](integration).

This platform does not re-implement Adwaita chrome in React Native — reach
for `AdwActionRow` and friends from `react-native-gtkx/adw`, inside a
`GtkListBox` with `cssClasses={["boxed-list"]}` (see the
[Reference](../reference) for the full row family). The style layer's
`boxShadow`, `outline*` and `textDecorationLine` properties exist precisely
so that an Adwaita-looking list stays expressible in a plain `StyleSheet`
when you do want to build one by hand — the frame is a three-part
`box-shadow` rather than a border, the focus ring an `outline`, which takes
no layout space. Drag-to-reorder goes through one module,
`react-native-gtkx/dnd` (see the Reference) — a `Droppable` around a
`Draggable` per row inside one `DropProvider` — rather than a bespoke
reorder prop.

## Namespaces

`Adw`, `Gdk`, `Gio`, `Gtk` and `Pango` are exported as values from both
`react-native-gtkx/gtk` and `/adw`, because code needs both the runtime enums
and the types:

```tsx
const scroller = <GtkScrolledWindow hscrollbarPolicy={Gtk.PolicyType.NEVER} />
const viewRef = useRef<Adw.NavigationView | null>(null)
```

## Wrapping a widget this package hasn't caught up to yet

`scripts/generate-widget-surface.ts` covers every `Gtk.Widget`/`Adw.Widget`
subclass gtkx binds as of its last run, but a gtkx release can add a widget
before the generator has been re-run for it, and a non-widget GI class (an
event controller, a filter, an adjustment) was never a generator candidate in
the first place. `wrapReactNative` reaches either without waiting — it's
generic, so the widget's own prop types survive:

```tsx
import { GtkPopover } from "@gtkx/jsx/gtk"
import { wrapReactNative } from "react-native-gtkx/common"

const Popover = wrapReactNative(GtkPopover)
// <Popover style={{ width: 240 }} autohide … /> — `autohide` still typed
```

That's the same mechanism the generated surface itself uses under the hood,
applied by hand. Two lower-level forms exist for cases even that doesn't fit:
`<Widget style={…}>` wraps an element already in hand, and
`useWidgetLayout(ref, { style })` attaches layout to a widget whose ref you
already own, with no wrapper component at all.

## The escape hatch

If something is still missing, reach the widget directly — every wrapper
here forwards its `ref` to the real GObject:

```tsx
const viewRef = useRef<Adw.NavigationView | null>(null)
<NavigationStack ref={viewRef} stack={stack}>…</NavigationStack>
// viewRef.current is the real Adw.NavigationView
```

There is deliberately no wall. A missing convenience should cost one line,
not a fork.

---

Measured numbers behind these decisions (the Yoga/GTK feasibility spike,
frame-budget studies, the navigation research) live in `docs/research/` —
repo-only working notes, not published here. The standing gtkx upstream
agenda is `docs/upstream-gtkx.md`, and every workaround the bridge carries
is cataloged in `docs/gtkx-1.2-notes.md`.

## Related

- [Reference](../reference) — the full component and API surface, GTK/Adw
  by badge.
- [Layout and styling](layout-and-styling) — the Yoga shadow tree, the
  layout/visual style split, and the two ways to react to a resize.
- [Window, navigation, and settings](integration) — `NavigationStack`,
  window actions and controllers, `GSettings`.
- [Gestures](gestures) — the responder system and `PanResponder` on GTK
  event controllers.
