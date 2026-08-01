# The platform layer: `gtk`, `adw`, `common`

React Native gives you a portable surface. This subpath gives you the platform
underneath it: GTK4 and libadwaita widgets as React components, with **nothing
filtered out**.

Three rules make it easy to reason about:

1. **It is not portable, and the import says so.** Anything you take from
   `react-native-gtkx/gtk` and `react-native-gtkx/adw` is Linux-only. That is deliberate — it shows up
   in review as a decision, not as an accident.
2. **A prefix tells you whose component it is.** `AdwHeaderBar`, `GtkButton`,
   `AdwNavigationView` — that IS the widget, as gtkx binds it. No prefix —
   `NavigationStack`, `SlotContent`, `Widget` — means it is ours. A wrapper of
   ours therefore never makes a standard widget unreachable.
3. **It does not know about react-navigation.** No router is involved, none is
   required. `react-native-gtkx/navigation` is a thin adapter built on top of
   this subpath, exactly the way `@react-navigation/native-stack` is built on
   top of `react-native-screens`. You can skip the adapter entirely.

```
your app
   ├── react-native                    portable components
   ├── react-native-gtkx/navigation    react-navigation adapter   (optional)
   ├── react-native-gtkx/common        what we wrote ourselves    (this page)
   ├── react-native-gtkx/adw           libadwaita widgets         (this page)
   └── react-native-gtkx/gtk           GTK widgets                (this page)
```

## Why you would reach for it

- A GTK capability that React Native has no concept of: a real
  `Adw.NavigationView` stack, a `GtkListBox` row, a native `GtkEntry`.
- Your own router, or no router: drive navigation from `useState`, a reducer,
  a URL, a state machine.
- A property we did not think to surface in the navigator's options. Every
  widget below is re-exported straight from the gtkx bindings, so the full
  GObject property and signal surface is yours — including properties added
  to gtkx after this page was written.

## What is exported

### Declarative primitives

These are the two components we wrap, because a raw `Adw.NavigationView` is
imperative (`push`, `pop`, `pop_to_tag`) and React is not.

| Export                | What it is                                             |
| --------------------- | ------------------------------------------------------ |
| `NavigationStack`     | `Adw.NavigationView` driven by a `stack` array of tags |
| `NavigationStackPage` | one page of that stack, identified by `tag`            |

They **inherit every prop of the underlying widget** and only add to it, so
anything you could set on `Adw.NavigationPage` you can set on
`NavigationStackPage`.

### React Native content inside GTK slots

| Export             | Sizing                       | Use for                                          |
| ------------------ | ---------------------------- | ------------------------------------------------ |
| `SlotContent`      | fills the slot               | a page body, a pane, a dialog body               |
| `IntrinsicContent` | sized by its own Yoga layout | an AdwHeaderBar slot, a toolbar area, a list row |

`createSidebarNavigator`'s `sidebarRow` screen option (docs/api.md) wraps
its content in exactly `IntrinsicContent` for this reason — a row is sized
by what it holds, not stretched to fill the list.

**Every content area inside a widget needs one of them.** A widget hands out
rectangles two ways: as ordinary CHILDREN (a content area) and as SLOTS —
properties that take a widget, `topBar={…}`, `titleWidget={…}`, `sheet={…}`.
Which way a given area arrives is gtkx's business and moves between releases
(rc.3 took the `content`/`child` props off single-child widgets and made that
content a child), and it has never had anything to do with layout. Both are
GTK's territory: the layout root is cleared on the way in, so a widget lands
bare (what `WidgetContent` does by hand) and React Native content has to bring
its own root.

```tsx
<AdwBottomSheet
  style={{ flex: 1 }}
  sheet={
    <IntrinsicContent>
      <View style={{ padding: 20, gap: 10 }}>…</View>
    </IntrinsicContent>
  }
  bottomBar={
    <IntrinsicContent>
      <View style={{ flexDirection: "row", gap: 8 }}>…</View>
    </IntrinsicContent>
  }
>
  {/* the content area — a child under rc.3, and just as much a boundary */}
  <SlotContent>
    <View style={{ flex: 1, justifyContent: "center" }}>…</View>
  </SlotContent>
</AdwBottomSheet>
```

