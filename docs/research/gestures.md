# Touch and gestures: what they should be on this platform

Research behind the gestures decision. First pass 2026-07-30 (touch parity
on GTK4 for embedded touchscreens); revised 2026-08-01 after building
drag-and-drop for `examples/tasks-nav`, which turned the question from "how
faithful can we be" into "which of three directions do we take".

**Decision: reimplement RN's own Gesture Responder System in JS on top of
GTK4 event controllers, mouse-first, in three slices.**
`react-native-gesture-handler` and `react-native-reanimated` are out of
scope. GTK's own controllers stay the documented Linux-only escape hatch
they already are.

## Where we started

Building drag-reorder for `tasks-nav` established the position concretely.
RNGH and Reanimated are not implemented, shimmed or aliased anywhere — the
presets alias `react-native` and `react-native-svg` and nothing else — so
libraries built on them fail at _import_, not at runtime. One level down, a
hand-rolled JS gesture was blocked too: `View` had no touch or responder
props, `PressEvent` was `{x, y}`, there was no `measure()`, and
`ScrollEvent` had no `layoutMeasurement`, so even autoscroll-during-drag had
nothing to read. The feature shipped on `GtkDragSource`/`GtkDropTarget` —
correct for a Linux-only app, but an escape hatch, not a story.

## The RN surface to be faithful to

The **Gesture Responder System** is a single global interaction lock with
capture-then-bubble negotiation (deepest-wins on bubble, parent-wins on
capture), transfer to ancestors via LCA renegotiation, and a voluntary
release protocol (`onResponderTerminationRequest`). View touch props
(`onTouchStart/Move/End/Cancel`) fire independently of responder status from
the same event stream. `PanResponder` wraps the responder props with
centroid-based `gestureState` maths.

reactnative.dev does **not** call it legacy: the docs source
(`facebook/react-native-website/docs/gesture-responder-system.md`) carries
no deprecation notice, no admonition and no mention of RNGH. That framing is
RNGH's own README. W3C pointer events (RN 0.71) were additive.

Under Fabric the negotiation still runs in JS — native is dispatch-only, and
the sole JS→native back-channel is `setIsJSResponder`.

## The cheap path is closed for us

Every other platform gets the algorithm free: emit
`topTouchStart/Move/End/Cancel` and let the stock renderer negotiate.
`ResponderEventPlugin` (~800 lines) plus `ResponderTouchHistoryStore` —
~1,300 lines in total — live in **`facebook/react`**, inside
`packages/react-native-renderer`, and ship inside RN's `ReactFabric-*.js`
bundles.

We render through `@gtkx/react`, which is built on `react-reconciler` — not
`react-native-renderer`. There is no plugin seam to feed.

