# Layout and styling

React Native's layout model is Yoga, and Yoga's numbers have to end up as
real GTK widget rectangles. This page is about the two mechanisms that make
that true in both directions — a Yoga shadow tree feeding GTK's own
allocation cycle, and a style split that sends layout properties to Yoga and
visual properties to GTK CSS — and about the boundary between a GTK layout
and a React Native one, which is where the platform's least obvious failure
mode lives if you don't know it's there.

## One Yoga engine per layout root

A `LayoutEngine` owns one Yoga tree and batches every mutation — a style
change, a tree edit, a measurement invalidation — into a single Yoga
`calculateLayout` pass per microtask, however many components touched the
tree before the pass runs. After that pass, committing widget rectangles is
**incremental**: the engine walks only the paths a mutation could have
changed, driven by two signals together —

- Yoga's own per-node `hasNewLayout` flag, set on every node Yoga actually
  re-laid out. It catches what a dirty set alone can't know: changing one
  child re-lays out its _following siblings_ (they shift) and any ancestor
  whose size followed, while an untouched subtree keeps its cached,
  parent-relative layout even when its container moved.
- the engine's own dirty set — which node each mutation actually came from —
  which catches what Yoga's flag doesn't imply: a re-measured leaf whose
  rectangle came out identical still has to recommit, because measuring it
  reset its own widget size request.

Widget moves are committed first for the whole pass, then `onLayout`
callbacks fire in a second pass over only the entries whose rect changed —
matching React Native's own two-phase order.

## GTK's allocation cycle IS the Yoga pass

Every RN-shaped container widget (`View`'s `GtkBox`, and anything wrapped
through `Widget`/`wrapReactNative`) runs a custom `Gtk.LayoutManager`
subclass, registered from JS, that does nothing but delegate: `measure()`
returns whatever the engine already computed for that node, and
`allocate()` hands the container's final size to the engine, which places
every child at its computed rectangle synchronously, inside GTK's own
allocation pass. GTK never queries children for their own size preferences
through this path — Yoga already decided, and GTK is told, not asked. That
is what removes the layout conflicts a naive integration would hit: a
window's minimum-size ratchet, overflow children inflating their ancestors,
widget minimums pushing rectangles around.

## Three flavors of layout root

A layout root is where a `LayoutEngine` is created. There are three, and the
difference is which side reports size to which:

- **The window root**, created once by `AppRegistry.runApplication`. In the
  ordinary case it adopts GTK's own window allocation as its Yoga viewport —
  the window decides the size, layout fills it.
- **`SlotContent`** (`NestedRoot`) — a full, independent Yoga engine mounted
  inside _any_ GTK container slot: an `Adw.NavigationPage`'s content, a
  toolbar view's body, a future container nobody has written yet. It follows
  the slot's own allocation exactly like the window root follows the
  window — the slot decides the size.
- **`IntrinsicContent`** (`IntrinsicRoot`) — the other direction: this root's
  own Yoga-computed content size becomes _its_ size request to GTK, so a
  `HeaderBar` slot or a sidebar row can ask "how big are you?" and get an
  answer built from real React Native content. Measuring runs a speculative,
  uncommitted Yoga pass first (honoring GTK's width-for-height style
  constraint), and the allocation pass that follows recomputes at the real
  size and commits it.

Use `SlotContent` for a page body, a pane, a dialog body — anything that
should fill the rectangle it's given. Use `IntrinsicContent` for a HeaderBar
slot, a toolbar area, a list row — anything that should be sized by what it
holds. `createSidebarNavigator`'s `sidebarRow` screen option wraps its
content in exactly `IntrinsicContent`, because a sidebar row is sized by
what it holds, not stretched to fill the list.

## Why the boundary matters