Forget the wrapper and you get an error naming the widget and where the
content landed, not a wrong-looking window: without a root, content inside a
widget would join the ENCLOSING Yoga tree — laid out against the window's
viewport while GTK hands it the widget's own rectangle.
`examples/bottom-sheet` is that whole story in one screen.

Which of the two is yours to choose, and the platform deliberately does not
guess: `AdwBottomSheet` alone FILLS in its content child but HUGS in both
`sheet` and `bottomBar`. One widget, three content areas, two answers, with
nothing in the name or the GIR type to tell them apart — the answer lives in
the widget's own layout code. Swapping them is visible immediately:
`SlotContent` in a bottom bar collapses it to nothing (a filling root reports
a zero minimum, so a size-to-content area is told "nothing"), and
`IntrinsicContent` around a content area leaves `flex: 1` with no viewport to
fill.

Note the two independent sizes here. `style={{ flex: 1 }}` on the widget is
the WIDGET's size in the surrounding React Native layout (a wrapped widget is
a Yoga leaf at its natural size until the style says otherwise); the wrapper
inside each content area is the CONTENT's size inside the rectangle that
widget then hands out.

### GTK widgets, driven by React Native

Every `GtkWidget` subclass gtkx binds — 86 of them at last count, from
`GtkBox` and `GtkButton` to `GtkColumnView` and `GtkEmojiChooser`. The list is
generated, not hand-picked: `scripts/generate-widget-surface.ts` classifies
gtkx's full binding by real GObject inheritance (see
`scripts/widget-surface/classification.json` for the exact list gtkx binds
today) and `src/gtk/widgets.generated.ts` is the committed result. Re-run the
generator after a gtkx upgrade to pick up new widgets — it diffs against its
own previous output and prints what changed.

They keep **every prop gtkx binds** and gain `style` and `onLayout`. Position
and appearance both come from the style prop, exactly like anywhere else in
React Native:

```tsx
<View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
  <GtkEntry
    style={{ flex: 1 }}
    placeholderText="Filter"
  />
  <GtkButton
    style={{ width: 72, backgroundColor: "#3584e4", borderRadius: 6 }}
    label="Go"
  />
</View>
```

The entry flexes, the button takes its width and its colour. The layout half
of the style drives Yoga; the visual half becomes a GTK CSS class **on the
widget itself**, so the button really is blue, not a blue box behind a button.
Set no size and the widget's own natural size wins.

**Outside React Native layout they step aside.** The same `GtkButton` dropped
into a `AdwHeaderBar`'s `start` or a `AdwToolbarView`'s `topBar` — where there is no
Yoga tree to join — renders as the bare widget. One symbol, both worlds, no
flag to remember.

### Unwrapped by necessity

Two families of widget are exported **raw** instead of wrapped, because a
wrapper box around them would be invalid GTK rather than a convenience:

- **toplevels** — everything that implements `GtkRoot`: `GtkWindow` and
  everything that derives it (every `Gtk*Dialog`, `GtkApplicationWindow`,
  `GtkAssistant`, `GtkShortcutsWindow`, and their Adwaita counterparts
  `AdwWindow`, `AdwApplicationWindow`, `AdwAboutWindow`, `AdwMessageDialog`,
  `AdwPreferencesWindow`) — plus `GtkDragIcon`, which derives `Gtk.Widget`
  directly and is a toplevel all the same. A wrapper box around a window is
  not a layout, it is two windows; and a drag icon inside one is a widget
  GTK cannot present at all. The rule is written against `GtkRoot` (the
  capability: owns its own surface, is presented, never parented) rather
  than against `Gtk.Window` (one familiar instance of it) precisely because
  `GtkDragIcon` is the case a class-shaped rule misses. `GtkPopover` sits on
  the other side of the line — a `GtkNative` but not a `GtkRoot`, and gtkx
  parents it with `gtk_popover_set_parent`, so it stays wrapped. Build a
  drag icon the way GTK does, from the drag itself
  (`Gtk.DragIcon.getForDrag(drag).setChild(…)`), not by mounting one.
