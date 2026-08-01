# react-native-reanimated on this platform: can it exist, and at what cost

Reconnaissance behind the Reanimated decision, 2026-08-01. Prior art:
`docs/research/gestures.md` (which ruled Reanimated out of scope) and
`docs/research/drag-and-drop.md` (which measured how load-bearing it is for
one real consumer). This epic re-opens the question those two closed, and
reaches the opposite conclusion — on evidence that neither of them had.

**Decision: yes, attempt it. Reimplement the single-runtime semantics behind
the `react-native-reanimated` name, aliased like `react-native-svg` and
`react-native-reanimated-dnd` already are. Do not port the worklet
architecture; there is nothing to port it onto, and nothing that needs it.**

The first slice is `useSharedValue` + `useAnimatedStyle` driving `opacity`
and `transform`. That slice is **already proven end to end** — see the spike
below, which moves a real GTK widget 120px with zero React renders.

## The hypothesis, and why it survived contact

Reanimated exists to solve a problem this platform does not have. On mobile,
JS and UI are separate threads and crossing between them is expensive; the
worklet runtime, shared values, `runOnUI`/`runOnJS` and the Babel extraction
all exist to move work off the JS thread.

Here GTK's main loop **is** the JS thread. A widget call is a synchronous C
call on the same stack through NAPI-RS. So the prediction was that supporting
Reanimated means discarding its architecture rather than reproducing it.

That prediction held, and the strongest evidence is not ours:

> **Reanimated already ships a complete single-runtime implementation.** It
> is the web path, selected by `SHOULD_BE_USE_WEB` in
> `src/common/constants/platform.ts:23`:
>
> <!-- prettier-ignore -->
> ```ts
> export const SHOULD_BE_USE_WEB = IS_JEST || IS_WEB || IS_WINDOWS;
> ```

Note `IS_WINDOWS`. **react-native-windows — an out-of-tree RN platform with
no DOM and no second runtime — is already routed down that path.** The
architecture is not load-bearing for Reanimated's own semantics; upstream
treats it as an optimisation that some platforms do not need. Every scary
piece has a single-threaded twin already in the tree:

| Concern                                  | Native path                                       | Single-runtime twin that already exists                                        |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `runOnUI` / `runOnJS` / `scheduleOnUI`   | `threads.native.ts`, JSI hop                      | `worklets/src/threads.ts` — 110 lines, `queueMicrotask` + rAF                  |
| Shareable serialization                  | `memory/serializable.native.ts`, 889 lines        | `memory/serializable.ts` — 35 lines of identity functions                      |
| `SharedValue.value`                      | `makeMutableNative` + guest/host decorators       | `mutables.ts:297` `makeMutableWeb` — a plain closure box with a listener `Map` |
| Mapper registry, topo sort, dep tracking | —                                                 | `src/mappers.ts` is **already 100% JS**, no native calls at all                |
| `withTiming` / `withSpring`              | —                                                 | already pure JS math; only the frame pump is native                            |
| Applying props outside React             | `global._updateProps` into the Fabric shadow tree | `_updatePropsJS`, which tries `setNativeProps` **before** touching the DOM     |

The last row matters more than it looks. `ReanimatedModule/js-reanimated/index.ts`
dispatches in this order:

<!-- prettier-ignore -->
```ts
if (typeof component.setNativeProps === 'function') {
  setNativeProps(component, rawStyles, isAnimatedProps)   // <- not DOM
} else if (createReactDOMStyle !== undefined && component.style !== undefined) {
  updatePropsDOM(component, rawStyles, isAnimatedProps)
}
```

So the single-runtime path is not inherently DOM-bound. The blocker to
_vendoring_ it wholesale is elsewhere (below), not in the architecture.

## The cheapest decisive experiment: the Babel plugin

The first probe was to put their Babel plugin in front of a trivial worklet
and read what it emits. Against `react-native-reanimated@4.5.3` /
`react-native-worklets@0.11.3`, a `'worklet'`-annotated function becomes:

<!-- prettier-ignore -->
```js
const bump = function bump_probeTsx1Factory({ _worklet_16865615926849_init_data }) {
  const _e = [new global.Error(), 1, -27];
  const bump = function (x) { return x * 2 + 1; };
  bump.__closure = {};
  bump.__workletHash = 16865615926849;
  bump.__pluginVersion = "0.11.3";
  bump.__initData = _worklet_16865615926849_init_data;
  bump.__stackDetails = _e;
  return bump;
}({ _worklet_16865615926849_init_data });
```