A GTK widget hands out rectangles two ways: as ordinary children (a content
area) and as slots — properties that take a widget, `titleWidget={…}`,
`sheet={…}`. Which way a given area arrives is gtkx's own business, and it
moves between gtkx releases; it has never had anything to do with layout.
Both are GTK's territory, and both need the same thing on the way in: the
enclosing React Native layout root is cleared, so a widget lands bare, and
anything that should be React Native content again has to bring its own
root — one of these two:

### React Native content inside GTK slots

| Export             | Sizing                       | Use for                                          |
| ------------------ | ---------------------------- | ------------------------------------------------ |
| `SlotContent`      | fills the slot               | a page body, a pane, a dialog body               |
| `IntrinsicContent` | sized by its own Yoga layout | an AdwHeaderBar slot, a toolbar area, a list row |

Forget the wrapper, and the failure is not a wrong-looking window — it's
content silently laid out against the _wrong_ rectangle. Without a root,
content dropped into a widget's slot or child position would join the
_enclosing_ Yoga tree, measured against the window's viewport, while GTK
hands the widget only its own rectangle: laid out against one box, drawn in
another, quietly stealing space from a tree it was never in. The platform
catches this instead of letting it happen silently — every element-valued
prop a wrapped widget is given, and its children, are put behind a boundary
that clears the layout root and remembers where the content was headed, so
the first read of a Yoga hook downstream throws a message naming the exact
widget and slot ("`AdwBottomSheet`'s `sheet` slot") and which of
`SlotContent`/`IntrinsicContent` to wrap it in.

Which of the two is right cannot be inferred, and one widget proves why:
`AdwBottomSheet` alone FILLS its content child but HUGS both `sheet` (a
bottom sheet rises to the height of its own contents) and `bottomBar`. One
widget, three content areas, two answers, nothing in the name or the GI type
to tell them apart — the answer lives in the widget's own layout code, not
in a rule this platform could apply mechanically.

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
  <SlotContent>
    <View style={{ flex: 1, justifyContent: "center" }}>…</View>
  </SlotContent>
</AdwBottomSheet>
```

Note the two independent sizes here: `style={{ flex: 1 }}` on `AdwBottomSheet`
itself is the _widget's_ size in the surrounding React Native layout (a
wrapped widget is a Yoga leaf at its own natural size until a style says
otherwise); the wrapper inside each content area sizes the _content_ within
the rectangle that widget then hands out.

## Giving a raw GTK widget a place in Yoga's tree

The reverse bridge — a GTK widget that should participate in React Native
layout rather than sit in a slot — is `Widget`, `wrapReactNative`, and
`useWidgetLayout`. All three do the same thing: give the widget a Yoga leaf,
apply the layout half of a style to it, and — the part that matters — measure
the widget's own natural size, so it lands at the size the GTK theme wants
rather than collapsing to zero.

```tsx
<View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
  <Widget style={{ flex: 1 }}>
    <GtkEntry placeholderText="Search" />
  </Widget>
  <Widget>
    <GtkButton iconName="edit-find-symbolic" />
  </Widget>
