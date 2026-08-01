# GestureDetector: can GTK feed a faithful Pan, and what does arbitration cost

Reconnaissance behind the `gesture-detector` decision, 2026-08-01. Prior art:
`docs/research/gestures.md`, which refused `react-native-gesture-handler` on
four grounds, and `docs/research/reanimated.md`, which expired two of them by
shipping Reanimated. This recon re-opens the question those two closed.

**Decision: yes, attempt it. Reimplement the semantics behind the
`react-native-gesture-handler` name over our own responder system, aliased
like `react-native-svg` and `react-native-reanimated` already are. Do not
vendor `src/web/`.**

The first slice is `Gesture.Pan()` + `GestureDetector` + the offset knobs.
That slice is **already proven end to end** — see the spike below, which
moves a real GTK widget 105px through a shared value, refuses the same drag
when the long press has not elapsed, and refuses it again when it goes
sideways past `failOffsetX`.

## What is being reopened, and what is not

Reasons 1 and 2 of the original refusal ("it unblocks almost nothing" /
"RNGH 3.x closed even that") were both about Reanimated, and
`react-native-gtkx/reanimated` ships. Reasons 3 and 4 are untouched and were
not investigated here, except to confirm reason 4 is still true of the
current release:

> `src/RNGestureHandlerModule.windows.ts` in **3.1.0** now imports the eight
> web handler classes and exports them as a `Gestures` map — so the file
> reads, at a glance, like a platform that got implemented. Every one of its
> seven module methods is still a body containing the comment `// NO-OP` and
> nothing else. Four years on, the one precedent for reusing `src/web/` out
> of tree is still a stub that looks less like a stub than it used to.

**And a fact neither the PRD nor `gestures.md` had: the API this epic targets
is deprecated upstream.** In 3.1.0 every one of the twelve `Gesture.*`
statics carries an `@deprecated` tag — `Gesture.Pan()` says "please use
`usePanGesture` instead", `Gesture.Simultaneous()` says
`useSimultaneousGestures` — as do `ComposedGesture`, `SimultaneousGesture`
and `ExclusiveGesture` themselves. The replacement is a 6,763-LOC `src/v3/`
tree of hooks. `GestureDetector` is **not** deprecated; it is the one part
of the surface that survives the migration intact.

This does not change what to build first, because every shipped consumer
measured below still calls the deprecated spelling — but it does change what
to build it _as_: recognizers and arbitration are the implementation, and
`Gesture.Pan()` and `usePanGesture()` are two thin spellings over it. Picking
one as the internal shape would mean rewriting later, exactly as upstream
just did.

**One PRD claim did not survive contact.** "RNGH layers on the Gesture
Responder System rather than replacing it — its own `NativeDetector.tsx`
sets `onStartShouldSetResponder`" is true as a sentence and much narrower
than it reads. That prop comes from `v3/hooks/useJSResponderHandler.ts`,
which returns `() => false` unless a `JSResponderContext` is present, and
whose `isSupportedGesture` covers `Tap`, `LongPress`, `Fling`, `Native` and
`Hover` — **not `Pan`**. It is a narrow interop hook for RNGH gestures
inside an RN `ScrollView`, not the substrate RNGH's arbitration runs on.
The PRD's "fact that makes it tractable" is therefore weaker than stated.
What replaces it is stronger and is ours: the spike below runs a faithful
`Pan` on the responder system and measures it.

## Probe 1: does GTK give us enough raw events

The decisive question, and the one the whole design rests on.
`Gesture.Pan().activeOffsetY([-10, 10])` means: watch the pointer, stay
`BEGAN`, activate only after 10px of vertical travel — and let a sibling win
if it goes horizontal instead. That is reachable only if a GTK controller
reports motion **without claiming the sequence**, for as long as the
recognizer needs to decide.

