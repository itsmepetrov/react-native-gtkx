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

**Closed by probe 6 below**, which found that the missing device could be
built rather than bought. The sentence "the VM has no touchpad either" was
true and the conclusion drawn from it was not: a touchpad is a kernel object,
and `/dev/uinput` makes one.

## Probe 6: the touchpad, built rather than waited for

Probe 4's verdict — "the mechanism exists, what is missing is a way to test
it" — held for one day. What broke it is that probe 4 measured the wrong
layer. Its finding was that **no Wayland protocol can inject a pinch**, which
is true and permanent: `zwlr_virtual_pointer_v1` has motion, button, axis and
frame and no gesture requests, and there is no other injection protocol in
wlroots. The conclusion drawn from it — that the rig therefore cannot produce
a touchpad gesture — does not follow, because a pinch is not injected by a
client at all. It is **concluded by libinput** from two fingers moving on a
device it has classified as a touchpad. So the injection point is one layer
lower than any protocol: the kernel.

`/dev/uinput` creates a device the kernel and udev treat as real, which is the
technique libinput's own `litest` suite uses for every one of its touchpad
tests. `packages/react-native-gtkx/tests/gtk/support/virtual-touchpad.ts` is
that device — 100x60mm at 40 units/mm, two MT slots, `INPUT_PROP_POINTER`,
`BTN_TOOL_DOUBLETAP` — with the ioctls in a Python sibling, because uinput
needs them and Node has none.

libinput accepted it on the first attempt:

```
event5  DEVICE_ADDED  rn-gtkx virtual touchpad  seat0 default group6
        cap:pg  size 100x60mm  tap (dl off) left scroll-nat scroll-2fg-edge
event5  GESTURE_PINCH_BEGIN   +1.487s  2
event5  GESTURE_PINCH_UPDATE  +1.500s  2  ...  1.09 @ 0.00
event5  GESTURE_PINCH_UPDATE  +1.734s  2  ...  1.82 @ 0.00
event5  GESTURE_PINCH_END     +1.747s  2
```

`cap:pg` is pointer **and gesture**. The `1.82 @ 0.00` is scale and angle: a
2.0x spread reaches libinput as 1.82, and a 60° rotation reaches it as 3° per
frame at scale 1.00. **Rotation is delivered as well as pinch**, which was the
open question — `libinput_event_gesture_get_angle_delta` is real and the
compositor forwards it.

### What the chain delivers, measured end to end

`spike/gesture-detector/run-session.sh`, against the desktop session's own
compositor, with both a raw `GtkGestureZoom` on a plain `GtkBox` and the
shipped `Gesture.Pinch()` watching the same injected gesture:

| Question                                      | Measured                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| Does an injected two-finger spread reach GTK? | Yes. `scale-changed` 17 times, ending at **1.816** for a 2.0x spread          |
| Does a squeeze arrive as a scale below 1?     | Yes. **0.555** for a 0.5x squeeze                                             |
| Does a rotation reach `GtkGestureRotate`?     | Yes. **0.8907 rad (51.0°)** for a 60° rotation                                |
| Is a rotation also a zoom?                    | No. Scale stayed at **1.000** throughout it                                   |
| Does GTK know where the gesture is?           | Yes. `gtk_gesture_get_bounding_box_center` = **{379.5, 101.2}**, widget-local |
| Does the SHIPPED module see the same thing?   | Yes. `Gesture.Pinch()` reported **1.81640625** — GTK's number, bit for bit    |
| Does it run the whole progression?            | `begin=1 start=1 updates=16 end=1`, velocity 3.31/s, focal {379.5, 101.2}     |
| `Gesture.Rotation()`                          | **0.8907 rad**, velocity 4.30 rad/s, anchor {379.6, 101.2}, 15 updates        |
| Negative control, raw GTK                     | The half the pointer never visited: **0** zoom begins, 0 rotate begins        |
| Negative control, the module                  | The detector the pointer never visited: **0** begins, 0 updates               |

**So `Pinch` and `Rotation` both ship, and neither is a partial.** The angle
question the slice was told to expect a refusal on — "wlroots may not
synthesize rotate the way it does pinch" — did not arise, because the rotation
is libinput's, computed from the two fingers before any compositor sees it.