- **child-only widgets** — valid solely as the direct child of one specific
  parent. `GtkListBoxRow` and `GtkFlowBoxChild` (plus everything that derives
  them — every Adwaita preferences row, `AdwActionRow` included) are caught
  mechanically, by real inheritance. `AdwNavigationPage` and
  `AdwPreferencesPage` derive `Gtk.Widget` directly with no shared base to
  catch them mechanically, so they are a two-entry, doc-verified denylist
  instead — see `scripts/widget-surface/classify.ts` for the exact reasoning
  behind each.

`GtkGestureClick` is a third, simpler case: an event controller, not a
widget at all, so it was never a candidate for wrapping in the first place.

Nothing here is unreachable — every raw export above is still exported,
by name, from `react-native-gtkx/gtk` or `/adw`, exactly as gtkx binds it.

### Auxiliary objects, not widgets at all

A further set of real JSX elements gtkx provides are not `Gtk.Widget` or
`Adw.Widget` subclasses either, so `scripts/generate-widget-surface.ts`
never sees them at all — same reason `GtkGestureClick` above is hand-kept
rather than generated, just a wider set: actions and menus (`GSimpleAction`,
`GMenu`), a responsive breakpoint (`AdwBreakpoint`), one option of an
`AdwToggleGroup` (`AdwToggle` — a segmented-control entry, not a widget of
its own) and the two leaf elements an `AdwShortcutsDialog` is built from
(`AdwShortcutsSection`, `AdwShortcutsItem`), a text buffer and an
adjustment — the model objects `GtkTextView`/spin- and scale-style widgets
bind to (`GtkTextBuffer`, `GtkAdjustment`), keyboard shortcuts
(`GtkShortcut`, `GtkShortcutController`), and the two drag-and-drop
controllers (`GtkDragSource`, `GtkDropTarget`). All of them are exported, by
name, from `react-native-gtkx/gtk` or `/adw`, next to `GtkApplication` and
`GtkGestureClick`.

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

**One caveat found while building `examples/tasks-app`, worth knowing before
you rely on it in a test:** `AdwBreakpoint`'s `onApply`/`onUnapply` never
fired in the `@gtkx/vitest` headless-sway gtk test project, even with a
genuine `swaymsg` resize past the condition's threshold (see
`packages/react-native-gtkx/tests/gtk/bridge/auxiliary-elements.gtk.test.tsx`)
— but it works exactly as documented in a real GNOME session (verified with
a throwaway app launched via `node scripts/vm.ts app`). Treat it as untestable
under headless sway today, not as broken.

### The window and application AppRegistry built

