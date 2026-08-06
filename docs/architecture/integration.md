# Window, navigation, and settings

Some capabilities belong to the window or the application, not to any one
widget: navigation state, keyboard shortcuts, actions a menu or a
notification can target, and settings that outlive a single render. This
page is how React Native components reach those without reaching for
`runApplication`'s static options.

## Navigation without a router

`NavigationStack` and `NavigationStackPage` are the two components this
package wraps a raw `Adw.NavigationView` in, because it's imperative
(`push`/`pop`/`pop_to_tag`) where React is not:

### Declarative primitives

| Export                | What it is                                             |
| --------------------- | ------------------------------------------------------ |
| `NavigationStack`     | `Adw.NavigationView` driven by a `stack` array of tags |
| `NavigationStackPage` | one page of that stack, identified by `tag`            |

They inherit every prop of the underlying widget and only add to it, so
anything settable on `Adw.NavigationPage` is settable on `NavigationStackPage`
too. The navigation state is an ordinary array of tags — change the array,
the widget animates:

```tsx
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

Pages not listed in `stack` are still accepted as children and simply aren't
shown, so a router can hand over every screen it owns at once. As an app's
root — where GTK allocates it directly — `NavigationStack` needs nothing
else; nested anywhere inside a React Native layout it needs wrapping in
`Widget`, because the component renders a raw `Adw.NavigationView`, which has
no Yoga node of its own.

`NavigationStack` inherits every prop of `Adw.NavigationView` and adds:

| Prop                                        | Meaning                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack`                                     | ordered page tags, root first — the navigation state                                                                                                                            |
| `animateTransitions`                        | forwarded to `Adw.NavigationView`'s own property; default true. GTK has one transition style, so this is on/off                                                                 |
| `onPopped(tag)`                             | the widget popped by itself — not called for pops caused by changing `stack`                                                                                                    |
| `onPageClosed(tag)`                         | a closing page finished animating out and left the tree                                                                                                                         |
| `onTransitionStart()` / `onTransitionEnd()` | a push/pop/replace began or finished, the latter driven by the transitioning page's own `shown`/`hidden` signal                                                                 |
| `transitionDuration`                        | ms, default 400 — a fallback window for retention and the callbacks above, used only when a page's transition signal never arrives; not a measurement of real transition length |
| `ref`                                       | the `Adw.NavigationView` itself                                                                                                                                                 |

**Exit animations are handled for you.** When a tag leaves `stack`, the
widget still animates the page out — `NavigationStack` keeps a snapshot of
that page until its `hidden` signal, with a timer fallback for the two cases
where that signal never arrives on its own (a compositor that never emits
it, and a page skipped over entirely by a multi-hop pop), so nothing keeps
rendering a page it already considers gone.

React Native content in native chrome is the same `IntrinsicContent`
boundary the layout page describes, used against a HeaderBar slot:

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

### Mixing with react-navigation

`react-native-gtkx/navigation` composes with everything above, because the
navigator is built on these same primitives — it is a convenience, not a
ceiling. Use it for an app's overall structure and drop to
`react-native-gtkx/gtk`/`/adw` wherever a screen needs a widget the
navigator's options don't cover: a raw `GtkButton` in `headerButtons`, a
`GtkListBox` inside a screen. Keep portable code portable with a `.linux.tsx`
platform extension or `Platform.select({ linux: … })` — an option a platform
doesn't understand is simply ignored, and in development the navigator warns
with the screen and option name rather than swallowing it silently.

## Reaching the window and the application