### The constraint that stays, and why no test in the suite can do this

**The compositor has to have a libinput backend.** That is the whole of the
remaining gap, and it is measured in both directions with the same probe and
the same device present:

| Compositor                                           | Result                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| The desktop session's (GNOME/mutter, native backend) | The full chain, every number above                            |
| Headless sway, as `@gtkx/vitest` starts it           | **Nothing.** No gesture activity, and the pointer never moved |

`@gtkx/vitest`'s `headless-display.js` starts each worker's compositor with
`WLR_BACKENDS=headless` and `WLR_LIBINPUT_NO_DEVICES=1`, applied
unconditionally with no environment escape. A headless wlroots backend
enumerates no input devices, so the uinput touchpad is invisible to it — and
that is not a bug to route around: a compositor with a libinput backend needs
a seat, and a second libseat client on a seat logind has already given to
gnome-shell cannot have one.

So the split is the honest one and it is drawn at the GTK controller:

- **below it** — uinput, evdev, libinput, the compositor, GDK — is probe 6,
  run by hand against the session compositor, with its own negative controls;
- **above it** — the detector attaching the right controller to the right
  widget, the recognizer, the arbitration, the payload — is
  `tests/gtk/gesture-handler/touchpad-gestures.gtk.test.tsx`, which emits GTK's
  own signals on the real controllers, and
  `tests/unit/gesture-handler/touchpad.test.ts` for the semantics.

Six mutations were run against that pair to check the tests are sensitive to
what they claim. Every one is caught, and by the right test: removing the pinch
activation gate (2 unit + 1 gtk), changing upstream's 5° rotation constant
(1 unit + 1 gtk), putting `velocity` back on upstream-web's per-millisecond
denominator (3 unit), making `scaleChange` a difference instead of a ratio
(1 unit), letting a touchpad kind answer the pointer props (1 unit + 1 gtk),
and letting `Pinch` reach for the responder lock (13 unit + 3 gtk).

### Two things the injection needed that are not obvious

- **`BTN_RIGHT`.** Without it libinput logs `kernel bug: missing right button,
assuming it is a clickpad` and reclassifies the device. Harmless here, but a
  clickpad is a different device with different rules.
- **Frame pacing.** libinput decides pinch-versus-two-finger-scroll from the
  first frames of motion and computes its velocities from the timestamps, so
  the injector sleeps 12ms between frames and does not dwell before moving. A
  long glide also has to be split — one step per 3mm — or libinput discards
  frames as `Touch jump detected`.

## Probe 5: the spike — which has since shipped

**Superseded, and deliberately deleted.** Slice 1 turned this probe into the
module: `packages/react-native-gtkx/src/gesture-handler-compat/`, with its
nine assertions rewritten as real tests against the real code —
`tests/unit/gesture-handler/recognizer.test.ts` for the state machine and
`tests/gtk/gesture-handler/gesture-detector.gtk.test.tsx` for the same claims
under real pointer injection. The gallery's "Gesture detector" section is the screen to drag
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
   slice with real difficulty in it. **Shipped**, and the section below
   records what building it changed about the specification above.
4. **`Gesture.Native()` and the scrollable re-exports.** `Native` over the
   scroll-arbitration work that already exists, plus RNGH's `ScrollView` and
   `FlatList` re-exports (two of the four consumers render them) and the
   `Touchable` family `@gorhom/bottom-sheet` re-exports. The `->DENIED`
   detection from probe 1 belongs here, because this is the slice that puts
   a real GTK gesture into the arbitration. **Shipped**, and it corrected
   two more lines — see below.
5. **`Pinch`/`Rotation`**, when there is a machine that can produce a
   touchpad gesture to test them with. Not before. **Shipped**, and what
   unblocked it was not a machine — see probe 6, which built the device the
   slice was waiting for.

### What slice 4 corrected, by building the libraries instead of reading them

The recon measured the four consumers' SOURCES. Slice 4 measured them the only
way that settles it — a probe app under the real `gtkx build`, with the real
published packages and the presets' aliases in place. Two claims did not
survive, and both are the same shape: **what stops these libraries is not in
this surface at all.**

