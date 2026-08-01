# reanimated-playground — the Reanimated surface, hands on

Seven panels on one scrolling screen, each one a thing
[`react-native-gtkx/reanimated`](../../docs/api.md#react-native-reanimated-react-native-gtkxreanimated)
either does or deliberately does not do. It is meant to be **run and poked
at**, not read: drag the box, press the buttons, watch the render counter not
move.

```sh
npm install                            # from the repo root (workspaces)
cd examples/reanimated-playground
npm run dev                            # gtkx dev — vite + Fast Refresh
npm run build && npm start             # release bundle
```

![The playground mid-drag: the "drag me" box carried down to the bottom-right of its arena by the pointer and CUT OFF at the arena's edge — its lower half and the bottom of its label gone, the caption below it untouched — and further down a row of counters reading "React renders — looping box: 1", "React renders — dragged box: 1", "Frames driven — looping box: 350", "Frames driven — dragged box: 58", "Frames per second, now: 59".](../../docs/shots/reanimated-playground.png)

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
`withSpring` on release. **It is not `GestureDetector`** — `Gesture.Pan()` and
`GestureDetector` are not implemented here and throw, naming themselves — so
the drag is React Native's own responder system, which is what an RN app used
before the Gesture API existed and which runs here unchanged. The Reanimated
half is exactly what you would write on iOS. The panel says all of this on
screen; a demo that quietly substituted one gesture API for another would be
lying about the state of the platform.

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

**04 The five animation functions.** `withTiming`, `withSpring`,
`withSequence`, `withRepeat`, `withDelay` and `cancelAnimation` on one box, so
they can be fired back to back and compared.

**05 Easing.** Seven curves over the same 1400 ms and the same 260 px, all
started from one press — one shared value the rows react to, rather than seven
buttons.

![Seven lanes mid-flight, each box at a different distance along its track: linear ahead of ease, out(bounce) furthest behind, out(cubic) and bezier(.25,.8,.25,1) furthest ahead.](../../docs/shots/reanimated-playground-easing.png)

**06 One value, three consumers.** Two `useDerivedValue`s and one
`useAnimatedReaction` off a single shared value, driving three widgets and a
tally. No hook is given a dependency array and everything still updates,
because tracking here is dynamic — recorded from the reads a mapper actually
performs.

**07 What it refuses.** The panel this example exists for as much as the
counter does.

![Panel 07 after pressing "Animate width" then "Force a React render": the red box now 280 px wide with a "2" in it, the green box fully rounded, two yellow warnings quoting the LAYOUT-property refusal and the borderRadius refusal in full, and a table reading 64 µs / 128 µs / 496 µs for the Yoga pass at 5, 60 and 300 children against 0.7 µs for a transform and 11.2 µs for a colour.](../../docs/shots/reanimated-playground-refused.png)

Press "Animate width" and **nothing moves**. The warning it produces is
printed in the app (`src/warnings.ts` wraps `console.warn`; the panel renders
the buffer), next to the measurement that justifies it: a Yoga pass plus
commit for one animated `width` is 64 µs on a five-child tree, 128 µs at
sixty and 496 µs at three hundred, while a transform write is 0.7 µs and a
colour write 11.2 µs at every one of those sizes. A layout write is O(the
tree); the two imperative paths are O(1). And `queueResize` propagates to the
toplevel, so an animated `width` can resize the window it is in.

Then press "Force a React render" and the box jumps to where the animation
ended — the documented behaviour, that the value is applied on the next React
render rather than dropped. `borderRadius` gets the other message (not a
layout property, still not driveable) and lands on the same render.
`scaleX`, the transform the warning names, runs at frame rate next to them.

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
count is printed inside the refused boxes so that the next render actually
reaches them.

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

Nothing in the app is faked, and two things a reader might expect are absent
because the platform does not have them:

- **`GestureDetector` / `Gesture.Pan()`** — not implemented; panel 01 says so
  and uses `PanResponder`.
- **Layout animations** (`FadeIn`, `LinearTransition`, `Keyframe`) and
  **`Animated.FlatList`** — these throw rather than warn, so there is no
  running demo of them to show. Panel 07 names them; `docs/api.md` has the
  reasoning.

`useAnimatedProps` is not demonstrated either: its real consumer is the SVG
shapes, and that case is already covered by the gallery's SVG section.

## How the screenshots were taken

`scripts/shot-example-headless.ts` and `scripts/shot-example-drag.ts`, on a
private headless compositor with a `zwlr_virtual_pointer_v1` device — so the
drag above is a real pointer through the real compositor → GDK → responder
path, not a synthesised callback.
