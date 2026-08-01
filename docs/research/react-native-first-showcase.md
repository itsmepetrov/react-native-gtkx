# Can an app written in portable React Native look native here?

`examples/tasks-nav` is this project's showcase for `createSidebarNavigator`,
and almost none of it is React Native. Its content screen is a `GtkBox` around
a `GtkScrolledWindow` around an `AdwClamp` around a `.boxed-list` `GtkListBox`
of `AdwActionRow`s. For a project whose pitch is "write the React Native API,
get real GTK widgets", that is the wrong thing to be showing.

It did not start that way. The screen was originally written in `ScrollView` /
`Pressable` / `Text` / `View` / `StyleSheet` (commit `3f96d80`) and looked
visibly worse than `examples/tasks-app` beside it, so it was rewritten to raw
Adwaita widgets and the `contentLayout: "widget"` screen option exists to
support that. The rewrite fixed the screenshot and hid the finding.

This is that finding, measured.

## The rig

Every image below is `examples/tasks-nav` at 1100x760 under its **own**
headless sway (pixman, one output, no input devices), captured with `grim`:
`scripts/shot-example-headless.ts`. That matters more than it sounds. The
alternative — `scripts/dev-loop.ts`, which screenshots the VM's real GNOME
session — can only capture whichever window happens to be focused, and several
sessions share this VM. Sequential runs of the headless rig are
byte-comparable, which is what let the last row of the table below be stated
as "identical" rather than "looks the same".

The task fixture is identical in every arm (the save file is removed before
each run, so the seed data is what renders).

## What the gap actually is

| | |
| --- | --- |
| **Adwaita widgets** — `.boxed-list` `GtkListBox` of `AdwActionRow` | ![](../shots/rn-first/adwaita.png) |
| **Portable React Native, as an RN developer writes it** — this is commit `3f96d80`'s own tree: `ScrollView` + `Pressable` + `Text`, `StyleSheet` for padding and gaps | ![](../shots/rn-first/rn-naive.png) |
| **The same tree, with `StyleSheet` asked for everything Adwaita's stylesheet asks for** — before any platform change | ![](../shots/rn-first/rn-styled-before.png) |
| **The same styles, after this branch added `boxShadow`** | ![](../shots/rn-first/rn-styled-after.png) |

The middle two rows are the whole point. The distance between row 2 and row 3
is **styling the app never did**, not a platform limitation — and it is most of
the distance. The distance between row 3 and row 4 is a single missing style
prop.

## Where the numbers came from

Not from eyeballing a screenshot. libadwaita compiles its stylesheet into the
library, and it can be read back:

```
gresource extract /usr/lib/<triple>/libadwaita-1.so.0 \
  /org/gnome/Adwaita/styles/gtk.css
```

On libadwaita 1.9.1 / GTK 4.22.4, the rules that make a `.boxed-list` are:

```css
list.boxed-list, list.content, .card {
  background-color: var(--card-bg-color);
  color: var(--card-fg-color);
  border-radius: 12px;
  box-shadow: 0 0 0 1px RGB(0 0 6/3%),
              0 1px 3px 1px RGB(0 0 6/7%),
              0 2px 6px 2px RGB(0 0 6/3%);
}
list.boxed-list > row            { border-bottom: 1px solid var(--card-shade-color); }
list.boxed-list > row:first-child{ border-top-left-radius: 12px; border-top-right-radius: 12px; }
list.boxed-list > row:last-child { border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;
                                   border-bottom-width: 0; }
list > row                       { padding: 2px; }
row.activatable:hover            { background-color: color-mix(in srgb, currentColor 4%, transparent); }
row.activatable:active           { background-color: color-mix(in srgb, currentColor 8%, transparent); }
row:focus:focus-visible          { outline-color: color-mix(in srgb, var(--accent-color) 50%, transparent);
                                   outline-width: 2px; outline-offset: -2px; }
row > box.header                 { margin-left: 12px; margin-right: 12px;
                                   border-spacing: 6px; min-height: 50px; }
row > box.header > box.title     { margin-top: 6px; margin-bottom: 6px; border-spacing: 3px; }
row label.subtitle               { font-size: smaller; opacity: var(--dim-opacity); }
```

Read against a column of pixels through the reference screenshot, that comes
out as: card top edge one pixel of `rgb(232,232,233)` then white; separators
`rgb(237,237,237)` — which is `--card-shade-color: rgba(24,24,24,0.08)` over
white, i.e. `255·0.92 + 24·0.08 = 236.4` — every **55 px**; and a four-pixel
gradient below the card, `222 → 233 → 238 → 243 → 246`, which is the two soft
drop shadows.

**A `.boxed-list` is, visually, a styled `View`.** There is no widget behaviour
in any of the above. That is why the answer to most of this is style, not
components.

## The gap list, and where each one closes

Three categories, in the order they were asked for: expressible in RN style
today; not expressible but should be (ours to fix); genuinely not a style.