So our situation is **react-native-web's exactly**: a foreign event model
with no renderer hook. RNW's
`packages/react-native-web/src/modules/useResponderEvents/` is **1,466
lines** across six files, a deliberate clean-room rewrite (0.13.0 release
notes: "rewritten from scratch in user space… the most accurate and well
integrated implementation of any platform") that preserves the upstream
lifecycle verbatim. Two consequences that cut our cost:

- **`PanResponder` is vendorable unchanged.** RNW's
  `src/exports/PanResponder/index.js` is four lines re-exporting Meta's own
  file, header intact. It works because RNW reproduces the exact
  `touchHistory` shape upstream expects (`touchBank` with `currentPageX/Y`,
  `previousPageX/Y`, `startPageX/Y`, `*TimeStamp`, `touchActive`;
  `numberActiveTouches`; `indexOfSingleActiveTouch`; `mostRecentTimeStamp`).
- RNW also _added_ two negotiation channels RN lacks
  (`onScrollShouldSetResponder`, `onSelectionChangeShouldSetResponder`) —
  precedent that extending the model for a platform's realities is fine.

## Why not react-native-gesture-handler

The reuse thesis is technically sound. RNGH's `src/web/` is 6,505 LOC of
pure TypeScript with no third-party deps as of 3.x; roughly 4,900 of it
makes no DOM calls at all, including the 1,147-LOC `GestureHandler` state
machine and the whole 401-LOC `GestureHandlerOrchestrator`, where
multi-gesture arbitration actually lives. `AdaptedEvent` is a plain struct;
`GestureHandlerDelegate` is 13 methods. A port is ~1,200–1,600 LOC against
~9,000 LOC of native recognizers.

We are still not doing it:

1. **It unblocks almost nothing.** `react-native-draggable-flatlist`,
   `@gorhom/bottom-sheet` and `@react-navigation/drawer` all list Reanimated
   as a _hard_ peer dependency and import it at module scope. Reanimated
   genuinely is a soft dependency of RNGH itself (3.1.0's
   `peerDependencies` are exactly `react` and `react-native`; the
   `try { require(...) } catch` in `reanimatedWrapper.ts` is real) — and a
   hard one for everything built on it. "RNGH without Reanimated" buys
   `@react-navigation/stack`'s swipe-back and nothing else.
2. **RNGH 3.x closed even that.** PR #3734 (in 3.0.0) deleted the
   Reanimated-free `Swipeable` and `DrawerLayout`; only
   `ReanimatedSwipeable`/`ReanimatedDrawerLayout` survive, both with an
   unconditional module-scope Reanimated import that bypasses RNGH's own
   soft wrapper. In 2.x you could ship swipeable rows without Reanimated; in
   3.x you cannot. Gesture-capable platform and Reanimated port are now one
   milestone.
3. **No supported seam.** `src/web/` and its two interfaces are unexported,
   there is no `exports` map, and no out-of-tree platform story. Metro would
   resolve `.linux.* → .native.* → .ts` onto the _native_ module. Realistic
   budget: vendoring a private layer that 3.0 just rewrote.
4. **The one precedent is a warning.** react-native-windows has shipped
   `RNGestureHandlerModule.windows.ts` as a literal `// NO-OP` since 2.8.0
   (Oct 2022), unchanged today; both tracking issues are closed as _not
   planned_. macOS got real support only because RNGH's Objective-C could be
   recompiled against AppKit through react-native-macos's `RCTUIKit` shim —
   an option GTK does not have. Nobody has reused `src/web/`.

RNGH also **layers on** the responder system rather than replacing it
(`NativeDetector.tsx` sets `onStartShouldSetResponder`), so nothing built
for the responder system is wasted if RNGH ever arrives.

## Where GTK's model and RN's disagree

### RN has one tree; we have islands

`NestedRoot`/`IntrinsicRoot` mount a whole Yoga engine inside arbitrary
native GTK slots — an `Adw.NavigationPage`, a `HeaderBar` slot, a sidebar
row — so native widgets with their own gestures sit both above and below RN
views. `tasks-nav` is mostly native widgets with RN inside them. macOS,
Windows and Web all have a single RN-owned tree; we do not. The responder
lock is therefore scoped to a `Root`, not the process, and events a native
widget consumes never enter it at all.

### There is no voluntary release

`gtk_gesture_set_state(CLAIMED)` sets the sequence to `DENIED` on every
gesture on _parent_ widgets and emits `::cancel` on everything _underneath_
— and `::cancel` means "forget everything about this sequence".
`Claimed → Denied` is legal but is not an undo; GTK compensates only in the
narrow case of a capture-phase claim on press released before any movement.
There is no way to ask a holder to yield, so
`onResponderTerminationRequest` has no GTK analogue: negotiation runs
entirely in JS and `CLAIMED` is only the final one-way declaration.

Note the asymmetry: a parent stealing from a child maps onto capture-phase
claiming; a child stealing from a claimed ancestor is not expressible.

### RN is touch-first, GTK on the desktop is pointer-first

`gdk_event_get_event_sequence()` returns `NULL` for every mouse event and
non-NULL only for touch, so a sequence-keyed table must treat `NULL` as a
legitimate key.

And the finding that reorders the work: **all four gestures
`GtkScrolledWindow` installs internally (drag, pan, swipe, long-press) are
`touch_only = TRUE`** and grouped. With a mouse they never run, so a child
pan inside a scrolling list never contends with scrolling — the only mouse
path in is `GtkEventControllerScroll`, and a wheel is not a drag.
**ScrollView arbitration is a touch-only problem**, and everything else is
mouse-verifiable without touch hardware or a seated session.

For touch, the levers are known:
`gtk_scrolled_window_set_kinetic_scrolling(FALSE)` puts all four gestures in
`GTK_PHASE_NONE` (the only lever without a race); the scrolled window claims
only in `drag-update` after the drag threshold, so a child claiming on press
wins; and its long-press handler unconditionally denies the whole grouped
set — which is why long-press-then-drag works in native GTK lists.

### Thresholds and delays are not where you would expect

`GtkGestureDrag` has **no threshold** — it emits `drag-begin` on press;
`gtk-dnd-drag-threshold` (8 px) is ours to apply.
`GtkGestureLongPress`'s delay is `gtk-long-press-time` (500 ms) times a
`delay-factor` clamped to [0.5, 2.0], so GTK can express only 250–1000 ms
against RN's arbitrary `delayLongPress`. `Pressable` already uses a JS timer
instead, and the gesture work keeps doing that.

### Where they agree

GTK's `CAPTURE → TARGET → BUBBLE` runs root→target then target→root, which
is exactly RN's capture/bubble order. That is the one thing GTK hands us for
free, and reimplementing it would be spending code to get it wrong.

## Verifiability decides the implementation shape

Two defensible shapes: per-View GTK gestures, or a single
`GtkEventControllerLegacy` on the toplevel in `GTK_PHASE_CAPTURE` returning
`FALSE`, with JS hit-testing via `gtk_widget_pick()` and dispatching the
whole path — react-native-web's shape, and the architecturally cleaner one.

`@gtkx/testing`'s `userEvent` drives **GtkGesture signals on the widget you
name**: `userEvent.drag` calls `getAllControllers(widget, Gtk.GestureDrag)`
and emits `drag-begin`/`drag-update`/`drag-end` with patched
`getStartPoint`/`getOffset`. It never produces a `GdkEvent`. So per-View
gestures are testable in the existing headless GTK suite today; the raw tap
is not testable in the current harness at all, and would need real input
injection — which the touch spike showed requires a seated session (headless
sway over SSH cannot take real input devices).

**The hybrid we take: GTK carries the events, JS owns the algorithm.** Views
declaring responder props get a capture-phase controller for the `*Capture`
props and a bubble-phase one for the rest; both only report "press/move/
release at (x, y) on widget W" into one central module per `Root`, which
owns the path walk, the negotiation and the touch history. A view with no
responder props needs no controller, because RN only asks views that declare
handlers. What this gives up: termination triggers that are not pointer
events (window focus loss, context menu, ancestor scroll) need their own
small per-`Root` listeners rather than falling out of one tap. That is slice
3, where the raw tap gets revisited — and its prerequisite is event
injection in `@gtkx/testing`.

Two GTK details to build around: controllers on one widget run **LIFO**
(`gtk_widget_add_controller` prepends), and a legacy controller returning
`TRUE` also skips the remaining controllers on its own widget.

## What building slice 2 changed about the plan

Four corrections, recorded because the plan was wrong in each and the code is
right.

**Capture-phase GTK controllers are not needed.** The plan called for two
controllers per view — a capture-phase one for the `*Capture` props and a
bubble-phase one for the rest. Once the central JS module owns the path walk
it runs capture root-to-target and bubble target-to-root itself, so one
bubble-phase `GtkGestureDrag` per responder-declaring view is the whole event
source. Half the controllers, and the phase ordering stops depending on GTK
agreeing with RN about it.

**The lock is global, exactly as in RN.** The plan said the responder lock
should be scoped to a `Root`. That was the wrong conclusion from a right
observation: there is one pointer, so one lock is both simpler and more
faithful. What is genuinely island-scoped is the negotiation _path_ — the
walk climbs GTK parents and finds nothing registered above a layout root, so
native widgets between or above views take no part without any special
casing.

**No drag threshold belongs in this layer.** The research said
`gtk-dnd-drag-threshold` (8 px) was "ours to apply" because `GtkGestureDrag`
has none. Applying it would have been a bug: RN's responder system has no
threshold either, and `PanResponder` users supply their own inside
`onMoveShouldSetPanResponder`. A threshold here would silently break every
gesture that claims on press.

**Task 011 is much smaller than it looked.** `@gtkx/vitest` already opens a
Wayland connection and binds `zwlr_virtual_pointer_manager_v1`, creating a
virtual pointer so the headless compositor advertises pointer capability —
it simply never sends events through it. Real input injection is therefore
`motion_absolute`/`button`/`frame` requests on an object the harness already
holds, not a new protocol.

### What slice 2's tests do and do not prove

`userEvent.drag` emits `drag-begin`/`drag-update`/`drag-end` on the named
widget's own controllers. So the tests prove everything from the gesture
signal inward — negotiation, touch history, `PanResponder`'s `gestureState`,
`dx`/`dy`/`vx`/`vy` — and do **not** prove GDK-event-to-`GtkGestureDrag`
delivery. That last hop is the same one `Pressable`'s `GtkGestureClick` has
been making in shipped apps since the beginning, on the same widget class,
which is why this was judged an acceptable gap rather than a blocker. Closing
it properly is task 011.

## What the gallery found, the first time this met a real screen

Two defects that every test had missed, both found within minutes of
pointing the gallery at a real window — and neither of them in the
responder system itself.

**`Animated.ValueXY` did not exist, so the canonical drag crashed.** The
app died on `Animated.ValueXY is not a constructor`. Essentially every RN
drag in the wild is `new Animated.ValueXY()` plus
`pan.setValue({ x: gesture.dx, y: gesture.dy })`, with the transform from
`getTranslateTransform()`. Shipping the responder system without it meant
portable drag code still did not run — the gesture half worked and the
value half was missing. `ValueXY` is now implemented as the thin composite
over two `Value`s that it is upstream, which also required `setOffset` /
`flattenOffset` / `extractOffset` on `AnimatedValue` (the continuing-drag
idiom: fold where the gesture ended into the offset so the next `dx` starts
at zero). Offsets default to 0, so nothing that existed before behaves
differently.

**`Animated.View` silently ignored the responder props.** Slice 2 added
them to `View` only. `Animated.View` is a different component, and it is
precisely where an idiomatic drag lands, because the dragged thing is
animated by definition. Spreading `panHandlers` onto it **compiled without
error** — TypeScript does not excess-property-check a spread of a variable —
and did nothing at runtime. No type error, no warning, no effect: the worst
possible failure mode, and one no unit test would ever catch because the
test would have been written against `View`.

The general lesson is worth stating: a prop set that only some components
accept is a trap when the idiomatic call site is one of the ones that do
not. `docs/api.md` now says which components take responder props.

`Animated.event` remains unimplemented; writing the value directly is what
it would do anyway, and that is documented rather than hidden.

## Landmines other platforms hit

- **Timestamp resolution is load-bearing.** `ResponderTouchHistoryStore`
  reads `timestamp` and `PanResponder`/`TouchHistoryMath` difference it for
  velocity. A coarse or non-monotonic clock silently reports _zero_ movement
  — the standing diagnosis for react-native-windows #14119 ("PanResponder
  don't appear to work on New Architecture", open since 2024-11, still
  reproducing on RN 0.83): `Date.now()` granularity meant consecutive frames
  compared equal. Use a monotonic sub-millisecond clock.