- **`react-native-draggable-flatlist` 4.0.3 does not stop on the
  `FlatList`/`ScrollView` re-exports.** It stops at BUILD, on `react-native`:
  `findNodeHandle` and `LogBox` are not exported by this platform
  (`CellRendererComponent.tsx`, `NestableDraggableFlatList.tsx`). The
  re-exports could not have been the wall, and the mechanism says why —
  `Animated.createAnimatedComponent()` reads only `displayName` and `name`,
  which are both on the stand-in's introspection allowlist, so a stand-in
  binds and constructs at module scope without complaint. It would have failed
  at first RENDER. Past those two exports the next wall is
  `useAnimatedScrollHandler`, which `react-native-gtkx/reanimated` refuses.
- **`@gorhom/bottom-sheet` 5.2.14 stops at BUILD too**, on the same surface:
  `findNodeHandle`, `LogBox`, `Keyboard`, `VirtualizedList`. Everything it
  takes from `react-native-gesture-handler` now resolves. What is still
  missing from THIS surface is the cross-gesture relations its pan chains
  configure, which are slice 3's.
- **`react-native-reanimated-dnd` never loads at all**, and that is the
  presets' own decision: both alias the package name onto
  `react-native-gtkx/dnd`. Its `Sortable`/`SortableGrid` do take RNGH's
  `FlatList`/`ScrollView` at module scope, so the re-exports are what an
  unaliased build would need — but no app takes that path.

So the epic's "which libraries run" question has an answer the recon could not
have reached from sources: **the remaining blockers are four `react-native`
core exports and one Reanimated hook**, not gesture code. That is a different
slice's work, and naming it is more useful than guessing at it.

### What building those five changed, and the two libraries running

The follow-up slice built them and then ran the probe app. Both libraries now
work end to end under a real `zwlr_virtual_pointer_v1`
(`spike/core-exports`, committed): a row of `react-native-draggable-flatlist`
is dragged and the order changes, `@gorhom/bottom-sheet`'s handle is dragged
and the sheet snaps up, and the zone the pointer never visits stays silent.
`docs/api.md` has the numbers and what the probe does NOT prove.

The list above was right about the BUILD and could not have been right about
what came after it, which is the same lesson one turn further on: **a build
tells you what does not resolve, and only a running app tells you what does
not work.** Three walls appeared past the last missing export, none of them
predictable from any import:

- **`__DEV__` was not defined on the vite path at all.** It is part of RN's
  runtime contract, not a Metro detail; the Metro path gets it from the app's
  own preset and nothing supplied it here, so `@gorhom/bottom-sheet`'s logger
  crashed the bundle at startup. The vite preset defines it from vite's mode
  now.
- **`FlatList` did not accept `CellRendererComponent`.** That prop is
  `react-native-draggable-flatlist`'s entire design — the cell is what
  translates and what provides the "am I the active row" context — so
  `ScaleDecorator` threw `useIsActive must be called from within
CellProvider!` on the first render, well past every import.
- **`useDerivedValue(() => withSpring(…))` seeded the value with the
  animation.** Upstream collapses every builder to its target during the
  first evaluation of an updater (`IN_STYLE_UPDATER`), because that run has
  nothing to animate from; this platform did not, so the second evaluation
  found a shared value holding an object.

One more thing the running app settled that the build could not:
`findNodeHandle` has to answer for a COMPOSITE. `@gorhom/bottom-sheet`
identifies its scrollable by node handle, and a windowed list that resolved to
nothing left it warning `Couldn't find the scrollable node handle id!` with no
scrollable bound to the sheet. A list resolves to the `ScrollView` it renders
now, which is what RN does for a `FlatList` too.

Two smaller things this slice settled:

- **`Gesture.Native()` is the first recognizer that never takes the
  responder**, and that is a platform fact rather than an optimisation: taking
  it is what calls `setKineticScrolling(false)` on every enclosing
  `GtkScrolledWindow`. A gesture that means "the native scroller is handling
  this" cannot be the thing that switches the native scroller off. Proven with
  a real wheel and a real drag over one, asserting the scroller's four gestures
  never leave `GTK_PHASE_CAPTURE`.