Three measured facts, each verified by running the emitted code:

1. **The output is an ordinary JS closure.** The body is preserved verbatim
   and captured lexically. `bump(2) === 5` with no runtime present.
2. **The plugin injects no runtime import.** Grepping the emitted module for
   added `require`/`import` finds none — the only import is the one the
   source already had. The only free global is `global.Error`.
3. **The worklet metadata is inert without a serializer.** `__closure`,
   `__workletHash` and `__initData` are consumed only by the code that ships
   a function to a second runtime. With one runtime they are dead weight.

So the plugin needs nothing from us. **And we do not need the plugin.** The
same source, transformed with the plugin removed entirely, behaves
identically — `'worklet'` is then just an inert string directive, which is
what a directive prologue is in plain JS:

|                                            | with `react-native-worklets/plugin` | with no plugin at all     |
| ------------------------------------------ | ----------------------------------- | ------------------------- |
| worklet directly callable                  | yes (`bump(2) === 5`)               | yes (`bump(2) === 5`)     |
| `runOnUI(fn)()` runs synchronously         | yes                                 | yes                       |
| `useAnimatedStyle` mapper re-runs on write | yes                                 | yes                       |
| `__workletHash` present                    | yes                                 | no — and nothing reads it |

**This platform never runs Babel anyway.** The vite path is
vite 8 / rolldown (oxc); the Metro path uses the app's own stock
`@react-native/babel-preset`, which this repo deliberately never modifies.
There is no repo-side Babel config to add a plugin to and none to strip one
from. So both configurations have to work, and both do: an app that keeps
`react-native-worklets/plugin` in its `babel.config.js` for its iOS and
Android builds produces output our runtime handles, and an app without it
produces output our runtime handles.

**Dependency tracking does not need the plugin either**, and this is where a
single runtime is strictly better. Upstream uses the plugin-emitted
`__closure` only to build a _candidate_ list —
`useAnimatedStyle.ts:491` is `let inputs = Object.values(updater.__closure ?? {})`
— and `extractInputs` then filters it at runtime; on web, when `__closure`
is absent, the user's `dependencies` array is substituted. We can skip both
and track **dynamically**: record which shared values a mapper actually reads
while it runs. That is more precise than a static closure scan (a
conditional read is tracked correctly) and needs no build step. The spike
does exactly this in about 20 lines.

### The one semantic divergence, and it is benign

The plugin captures closure variables **by value** at creation time; plain
lexical capture is live. Measured on the same source:

```
captured value seen by worklet, WITH plugin:    0     (snapshot)
captured value seen by worklet, WITHOUT plugin: 42    (live)
```

Mobile's snapshot behaviour is an artifact of serializing the function to
another runtime, not an intended semantic. In practice worklets capture
shared values — objects with stable identity — so the two agree. The
divergence is only observable for a worklet closing over a reassigned plain
`let`, which is already a bug on mobile. Document it; do not engineer around
it.

## The spike: it already drives a real GTK widget

`spike/reanimated/` is a ~330-line flattened Reanimated (`useSharedValue`,
`useAnimatedStyle`, `useDerivedValue`, `useAnimatedReaction`, `withTiming`,
`runOnUI`, `runOnJS`, `useAnimatedRef`, `measure`) plus a probe app written
against the plain React Native surface. `bash spike/reanimated/run-headless.sh`
in the VM builds it, runs it under headless sway and prints:

```
[rea-spike] PASS runOnUI/runOnJS are direct calls — uiRan=true jsGot=7 (synchronously, same stack)
[rea-spike] PASS measure() is synchronous — start={"x":72,"y":90,"width":24,"height":24,"pageX":72,"pageY":90}
[rea-spike] PASS shared value drove REAL GTK geometry — pageX 72 -> 192 (moved 120px, expected 120)
[rea-spike] PASS no React render during the animation — render count = 1
[rea-spike] PASS mapper re-ran per frame — useAnimatedReaction fired 65 times
[rea-spike] PASS shared value settled at target — offset.value = 120
[rea-spike] PASS animated position survives a React render — pageX after re-render = 192 (was 192)
```

The geometry check is deliberately taken from `measureInWindow` on a **child**
of the animated view, so it reports the real GTK allocation in window
coordinates rather than a value we stored ourselves. 65 mapper runs over
1200 ms is ~54 fps on the existing 16 ms GLib timeout driver.

### Why it needed no library changes at all

The single most useful discovery in the epic. `src/components/animated.tsx:48`
recognises an animated node **structurally**:

```ts
const isAnimatedNode = (value: unknown): value is AnimatedNode =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as AnimatedNode).addListener === "function" &&
  typeof (value as AnimatedNode).__getValue === "function"
```

A `SharedValue` that also implements `addListener` / `removeListener` /
`__getValue` **is** an `AnimatedNode`, so the existing `Animated.View` drives
it through the existing path — `setStoredTransform` into the rect store plus
`queueAllocate`, and `widget.setOpacity` for opacity — with no change to
library code. Reanimated's `AnimationObject` and our `AnimatedValue` turn out
to be the same idea, and the platform's animation engine
(`src/animated/`, pure, scheduler-injected) is already the right driver.

`useAnimatedStyle` is then a small adapter: run the updater under dependency
tracking, replace each animatable leaf with a derived node on the first run,
and push new leaf values into those nodes on later runs. React never
re-renders — the spike asserts a render count of exactly 1 across the whole
animation, and asserts that a subsequent real React render does not reset the
animated position.

## Where the actual cost is

Not the runtime. Two places.

### 1. The animatable-property gap — the real boundary

Reanimated's `useAnimatedStyle` can animate essentially everything.
`src/common/style/config.ts` is a 234-entry allow-list
(`STYLE_PROPERTIES_CONFIG`) covering layout props (`width`, `height`, `top`,
`flex`, every `margin*`/`padding*`), colors (`backgroundColor`, `color`,
every `border*Color`, via `processColor`), shadows, borders, typography,
transforms and opacity.

This platform can currently write exactly **two** things to a mounted widget
without a React render:

- `opacity` → `widget.setOpacity(...)`;
- `transform` → `setStoredTransform` + `queueAllocate`, applied in
  `allocateChild` as a `Gsk.Transform.matrix2d`.

Everything else — every color, every border, every radius — reaches GTK as a
CSS class computed in `useLayoutChild` and applied through React as a
`cssClasses` prop. There is **no imperative escape hatch** for it, and layout
props would additionally require a Yoga pass.

So `useAnimatedStyle` returning `{ backgroundColor }` or `{ width }` cannot be
honoured at full rate today. That is the honest boundary, and it is the same
boundary our own `Animated` already has (`docs/api.md`): this is not a new
limitation, it is an existing one becoming visible under a bigger API.

Widening it is a separate, independently valuable piece of work:

- **colors** need an imperative CSS provider per widget (or a small set of
  animatable GTK properties) instead of a memoised class registry;
- **layout props** need a Yoga write plus a targeted re-layout, which is
  what `queueResize` already does — expensive per frame by construction, and
  expensive on mobile too.

> **Both of those were since done and measured** —
> [animated-colors.md](animated-colors.md). Colours animate through a
> `GtkCssProvider` private to each widget, at 11.2 µs per frame and no React
> renders. Layout props were measured and **refused**: a Yoga pass costs what
> the tree costs (64 µs at five children, 496 µs at three hundred) where
> every other imperative write is flat, so they warn by name with the
> transform to use instead. The paragraph above predicted the shape of both
> answers; only the layout half came out the other way.

The correct first slice therefore stops where the platform stops, and says so
in `docs/api.md`'s Differences column rather than silently dropping writes.

### 2. `exiting` layout animations — the one genuine wall

`entering` and `layout`/`LinearTransition` are fine: snapshot, measure,
animate. Upstream's own web implementation
(`src/layoutReanimation/web/`) does all of it on one thread.

`exiting` is different, and it is the one place where something structural is
required — though it is a **view-layer** requirement, not a second-runtime
one. An exiting animation must keep rendering a widget that React has already
reconciled away. On Fabric, Reanimated does this by being a
`MountingOverrideDelegate` (`LayoutAnimationsProxyCommon`) that rewrites the
mount instruction list and suppresses `Delete`/`Remove` for animating tags.
On web it does it by `cloneNode`-ing the element, stealing its children,
reparenting the clone outside React's control, and using a `MutationObserver`
to catch unmounts React did not announce.

Our equivalent seam is `useLayoutChild`'s single `useLayoutEffect` cleanup
(`src/components/use-layout-child.ts:172-265`), which on unmount does
`node.setCommit(null)`, `parent.removeChild(node)`, `node.free()`. By the
time it runs the widget is already detached — there is nothing left to
animate. Something below React has to retain it.

