# gallery — the whole surface, one window

Every capability this platform claims, one per sidebar entry, in an app you
run and poke at. The chrome is the package's own sidebar navigator: a native
`Adw.NavigationSplitView` with the sections in a real `GtkListBox`.

```sh
npm install                     # from the repo root (workspaces)
cd examples/gallery
npm run dev                     # gtkx dev — vite + Fast Refresh
npm run build && npm start      # release bundle
```

The sidebar IS the navigation, so it carries the granularity: one section per
capability, named so it can be found without reading. A section that grows two
unrelated halves becomes two sections.

It is also **grouped**, and the grouping is the honest story of the platform in
the order a reader meets it:

1. **React Native** — the portable API an iOS/Android app already knows. None
   of it is this platform's invention; all of it happens to render as GTK.
2. **gtkx** — what exists only because this is GTK: Adwaita widgets, the
   escape hatches, the layout-root boundary between the two worlds.
3. **Modules** — the third-party ecosystem, reached through the presets'
   aliases and, in the last section, not aliased at all.

| Light                                                                                                                                                                                                                                  | Dark                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ![The gallery sidebar, light theme: a "React Native" section header above Views, Text, Layout, Clipping and the rest, then a "gtkx" header above Widget hosting and Adwaita stack.](../../docs/shots/gallery/sidebar-groups-light.png) | ![The same sidebar in the dark theme, with the headers equally legible.](../../docs/shots/gallery/sidebar-groups-dark.png) |

The headers are real Adwaita section headers, attached with
`GtkListBox.set_header_func` through the navigator's own
[`group` option](../../docs/api.md) — not rows pretending to be headers. That
distinction is the point: a header faked as a non-selectable `GtkListBoxRow`
still sits in the list's focus chain, so the arrow keys stop on it and
assistive technology announces a row that cannot be activated. Verified by
walking the list with injected `Down` presses: focus crosses each header
without ever landing on one.

`GALLERY_SECTION=<id>` opens one section directly (the visual-regression
script uses it); `GALLERY_SCHEME=light` starts in the light theme, and the
HeaderBar button toggles either way live.

## The sections

### React Native

| Section                  | What it proves                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| Views, Text, Layout      | Yoga flexbox, text rendering, the box model                            |
| Clipping                 | `overflow: "hidden"` to the rounded shape, hit-testing following it    |
| Inputs, Buttons, Toggles | `TextInput`, `Pressable`, `Switch` and friends                         |
| Lists, Media             | `FlatList`/`SectionList`, `Image`                                      |
| Modal                    | `Modal` → a real modal `GtkWindow`                                     |
| Animated                 | `Animated.timing`/`spring`/`loop`/`sequence` — the drivers             |
| Interpolate              | `interpolate`: multi-stop ranges, mirrored extrapolation, fan-out      |
| Transforms               | translate/rotate/scale as paint-only, on the allocation's GskTransform |
| Gestures                 | React Native's own responder system and `PanResponder`                 |
| APIs                     | `Platform`, `Dimensions`, `Appearance`, `Alert`, `Linking`             |

### gtkx

| Section        | What it proves                                            |
| -------------- | --------------------------------------------------------- |
| Widget hosting | React Native inside a GTK widget's child and slots        |
| Adwaita stack  | `Adw.NavigationView` driven declaratively, with no router |

### Modules

| Section            | What it proves                                                        |
| ------------------ | --------------------------------------------------------------------- |
| Reanimated values  | shared values, `useAnimatedStyle`, and the zero-render counter        |
| Reanimated motion  | `withTiming`/`Spring`/`Sequence`/`Repeat`/`Delay`, `Easing`, colours  |
| Layout animations  | `FadeIn`/`FadeOut`/`LinearTransition`/`Keyframe`                      |
| Reanimated limits  | which sizes are driven, which are refused, and the measurement why    |
| Gesture detector   | `Gesture.Pan`/`Tap`/`LongPress` and their configuration knobs         |
| Pinch and rotation | `Gesture.Pinch`/`Rotation` off GTK's own touchpad gestures            |
| Gesture relations  | `Gesture.Native`, `simultaneousWith…`, `requireExternalGestureToFail` |
| Drag and drop      | `react-native-gtkx/dnd` — the platform's own DnD surface              |
| Svg                | `react-native-svg`; an RN `Animated.Value` driving `r` directly       |
| Upstream libraries | two REAL npm packages, unaliased, on this platform's compat surfaces  |