Measured directly, on raw `Gtk.Box` widgets with no React Native in the path,
driven by a real `zwlr_virtual_pointer_v1` and instrumented through
`GtkGesture::sequence-state-changed` (`spike/gesture-detector/src/probe-gtk.tsx`,
GTK 4.22.4, sway 1.11):

| Question                                                   | Measured                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| When does motion start arriving?                           | `drag-begin` on press, `drag-update` on every injected move — 10 of 10                        |
| Does an unclaimed gesture keep receiving?                  | Yes. **0** sequence-state changes across a 90px drag, `drag-end` at the end, no `cancel`      |
| Can two live recognizers watch the same unclaimed pointer? | Yes. A child gesture and its ancestor's gesture each saw all 10 updates, both at state `NONE` |
| What does claiming cost the claimer?                       | Nothing. Claiming at update 4 on the source: `->CLAIMED`, then updates 5-10 still arrive      |
| What does it cost everyone else?                           | Everything, immediately — see below                                                           |
| Negative control                                           | A zone the pointer never visited: 0 events, in all three runs                                 |

**So the answer is yes, with room to spare.** GTK's controllers are pure
observers until something claims, which is exactly the substrate a JS
recognizer needs. The `activeOffsetY` / `failOffsetX` behaviour is reachable
here, and the epic does not change shape.

### Two corrections to `docs/research/gestures.md`

The claim propagation is **the reverse of what that file records**, and the
difference is not cosmetic.

`gestures.md` says `gtk_gesture_set_state(CLAIMED)` "sets the sequence to
DENIED on every gesture on _parent_ widgets and emits `::cancel` on
everything _underneath_". Measured on 4.22.4, it is the other way round, and
the two directions are not even symmetrical:

| Who claims                                        | What happens to the other gesture | Signals it sees                                                       |
| ------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| the **descendant** (deeper, runs first in bubble) | the ancestor is **cancelled**     | `::cancel` then `::end`, and **no** `::sequence-state-changed` at all |
| the **ancestor** (shallower, runs second)         | the descendant is **denied**      | `->DENIED` then `::end`, and **no** `::cancel`                        |

The second row is the dangerous one, and it upgrades slice 3's bug from
"the drag goes silent" to something worse. Our responder system maps
`::cancel` to `onResponderTerminate` and `drag-end` to
`onResponderRelease`. A native ancestor claiming the sequence mid-drag
therefore reaches JS as **a clean release**, indistinguishable from the user
lifting the pointer — not as a termination. Nothing depends on this today,
because `use-responder.ts` already claims on the source and never on an
ancestor. It becomes load-bearing the moment `Gesture.Native()` puts a real
GTK widget's own gesture into the arbitration, which is precisely what
`@gorhom/bottom-sheet` needs. Any implementation of `Gesture.Native()` has
to treat `drag-end` on a denied sequence as a cancellation, and the only way
to tell the two apart is the `->DENIED` transition — so
`::sequence-state-changed` has to be watched, not just the drag signals.

## Probe 2: what the orchestrator actually guarantees

Read as a specification from `src/web/` at 3.1.0 —
`GestureHandlerOrchestrator.ts` (401 LOC), `GestureHandler.ts` (1,136),
`InteractionManager.ts` (137), `PanGestureHandler.ts` (552),
`gestureComposition.ts` (159). Nothing is vendored, adapted or transcribed;
what follows is the behaviour, restated.

### There are exactly three relations, and composition is sugar

`InteractionManager` holds three maps keyed by handler tag, and nothing else:

| Map                       | Filled from                                           | Means                                    |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `waitForRelations`        | `requireExternalGestureToFail`, and `Exclusive`       | this gesture must wait for those to fail |
| `simultaneousRelations`   | `simultaneousWithExternalGesture`, and `Simultaneous` | these two may both be active             |
| `blocksHandlersRelations` | `blocksExternalGesture`                               | those must wait for **this** one         |