### 1. Expressible in RN style today — the app simply never did it

| Gap | How |
| --- | --- |
| Card background | `backgroundColor: PlatformColor("card-bg-color")`. Adwaita's variables are already reachable — this is what `PlatformColor` is for, and it tracks the light/dark switch for free. |
| 12 px corner radius | `borderRadius: 12` |
| Hairline separators between rows | `borderBottomWidth: 1, borderBottomColor: PlatformColor("card-shade-color")` |
| Rounded first/last row, no separator under the last | Per-corner radii (`borderTopLeftRadius` …) keyed off the row index. RN has no `:first-child`, so the index is the app's (or a list component's) job — but nothing is missing from the style layer. |
| Row metrics: 50 px minimum, 12 px side inset, 6 px between prefix/title/suffix, 6 px above and below the title block, 3 px between title and subtitle | `minHeight`, `paddingHorizontal`, `gap`, `marginVertical` — a direct transcription of the CSS above |
| Dimmed subtitle | `opacity: 0.55` (`--dim-opacity` is `55%`) |
| **Row hover** | `Pressable`'s `style={({ hovered }) => …}`. Already works, and works well: `tests/gtk/components/pressable-hover.gtk.test.tsx` asserts that a real `EventControllerMotion` `enter` swaps the widget's CSS class **without a React render at all** (the fast path in `components/pressable.tsx`). `hovered` is a documented platform extension to RN's state callback; `examples/hn-app`, the gallery and `examples/adwaita-primitives` already use it. |
| **Row press feedback** | Same callback's `pressed`. |
| Row activation on click | `Pressable`'s `onPress` — this is `AdwActionRow`'s `activatable` + `onActivated`. |

One caveat that is real but small: Adwaita's hover tint is
`color-mix(in srgb, currentColor 4%, transparent)`, i.e. 4% of the *foreground*
colour, which follows the theme into dark mode. RN has no `color-mix` and no
`currentColor`, so an app writes two literal tints and picks between them with
`useColorScheme()`. That is how RN apps have always done this, on every
platform; it is not a gap in this layer, and adding a `color-mix` passthrough
to `parseColor` would be inventing non-RN surface to avoid three lines of app
code.

### 2. Not expressible, and that is ours — **fixed on this branch**

**`boxShadow`.** The `.boxed-list` frame is not a border. It is
`box-shadow: 0 0 0 1px …` plus two soft drops, and our style layer listed
`boxShadow` under "Ignored (outside the frozen contract)" — dropped with a
`console.warn`. That is one prop standing between an RN-written list and the
platform's own list, and it is a prop **React Native itself has had since
0.76**, with GTK4 CSS supporting `box-shadow` natively. Approximating it with
`borderWidth: 1` is not the same thing: a border consumes the box and insets
content, a shadow does not, and no border reproduces the two blurred drops.

Now implemented (`style/box-shadow.ts`), taking both RN forms. The string form
is **parsed, not forwarded** — a `PlatformColor` only becomes a GTK variable
after `parseColor` has seen it, and a malformed shadow should cost one dev
warning rather than poison the whole declaration block, exactly as an invalid
`backgroundColor` already does. Two RN behaviours are matched deliberately:
lengths follow RN's own grammar (a bare number or `px`, nothing else; blur may
not be negative), and **an omitted colour renders black, not `currentColor`** —
RN's documented deviation from CSS, which only stays true here because it is
emitted explicitly.

The result, sampled down the same pixel column as the reference:

| | card top edge | separator pitch | bottom shadow |
| --- | --- | --- | --- |
| Adwaita `.boxed-list` | `245 → 232 → 255` | 55 px | `222 → 233 → 238 → 243 → 246` |
| RN `View` + `StyleSheet`, before | `250 → 255` (nothing) | 53 px | none |
| RN `View` + `StyleSheet`, after | `245 → 232 → 255` | 53 px | present |

The card frame is **pixel-identical** to the widget's. The 53-vs-55 pitch is
`list > row { padding: 2px }` not yet transcribed into the example, not a
platform gap.

**`outlineWidth` / `outlineColor` / `outlineStyle` / `outlineOffset`.** Found
while looking for the focus ring. Adwaita draws every focus ring with CSS
`outline`, GTK4 implements it, and **React Native has had these four props
since 0.77** — we had none of them. Unlike `borderWidth`, an outline takes no
layout space, so it never has to reach Yoga: it is a pure visual prop. Added in
the same slice, because a focus ring that cannot be *drawn* makes the
component-level work below pointless.

Both are in `style/README.md` now, and both are covered by
`tests/unit/style/box-shadow.test.ts`.

### 3. Genuinely not a style — needs a component

These are the ones where reaching for `StyleSheet` would be forcing it.

