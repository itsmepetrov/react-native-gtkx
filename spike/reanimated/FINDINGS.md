# Reanimated spike — the flattened architecture drives real GTK

**This is a spike, not an implementation.** It exists to answer one question
with a measurement instead of an argument: can `useSharedValue` +
`useAnimatedStyle` drive a real GTK widget on this platform, with no worklet
runtime, no second thread, and no change to library code?

**Answer: yes, all three.** The full reasoning, the Babel-plugin probe and
the cost analysis live in `docs/research/reanimated.md`; this file records
only what the probe itself proves.

## Running it

```bash
# in the VM (see .claude/skills/vm/SKILL.md)
cd spike/reanimated && npx gtkx build
cd ../.. && bash spike/reanimated/run-headless.sh
```

The spike is not an npm workspace and needs no install of its own — `vite`,
`@gtkx/cli` and the `react-native-gtkx` workspace link all resolve from the
repo root's `node_modules`.

The probe decides its own verdict in-process by measuring real GTK geometry;
the screenshots in `/tmp/rea-spike` only show that it moved on screen.

## Output

```
[rea-spike] PASS runOnUI/runOnJS are direct calls — uiRan=true jsGot=7 (synchronously, same stack)
[rea-spike] PASS measure() is synchronous — start={"x":72,"y":90,"width":24,"height":24,"pageX":72,"pageY":90}
[rea-spike] PASS shared value drove REAL GTK geometry — pageX 72 -> 192 (moved 120px, expected 120)
[rea-spike] PASS no React render during the animation — render count = 1
[rea-spike] PASS mapper re-ran per frame — useAnimatedReaction fired 65 times
[rea-spike] PASS shared value settled at target — offset.value = 120
[rea-spike] PASS animated position survives a React render — pageX after re-render = 192 (was 192)
```

`1-before.png` shows the box at x=24 at full opacity; `2-after.png` shows it
at x=144 at opacity 0.35. Both were driven by shared values.

## What each assertion actually proves

- **`runOnUI`/`runOnJS` are direct calls.** The worklet body ran
  synchronously on the same stack and the value came back through `runOnJS`
  in the same tick. There is no scheduling because there is nowhere to
  schedule to.
- **`measure()` is synchronous.** Upstream's `measure()` may only be called
  inside a worklet, because only the UI thread holds the current shadow
  tree. Ours returns a value directly: `measureInWindow` already invokes its
  callback before returning. The first call still waits for the window to be
  mapped and the first Yoga rect to be committed — that is the platform's
  RN-faithful `measure()` contract, not a spike limitation.
- **Real GTK geometry.** The measurement is taken on a **child** of the
  animated view, in window coordinates, so it reports what GTK actually
  allocated rather than a value the spike stored itself. 120px commanded,
  120px observed.
- **No React render.** The render counter still reads 1 after the whole
  animation. Values reach the widget through `setStoredTransform` +
  `queueAllocate` and `widget.setOpacity` — the platform's existing
  imperative path.
- **Mapper re-ran per frame.** 65 runs over 1200 ms ≈ 54 fps on the existing
  16 ms `GLib.timeoutAdd` driver, with no new timer added by this layer.
- **Survives a React render.** A later real render does not snap the widget
  back, which is the failure mode a naive implementation would hit.

## The load-bearing discovery

`src/components/animated.tsx:48` recognises animated nodes **structurally**
(`addListener` + `__getValue`). A `SharedValue` implementing those two
methods therefore _is_ an `AnimatedNode`, so the existing `Animated.View`
drives it with **zero library changes**. `src/flat-reanimated.tsx` is the
whole adapter, and its `withTiming` runs on the platform's own `Animated`
engine rather than introducing a second clock.

## What the spike deliberately does NOT do

Kept out on purpose, so this stays a probe and does not drift into a half
implementation:

- only `opacity` and `transform` leaves become animated nodes, because those
  are the only two things this platform can write to a mounted widget
  imperatively. Colors and layout props stay literal and are frozen at first
  render — the real cost boundary, analysed in the research doc;
- a style whose _shape_ changes between mapper runs is not handled (the leaf
  map is built once);
- no `withSpring`, `withSequence`, `withRepeat`, `withDelay`, `interpolate`,
  `interpolateColor` or `Easing` — all pure JS upstream and none of them in
  question;
- no `entering`/`exiting`/`layout` animations. `exiting` is the one part
  needing something genuinely new from the view layer (a widget-retention
  primitive); see the research doc;
- no `createAnimatedComponent`, no `useAnimatedScrollHandler`, no
  `useEvent`/`useHandler`, no `GestureDetector` integration;
- no cancellation or re-entrancy hardening, and mappers are never torn down.

## Nuance worth remembering

`react-native-worklets/plugin` captures closure variables **by value** at
creation; plain lexical capture is live. Measured on identical source: the
plugin build sees `0`, the plain build sees `42`. Mobile's snapshot behaviour
is an artifact of serializing to another runtime. In practice worklets close
over shared values — objects with stable identity — so the two agree, and
the divergence is only visible for a worklet closing over a reassigned plain
`let`, which is already a bug on mobile.