`Gesture.Race` adds nothing at all — it is the default. `Gesture.Simultaneous`
is a pairwise fill of the second map. `Gesture.Exclusive` is a chain fill of
the first ("every group waits for all groups before it"). That is the whole
of composition: 159 lines of list-building over three primitives. **Build the
three maps and the composers are an afternoon.**

### The arbitration rules

1. **Activation order.** A handler that reaches `ACTIVE` asks the
   orchestrator (`tryActivate`). If any live handler it must wait for is
   unfinished, it is parked in `awaitingHandlers` and stays `BEGAN`. If a
   handler it waits for has already reached `END`, it is cancelled outright.
   Otherwise it activates unless some other handler would cancel it.
2. **`makeActive` is a broadcast cancel.** The instant a handler activates it
   walks every recorded handler and cancels each one that
   `shouldHandlerBeCancelledBy` says it should. **Mutual exclusion is the
   default**; a simultaneous relation is the only exemption.
3. **`shouldHandlerBeCancelledBy`**, in order: a simultaneous relation in
   _either_ direction exempts. A handler that is already `ACTIVE` or awaiting
   is cancelled only by an active **`Native`** handler that is not a button —
   this is the one rule `InteractionManager` contributes, and it is why
   `Gesture.Native()` is special rather than just another recognizer.
   Otherwise, two handlers that share no pointer and sit on different views
   are only in conflict if a tracked pointer lies inside both views' bounds;
   everything else conflicts.
4. **`requireExternalGestureToFail` holds until the other handler finishes** —
   `FAILED` or `CANCELLED` releases the waiter (`tryActivate` runs again);
   `END` **cancels** it, with a synthetic `BEGAN -> CANCELLED` if it had
   already ended discretely.
5. **Simultaneous activation is real.** Several handlers can be `ACTIVE` at
   once, each with its own `activationIndex`, all receiving updates.

### Can the responder lock express this? No — and it should not try

The responder lock is a **single global one-winner lock** with LCA-pruned
transfer. RNGH's model is a **set** of concurrently active gestures. Those are
different shapes and no amount of care makes one the other: two gestures
that are `Simultaneous` are both `ACTIVE` and both emit `onUpdate` for the
same pointer, and there is exactly one responder.

The verdict is that they are two locks at two levels, and this is not a
compromise — it is what the platform already forced on the responder system
itself:

- **The responder lock stays what it is**, and keeps its one job: deciding
  that this interaction belongs to React Native rather than to a native GTK
  widget, and making the single irrevocable `CLAIMED` declaration on the
  source, once per interaction. Probe 1 shows this costs the source nothing
  and denies everyone else, which is exactly the semantics wanted.
- **Gesture-level arbitration is a second, JS-only registry** — the three
  relation maps and the orchestrator loop above — which never talks to GTK
  at all. It decides _which_ `GestureDetector`s are active; the responder
  lock has already decided _that_ one of them is.

Concretely: a `GestureDetector` takes the responder when its recognizer
first activates (as the spike does), and the orchestrator is what decides
whether other detectors activate alongside it. A second detector activating
`Simultaneous`ly does **not** take the responder — it is already ours, and
`grant()` is deliberately a no-op for the GTK claim after the first one
(`session.claimed`).

The cost of the other shape — making the responder lock multi-holder — is
that `PanResponder`, the responder props and every RN-portable app on this
platform stop matching RN. That is not a trade; it is a regression with
extra steps. **One lock for the interaction, one registry for the gestures.**

There is one genuine consequence to write down: a gesture that is
`Simultaneous` with an active one but that _never_ wins the responder cannot
receive `onResponderMove`. It has to be driven from the touch props, which
fire regardless of responder status — which is what the spike's recognizer
already does for its `BEGAN` phase. So the orchestrator's update pump is
`onTouchMove`, and `onResponderMove` is only the responder holder's copy.

## Probe 3: the four libraries, measured