`useParentWindow` (the `Gtk.Window` ancestor), `useApplication` (the
`Adw.Application` — `.sendNotification(id, notification)` is the common
reason to reach it) and `quit` (the same function `AppRegistry` wires to a
window's own close button) are re-exported from `react-native-gtkx/gtk`.
None of these give you the window or application object ITSELF to build —
`AppRegistry.runApplication` already did that — they let already-mounted
code reach back into it, the same way `useBindSetting` needs a `Gtk.Window`
to bind a `defaultWidth` property on:

```tsx
const window = useParentWindow()
useBindSetting({
  schema,
  key: "window-width",
  object: window,
  property: "defaultWidth",
})
```

### GSettings

`useSetting` and `useBindSetting` come straight from `@gtkx/react`, re-
exported from `react-native-gtkx/gtk` next to the `Gio` namespace they read
and write through:

```tsx
const [value, setValue] = useSetting(schema, "color-scheme")
useBindSetting({
  schema,
  key: "window-width",
  object: windowRef,
  property: "defaultWidth",
})
```

Turning a `.gschema.xml` file into the `SettingsSchema` object these hooks
expect (`{ id, path, keys }`) is a build-time concern, not something this
subpath does — `#data/your-schema.gschema.xml` resolves for free on the
`gtkx dev`/`gtkx build` toolchain (the `gtkx:settings` vite plugin ships
inside `@gtkx/cli` itself), the same way `examples/tasks-app` uses it. It is
not wired into the Metro toolchain (`react-native run-linux`) at all — an
app on that path has to construct the `SettingsSchema` object by hand
(`{ id, path, keys: { "key-name": "s" } }`, matching the schema's own type
strings) or add its own build step.

### Adwaita structure

Every `Adw.Widget` subclass gtkx binds — 46 wrapped the same way as the GTK
widgets above, from `AdwAvatar` and `AdwCarousel` to `AdwToolbarView` and
`AdwViewSwitcher`. `AdwHeaderBar` and `AdwToolbarView` now take `style` too,
and still step aside into the bare widget in a slot that has no Yoga tree —
`AdwToolbarView`'s own `topBar` is exactly that kind of slot:

```tsx
<View style={{ flex: 1 }}>
  <AdwToolbarView
    style={{ flex: 1 }}
    topBar={<AdwHeaderBar showTitle={false} />}
  >
    <SlotContent>{/* … */}</SlotContent>
  </AdwToolbarView>
</View>
```

`AdwNavigationView` and `AdwNavigationSplitView` are wrapped the same way;
`NavigationStack` above is a declarative layer on top of the former, not a
replacement for it — the raw widget is always one import away.

`AdwApplicationWindow` (a toplevel) and `AdwNavigationPage` (valid only as a
direct child of `AdwNavigationView`/`AdwNavigationSplitView`) are exported
raw — see "Unwrapped by necessity" above.

### Namespaces

`Adw`, `Gdk`, `Gio`, `Gtk`, `Pango` — exported as values, because you need
both the runtime enums and the types:

```tsx
;<GtkScrolledWindow hscrollbarPolicy={Gtk.PolicyType.NEVER} />
const viewRef = useRef<Adw.NavigationView | null>(null)
```

## Navigation without a router

The stack is an array of tags. Change the array, the widget animates.

```tsx
import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { AdwHeaderBar, AdwToolbarView } from "react-native-gtkx/adw"
import {
  NavigationStack,
  NavigationStackPage,
  SlotContent,
} from "react-native-gtkx/common"

const App = () => {
  const [stack, setStack] = useState(["home"])

  return (
    <NavigationStack
      stack={stack}
      // The Adwaita back button, Escape, the back gesture and the
      // back-history menu all arrive here. Follow them in your own state.
      onPopped={(tag) => setStack((s) => s.filter((entry) => entry !== tag))}
    >
      <NavigationStackPage
        tag="home"
        title="Home"
      >
        <AdwToolbarView topBar={<AdwHeaderBar />}>
          <SlotContent>
            <Pressable onPress={() => setStack((s) => [...s, "detail"])}>
              <Text>Open detail</Text>
            </Pressable>
          </SlotContent>
        </AdwToolbarView>
      </NavigationStackPage>

      <NavigationStackPage
        tag="detail"
        title="Detail"
      >
        <AdwToolbarView topBar={<AdwHeaderBar />}>
          <SlotContent>
            <View />
          </SlotContent>
        </AdwToolbarView>
      </NavigationStackPage>
    </NavigationStack>
  )
}
```

A runnable version is `examples/adwaita-primitives` — three levels deep, with
React Native content in the header bar and a raw `GtkButton` beside it.

### `NavigationStack` props

Everything `Adw.NavigationView` has, plus:

| Prop                                        | Meaning                                                                                                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack`                                     | ordered page tags, root first. This is the navigation state                                                                                                                             |
| `animateTransitions`                        | forwarded straight to `Adw.NavigationView`'s own property. Default true — GTK has one transition style, so this is only ever on/off                                                     |
| `onPopped(tag)`                             | the WIDGET popped by itself. Not called for pops you caused by changing `stack`                                                                                                         |
| `onPageClosed(tag)`                         | a closing page finished animating out and left the tree                                                                                                                                 |
| `onTransitionStart()` / `onTransitionEnd()` | a push/pop/replace began / finished, the latter driven by the transitioning page's own `shown`/`hidden` signal                                                                          |
| `transitionDuration`                        | ms, default 400 — a fallback window for retention and the callbacks above, used only when a page's own transition signal never arrives; not a measurement of the real transition length |
| `ref`                                       | the `Adw.NavigationView` itself, for anything not modelled here                                                                                                                         |

Pages not listed in `stack` are still accepted as children and simply are not
shown, so a router may hand over all of its screens at once.

**Exit animations are handled for you.** When a tag leaves `stack`, the widget
still animates the page out. `NavigationStack` keeps a snapshot of that page
until its `hidden` signal (with a timer fallback for two cases where that
signal never arrives on its own: compositors that never emit it, and a page
skipped over entirely by a multi-hop pop — see `transitionDuration` above),
so you never have to keep rendering pages you already consider gone.

### React Native content in native chrome

An AdwHeaderBar slot wants a widget that knows its own size, which is what
`IntrinsicContent` provides:

```tsx
<AdwHeaderBar
  start={
    <IntrinsicContent>
      <Text>{stack.length} deep</Text>
    </IntrinsicContent>
  }
  end={[
    <GtkButton
      key="home"
      iconName="go-home-symbolic"
      onClicked={reset}
    />,
  ]}
/>
```

## Two ways to react to size

Two mechanisms answer two different questions, and neither is a replacement
for the other:

- **"Render different content at different widths"** — `useWindowDimensions`
  (from `react-native`, portable, already exists). A resize triggers a React
  render, your component reads the new width, you return different JSX.
  This is the right and ONLY tool for anything that changes what is
  rendered — swapping a filter bar for a compact one, hiding a column,
  changing text.
- **"Flip a widget property natively at a threshold, with no render at all"**
  — `AdwBreakpoint` + `AdwBreakpointBin`. `Adw.Breakpoint` is a condition
  (a size/aspect-ratio threshold) plus a set of property setters: when the
  condition starts holding, each setter writes its value onto its target
  object's property directly, through GObject, inside GTK's own allocation
  pass; when the condition stops holding, the setter puts the property back
  to whatever it held before. **No React commit, no Yoga pass, no JS
  callback runs for the flip itself** — a resize costs nothing beyond what
  GTK's layout was already doing.

  `Adw.Breakpoint` is not a widget — verified against the real binding,
  `Adw.Breakpoint.prototype instanceof Gtk.Widget` is `false`; its
  prototype chain bottoms out at plain `GObject.Object`. It draws nothing
  and occupies no space, so it is exported raw (`AdwBreakpoint`, from
  `react-native-gtkx/adw`), the same way `GtkGestureClick` is: running it
  through `wrapReactNative` would hand it a Yoga node for something that
  is not a rectangle, which is a layout bug, not a convenience.
  `Adw.BreakpointBin` (`AdwBreakpointBin`) IS a real widget — a container
  that scopes breakpoints to its own child subtree instead of a whole
  window — and is wrapped normally, taking `style`/flex like anything else
  here.

  A breakpoint's setters may only target widgets INSIDE the
  `AdwBreakpointBin` they are attached to, never the bin itself — so the
  widget whose property you want to flip must be the bin's child:

  ```tsx
  import { Adw, AdwBreakpoint, AdwBreakpointBin } from "react-native-gtkx/adw"

  const splitViewRef = useRef<Adw.NavigationSplitView | null>(null)
  const breakpointRef = useRef<Adw.Breakpoint | null>(null)

  useEffect(() => {
    if (!splitViewRef.current || !breakpointRef.current) return
    const collapsed = new GObject.Value()
    collapsed.init(GObject.typeFromName("gboolean"))
    collapsed.setBoolean(true)
    breakpointRef.current.addSetter(splitViewRef.current, "collapsed", collapsed)
  }, [])

  <AdwBreakpointBin
    breakpoints={
      <AdwBreakpoint
        ref={breakpointRef}
        condition={Adw.BreakpointCondition.newLength(
          Adw.BreakpointConditionLengthType.MAX_WIDTH,
          500,
          Adw.LengthUnit.SP,
        )}
      />
    }
  >
    <AdwNavigationSplitView ref={splitViewRef} …>…</AdwNavigationSplitView>
  </AdwBreakpointBin>
  ```

  `addSetter` wants a genuine, boxed `GObject.Value` — found empirically: a
  bare JS `true` fails a `G_IS_VALUE` assertion on the native side, it does
  not silently coerce. `createSidebarNavigator`'s own `collapseWidth` (see
  below) is built on exactly this pair; reading `collapsed`/`showContent`
  back (e.g. to decide whether a click should also reveal content) is a
  plain native property read through the same ref, not React state — so
  neither the flip nor a read of it costs a render.

No `useBreakpoint(condition) → boolean` hook exists, and none is planned:
it would return a flag to JS and trigger a re-render on every crossing,
which is precisely what `useWindowDimensions` already does — a second name
for the first mechanism, with none of the second's native-setter value.
If what you want is "my component's JSX changes", reach for
`useWindowDimensions`; only reach for `AdwBreakpoint` when the thing that
should change is a widget property GTK itself owns, and you want that
change to cost nothing.

## Mixing with react-navigation

They compose, because the navigator is built on these primitives. Use
`react-native-gtkx/navigation` for the app's structure and drop to
`react-native-gtkx/gtk` and `react-native-gtkx/adw` where you need a widget the options do not cover —
for example a raw `GtkButton` in `headerButtons`, or a `GtkListBox` inside a
screen.

Keeping portable code portable: put Linux-only UI behind a `.linux.tsx`
platform extension, or behind `Platform.select({ linux: … })`. Options a
platform does not understand are ignored, and in development the navigator
warns with the screen and option name rather than swallowing them silently.

## Wrapping a widget we do not export

The generated surface above covers every current `Gtk.Widget`/`Adw.Widget`
subclass gtkx binds, but "current" is doing work in that sentence: a gtkx
release can add a widget before this package's generator has been re-run for
it, and non-widget GI classes (an event controller, a filter, an adjustment)
were never candidates for the widget surface in the first place even though
a handful of them are occasionally worth putting inside RN layout too.
`wrapReactNative` is how you reach either without waiting on us — it is
generic, so the widget's own props keep their types:

```tsx
import { GtkPopover } from "@gtkx/jsx/gtk"
import { wrapReactNative } from "react-native-gtkx/common"

const Popover = wrapReactNative(GtkPopover)
// <Popover style={{ width: 240 }} autohide … /> — `autohide` still typed
```

(`GtkPopover` here is already part of the generated surface — this is the
same mechanism `src/gtk/widgets.generated.ts` uses under the hood, just
applied by hand. It stays useful the day gtkx binds something this package
has not regenerated for yet.)

Two lower-level forms exist for cases the wrapper does not fit:

- `<Widget style={…}>` — wrap an element you already have in hand;
- `useWidgetLayout(ref, { style })` — attach layout to a widget whose ref you
  own, with no wrapper component at all. Returns the GTK CSS class from the
  style's visual half, for you to pass to `cssClasses`.

## The escape hatch

If something is missing, reach the widget directly:

```tsx
const viewRef = useRef<Adw.NavigationView | null>(null)
<NavigationStack ref={viewRef} stack={stack}>…</NavigationStack>
// viewRef.current is the real Adw.NavigationView
```

There is deliberately no wall here. A missing convenience should cost you one
line, not a fork.

## Related

- [API v1](api.md) — the portable React Native surface.
- [Navigation research](research/navigation-extensibility.md) — how the
  adapter maps react-navigation onto these primitives.
- [What we need from gtkx](upstream-gtkx.md) — the upstream agenda.
