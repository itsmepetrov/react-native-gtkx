# Touch and gestures: RN parity on GTK4 for embedded/touch devices

Research snapshot (2026-07-30) behind the gestures PRD. Target: apps on
embedded touchscreen devices; gesture support "like in react-native".

## The RN surface to be faithful to

- **The Gesture Responder System** is a single global interaction lock
  with capture-then-bubble negotiation (deepest-wins bubble, parent-wins
  capture), transfer only to ancestors via LCA renegotiation, and a
  voluntary-release protocol (`onResponderTerminationRequest`).
  Notably, reactnative.dev does NOT call it legacy and does not
  recommend react-native-gesture-handler — that framing is RNGH's own.
  View touch props (`onTouchStart/Move/End/Cancel`) fire independently
  of responder status. `PanResponder` wraps the responder props with
  centroid-based `gestureState` math. Even under Fabric, responder
  negotiation runs in JS — the same execution model we already have, so
  v1 needs no new threading machinery.
- **RNGH**: native recognition + an orchestrator with explicit relation
  maps (`waitFor`/`simultaneous`/`blocks`) over a six-state machine.
  Reanimated is a SOFT dependency (try/catch require; degrades to
  JS-thread callbacks) — the trap is ecosystem packages (drawer,
  bottom-sheet, draggable-flatlist) that hard-require Reanimated.
  RNGH's web implementation is pure TypeScript with a small
  `GestureHandlerDelegate` porting seam — exactly how react-native-macos
  bootstrapped (web fallback in 2.5.0, native in 2.15.0).
  react-native-windows only ever got a no-op stub.

## The GTK4 side

- Controllers/gestures cover the inventory (Click/Drag/Pan/Swipe/Zoom/
  Rotate/LongPress/Stylus + Scroll/Motion/Key controllers,
  AdwSwipeTracker); all codegen-exposed. Phases (CAPTURE/TARGET/BUBBLE)
  map onto RN's capture/bubble ask.
- The arbitration primitive differs: per-sequence, one-directional
  claim/deny (`EventSequenceState`), no "ask the holder to release",
  no `waitFor`. RN's negotiation (and RNGH's orchestration) must
  therefore run at OUR bridge layer, using `CLAIMED` only as the final
  one-way declaration.
- `GtkScrolledWindow` privately owns four grouped TOUCH-ONLY gestures
  (drag/pan/swipe/long-press; pan in CAPTURE phase) — kinetic scroll
  and scroll-vs-child arbitration come for free, but ONLY for
  `GDK_SOURCE_TOUCHSCREEN` events. Consequences: mouse automation can
  never exercise this path, and a child pan gesture needs its own
  CAPTURE-phase presence plus a buffer-then-decide step to compete
  ("pan inside scroll").

## The verification gate: simulating touch without hardware

- `GTK_DEBUG=touch-ui` does NOT make mouse act as touch for gestures
  (only affects text selection handles); `touchOnly` checks the real
  device source.
- `ydotoold -T` enables MT axes but does NOT set `INPUT_PROP_DIRECT` —
  udev likely classifies it as a touchpad, not a touchscreen. Must be
  verified empirically before trusting it.
- The reliable path: a purpose-built uinput touchscreen with
  `INPUT_PROP_DIRECT` + MT axes via `evemu-tools` or `python3-evdev`
  (both in apt, neither installed). `libinput record/replay` is the
  long-term regression tool once real hardware exists.

## Plan shape (see the gestures PRD/epic)

Spike the touch simulation first — it gates all touch-only
verification. v1: View touch events → responder-negotiation core (a
port of ResponderEventPlugin's algorithm at the bridge layer) →
PanResponder → ScrollView arbitration (the highest-risk piece) →
box-only + Pressable hitSlop/pressRetentionOffset drift tolerance →
docs. RNGH-compat subset (Pan/Tap/LongPress/Native + relations) is an
explicitly separate stretch epic, justified only by a concrete consumer
(JS-stack swipe-back, legacy Swipeable); full RNGH parity and
Reanimated-dependent consumers are explicitly out of scope.

## Honest gaps for ported apps

No hover on touch (HIG forbids relying on it), no enforced touch-target
minimum yet (RN apps assume 44pt/48dp), multi-finger pinch/rotate
deferred, Pressable is not keyboard-activatable (separate a11y gap),
drawer/bottom-sheet/draggable-flatlist need Reanimated we don't have.