- **`scrollBy` can inject a scroll UP now.** The `wl_fixed` argument was
  encoded with `writeUInt32LE`, which throws on anything negative; `>>> 0`
  reinterprets the two's complement bits and touches nothing that was already
  in range. It stopped being "unrelated to this epic" the moment a test wanted
  to prove a scroller was fully live rather than merely movable in one
  direction.

~~Refusals that stand: `Fling`, `Hover`, `Manual`, `ForceTouch`, the legacy
`*GestureHandler` components, `RectButton` and the button family beyond the
`Touchable` re-exports slice 4 needs. All keep throwing by name.~~ **Half of
that is now wrong and the wrong half is instructive — see "Probe 7" and "The
last four" below.** All four recognizers ship. The legacy components and the
button family keep throwing, with reasons recorded rather than implied.

## What building slice 3 changed about the specification above

Four things, all of them corrections to this file rather than to upstream.

**The two locks meet in one function, and it is not where this file
predicted.** "A `GestureDetector` takes the responder when its recognizer
first activates" is right; what the section above left out is _who asks_. The
loop is what decides, and it hands the recognizer one boolean —
"another gesture already holds the interaction" — which is the entire
interface between the JS registry and the responder lock. `true` and the
gesture asks for the lock as slice 1 did; `false` and it goes ACTIVE without
touching it. There is no other seam, and the registry still imports nothing
from the platform.

**The out-of-event grant channel is now used from inside events too.** Slice 1
could leave an in-event activation to the negotiation the responder system
runs after the touch props, because only one gesture was ever asking. With
two, both defer into the same negotiation, exactly one wins it, and the loser
sits authorized and never activates — so `Simultaneous` would silently have
been a race. Asking for the lock from `authorize()` settles it before the
second gesture is consulted, which is what lets that one be told the
interaction is already taken. Same negotiation either way: capture still
beats bubble, and an ancestor can still win.

**Mutual exclusion is enforced at activation, not at authorization.**
Upstream's `makeActive` cancels the losers and sends `ACTIVE` in one
synchronous breath, because it has no lock to wait for. Here a gesture that
has to take the responder becomes ACTIVE only if the negotiation grants it,
and an ancestor can still win — so the broadcast cancel runs from the moment
the gesture really is ACTIVE. Same rule, applied at the only instant it is
true.

**`Gesture.Native()` turned out to settle a question the loop asks in two
directions.** "Another gesture already holds the interaction" is not "another
gesture is active": a `Native` is ACTIVE and holds nothing on purpose, so a
pan activating beside it still has a lock to take. Nor is holding a per-kind
fact — a `Pan` that lost the lock to a simultaneous partner is a claiming kind
that does not hold it either. So the loop asks the participant, and the answer
is per interaction. Both halves of upstream's `Native` rule are reachable now
and both are tested: an active `Native` refuses an ordinary gesture's
activation, and a `simultaneousWithExternalGesture` between them lets it
through, which is `@gorhom/bottom-sheet`'s exact configuration.

**Upstream's third cancellation branch has no reachable case here, and this
file's rule 3 should say so.** "Two handlers that share no pointer and sit on
different views are only in conflict if a tracked pointer lies inside both
views' bounds" is arithmetic over a multi-pointer tracker. There is one
pointer, one interaction and one fabricated touch, and a gesture is recorded
only when that touch reaches it — so every pair of recorded gestures shares
it, and what upstream computes, this platform knows by construction. The
branch is not implemented; the comment where it would have gone says why.

### The islands question, answered

Asked by the PRD ("crux 5") and answered here rather than discovered later.

The responder lock is one per process; the negotiation path is whatever GTK
widget chain the interaction arrives on. The arbitration registry is also
process-wide and has **no tree knowledge at all** — three maps keyed by
handler tag. What makes that safe is _when_ a gesture enters it: **on the
press, not on mount.**

- Two `Root`s that **nest** — `NestedRoot`/`IntrinsicRoot` mounting an island
  inside another island's view — are one GTK widget chain. Both gestures are
  on one interaction path and every relation behaves exactly as it does inside
  a single `Root`. Native widgets in between take no part and do not break the
  chain.