## Sections that fill the canvas instead of scrolling

Most sections scroll inside an explicit `ScrollView`. Five do not — see
`fillsCanvas` in `src/index.tsx`. This is not cosmetic: a `Gesture.Native()`
over a real `ScrollView`, a drawer dragged in from an edge, an
`AdwBottomSheet`'s drag handle and Adwaita's back gesture all negotiate with
whatever else wants the pointer, and an enclosing `ScrollView` is a competitor
those demos were never meant to have. Each of the five was a standalone app
whose window it filled; the canvas is that window.

## Colour, and the rule that produced it

Everything a reader has to READ resolves through `PlatformColor` onto an
Adwaita variable, so the whole gallery follows the desktop's light/dark
setting without a render:

| Use                       | Variable                                               |
| ------------------------- | ------------------------------------------------------ |
| body and prose            | `window-fg-color`                                      |
| labels, legends, captions | `dimmed-fg-color`, falling back to the above           |
| "this is refused"         | `warning-color`                                        |
| "this worked"             | `success-color`                                        |
| "this is an error"        | `error-color`                                          |
| surfaces                  | `window-bg-color`, `card-bg-color`, `card-shade-color` |

The saturated demo colours (`palette.accent`, `green`, `orange`, `purple`,
`red`, `yellow`) are **content** and stay fixed — a card about interpolating
between two colours must not have them move under it — and text sitting on one
of those fills is always `palette.onColor`, because the fill does not change.

A hand-picked hex can only be right on one of the two themes, and the wrong
half of the time it is the unreadable half. The specific bug worth remembering:
`--warning-bg-color` is the saturated FILL that goes _behind_
`--warning-fg-color`, and putting it on type is how the refusal warnings ended
up unreadable on the light theme. The fix is a 15% amber tint as the surface,
`warning-color` on the label, and the body in the ordinary foreground.

## Reanimated: the three sections

### Zero renders per frame

The strongest claim this surface makes, in the form a person can check. A box
has been animating since the app opened; next to it, the number of times React
rendered it. It reaches 1 at mount and stays there while the frame counter
climbs at ~60 a second. Drag the box above it and its counter behaves the same
way: several hundred frames, one render.

The counters cannot live in React state — putting them there would make
reading them cause the very renders they count — so they live in a module
object that a timer snapshots into state (`src/stats.ts`).

### Where the boundary is

An animated size runs at frame rate wherever the change stops at the node that
owns it, and is refused by name everywhere else. The section shows the line
rather than a wall: the first two lanes animate **the same shared value**, with
the same box, and differ by one style on the lane that contains them.

- **7.1 µs** a frame for a driven size, flat at 5, 60 and 300 children;
- **21.7 µs** with wrapped text inside the box to re-lay-out;
- **52 → 496 µs** for the naive write over that same 5 → 300 children;
- **1.5 µs** for a transform, **11.2 µs** for a colour, at every size.

Flat in the container versus proportional to it: that is the whole decision.

#### The six things that put a size on the refused side

The section demonstrates two of these and names the rest here rather than on
screen — six lanes that all do nothing would teach less than two that disagree.

1. The axis is the container's **main** axis (the third lane).
2. The resolved **cross-axis alignment** is `center` or `flex-end` (the second
   lane) — the node's position would move with its size.
3. The container's own size **comes from its children**.
4. The node's **other axis comes from its content**, so re-wrapping would
   change that too.
5. An `aspectRatio`, or a `min`/`max` that would clamp the driven value.
6. A **wrapping** container.

`flex`, `flexBasis`, every `margin*`/`padding*` and `gap` are refused outright
— no carve-out applies to them at all. `Animated.FlatList` does not warn: it
throws, naming itself, because a list that mounted without animating is worse
than one that failed.

