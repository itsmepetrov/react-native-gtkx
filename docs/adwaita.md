# `react-native-gtkx/adwaita` — the GTK layer

React Native gives you a portable surface. This subpath gives you the platform
underneath it: GTK4 and libadwaita widgets as React components, with **nothing
filtered out**.

Three rules make it easy to reason about:

1. **It is not portable, and the import says so.** Anything you take from
   `react-native-gtkx/adwaita` is Linux-only. That is deliberate — it shows up
   in review as a decision, not as an accident.
2. **A prefix tells you whose component it is.** `AdwHeaderBar`, `GtkButton`,
   `AdwNavigationView` — that IS the widget, as gtkx binds it. No prefix —
   `NavigationStack`, `PageContent`, `Widget` — means it is ours. A wrapper of
   ours therefore never makes a standard widget unreachable.
3. **It does not know about react-navigation.** No router is involved, none is
   required. `react-native-gtkx/navigation` is a thin adapter built on top of
   this subpath, exactly the way `@react-navigation/native-stack` is built on
   top of `react-native-screens`. You can skip the adapter entirely.

```
your app
   ├── react-native                    portable components
   ├── react-native-gtkx/navigation    react-navigation adapter   (optional)
   └── react-native-gtkx/adwaita       GTK widgets                (this page)
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
| `PageContent`      | fills the slot               | a page body, a pane, a dialog body               |
| `IntrinsicContent` | sized by its own Yoga layout | an AdwHeaderBar slot, a toolbar area, a list row |

### GTK widgets, driven by React Native

`GtkBox`, `GtkButton`, `GtkEntry`, `GtkLabel`, `GtkListBox`, `GtkPicture`,
`GtkScrolledWindow`, `GtkSpinner`, `GtkSwitch`, `GtkTextView`.

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

`GtkGestureClick` (an event controller, not a widget), `GtkListBoxRow` (valid
only as a direct child of a `GtkListBox`) and `GtkWindow` (a toplevel) are
exported raw: a wrapper around them would be invalid GTK rather than a
convenience.

### Adwaita structure

`AdwApplicationWindow`, `AdwHeaderBar`, `AdwNavigationSplitView`, `AdwToolbarView` —
re-exported verbatim. These are chrome you build the window out of, not
children of a flex row, so they take no `style`.

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
import {
  AdwHeaderBar,
  AdwToolbarView,
  NavigationStack,
  NavigationStackPage,
  PageContent,
} from "react-native-gtkx/adwaita"

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
          <PageContent>
            <Pressable onPress={() => setStack((s) => [...s, "detail"])}>
              <Text>Open detail</Text>
            </Pressable>
          </PageContent>
        </AdwToolbarView>
      </NavigationStackPage>

      <NavigationStackPage
        tag="detail"
        title="Detail"
      >
        <AdwToolbarView topBar={<AdwHeaderBar />}>
          <PageContent>
            <View />
          </PageContent>
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

| Prop                                        | Meaning                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `stack`                                     | ordered page tags, root first. This is the navigation state                     |
| `onPopped(tag)`                             | the WIDGET popped by itself. Not called for pops you caused by changing `stack` |
| `onPageClosed(tag)`                         | a closing page finished animating out and left the tree                         |
| `onTransitionStart()` / `onTransitionEnd()` | a push/pop/replace began / finished                                             |
| `transitionDuration`                        | ms, default 400 — used for retention and the callbacks                          |
| `ref`                                       | the `Adw.NavigationView` itself, for anything not modelled here                 |

Pages not listed in `stack` are still accepted as children and simply are not
shown, so a router may hand over all of its screens at once.

**Exit animations are handled for you.** When a tag leaves `stack`, the widget
still animates the page out for about 200 ms. `NavigationStack` keeps a
snapshot of that page until its `hidden` signal (with a timer fallback for
compositors that never emit it), so you never have to keep rendering pages
you already consider gone.

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

## Mixing with react-navigation

They compose, because the navigator is built on these primitives. Use
`react-native-gtkx/navigation` for the app's structure and drop to
`react-native-gtkx/adwaita` where you need a widget the options do not cover —
for example a raw `GtkButton` in `headerButtons`, or a `GtkListBox` inside a
screen.

Keeping portable code portable: put Linux-only UI behind a `.linux.tsx`
platform extension, or behind `Platform.select({ linux: … })`. Options a
platform does not understand are ignored, and in development the navigator
warns with the screen and option name rather than swallowing them silently.

## Wrapping a widget we do not export

gtkx binds far more of GTK than this subpath re-exports. `wrapReactNative`
turns any of it into a React Native citizen, and it is generic, so the
widget's own props keep their types:

```tsx
import { GtkPopover } from "@gtkx/jsx/gtk"
import { wrapReactNative } from "react-native-gtkx/adwaita"

const Popover = wrapReactNative(GtkPopover)
// <Popover style={{ width: 240 }} autohide … /> — `autohide` still typed
```

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