- Two `Root`s that are **disjoint** — separate windows, sibling islands —
  can never have both gestures live in one interaction, because there is one
  pointer and one session. The relation is expressible, resolves to a real
  handler tag, and never has an occasion to apply. Not an error, and no
  warning: an inert relation is exactly as harmful as an unused one.
- **`requireExternalGestureToFail` across disjoint `Root`s does not
  deadlock**, and that is the whole reason for recording on the press.
  Parking only ever happens against a gesture that is live in the interaction
  under way. Recording on mount would have turned a relation across two
  islands into a gesture held in `BEGAN` for ever, with nothing to release it
  — the failure this question was asked to avoid.

The same reasoning covers two gestures in one `Root` that the pointer cannot
reach together: siblings never see each other's interaction, so a relation
between siblings is inert for the same reason and by the same mechanism.
`tests/unit/gesture-handler/orchestrator.test.ts` drives all three cases.

### What could not be checked here either

- **Two gestures on two pointers.** Everything above is one pointer, because
  that is all `zwlr_virtual_pointer_v1` and this platform's responder system
  have. Upstream's pointer-sharing branch is unreachable for that reason, and
  it will stay unreachable until there is multi-touch to reach it with.
- **Two gestures on two views the pointer cannot reach together.** Siblings
  never see each other's interaction, so a relation between them is inert by
  construction rather than by test. The islands answer above says the same
  thing about `Root`s and for the same reason.

## The last four, and what re-examining a refusal is worth

The four names this file left standing — `Fling`, `Hover`, `Manual`,
`ForceTouch` — all ship. What is worth recording is not that they were built
but **how badly the four reasons differed once each was checked on its own**,
because this file had grouped them into one sentence and the grouping was doing
real damage.