Two things this used to say were re-measured and are **not** true. Making GTK
re-measure every ancestor after a resize adds nothing at any tree size — the RN
root reports a constant size request — and for the same reason an animated
`width` cannot resize the window: the request stayed at min 88 with a child
driven to 3000 px wide. The boundary rests on cost, and only on cost.
See [docs/research/animated-size.md](../../docs/research/animated-size.md).

The warning string the app prints still quotes the earlier recon figures (71 /
509 µs, and 0.6 µs for a transform) rather than the shipped path's own
re-measurement in
[docs/api.md](../../docs/api.md#the-second-exception-a-size-that-is-confined-to-the-node-that-owns-it)
(52 / 496 µs, 1.5 µs). The on-screen table follows `docs/api.md`; the string in
`packages/react-native-gtkx/src/components/animated.tsx` has not caught up yet.

### Three things these sections found

**1. The React Compiler is on, and it froze the render counter.** `gtkx dev`
and `gtkx build` run `@gtkx/cli`'s React Compiler vite plugin. A component that
reads a mutable module object during render therefore has that read memoised —
`readCounter("loop")` takes no reactive input, so it is computed once and the
JSX built from it is reused forever. The readout re-rendered fourteen times and
displayed the mount value every time, which looked exactly like a broken
counter and was not. `src/stats.ts` snapshots into state on a timer instead.
Worth knowing for any gtkx app that polls a mutable value: **it will not
repaint**.

The same thing bites the limits section in a subtler way. An `Animated.View`
whose props are all stable is memoised, so a parent's `setState` does not
re-render it and "applied on the next React render" is not demonstrable. The
forced-render count is printed inside the boxes so that the next render
actually reaches them.

**2. `sharedValue.value = …` inside a component does not lint.** This repo's
`eslint-plugin-react-hooks` v7 (`react-hooks/immutability`) rejects "modifying
a value returned from a hook". The Reanimated sections therefore use
`x.get()` / `x.set(...)`; `src/gesture-board.tsx`, which writes shared values
from gesture callbacks the way upstream's own docs show, carries a file-level
disable instead. Both spellings work at runtime.

**3. `react-hooks/refs` has no spelling for a render counter.** Counting
renders means writing a ref during render, which is precisely what the rule
forbids. `eslint.config.ts` turns that one rule off for `examples/gallery`,
next to the exemptions the repo already carries for `src/components` (lazy ref
init) and `spike/`.

## Widget hosting: children and slots are the same thing

A widget hands out rectangles two ways:

```tsx
<AdwBottomSheet sheet={…} bottomBar={…}>
  {/* the content area — an ordinary child */}
</AdwBottomSheet>
```

`sheet` and `bottomBar` are **slots**: properties that take a widget. The
content area is an ordinary **child**. Which way a given area arrives is gtkx's
business and moves between releases — rc.3 took the `content`/`child` props off
single-child widgets — and it has never had anything to do with layout.

Both are GTK-tree moves, and only GTK-tree moves: in the React tree the content
stays exactly where you wrote it. That matters, because React Native layout
follows the REACT tree. So the boundary clears the layout root on the way in:
GTK widgets land bare, and React Native content brings its own root.

| Content area | Wants                  | Wrapper            |
| ------------ | ---------------------- | ------------------ |
| the child    | fill the widget's area | `SlotContent`      |
| `sheet`      | rise to its own height | `IntrinsicContent` |
| `bottomBar`  | hug the row it holds   | `IntrinsicContent` |

One widget, both answers — which is exactly why the platform does not guess for
you. Nothing in the name, the type or the introspection data says which one
fills; that lives in the widget's own layout code, and here it disagrees with
itself two ways out of three. Note that the disagreement crosses the child/slot
line without caring about it.

Try swapping them, it is instructive:

- `SlotContent` in `sheet` or `bottomBar` → the panel collapses to a sliver and
  the bar disappears. A filling root reports a zero minimum, and a
  size-to-content area asking "how big are you?" is told "nothing".
- `IntrinsicContent` around the child → the column stops being centred. An
  intrinsic root's viewport is its own content size, so `flex: 1` has nothing
  to fill.

Forget the wrapper entirely and you get an error naming the widget and where
the content landed, with both options spelled out.

### The two sizes

They are independent:

```tsx
<AdwBottomSheet style={{ flex: 1 }}>
  {" "}
  {/* ① the WIDGET's size in RN layout */}
  <SlotContent>
    <View style={{ flex: 1 }} /> {/* ② the CONTENT's size inside it */}
  </SlotContent>
</AdwBottomSheet>
```

① A wrapped GTK widget is a Yoga **leaf** taking its natural size until the
style says otherwise. ② Inside, a fresh Yoga root whose viewport is the
rectangle the widget hands out. `flex: 1` there fills the WIDGET, never the
window — every root has its own viewport, and the two numbers never meet.

### Wrapped widgets and raw ones

`AdwBottomSheet` takes a `style` because it is a _wrapped_ component with a
Yoga node. `NavigationStack` renders a **raw** `Adw.NavigationView` binding,
which has none — as a standalone app it was the window's only child and GTK
allocated it, but inside a React Native layout root nothing does, and it draws
nothing while GTK logs `Trying to snapshot AdwNavigationView without a current
allocation`. `Widget` from `react-native-gtkx/common` is the bridge: it puts a
measured Yoga leaf around the widget, which is what gives it an allocation.
That is why the Adwaita stack section wraps and the widget hosting one does
not — and it is the single thing that broke when these two moved in here.

## Upstream libraries: the real packages

Two published npm tarballs, installed for real, running unaliased:

- **`react-native-reanimated-dnd@2.0.0`** — the preset's alias is undone for
  this project only, so the library resolves for real and everything it imports
  (`react-native`, `react-native-reanimated`, `react-native-worklets`,
  `react-native-gesture-handler`) is answered by react-native-gtkx.
- **`react-native-drawer-layout@4.2.9`** — drag from the left edge to open it.

This is the opposite of `examples/reanimated-dnd` and of the `dnd` section,
which prove the MIRROR: unedited upstream source with
`react-native-reanimated-dnd` aliased onto `react-native-gtkx/dnd`, so the real
package never loads. Both are worth having, and the difference between them is
the whole [research note](../../docs/research/upstream-libraries.md).

Two things in `vite.config.ts` are deliberate, and deleting either changes what
the section proves rather than breaking it loudly:

- a ten-line plugin, because `react-native-drawer-layout` ships
  `GestureHandler.ios.js` and `GestureHandler.android.js` with no `.native.js`,
  so every out-of-tree platform silently resolves the no-op web fallback and
  the drawer becomes undraggable without a single warning;
- a `resolve.alias` entry that un-aliases the -dnd package, which works because
  vite runs `resolve.alias` before every `enforce: "pre"` plugin.

`Sortable` is given `useFlatList={false}`, because its rows are absolutely
positioned and this platform's windowed list drops one of them.

## What is not here

- **Layout animations** (`FadeIn`, `LinearTransition`, `Keyframe`) —
  implemented, not yet demonstrated. Worth a section.
- **`Animated.FlatList`** — throws rather than warns, so there is no running
  demo to show. `docs/api.md` has the reasoning.
- **`useAnimatedProps`** — implemented (#67) and demonstrated NOWHERE, which
  is a real gap rather than a duplicate. The Svg section animates shape props,
  but through React Native's own `Animated.Value`, not through Reanimated's
  `useAnimatedProps`; the two are different code paths and only the first one
  has a demo. Worth a card in Svg.
- **The other four ways a size lands on the refused side** — listed above.

## How the screenshots were taken

`scripts/shot-example-headless.ts` and `scripts/shot-example-drag.ts`, on a
private headless compositor with a `zwlr_virtual_pointer_v1` device — so a drag
is a real pointer through the real compositor → GDK → responder path, not a
synthesised callback. `scripts/gallery-shots-vm.ts` captures every section in a
real GNOME session for `docs/shots/gallery/`.