| Gap | Why no style closes it | Where it belongs |
| --- | --- | --- |
| **Keyboard navigation between rows** (Up/Down moving a cursor through the list) | `GtkListBox` implements this as a widget behaviour. RN's `View` is not focusable and RN has no focus-traversal model on the desktop at all. | `react-native-gtkx/common` |
| **Focus state** | The *ring* is now drawable (above), but nothing tells a `View` it is focused: `Pressable`'s state callback is `{pressed, hovered}` with no `focused`, and there is no `onFocus`/`onBlur` outside `TextInput`. | `react-native-gtkx/common` — a row component that owns focus and hands the style layer an `outline*` |
| **`AdwEntryRow`'s inline editing** (the "Add a task…" row: a label that floats up into a title when the field has text, with an apply affordance) | This is a composed widget with its own state machine, not a look. RN has `TextInput` and a placeholder, which is a different interaction. | `react-native-gtkx/common`, or accept the difference |
| **Named theme icons** (`starred-symbolic`, `user-trash-symbolic`) | RN's `Image` takes a file path or a URI. An icon *name* resolved against the desktop icon theme has no RN equivalent — RN apps bundle assets or use `react-native-vector-icons`. | `react-native-gtkx/common` — **now `Icon`**, the shape every RN app already uses |
| Strikethrough on a completed task | Found here, closed as a style after all: `textDecorationLine` is an RN prop we did not have, and GTK draws it through **Pango attributes** rather than CSS — the same path `textAlign` already takes. Added alongside the two above. | the style/component layer |

## What shipped, and what is left

The list chrome now lives in `react-native-gtkx/common` as `List`, `ListRow`,
`ListSeparator` and `rowPosition`, with `Icon` for named theme icons. Nothing
in them creates a widget an app could not have created itself — they are
`View`, `Pressable` and `Text` with the numbers above baked in — which is the
point: an app should not have to re-derive libadwaita's metrics, and it should
not have to re-derive them again when libadwaita moves.

`examples/adwaita-primitives` uses them, and its article list (which was a
hand-styled `Pressable` with a hover tint, and did not look like GNOME) is now
the real thing:

![](../shots/rn-first/common-list.png)

**Two things are deliberately not done yet, and both are worth naming.**

1. **Keyboard navigation and the focus ring on `ListRow`.** The ring is now
   drawable, but nothing tells a `View` it is focused. Closing this means
   giving the row real focus — which is a platform decision about whether
   `Pressable` grows a `focused` state (RN has none) or whether `common` owns
   a focusable row of its own.

2. **`examples/tasks-nav`'s own rewrite**, which is what all of this was for.
   It is blocked on one specific thing rather than on effort: the task rows
   carry **drag-and-drop reorder**, attached as `GtkDragSource`/`GtkDropTarget`
   controllers on the `AdwActionRow`. A `Pressable` exposes no widget — its
   `ref` is RN's `ViewHandle` (measure methods), correctly, because that is
   RN's contract — so there is currently no way to attach a GTK controller to
   a row written in React Native. Rewriting the rows without solving that
   would silently drop a feature two earlier PRs added, which is worse than
   leaving the example as it is for one more slice.

   The shape of the answer is a `common`-level escape hatch (`ListRow` taking
   `controllers`, the way every gtkx widget element already does), or
   `common` owning drag-reorder outright. That is a design call about where
   the GTK boundary sits, not a bug, and it should be made deliberately.

## What this says about the showcase

The honest summary is that **the example was under-styled, and the platform was
missing one prop that mattered and three that will.** Not "React Native cannot
look native here".

That reframes the rewrite: `tasks-nav`'s body can be `View` / `Text` /
`Pressable` / `FlatList` / `StyleSheet` plus a small `common` list-and-row pair
for the parts above that are genuinely widget behaviour, and it should reach
`examples/tasks-app`'s appearance rather than approach it. `tasks-app` stays
exactly as it is — the hand-built Adwaita comparison is what makes the claim
checkable.

`contentLayout: "widget"` stays too. An app whose body really is a widget tree
is a legitimate thing to be, and `sidebarContent`/`sidebarRow` rest on the same
idea. What changes is which of the two the project's showcase demonstrates.

## Notes for whoever runs this again

- **Hover and press cannot be screenshotted on the headless rig**, and it is
  worth not re-discovering why. A wlroots seat started with
  `WLR_LIBINPUT_NO_DEVICES=1` has no pointer capability at all
  (`swaymsg -t get_seats` → `capabilities: 0, devices: []`), so no `wl_pointer`
  is ever advertised and no client can receive an enter. sway's
  `seat - cursor set X Y` answers `success: true` and changes nothing.
  `wlrctl`'s `wlr-virtual-pointer` does reach the compositor, but each
  invocation creates and destroys its own device, so the capability appears and
  disappears faster than a frame. The hover fast path is covered by
  `tests/gtk/components/pressable-hover.gtk.test.tsx` instead, which drives the
  real `EventControllerMotion` signal.
- The examples persist to `~/.local/share/dev.rngtkx.tasks{,nav}/tasks.json`.
  Remove it before a comparison run or you are shooting the previous run's
  state.
