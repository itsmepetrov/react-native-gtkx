# reanimated-playground — the Reanimated surface, hands on

Seven panels on one scrolling screen, each one a thing
[`react-native-gtkx/reanimated`](../../docs/api.md#react-native-reanimated-react-native-gtkxreanimated)
either does or deliberately does not do. It is meant to be **run and poked
at**, not read: drag the box, press the buttons, watch the render counter not
move — and in panel 07, watch two boxes on the same shared value disagree
about whether they are allowed to animate.

```sh
npm install                            # from the repo root (workspaces)
cd examples/reanimated-playground
npm run dev                            # gtkx dev — vite + Fast Refresh
npm run build && npm start             # release bundle
```

![The playground mid-drag: the "drag me" box carried down to the bottom-right of its arena by the pointer and CUT OFF at the arena's edge — its lower half and the bottom of its label gone, the caption below it untouched — and further down a row of counters reading "React renders — looping box: 1", "React renders — dragged box: 1", "Frames driven — looping box: 359", "Frames driven — dragged box: 51", "Frames per second, now: 48".](../../docs/shots/reanimated-playground.png)

Every import in `src/` is a **bare package name** — `react-native` and
`react-native-reanimated`. Neither package is installed in this workspace and
neither ever resolves; both bundler presets alias them, so the app is ordinary
React Native source that happens to render GTK widgets. There is no
`react-native-gtkx/...` import anywhere in the example, which is the point:
if one were needed, it would be a gap in the surface rather than a detail of
the demo.

## What each panel is for

**01 Drag me.** A shared value per axis, written from `PanResponder`'s gesture
state, read back through `useAnimatedStyle` into `transform`, sprung home with
`withSpring` on release. **It is not `GestureDetector`**, deliberately: this
panel is the React Native responder system, the API an RN app used before the
Gesture API existed, running here unchanged. `Gesture.Pan()`, `Tap`,
`LongPress` and `GestureDetector` are implemented now — see
`examples/gesture-detector`, which is where they are demonstrated — so the two
examples cover the two layers rather than duplicating one. The Reanimated half
here is exactly what you would write on iOS.

The arena sets `overflow: "hidden"`, so throwing the box past an edge cuts it
off at the arena — rounded corners included — instead of letting it slide over
the caption underneath. That is the platform honouring the style, which it did
not do until recently: `overflow` reached Yoga and stopped there, so a container
that asked to clip was accepted and clipped nothing. The other way to keep a
dragged box in its arena is to `clamp()` the shared value inside the gesture,
and this panel deliberately does not: clamping is an app deciding where a drag
ends, and it would leave nothing for the clip to demonstrate.

**02 Zero renders per frame.** The strongest claim this surface makes, in the
form a person can check. A box has been animating since the app opened; next
to it, the number of times React rendered it. It reaches 1 at mount and stays
there while the frame counter climbs at ~60 a second. Drag the panel-01 box
and its counter behaves the same way: several hundred frames, one render.

**03 Colours.** `interpolateColor` into `backgroundColor`, driven by a slider
you drag and by five preset stops — plus an auto pair on `withRepeat` showing
`'RGB'` and `'HSV'` on the same value at the same instant, which is the
clearest way to see that the two colour spaces are both really implemented.
`'LAB'` throws by name: upstream's is a vendored slice of culori fed the wrong
channel scale.

An animated colour reaches GTK through a `GtkCssProvider` private to that one
widget, reloaded in place — 11.2 µs a frame, flat in the size of the tree —
and deliberately **not** through the memoised class registry the static styles
use. That one would mint a class per frame into a process-wide stylesheet:
0.8 ms on the first frame, 6.8 ms by the six-hundredth, still climbing.

**04 The five animation functions.** `withTiming`, `withSpring`,
`withSequence`, `withRepeat`, `withDelay` and `cancelAnimation` on one box, so
they can be fired back to back and compared. Defaults are upstream's: timing
is 300 ms on `inOut(quad)`, spring is `GentleSpringConfig` (damping 120,
mass 4, stiffness 900). The spring solver differs from upstream in its rest
condition only — upstream stops on remaining energy, this one on displacement
and speed thresholds derived from the same energy budget, and the stopping
point differs by well under a pixel.

**05 Easing.** Seven curves over the same 1400 ms and the same 260 px, all
started from one press — one shared value the rows react to, rather than seven
buttons. `Easing.bezier` returns a factory object exactly as upstream does, so
`Easing.bezier(0.25, 0.8, 0.25, 1)` is passed to `withTiming` rather than
called; the pure maths behind all seven is ported from upstream's own web
path, not reimplemented.

![Seven lanes mid-flight, each box at a different distance along its track: out(bounce) and ease furthest behind, linear and inOut(quad) together in the middle, out(cubic) and bezier(.25,.8,.25,1) ahead of them, elastic(1.4) furthest along.](../../docs/shots/reanimated-playground-easing.png)

**06 One value, three consumers.** Two `useDerivedValue`s and one
`useAnimatedReaction` off a single shared value, driving three widgets and a
tally. No hook is given a dependency array and everything still updates,
because tracking here is dynamic — recorded from the reads a mapper actually
performs.

**07 Where the boundary is.** The panel this example exists for as much as the
counter does — and it is a boundary now rather than a wall, which is the whole
reason it was rewritten.

![Panel 07 after pressing "Animate width", "Animate height" and "Force a React render": the green box in the first lane 280 px wide with a "1" in it, the red box in the centred lane the same 280 px but only because the render was forced, the red box in the third lane grown to 76 px tall with the purple strip pushed down below it, and an amber-tinted box headed CONSOLE.WARN holding both refusal messages in full — the cross-axis-alignment one and the MAIN-axis one — set in the window foreground colour rather than in amber, then a table reading 7.1 µs for a driven size, 21.7 µs with wrapped text, 52 → 496 µs for the naive write over 5 → 300 children, 1.5 µs for a transform and 11.2 µs for a colour.](../../docs/shots/reanimated-playground-refused.png)

The first two lanes animate **the same shared value**, with the same box, and
differ by one style on the lane that contains them. The first lane is an
ordinary column, so `width` is its cross axis: the box grows from its leading
edge, no sibling moves, and it runs at frame rate — 7.1 µs a frame, the same
at five siblings or three hundred, with the render counter inside the box
sitting still while it moves. The second lane says `alignItems: "center"`, so
a wider box would also be a box in a different place, and that is refused.

Press "Animate width" and the two disagree in front of you. The refusal is
printed in the app (`src/warnings.ts` wraps `console.warn`; the panel renders
the buffer), naming the style that stopped it. "Animate height" adds the other
kind: `height` is the column's main axis, so growing the box would push the
strip below it down, and the warning says so and quotes what that costs — a
Yoga pass plus its commit walk is 52 µs on a five-child container, 133 µs at
sixty and 496 µs at three hundred, against 7.1 µs for the driven path at all
three. A refused layout write is O(the container); the driven one is O(the
node).

> The warning string the app prints still quotes the earlier recon figures
> (71 / 509 µs, and 0.6 µs for a transform) rather than the shipped path's own
> re-measurement in
> [docs/api.md](../../docs/api.md#the-second-exception-a-size-that-is-confined-to-the-node-that-owns-it)
> (52 / 496 µs, 1.5 µs). The panel's table follows `docs/api.md`; the string in
> `packages/react-native-gtkx/src/components/animated.tsx` has not caught up
> yet.

Then press "Force a React render" and both refused boxes jump to where their
animations ended — the documented behaviour, that a refused value is applied
on the next React render rather than dropped. `borderRadius` gets the other
message (not a layout property, still not driveable) and lands on the same
render. `scaleX`, the transform the refusals name, runs at frame rate next to
them — and is an approximation rather than a replacement, which the driven
lane above it demonstrates by re-laying-out what is inside the box instead of
stretching it.

### The six things that put a size on the refused side

The panel demonstrates two of these and names the rest here rather than on
screen — six lanes that all do nothing would teach less than two that
disagree.

1. The axis is the container's **main** axis (panel 07's third lane).
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

Two things this panel used to say were re-measured and are **not** true.
Making GTK re-measure every ancestor after a resize adds nothing at any tree
size — the RN root reports a constant size request, so there is nothing above
to recompute — and for the same reason an animated `width` cannot resize the
window: the request stayed at min 88 with a child driven to 3000 px wide. (An
RN island mounted straight into GTK chrome does report its content size, and
a size below one of those really would move the window request, which is why
that configuration is refused too.) The boundary rests on cost, and only on
cost.

## Three things this example found

**1. The React Compiler is on, and it froze the render counter.** `gtkx dev`
and `gtkx build` run `@gtkx/cli`'s React Compiler vite plugin. A component
that reads a mutable module object during render therefore has that read
memoised — `readCounter("loop")` takes no reactive input, so it is computed
once and the JSX built from it is reused forever. The readout re-rendered
fourteen times and displayed the mount value every time, which looked exactly
like a broken counter and was not. `src/stats.ts` snapshots the counters into
state on a timer instead, so the JSX has something that changes. Worth knowing
for any gtkx app that polls a mutable value: **it will not repaint**.

The same thing bites panel 07 in a subtler way. An `Animated.View` whose props
are all stable is memoised, so a parent's `setState` does not re-render it and
"applied on the next React render" is not demonstrable. The forced-render
count is printed inside the boxes so that the next render actually reaches
them — which in the driven lane doubles as the proof that the animation costs
no renders at all.

**2. `sharedValue.value = …` inside a component does not lint.** This repo's
`eslint-plugin-react-hooks` v7 (`react-hooks/immutability`) rejects
"modifying a value returned from a hook", which is every `x.value = withSpring(0)`
in a handler or an effect. The app therefore uses `x.get()` / `x.set(...)`
throughout — the accessor pair upstream added for exactly this reason, and
which this surface implements. Both spellings work at runtime; only one
passes the gate.

**3. `react-hooks/refs` has no spelling for a render counter.** Counting
renders means writing a ref during render, which is precisely what the rule
forbids. `eslint.config.ts` turns that one rule off for this directory, next
to the two exemptions the repo already carries for `src/components` (lazy ref
init) and `spike/`.

## What is not here

Nothing in the app is faked, and a few things a reader might expect are absent
— none of them because the demo is hiding something:

- **`GestureDetector` / `Gesture.Pan()`** — implemented, but demonstrated in
  `examples/gesture-detector` rather than here. Panel 01 deliberately uses
  `PanResponder`, so the two examples cover the two gesture layers instead of
  duplicating one.
- **Layout animations** (`FadeIn`, `LinearTransition`, `Keyframe`) —
  implemented, and not yet demonstrated here. Worth a panel.
- **`Animated.FlatList`** — throws rather than warns, so there is no running
  demo to show. Panel 07 names it; `docs/api.md` has the reasoning.
- **The other four ways a size lands on the refused side** — listed under
  ["The six things that put a size on the refused side"](#the-six-things-that-put-a-size-on-the-refused-side)
  above. Panel 07 demonstrates two of the six on screen.

An animated `width` **is** demonstrated as working, in panel 07's first lane.
It used to be in this list, and this README used to say that pressing "Animate
width" does nothing and that an animated `width` could resize the window it is
in. Both were true when they were written and neither is now
([docs/research/animated-size.md](../../docs/research/animated-size.md)).

`useAnimatedProps` is not demonstrated either: its real consumer is the SVG
shapes, and that case is already covered by the gallery's SVG section.

## How the screenshots were taken

`scripts/shot-example-headless.ts` and `scripts/shot-example-drag.ts`, on a
private headless compositor with a `zwlr_virtual_pointer_v1` device — so the
drag above is a real pointer through the real compositor → GDK → responder
path, not a synthesised callback.