</View>
```

`wrapReactNative` additionally detects, at render time, whether there's a
Yoga tree to join at all. **Outside React Native layout it steps aside**: the
same `GtkButton` dropped into an `AdwHeaderBar`'s `start` or an
`AdwToolbarView`'s `topBar` — where there is no enclosing root — renders as
the bare widget, with `style`/`onLayout` dropped rather than forwarded to a
GObject property that doesn't exist. One exported symbol, both worlds, no
flag to remember.

## The style split

A flattened style is partitioned into three disjoint buckets, each consumed
by exactly one part of the pipeline, and the split is exhaustive by
construction — adding a new style key without classifying it fails
compilation, not a runtime check:

- **Layout properties** (`flex`, `padding`, `gap`, `position`, and the rest
  of Yoga's own vocabulary) drive the Yoga node directly.
- **Visual properties** (`backgroundColor`, `borderRadius`, `boxShadow`,
  `outline*`, `opacity`, the font properties, `transform`) compile to a GTK
  CSS class applied to the widget itself — not a wrapper around it — except
  `transform`, which is applied as the child's allocation transform rather
  than through CSS, and `textAlign`/`textDecorationLine`, which Pango
  carries and `Text` applies directly.
- **Behavioral properties** (`pointerEvents`, `zIndex`) belong to neither
  Yoga nor CSS and are consumed silently by the component that owns the
  behavior: `pointerEvents` maps onto GTK's own hit-testing (`can-target`,
  and a `contains()` override for `box-none`/`box-only`), and `zIndex`
  becomes the enclosing container's paint and pick order. GTK4 CSS has no
  `overflow` property either, so `overflow` is the one visual-shaped
  property applied as a direct widget call rather than a class — it also
  has to reach Yoga, since Yoga needs it while measuring, so it is the one
  style property both halves of the pipeline read.

An unrecognized property warns once, by name, and is dropped — this is what
catches a typo or an unimplemented RN style property before it silently does
nothing.

## Two ways to react to size

Two mechanisms answer two different questions, and neither replaces the
other.

**"Render different content at different widths"** is `useWindowDimensions`
— portable, and already how React Native answers this everywhere else. A
resize triggers a React render, the component reads the new width, and
returns different JSX. This is the only tool for anything that changes
_what_ is rendered: swapping a filter bar for a compact one, hiding a
column, changing text.

**"Flip a widget property natively at a threshold, with no render at all"**
is `AdwBreakpoint` + `AdwBreakpointBin`. `Adw.Breakpoint` is a condition — a
size or aspect-ratio threshold — plus a set of property setters: when the
condition starts holding, each setter writes its value onto its target
object's property directly, through GObject, inside GTK's own allocation
pass; when it stops holding, the setter restores whatever value the property
held before. No React commit, no Yoga pass, no JS callback runs for the flip
itself — a resize costs nothing beyond what GTK's layout was already doing.

`Adw.Breakpoint` is not a widget — its prototype chain bottoms out at plain
`GObject.Object`, not `Gtk.Widget` — so it's exported raw, the same way
`GtkGestureClick` is: running it through `wrapReactNative` would hand a Yoga
node to something that isn't a rectangle. `AdwBreakpointBin` **is** a real
widget — a container that scopes breakpoints to its own child subtree
instead of a whole window — and is wrapped normally. A breakpoint's setters
may only target widgets _inside_ the bin they're attached to, never the bin
itself:

```tsx
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

`addSetter` wants a genuine, boxed `GObject.Value` — a bare JS `true` fails a
`G_IS_VALUE` assertion on the native side rather than silently coercing.
`createSidebarNavigator`'s own `collapseWidth` option is built on exactly
this pair; reading `collapsed`/`showContent` back is a plain native property
read through the same ref, not React state, so neither the flip nor a read
of it costs a render.

No `useBreakpoint(condition) → boolean` hook exists. It would return a flag
to JS and re-render on every crossing — a second name for
`useWindowDimensions`, with none of the native setter's value. Reach for
`useWindowDimensions` when the thing that should change is your component's
JSX; reach for `AdwBreakpoint` only when the thing that should change is a
widget property GTK itself owns, and the change should cost nothing.

One limitation, stated as what it is rather than found along the way: under
this project's headless test compositor (sway), `AdwBreakpoint`'s
`onApply`/`onUnapply` do not fire, even past a genuine resize past the
condition's threshold; they fire exactly as documented in a real GNOME
session. Treat this as a test-environment limitation, not a runtime defect.

## Related

- [Overview](overview) — the widget surface this mechanism serves, and
  where `Widget`/`wrapReactNative`/`SlotContent`/`IntrinsicContent` are
  exported from.
- [Window, navigation, and settings](integration) — `createSidebarNavigator`'s
  `collapseWidth`, built on the breakpoint mechanism above.