`useParentWindow` (the nearest `Gtk.Window` ancestor), `useApplication` (the
`Adw.Application` — `.sendNotification(id, notification)` is the common
reason to reach it), and `quit` (the same function `AppRegistry` wires to a
window's own close button) let already-mounted code reach back into objects
`AppRegistry.runApplication` already built, rather than construct them:

```tsx
const window = useParentWindow()
useBindSetting({
  schema,
  key: "window-width",
  object: window,
  property: "defaultWidth",
})
```

## Actions and shortcuts, declared in the tree

`WindowActions`, `ApplicationActions` and `WindowControllers` register their
children on the window or the application **from wherever they're written in
the component tree**. They render nothing where they sit — they're portals
in React's own sense: the children stay part of the tree at that position,
keeping the context, state and effects they'd have there, while the
registration itself lands on the window or application object.

```tsx
const NewTaskAction = () => {
  const { addTask } = useStore() // an ordinary React context store
  return (
    <WindowActions>
      <GSimpleAction
        name="new"
        onActivate={() => addTask()}
      />
    </WindowActions>
  )
}
```

That's `win.new` — what a HeaderBar button's `actionName`, a `GMenu` item and
an `actionAccels` entry all target. `ApplicationActions` is the same
component against the application's action map (`app.*`); the two prefixes
are not interchangeable — a `Gio.Notification`'s action button can only ever
activate an application action, and an application action outlives any one
window. `WindowControllers` takes `Gtk.EventController` children; a
`GtkShortcutController` with `scope={Gtk.ShortcutScope.GLOBAL}` is the
reason it exists.

**Reach for these, not `runApplication`'s `applicationActions`/
`windowActions`/`windowControllers` options.** Those options build their
children as props of the window `AppRegistry` creates, making them _siblings_
of the app tree rather than descendants — no provider inside the app sits
above them, so an action declared there can't read a React context at all.
The components fix all three things the options can't:

- **context works**, because the declaration is a descendant of its own
  provider;
- **registration is dynamic** — added on mount, removed on unmount, so one
  screen can own actions for exactly its own lifetime;
- **it composes** — two unrelated subtrees each declare their own without
  meeting in one shared options object.

`actionAccels` is not deprecated and stays a `runApplication` option: it's a
flat name→keys table with no children and nothing to read from context, and
it's deliberately process-wide — naming an action that isn't registered
right now simply does nothing. A shortcut that should come and go with a
screen is a `GtkShortcutController` inside `WindowControllers` instead.

**Two components, not one, because the two targets are different GObject
interfaces with different duplicate semantics.** Actions land on the window
as a `Gio.ActionMap` (`addAction`/`removeAction`, keyed by name); controllers
land on it as a `Gtk.Widget` (`addController`/`removeController`, keyed by
the controller object itself). One component sorting its children by type
would fail silently on a wrong child; two fail at the type level instead.

A duplicated action name goes to the **first** declaration; a second one is
ignored, with a development warning naming it. This isn't an arbitrary
choice between first and last: `Gio.ActionMap` is name-keyed at both ends —
`addAction` silently replaces a same-named action, and `removeAction` takes a
name, not the action object. Under "last wins," the first of two same-named
declarations to unmount would remove whatever currently answers to that
name, leaving the _other_ one mounted but dead. First-wins is the only order
where release always precedes acquire: the loser never registers, and when
the winner unmounts (removing its own action, correctly) the claim passes to
whichever declaration is still mounted, registering in a later commit. To let
a screen override a shortcut, give it its own name, or move the declaration
somewhere both screens can reach.

Inside a `Modal`, the enclosing window is the modal's own, so actions and
controllers declared there belong to it and go away with it — usually what a
dialog wants. Under `chrome: "content"` and inside the navigators nothing
changes: the window is still the one `AppRegistry` built, the navigators own
widgets inside it rather than its action map, and a HeaderBar button in a
page resolves `win.*` up through the widget hierarchy to that same window.
One consequence worth knowing: react-navigation keeps a popped screen
mounted until its exit transition ends, so a screen's actions and
controllers outlive the pop by the length of the animation.

## `Controllers`: a GTK event controller on a React Native component

The same idea one level down — `Controllers` attaches its children to the
widget of the _enclosing_ React Native component, `View`, `Pressable`,
`ScrollView`, `Animated.View`, any of them:

```tsx
<Pressable onPress={open}>
  <Controllers>
    <GtkDragSource
      actions={Gdk.DragAction.MOVE}
      onPrepare={(x, y, self) =>
        Gdk.ContentProvider.newForValue(
          GObject.buildValue(GObject.TYPE_STRING, (v) => v.setString(id)),
        )
      }
    />
  </Controllers>
  <Text>{title}</Text>
</Pressable>
```

**Why it exists.** A `Pressable`'s `ref` is deliberately a `ViewHandle`
(`measure`/`measureInWindow`/`measureLayout`) and not a `Gtk.Widget` — React
Native's contract says nothing about widgets, and reaching a real GObject
through a ref would pin every internal of this platform as public API. GTK
carries behavior no style and no RN prop expresses, drag-and-drop above all,
and `Controllers` is how a row written in ordinary React Native reaches it.

**Why a component, not a `controllers` prop on `View`.** A prop would sit on
a component an app shares with iOS and Android, imported from the _portable_
entry point — the file would compile everywhere, the prop would be ignored
off Linux, and the feature would vanish with no diagnostic. Here the import
itself is the signal: `react-native-gtkx/gtk` is a line an app already knows
it's crossing, one it already knows how to gate behind `Platform.OS` or a
`.linux.tsx` split — and its absence is visible in the tree rather than
silently inert.

Two properties follow from `Controllers` being a portal: **it composes with
context** (the handler that reorders a list is written where that list's
state already lives), and **it's lifecycle-bound** (attached on mount,
removed on unmount, so a screen's controllers leave with the screen).

One caveat, stated plainly: controllers attach **one commit after mount**.
React attaches host refs bottom-up, so the enclosing view's widget doesn't
exist yet when a child's own layout effects run. For an event controller
this is unobservable in practice — no pointer reaches a widget in its first
frame — but it does mean a test aiming a synthetic pointer at a freshly
mounted tree has to let one commit land first.

Inside a GTK widget's own slot there's no enclosing React Native component
and nothing to attach to; pass `controllers={…}` to the widget itself there
instead — the prop `Controllers` substitutes for everywhere else.

`react-native-gtkx/dnd` mirrors `react-native-reanimated-dnd`'s API
(`Draggable`, `Droppable`, `DropProvider`, `Sortable`) on top of exactly
these two controllers, and both bundler presets alias that package name onto
it — so does `react-native-gesture-handler`, onto a shim keeping
`GestureHandlerRootView` working — meaning a ported app's drag-and-drop
source runs unchanged.

## GSettings

`useSetting` and `useBindSetting` come from `@gtkx/react`, re-exported from
`react-native-gtkx/gtk` next to the `Gio` namespace they read and write
through:

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
subpath does. It resolves for free on the `gtkx dev`/`gtkx build` toolchain —
the `gtkx:settings` vite plugin ships inside `@gtkx/cli` itself — but it is
not wired into the Metro toolchain (`react-native run-linux`) at all; an app
on that path constructs the `SettingsSchema` object by hand
(`{ id, path, keys: { "key-name": "s" } }`, matching the schema's own type
strings) or adds its own build step.

## Related

- [Overview](overview) — where `NavigationStack`, `Widget`, and the rest of
  `react-native-gtkx/common` come from, and the widget taxonomy `Controllers`
  and the action components sit alongside.
- [Layout and styling](layout-and-styling) — `SlotContent`/`IntrinsicContent`,
  used throughout the navigation examples above.