- **Design the ScrollView back-channel in from day one.**
  `setIsJSResponder` — "JS took the interaction, native scroller stop
  stealing the drag" — is the piece everyone gets wrong.
  react-native-windows punted on it in 2017 and shipped a
  `manipulationModes` prop as a workaround; nine years later it is still
  paying.
- **Terminate liberally.** RNW's predicate is the template: cancel-ish
  events, context menu, window blur, ancestor scroll and selection change
  all force `onResponderTerminate`; only the last three consult
  `onResponderTerminationRequest`. Its README says it outright — the
  responder "might have been taken by the browser without asking".
  Substitute GTK.
- **Mouse is one fabricated touch.** RN's own event plugin has always had a
  `topMouseDown` path and RNW documents the conversion. Discriminate real
  touch with `gdk_event_get_pointer_emulated()` plus
  `GDK_SOURCE_TOUCHSCREEN`; `GDK_SOURCE_TOUCHPAD` is an _indirect_ device
  and counts as mouse.

## Simulating touch without hardware

Verified 2026-07-30: a uinput device declaring `INPUT_PROP_DIRECT` plus MT
axes is classified by udev as a real touchscreen (`ID_INPUT_TOUCHSCREEN=1`),
and touch-only GTK gestures do receive its events. `ydotoold -T` is **not**
usable — it enables `EV_ABS` but never sets `INPUT_PROP_DIRECT`.
`GTK_DEBUG=touch-ui` does not help either (it only affects text selection
handles). Headless sway over SSH cannot consume real input devices — no
seat/VT — so touch verification needs a seated session. Full recipe in
`spike/gestures/FINDINGS-touch.md`.