This platform already has the pattern, which is why this is a cost and not a
wall: `src/common/navigation-stack.tsx` snapshots a page when it leaves the
stack and drops it on the widget's real `hidden` signal, with a
`DEFAULT_TRANSITION_MS` fallback. That is exactly "keep rendering a component
the router already considers gone". Generalising it into a retention
primitive is real work, and it is why `exiting` belongs in a later slice
rather than the first.

## Why not vendor the web path wholesale

Tempting — `SHOULD_BE_USE_WEB` already selects a single-runtime
implementation, and `_updatePropsJS` prefers `setNativeProps` over the DOM.
But:

- the flag is `Platform.OS === 'windows' | 'web'`, and ours is `linux`, so it
  would take a patched fork rather than configuration;
- 21 files under `src/` still reach for `document`, `HTMLElement`,
  `getBoundingClientRect` or `MutationObserver`, including
  `JSReanimated.ts`, the whole `layoutReanimation/web/` tree and
  `platformFunctions/measure.web.ts`;
- it is 35,749 LOC of `src/`, of which `layoutReanimation` alone is 10,313
  and the Reanimated 4 CSS-animations feature is another 6,180 — almost all
  of it either decorative or DOM-bound;
- maintaining a fork of a fast-moving package is precisely the trap
  `docs/research/gestures.md` identified for RNGH's `src/web/`.

The right use of the web path is as a **blueprint**: it proves the
architecture flattens, and its files are the reference for how each piece
behaves without a second runtime. `interpolate`, `Easing`, `Bezier` and the
color parsing in `Colors.ts` are pure JS and can be reimplemented or adapted
directly; `withTiming`'s `onFrame` is five lines of arithmetic.

## What is decoration

Measured against the package's own exports, a first implementation can omit
all of this and still run most consumers:

- the **layout-animation catalog** — `BounceIn*`, `FlipIn*`, `LightSpeed*`,
  `Pinwheel*`, `Roll*`, `Rotate*`, `Stretch*`, ~90 exported builders, all
  presets over `withTiming`/`withSpring`. `FadeIn`/`FadeOut`/`LinearTransition`
  cover the overwhelming majority of real usage;
- **CSS animations** (`css.create`, `css.keyframes`, `createCSSAnimatedComponent`,
  ~25 `CSS*` types) — a Reanimated 4 addition no pre-4 consumer uses;
- **sensors** (`useAnimatedSensor`) — no analogue on a desktop;
- **screen transitions** and **shared element transitions** — the latter is
  marked experimental upstream;
- already-dead exports: `addWhitelistedNativeProps` / `addWhitelistedUIProps`
  are documented no-ops upstream, `isConfigured`/`isReanimated3` are
  deprecated warn-only aliases.

Deceptively cheap-looking but actually structural: `useEvent` / `useHandler`.
They look advanced, but `useAnimatedScrollHandler`, `useScrollOffset` and
`useComposedEventHandler` are all built on them.

## What this does to the gestures decision

`docs/research/gestures.md` ruled RNGH out partly because "Gesture-capable
platform and Reanimated port are now one milestone" — RNGH 3.x deleted the
Reanimated-free `Swipeable`/`DrawerLayout`, so every interesting consumer
needs both. That reasoning was correct and is unchanged. What changes is the
**price of the Reanimated half**, which that epic assumed was a worklet
runtime port and is in fact an adapter over machinery this platform already
has.

That does not automatically unblock the ecosystem — `react-native-draggable-flatlist`,
`@gorhom/bottom-sheet` and `@react-navigation/drawer` need `GestureDetector`
too, and RNGH remains ~1,200–1,600 LOC of `src/web/` port with no supported
seam. But it moves the blocker: after this, RNGH is the only thing left, and
it is a known quantity rather than a research question.

## Verdict

| Question                                             | Answer                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does the Babel plugin block us?                      | No. Its output is plain JS with no injected imports, and we do not need to run it at all.                                                                    |
| Is there a second runtime we cannot flatten?         | No. Upstream already ships the flattened version and routes a DOM-less platform (Windows) down it.                                                           |
| Can `useSharedValue` + `useAnimatedStyle` drive GTK? | **Yes, measured** — 120px of real window-space movement, 0 React renders, ~54 fps, no library changes.                                                       |
| Is `measure()` on the "UI thread" a problem?         | No. Ours is already synchronous; there is one thread.                                                                                                        |
| Where is the real cost?                              | The animatable-property gap (we can drive only `opacity` and `transform` imperatively) and `exiting` layout animations (needs a widget-retention primitive). |
| Should we attempt it?                                | Yes, as an aliased reimplementation, first slice `opacity` + `transform`.                                                                                    |