| Recognizer   | The reason recorded here                    | What checking it found                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Fling`      | unwritten                                   | Correct. A velocity predicate and a direction predicate over the existing machine.                                                                                                                                                              |
| `Manual`     | unwritten                                   | Correct, and it was the smallest. What it actually needed was elsewhere: `GestureStateManager`'s `fail()` and `end()` were two deferred flags rather than two transitions, which nothing had noticed because no kind had ever depended on them. |
| `Hover`      | "no input to run on"                        | **Wrong, and the wrongness was inherited rather than measured.**                                                                                                                                                                                |
| `ForceTouch` | needs pressure, which no input here reports | **True of every ordinary input and false of the rig**, by the same reasoning probe 6 used one layer down.                                                                                                                                       |

**`Hover` is the one that should not have been refused, and the mechanism of
the mistake is worth naming.** It was never measured. It sat in a list with
`Pinch`, `Rotation` and `ForceTouch` — three gestures that genuinely need input
this rig did not have — and inherited their verdict. But a hover needs no
button and no protocol the harness lacked: it needs `motion_absolute`, which is
the one request `zwlr_virtual_pointer_v1` has always had and which every other
probe in this file already used. The evidence was also sitting in the
repository the whole time: `components/pressable.tsx` has driven `hovered` off
`GtkEventControllerMotion` since long before this epic, and the gallery has had
hovering rows on screen throughout. `Hover` is now the **most** verified of the
four — a real injected crossing, a real widget, real `enter`/`motion`/`leave`,
in the ordinary vitest suite that `Pinch` and `Rotation` cannot run in.

The lesson is narrow and this file is the right place for it: **a refusal
inherited from a neighbour is not a finding.** Each of the four needed its own
sentence, and the one that had never had one was the one that was wrong.

## Probe 7: pressure, at the same layer probe 6 found the touchpad

Probe 6 established the technique and this is it applied once more: the thing
that cannot be injected by a Wayland client can often be _synthesized below
one_, at the kernel. The question was whether `ForceTouch` could be verified
rather than merely written.

The premise to discard first, and it is this file's own: "pressure, which no
input this platform can reach reports". True of `wl_pointer`, which has no
pressure axis and never will. Not true of the platform — the Wayland **tablet**
protocol (`zwp_tablet_v2`) carries pressure, GTK surfaces it through
`GtkGestureStylus.get_axis(GDK_AXIS_PRESSURE)`, and a tablet is a kernel object
that `/dev/uinput` can make, exactly as the touchpad was.

Measured, with a uinput stylus built from libinput's own litest Wacom Intuos5
descriptor:

| Question                                                       | Measured                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the session compositor advertise `zwp_tablet_manager_v2`? | Yes, v2. (GNOME/mutter — and note this corrects an assumption: the desktop session here is **not** wlroots.)                                                                                                                                                                                                                                                                                         |
| Do any EXISTING devices report `ABS_PRESSURE`?                 | **No.** The "virtual digitizer" and the spice tablet both carry X/Y only, despite the names.                                                                                                                                                                                                                                                                                                         |
| Does libinput classify a uinput stylus as a tablet?            | Yes — `Capabilities: tablet`, udev `ID_INPUT_TABLET=1`, `cap:T`, full `TABLET_TOOL_PROXIMITY`/`TIP`/`AXIS` semantics with a pressure value.                                                                                                                                                                                                                                                          |
| Does a GTK4 client receive varying pressure?                   | Yes. A linear 0→1 kernel ramp arrives as 22 samples rising monotonically from **0.005 to 1.000**.                                                                                                                                                                                                                                                                                                    |
| Is the transfer linear?                                        | **No, and this matters for any assertion.** Measured at BOTH layers on the same ramp: libinput's reading is exactly linear (0.04, 0.08 … 1.00) and GTK's is its SQUARE — so **mutter** is where the curve is applied, not libinput and not GDK. The GNOME `pressure-curve` setting is at its identity default, so this is not user configuration. Assert ordering and endpoints, never exact values. |
| Negative control, no pen in proximity                          | **0 events** in 1.5s.                                                                                                                                                                                                                                                                                                                                                                                |
| Negative control, pen hovering (`BTN_TOUCH=0`)                 | Axis present, value exactly **0.000**.                                                                                                                                                                                                                                                                                                                                                               |
| Negative control, an ordinary mouse                            | `has_pressure=False`, tool `none` — the axis is genuinely **absent**, not zero. That third control is the one that matters most, and it is the property `stylus-only` gives the shipped recognizer.                                                                                                                                                                                                  |

### What the SHIPPED module sees, on the same chain

`spike/gesture-detector/run-stylus.sh` is probe 6's runner shape with a stylus
in place of the touchpad, and it drives `Gesture.ForceTouch()` inside a real
`GestureDetector` rather than a reimplementation of it:

| Question                                               | Measured                                                                                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Does a raw `GtkGestureStylus` see varying pressure?    | Yes — **23 readings, 23 distinct**, rising monotonically from 0.0016 to 1.000                                                                   |
| Does the shipped recognizer run the whole progression? | Yes — `begin=1 start=1 updates=13 end=1 success=true`                                                                                           |
| Does it activate AT `minForce` rather than below it?   | Yes — `minForce=0.2`, force at activation **0.2298**                                                                                            |
| Are the reported forces monotonic?                     | Yes — 0.2713, 0.3141, 0.3601 … 0.8479, 0.9224, **1.0000**                                                                                       |
| Does `maxForce` cancel an ALREADY ACTIVE gesture?      | Yes — `start=1 updates=11 end=1 success=false state=3` (CANCELLED)                                                                              |
| Did the cancellation happen above the ceiling?         | Yes — cancelled at **0.5196** against `maxForce=0.5`, and the last update before it was 0.4641, so no update followed the ceiling being crossed |
| `pointerType`                                          | **STYLUS (1)**, not MOUSE (2) — the only kind here that is not a mouse                                                                          |
| Negative control                                       | The card the pen never touched: **0** begins, 0 starts, 0 updates, 0 ends                                                                       |

Reproducible: a second run reports 25 readings and the same verdicts. So
`ForceTouch` is not the partially-verified member of the set it was expected to
be — the only thing it lacks relative to `Fling`, `Manual` and `Hover` is
coverage inside the vitest suite, which is a property of the compositor the
suite starts and not of the gesture.

Two things the injection needed that are not obvious, and they are siblings of
probe 6's two:

- **`BTN_TOOL_PEN` with `ABS_X`/`ABS_Y` is what makes it a tablet**, because
  that is precisely what systemd-udev's `input_id` builtin keys
  `ID_INPUT_TABLET` off — and `ID_INPUT_TABLET` is what makes libinput build a
  tablet dispatch rather than a pointer one. `INPUT_PROP_POINTER` then marks it
  an _external_ tablet, which is what makes the compositor map the whole tablet
  area onto the whole screen; `INPUT_PROP_DIRECT` would want an output bound to
  it and gets no sensible mapping on a VM.
- **THE CLIENT MUST CONNECT AFTER THE DEVICE EXISTS**, and this one cost the
  most to find because the obvious diagnosis was wrong. The symptom is that the
  client receives `tablet_added` and then is never told `tool_added`, so no
  pressure arrives at all. It reads like "the first proximity after a hotplug is
  swallowed", and burning a throwaway proximity cycle looks like it helps.
  It is not that. Isolated by holding the client, the device and the ramp fixed
  and changing only the order:

  | order                               | pressure samples the client saw |
  | ----------------------------------- | ------------------------------- |
  | device -> throwaway cycle -> client | **24**                          |
  | client -> device                    | **0**                           |
  | client -> device -> throwaway cycle | **0**                           |

  A Wayland client that has already bound `zwp_tablet_seat_v2` when the tablet
  appears is told the tablet exists and never told about its TOOL. Confirmed on
  the wire with `WAYLAND_DEBUG=1` against `libinput debug-events` one layer
  below: libinput emitted every injected cycle, complete and correct and
  perfectly linear, in every one of the three runs — so nothing below the
  compositor differs, and mutter simply forwards the tool only to clients that
  bound the seat after the device existed. The probe therefore creates the
  device BEFORE `AppRegistry.runApplication`.

- **A proximity cycle starting within ~1s of the previous `proximity_out` is
  dropped in full**, so the probe uses ONE proximity cycle and presses and lifts
  the tip several times inside it rather than going in and out of proximity.

### The constraint that stays, and it is probe 6's, unchanged

**The compositor has to have a libinput backend**, so the vitest suite cannot
cover this and the split is drawn at the GTK controller exactly as it is for
`Pinch` and `Rotation`:

| Compositor                                 | Result                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| The desktop session's (GNOME/mutter)       | The full chain, every number above                                               |
| Headless sway, as `@gtkx/vitest` starts it | **Nothing.** Zero input devices enumerated; the uinput stylus is invisible to it |

`WLR_BACKENDS=headless,libinput` does not rescue it: sway dies before opening a
socket, because an SSH session has no VT and libseat cannot open one. That is
the same wall the touch work recorded, and fixing it means launching a
compositor on a real VT rather than changing any code.

So `ForceTouch` is verified the way `Pinch` and `Rotation` are — below the GTK
controller by a hand-run session probe with its own negative controls, and
above it by the ordinary suite, which asserts the wiring and asserts that a real
injected **mouse** drag over the widget produces nothing at all.

## What could not be checked, and will not be here

- **Touch.** Everything above is mouse. `zwlr_virtual_pointer_v1` is the only
  injection protocol wlroots offers and there is no virtual-touch protocol at
  all — the same wall `docs/research/gestures.md` recorded for ScrollView
  arbitration, unchanged.
- ~~**A real touchpad**, therefore `Pinch`/`Rotation` end to end. The VM has no
  touchpad device and no protocol can synthesize one.~~ **Wrong, and probe 6
  shows why**: no WAYLAND protocol can synthesize one, which is what was
  measured; the kernel can, through `/dev/uinput`, and libinput's own test
  suite has done it that way for a decade.
- **The consumer libraries actually running.** This recon measured their
  sources; nothing here was run against `react-native-reanimated-dnd`'s
  example app. That is the epic's own acceptance criterion, not the recon's.
- **macOS.** None of this runs on the host: GTK test projects do not even
  register there. Every number above came from the UTM VM.

Two smaller things measurement turned up and left alone:

- `tests/gtk/support/virtual-pointer.ts`'s `scrollBy` encoded its `wl_fixed`
  argument as an unsigned word, so a **negative** detent count threw
  `ERR_OUT_OF_RANGE` before it reached the wire, and scrolling up could not be
  injected. **Fixed in slice 4**, which needed it.
- The harness window never reports `is-active` under a private headless sway
  even though it is the only window and receives every event. The probes log
  it and proceed; the negative controls are what carry the assertions, which
  is the reason they exist.