This gates slice 3 only. Slices 1 and 2 are mouse-verifiable in CI.

## The staging

1. **Geometry and event shape** (direction-independent, shipped):
   `measure`/`measureInWindow`/`measureLayout` on `View`,
   `layoutMeasurement` on `ScrollEvent`, RN-shaped `PressEvent` with a
   monotonic timestamp.
2. **Pan and long-press on a View**: `View` responder props +
   `PanResponder`, per-View gestures feeding one central JS module.
3. **Full negotiation**: LCA transfer, termination, ScrollView arbitration —
   behind an input-injection harness.

## Honest gaps for ported apps

No RNGH-based library works, and that is the largest single portability gap
in the platform. Touch targets are not enforced at 44pt/48dp. Multi-finger
pinch/rotate is deferred (GTK has `GtkGestureZoom`/`GtkGestureRotate`
through the platform layer; RN has no portable API worth matching). Hover
currently fires from touch — `GtkEventControllerMotion` does not filter by
device source, and react-native-web explicitly drops non-`touch` pointer
types in `useHover` for this reason. `Pressable` is still not
keyboard-activatable (an accessibility gap, not a gesture one). Apps that
need a drag today should keep using `GtkDragSource`/`GtkDropTarget` through
`react-native-gtkx/gtk`: on Linux it is better than what slice 2 will give
them — real drag icons, cursors, GDK content negotiation — and slice 2's
value is that the same source also runs on iOS and Android.
