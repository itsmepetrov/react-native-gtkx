# bottom-sheet — React Native inside a GTK widget

An ordinary React Native app whose entire UI is one Adwaita widget:
`AdwBottomSheet`, with all three of its content areas filled with plain
`<View>`/`<Text>`/`<Pressable>`.

| Closed                                                                                                                                                            | Open                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ![A window with a heading, a paragraph and a blue button centred in it, and a thin bar along the bottom reading Accent, Blue.](../../docs/shots/bottom-sheet.png) | ![The same window with the sheet slid up, listing four accent colours with coloured dots.](../../docs/shots/bottom-sheet-open.png) |

```bash
npm install
npm run build -w bottom-sheet-example
npm run start -w bottom-sheet-example
```

## Children and slots are the same thing

A widget hands out rectangles two ways:

```tsx
<AdwBottomSheet sheet={…} bottomBar={…}>
  {/* the content area — an ordinary child */}
</AdwBottomSheet>
```

`sheet` and `bottomBar` are **slots**: properties that take a widget. The
content area is an ordinary **child**. Which way a given area arrives is
gtkx's business and moves between releases — rc.3 took the `content`/`child`
props off single-child widgets, so what used to be `content={…}` is the child
you see above — and it has never had anything to do with layout.

Both are GTK-tree moves, and only GTK-tree moves: in the React tree the
content stays exactly where you wrote it. That matters, because React Native
layout follows the REACT tree. Without a boundary, a `<View>` in either
position would put its Yoga node into the enclosing window root and lay itself
out against the window's viewport, while GTK hands it the widget's own
rectangle. So the boundary clears the layout root on the way in: GTK widgets
land bare (which is what they want), and React Native content brings its own
root.

## The two roots, and why you pick

```tsx
import { IntrinsicContent, SlotContent } from "react-native-gtkx/common"
```

| Content area | Wants                  | Wrapper            |
| ------------ | ---------------------- | ------------------ |
| the child    | fill the widget's area | `SlotContent`      |
| `sheet`      | rise to its own height | `IntrinsicContent` |
| `bottomBar`  | hug the row it holds   | `IntrinsicContent` |

One widget, both answers — which is exactly why the platform does not guess
for you. Nothing in the name, the type or the introspection data says which
one fills; that lives in the widget's own layout code, and here it disagrees
with itself two ways out of three. Note that the disagreement crosses the
child/slot line without caring about it — more evidence that the distinction
is syntax, not layout.

Try swapping them, it is instructive:

- `SlotContent` in `sheet` or `bottomBar` → the panel collapses to a sliver
  and the bar disappears. A filling root reports a zero minimum (so a window
  can always shrink), and a size-to-content area asking "how big are you?" is
  told "nothing".
- `IntrinsicContent` around the child → the column stops being centred. An
  intrinsic root's viewport is its own content size, so `flex: 1` has nothing
  to fill and `justifyContent: "center"` has no spare room to centre in.

Forget the wrapper entirely and you get an error naming the widget and where
the content landed, with both options spelled out. It used to render instead —
content with no root joined the enclosing window's Yoga tree, was laid out
against the window's viewport and drawn in the widget's rectangle, and looked
like this:

![The same window with the heading, paragraph and button jammed against the bottom edge under a window-height field of empty white.](../../docs/shots/bottom-sheet-before.png)

## The two sizes

They are independent, and both are in `src/App.tsx`:

```tsx
<AdwBottomSheet style={{ flex: 1 }}>
  {/* ① the WIDGET's size in React Native layout */}
  <SlotContent>
    <View style={{ flex: 1 }} /> {/* ② the CONTENT's size inside it */}
  </SlotContent>
</AdwBottomSheet>
```

① A wrapped GTK widget is a Yoga **leaf** taking its natural size until the
style says otherwise. `flex: 1` is what makes the sheet fill the window
instead of hugging itself — the same rule as any other React Native child.

② Inside, a fresh Yoga root whose viewport is the rectangle the widget hands
out. `flex: 1` there fills the WIDGET, never the window — every root has its
own viewport, and the two numbers never meet.

## Why the default chrome

`AppRegistry.runApplication` is called without `chrome: "content"`, so the
window brings its own titlebar and a window-level layout root. That root is
the point: it is the enclosing Yoga tree the widget's content must NOT join. Apps
built entirely from Adwaita chrome (`examples/adwaita-primitives`,
`examples/tasks-nav`) use `chrome: "content"` and have no ambient root at
all — for them every page body is already a `SlotContent`.