Symbol counts taken from shipped `src/` (and, for
`react-native-reanimated-dnd`, from the tagged GitHub source, since its
tarball ships only minified `lib/`). `@react-navigation/drawer` turned out
to contain no gesture code at all, so its real consumer —
`react-native-drawer-layout`, which it depends on — was measured instead.

| Library                                                                | `Gesture.*` constructors        | Config methods used                                                                                                                                                                                                                              | Other RNGH values                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-reanimated-dnd` 2.0.0                                    | `Pan` ×4                        | `activateAfterLongPress` ×4, `onStart` ×4, `onUpdate` ×4, `shouldCancelWhenOutside` ×3, `onFinalize` ×3, `enabled` ×3, `onEnd` ×1                                                                                                                | `GestureDetector` ×6, `GestureHandlerRootView`, **RNGH's `ScrollView` and `FlatList`**                                                                                                      |
| `@gorhom/bottom-sheet` 5.2.14                                          | `Pan` ×2, `Native` ×2, `Tap` ×1 | `simultaneousWithExternalGesture` ×4, `shouldCancelWhenOutside` ×4, `onEnd` ×3, `runOnJS` ×2, `requireExternalGestureToFail` ×2, `onStart`/`onFinalize`/`onChange`/`failOffsetY`/`failOffsetX`/`enabled`/`activeOffsetY`/`activeOffsetX` ×2 each | `GestureDetector` ×5, `State` (compared by value), RNGH's `TextInput`, **RNGH's `TouchableOpacity`/`TouchableHighlight`/`TouchableWithoutFeedback`** (non-iOS only), `.toGestureArray()` ×2 |
| `react-native-draggable-flatlist` 4.0.3                                | `Pan` ×1                        | `onBegin`, `onUpdate`, `onEnd`, `onTouchesDown`, `onTouchesUp`, `hitSlop`, `activeOffsetX` **or** `activeOffsetY`                                                                                                                                | `GestureDetector` ×1, `State`, **RNGH's `FlatList` and `ScrollView`**                                                                                                                       |
| `react-native-drawer-layout` 4.2.9 (behind `@react-navigation/drawer`) | `Pan` ×1                        | `onBegin`, `onStart`, `onChange`, `onEnd`, `activeOffsetX`, `failOffsetY`, `hitSlop`, `enabled`                                                                                                                                                  | `GestureDetector`, `GestureHandlerRootView`, `State`                                                                                                                                        |

**None of them uses `Pinch`, `Rotation`, `Fling`, `Hover`, `Manual` or
`ForceTouch`. None of them calls `Gesture.Race`, `Gesture.Simultaneous` or
`Gesture.Exclusive`.** The composers are unused by every shipped consumer;
what is used is the per-gesture relation methods, which are the same three
maps underneath.

The PRD's scope table is wrong in both directions, and this is what the
probe was for:

**Missing from it, and load-bearing:**

- **the gesture callbacks** — `onBegin`, `onStart`, `onUpdate`, `onChange`,
  `onEnd`, `onFinalize`, `onTouchesDown`, `onTouchesUp`. The PRD's config
  list has none of them. Every gesture in every library needs at least
  `onStart`/`onUpdate`/`onEnd` to do anything at all;
- **`GestureDetector` and `GestureHandlerRootView`** — named nowhere in the
  scope list, needed by everything (`GestureHandlerRootView` already ships);
- **RNGH's re-exported `ScrollView` and `FlatList`** — real rendered
  components, wrapped in `Animated.createAnimatedComponent`, in two of the
  four libraries. Not types, not optional;
- **`State`** — compared by value in two libraries, and currently a symbol
  our `gesture-handler` shim throws on;
- **`runOnJS`** as a builder method, and `.toGestureArray()`, in
  `@gorhom/bottom-sheet`.

**In it and unused by anyone:** `minDistance`, `maxPointers`,
`blocksExternalGesture`, and all three composers.

**Out of scope and needed anyway:** `@gorhom/bottom-sheet` re-exports RNGH's
`TouchableOpacity`/`TouchableHighlight`/`TouchableWithoutFeedback` from its
own public entry point as `BottomSheetTouchable` on every platform except
iOS. That is the "button family" the PRD excluded, and it is not avoidable
by an app — it is upstream's own export.

One resolution detail decides whether any of this is reachable:
`react-native-drawer-layout` ships a **gesture-free** `Drawer.tsx` next to
its `Drawer.native.tsx`, and a `GestureHandler.tsx` that stubs `Gesture` to
`undefined`. Metro on this platform resolves `.linux.* -> .native.* -> .*`,
so Linux gets the **native** file and the real RNGH surface. The web stub is
not a shortcut we can take without pretending to be web everywhere.

## Probe 4: touchpad pinch and rotate — a later increment, not a refusal

Cheapest probe, and the answer is more favourable than expected.

**GTK feeds them properly, and better than RNGH's own single-runtime path
does.** `gtk_gesture_zoom_filter_event` (GTK 4.22.4) explicitly lets
`GDK_TOUCHPAD_PINCH` through when `gdk_touchpad_event_get_n_fingers() == 2`,
and `_gtk_gesture_zoom_get_distance` then reads
`gdk_touchpad_event_get_pinch_scale()` straight off the event rather than
computing it from two touch points; `GtkGestureRotate` does the same with
the angle delta. So a **touchpad** pinch drives `GtkGestureZoom` with no
touchscreen involved. RNGH's web implementation cannot do this at all — its
`PinchGestureHandler` runs a `ScaleGestureDetector` over `tracker` pointers
and needs two real touches; only its `PanGestureHandler` has a trackpad path,
and that one is a wheel-event heuristic (`enableTrackpadTwoFingerGesture`,
`wheelDeltaY % 120`).

**And nothing in this rig can produce one.** Measured: both controllers
construct and connect fine, and both stayed at zero events across a full
injected drag session plus wheel input. That is not a GTK limitation, it is
a harness one — `zwlr_virtual_pointer_v1` has motion, button, axis and frame
requests and no gesture requests of any kind, and the VM has no touchpad
either (its input devices are a virtual USB keyboard, a virtual digitizer, a
spice tablet and ydotool's virtual device — `/proc/bus/input/devices`).

**Verdict: a later increment, not a permanent refusal.** The mechanism
exists, is first-class, and is a strictly additional event source into the
same JS state machines — which is what the PRD already predicted. What is
missing is a way to _test_ it, and that is the same shape of gap as touch:
it needs a real device on a seated session, not a code change. Until then
`Pinch`/`Rotation` should keep throwing by name.

## Probe 5: the spike — which has since shipped

**Superseded, and deliberately deleted.** Slice 1 turned this probe into the
module: `packages/react-native-gtkx/src/gesture-handler-compat/`, with its
nine assertions rewritten as real tests against the real code —
`tests/unit/gesture-handler/recognizer.test.ts` for the state machine and
`tests/gtk/gesture-handler/gesture-detector.gtk.test.tsx` for the same claims
under real pointer injection. `examples/gesture-detector` is the app to drag
by hand. The spike's own `flat-gesture.tsx` and `spike.tsx` are gone, because
a second implementation of a shipped module next to the shipped one only
rots; probes 1 and 4 stay, because nothing else reproduces what they measured.
What follows is what the spike established, kept as the record of why the
epic went ahead.

Two of its numbers changed when the code shipped, both for the same reason —
slice 1 added the out-of-event grant channel the section below asks for, so
`activateAfterLongPress` now activates ON the timer rather than on the first
move after it:

- the 105-out-of-120 measurement is now the full travel, because the
  activation point and the press point coincide when nothing has moved;
- the "lifted" visual appears when the press matures, which is what
  `react-native-reanimated-dnd` wants and what the spike could not do.

One of its assertions was also wrong and is corrected in the module: the spike
treated any `failOffset*` as a custom activation criterion, which pinned
`minDistance` at infinity, so `Pan().failOffsetY(...)` alone could never
activate. Upstream counts only `activeOffset*` and `minVelocity*`.

`bash spike/gesture-detector/run-headless.sh` in the VM ran both probes
under a private headless sway and printed:

```
[gd-spike] PASS activateAfterLongPress refuses a drag that starts immediately — trace=[drag:begin drag:finalize(false)] pageY 124 -> 124
[gd-spike] PASS after the long press the same drag activates — trace=[drag:begin drag:start drag:update drag:update …]
[gd-spike] PASS a shared value written from onUpdate moved REAL GTK geometry — pageY 124 -> 229 (moved 105px; shared value = 105, out of 120px injected after the long press)
[gd-spike] PASS no React render during the pan — render count 1 -> 1 across 15 onUpdate calls
[gd-spike] PASS callback order is RNGH's — trace=[drag:begin drag:start drag:update ×15 drag:end drag:finalize(true)]
[gd-spike] PASS activeOffsetY([-10,10]) does not activate at 6px, and does at 60px — 6px: started=false pageY 124 -> 124; 60px: pageY -> 164
[gd-spike] PASS failOffsetX([-20,20]) fails the pan, and a later vertical move cannot revive it — trace=[sheet:begin sheet:finalize(false)] pageY 124 -> 124
[gd-spike] PASS NEGATIVE CONTROL: the zone the pointer never visited saw nothing — control responder callbacks = 0
[gd-spike] PASS the animated position survives a React render — pageY after re-render = 229 (was 229, shared value = 105)
```

Every geometry number is `measureInWindow` on a **child** of the animated
view, so it reports the real GTK allocation in window coordinates rather
than a value the spike stored itself. The 105 rather than 120 is RNGH's own
`resetProgress`: translation is measured from the point of activation, not
from the press, so the first move after the timer is not counted.

### The seam that makes it work

One property of RN's model, which reads like a footnote and is the whole
design: **View touch props fire independently of responder status.** So the
recognizer runs off `onTouchStart`/`onTouchMove`, keeps its own
`UNDETERMINED -> BEGAN -> ACTIVE/FAILED` machine, holds no lock while it is
deciding, and returns `true` from `onMoveShouldSetResponder` at exactly the
instant it activates. `onStartShouldSetResponder` returns **false**, always
— a pan that grabbed the interaction on press is a pan with no `activeOffset`
at all.

`system.ts` already dispatches the touch props before it negotiates
(`dispatchTouch(...)` then `negotiateAndTransfer(...)` in both `touchStart`
and `touchMove`), so the recognizer's state is always current by the time
the negotiation asks it anything. No library change was needed.

### The spike was run against a deliberately broken build

`GD_BREAK=1` makes the detector take the responder on press and activate
immediately — the naive "just wire it to `PanResponder`" implementation.
Six of the nine checks fail, and they are the right six:
`activateAfterLongPress` (both), the geometry (90px instead of 105),
the callback order, `activeOffsetY` and `failOffsetX`. The three that keep
passing are the two about the animation path and the negative control, which
that mutation does not touch. The assertions are sensitive to the thing they
claim to measure.

## The one extension the epic needs — built in slice 1

`activateAfterLongPress` and `Gesture.LongPress` activate **on a timer**, not
on an event. RN's responder system negotiates only inside a touch event, so
a gesture whose timer has fired has no way to take the interaction until the
pointer next moves. The spike does the honest thing and activates on the
first move after the timeout — which for a drag is one frame later, and for
`react-native-reanimated-dnd` means the "lifted" visual appears when the
drag starts rather than when the press matures.

Closing it means one added channel on `createResponderSystem`: a registered
node may request the responder outside a touch event, running the same
negotiation against a synthesized event from the last known position. There
is precedent recorded two doors down — react-native-web added
`onScrollShouldSetResponder` and `onSelectionChangeShouldSetResponder`
because its platform needed negotiation channels RN lacks. This is the same
move, and it is small: `terminate()` already synthesizes an event from
`session.lastTouch` for exactly this reason.

**Built, as `ResponderSystem.requestResponder(host)`.** It reuses
`negotiateAndTransfer` unchanged, so capture still beats bubble and an
ancestor can still win; it dispatches no fabricated move afterwards; and it
refuses a node off the interaction's path, which the touch entry points get
for free and this one has to check. Documented as an extension with its reason
in `docs/research/gestures.md`.

## The slices

1. **The recognizer core and `Pan`.** The state machine, the four offset
   knobs, `minDistance`, `maxPointers`, `enabled`, `hitSlop`,
   `shouldCancelWhenOutside`, `activateAfterLongPress`, the eight callbacks,
   `GestureDetector`, and the out-of-event grant channel above. Aliased onto
   the package name; `Gesture.Pan()` and `usePanGesture()` as two spellings
   over one implementation. Unblocks `react-native-reanimated-dnd` and
   `react-native-drawer-layout` on their own.
2. **`Tap` and `LongPress`**, plus `State` as a real enum. Small once slice 1
   exists — both are the same machine with different predicates. **Shipped**,
   and it corrected this line: `State` is NOT what stopped either library.
   `@gorhom/bottom-sheet` imports it with `import type` in both places and so
   never read it at runtime; `react-native-draggable-flatlist` reads it inside
   a hook body, so it would have failed at first render rather than at import.
   What stops that one at import is slice 4's `FlatList`/`ScrollView`
   re-exports, which it feeds to `createAnimatedComponent` at module scope.
   `docs/api.md` has the per-library detail with file names.
3. **The orchestrator.** The three relation maps, `tryActivate`/`makeActive`,
   the awaiting list, and `Race`/`Simultaneous`/`Exclusive` as list-builders
   over them. This is where cross-component relations live and it is the
   slice with real difficulty in it.
4. **`Gesture.Native()` and the scrollable re-exports.** `Native` over the
   scroll-arbitration work that already exists, plus RNGH's `ScrollView` and
   `FlatList` re-exports (two of the four consumers render them) and the
   `Touchable` family `@gorhom/bottom-sheet` re-exports. The `->DENIED`
   detection from probe 1 belongs here, because this is the slice that puts
   a real GTK gesture into the arbitration.
5. **`Pinch`/`Rotation`**, when there is a machine that can produce a
   touchpad gesture to test them with. Not before.

Refusals that stand: `Fling`, `Hover`, `Manual`, `ForceTouch`, the legacy
`*GestureHandler` components, `RectButton` and the button family beyond the
`Touchable` re-exports slice 4 needs. All keep throwing by name.

## What could not be checked, and will not be here

- **Touch.** Everything above is mouse. `zwlr_virtual_pointer_v1` is the only
  injection protocol wlroots offers and there is no virtual-touch protocol at
  all — the same wall `docs/research/gestures.md` recorded for ScrollView
  arbitration, unchanged.
- **A real touchpad**, therefore `Pinch`/`Rotation` end to end. The VM has no
  touchpad device and no protocol can synthesize one.
- **The consumer libraries actually running.** This recon measured their
  sources; nothing here was run against `react-native-reanimated-dnd`'s
  example app. That is the epic's own acceptance criterion, not the recon's.
- **macOS.** None of this runs on the host: GTK test projects do not even
  register there. Every number above came from the UTM VM.

Two smaller things measurement turned up and left alone:

- `tests/gtk/support/virtual-pointer.ts`'s `scrollBy` encodes its `wl_fixed`
  argument as an unsigned word, so a **negative** detent count throws
  `ERR_OUT_OF_RANGE` before it reaches the wire. Scrolling up cannot be
  injected today. One-line fix, unrelated to this epic.
- The harness window never reports `is-active` under a private headless sway
  even though it is the only window and receives every event. The probes log
  it and proceed; the negative controls are what carry the assertions, which
  is the reason they exist.
