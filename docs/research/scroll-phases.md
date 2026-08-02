# Research: what a scroll's phases are on GTK, and what asking for them costs

Date: 2026-08-02. Run: VM (Ubuntu 26.04 aarch64, GTK 4.22.4), headless sway
via the `gtk` vitest project, software rendering — the same machine and
harness as [animated-colors.md](animated-colors.md) and
[z-index.md](z-index.md), so the numbers sit next to those without
conversion. All input is real: a `zwlr_virtual_pointer_v1` on a second
Wayland connection ([virtual-pointer.ts](../../packages/react-native-gtkx/tests/gtk/support/virtual-pointer.ts)),
never a synthesised GtkGesture signal — every finding here lives below the
level `@gtkx/testing`'s `userEvent` can reach.

## Verdict

**RN's four scroll phases exist here, and which ones you get is a property
of the INPUT DEVICE rather than of the platform.**

- A **mouse wheel** produces none of them. GTK reports a detent and nothing
  around it: one `::scroll`, no `::scroll-begin`, no `::scroll-end`, no
  `::decelerate`, and the adjustment lands its whole step in a single frame
  with nothing coasting after. There is no drag to begin and no momentum to
  report, and none is invented.
- A **touchpad glide** produces all four. The sequence has a real beginning
  and a real end, and `GtkScrolledWindow`'s own kinetic animation carries the
  content on for seconds afterwards.

This narrows rather than overturns the claim PR #88 shipped and documented
("a wheel-driven desktop scroller has no drag or momentum phase"). That was
true, and it was true _about the wheel_. It was recorded as a fact about the
platform because the only scroll anyone had driven was a wheel.

**Asking for the phases costs nothing until you ask.** While no phase handler
is attached, no controller is created, no signal is connected and no timer
runs; per scroll event the cost is 7.17 µs with none attached and 6.93 µs
with all four, which is inside the run-to-run noise. The residual — one
`GtkEventControllerScroll` receiving events it does not consume, paid only
while a handler is attached — is **0.31 µs per scroll event**, measured
rather than asserted (§4).

## 1. What GTK reports, per device

A `GtkEventControllerScroll` with `BOTH_AXES | KINETIC` in the CAPTURE phase
on the `GtkScrolledWindow`, with every signal traced, plus a tick callback
recording the vertical adjustment every frame.

### A mouse wheel

```
--- one detent down ---
 130.0  scroll  dx=0 dy=1  unit=0
--- burst of five detents down ---
 536.6  scroll  dx=0 dy=1  unit=0
 556.8  scroll  dx=0 dy=1  unit=0
 589.6  scroll  dx=0 dy=1  unit=0
 609.8  scroll  dx=0 dy=1  unit=0
 630.0  scroll  dx=0 dy=1  unit=0
--- one detent up ---
1254.5  scroll  dx=0 dy=-1 unit=0
```

`unit=0` is `GDK_SCROLL_UNIT_WHEEL`. **`::scroll-begin`, `::scroll-end` and
`::decelerate` never fire**, which is exactly what the signal's own
documentation says — _"It will only be emitted on devices capable of it."_

The adjustment, over 86,802 tick samples, changed **eight times** — once per
detent and never in between:

```
0.00 → 34.20 → 68.40 → 102.60 → 136.80 → 171.00 → 205.20 → 171.00
```

One detent is one 34.2 px step, applied in the frame the event arrives in.
There is no animation between two detents and nothing continues after the
last one, so there is no interval during which a `onMomentumScroll*` pair
would be describing anything.

### A touchpad glide

Injected as libinput reports a two-finger scroll: `axis_source = FINGER`,
continuous deltas, **no `axis_discrete`**, terminated by `axis_stop`. That
last request is the whole difference — it is what gives GDK a scroll
_sequence_ to bracket. (`glideBy`/`glideEnd` were added to the virtual
pointer for this; `axis_stop` had never been sent before.)

```
1673.9  scroll-begin
1673.9  scroll  dx=0 dy=20  unit=1
   …    (twelve of them, 20.3 ms apart)
1897.3  scroll  dx=0 dy=20  unit=1
1917.7  scroll-end
1917.8  decelerate  vx=0.000 vy=2500.000
```

`unit=1` is `GDK_SCROLL_UNIT_SURFACE` — pixels. And the adjustment does not
stop at the lift:

```
lift at 1897.4 → 771.00
1927.5 → 871.77   1943.9 → 966.04   1960.5 → 1054.24   1977.2 → 1136.74
…
3393.8 → 2329.36  3410.5 → 2329.63   (at rest)
```

A textbook exponential decay, 16.7 ms per step, running for about 1.5 s after
the fingers left. **That is the momentum**, and it is the scrolled window's
own — nothing in this platform animates it.

### Two things the flags decide

- **An axis flag is required for anything at all.** A controller created with
  `KINETIC` alone emits _nothing_ — not even `::scroll-begin`. Measured
  directly, because "we only need the phases, so we can turn the deltas off"
  was the obvious optimisation and it is wrong.
- **`::scroll` need not be connected.** With `BOTH_AXES | KINETIC` and only
  `scroll-begin`/`scroll-end`/`decelerate` connected, the phases arrive
  unchanged. An unconnected GObject signal is a walk over an empty handler
  list in C, so the per-scroll-frame cost of this controller never enters JS.

## 2. How RN's four phases are mapped

| RN                      | Source here                                      | Exact?                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onScrollBeginDrag`     | `GtkEventControllerScroll::scroll-begin`         | **Approximate.** RN's drag is a finger on the CONTENT. A touchpad never touches the content, so this is "the user started driving this scroller" — the closest true statement, and the one every consumer acts on. |
| `onScrollEndDrag`       | `::scroll-end`                                   | Same approximation, same reason. The sequence really did end.                                                                                                                                                      |
| `onMomentumScrollBegin` | the adjustment moving again after `::scroll-end` | Exact.                                                                                                                                                                                                             |
| `onMomentumScrollEnd`   | that movement coming to rest                     | Exact, with a 60 ms rest window (§3).                                                                                                                                                                              |

**Momentum is read off the adjustment, not off `::decelerate`.** The
controller emits `decelerate` at _every_ `scroll-end` — it reports the
velocity it measured, not a decision to coast — while the scrolled window
decides for itself whether that velocity is worth animating. RN fires
`onMomentumScrollBegin` only when the view actually keeps moving, so the
honest source is the movement itself. A glide that ends dead produces the
drag pair and no momentum pair, which is RN's behaviour too.

A new drag arriving during a coast ends the momentum before beginning the
drag, so a consumer never sees two live phases at once.

## 3. Wall time, not frames — and the rig artefact that decided it

The momentum watch was first written as a tick callback comparing the
adjustment frame to frame, with a four-frame grace for the handoff and a
two-frame rest. Both constants are meaningless, and the harness said so:

> 294,143 tick callbacks in 2,755 ms — **~106 per millisecond**.

Under the headless compositor there is no output to pace the frame clock, so
a registered tick callback free-runs. A "four-frame" grace expired in
microseconds and no momentum was ever detected. In a real session the same
code would have worked, and the test would have been the only thing that
knew.

The shape it became is better on both counts:

- it watches the adjustment's own `value-changed` — **no tick callback at
  all**, so nothing polls and the frame clock is never held open;
- it measures in **milliseconds**: 120 ms for the kinetic animation to take
  over (measured handoff: 5.6 ms), and 60 ms of stillness to call it rest
  (GTK steps the value every 16.7 ms right to the end, so that is three and a
  half missed steps).

The rest timer re-arms for the REMAINING idle time rather than resetting on
every step, so the timers a coast costs are bounded by its duration and not
by how often the adjustment moved. Measured on one real coast: **156
adjustment steps over 2,763 ms** (≈60 Hz — GTK's deceleration is frame-paced
even where our own tick callback is not), against **≈46 timer re-arms** and
**4 phase dispatches**.

## 4. What it costs

### Per scroll event

2,000 adjustment moves per round, 15 interleaved rounds, median. Interleaved
so machine drift falls on every configuration equally rather than on whichever
ran last.

| configuration                                | µs per scroll event |
| -------------------------------------------- | ------------------- |
| no `onScroll`, no phases                     | 2.46                |
| `onScroll`, no phases — **today's baseline** | 7.17                |
| `onScroll` + one phase handler               | 7.02                |
| `onScroll` + all four                        | 6.93                |
| `useScrollOffset` only, no `onScroll` at all | 5.15                |

**The phase machinery adds nothing to the per-event path**, which is what the
design intends: the phases are delivered by two signals that fire twice per
gesture, and the per-event path never learns they exist. The last two rows
differ from the baseline by less than the spread within a single
configuration's own fifteen rounds (6.46–8.87 µs for the baseline, with
occasional 12–25 µs GC outliers discarded by the median), so the honest
statement is _below the measurement floor_, not _zero_.

`useScrollOffset` is cheaper than an `onScroll` because it is strictly less
work: two adjustment reads and one shared-value write, against `onScroll`'s
full `ScrollEvent` (six reads plus the object).

### The residual, which is real

One `GtkEventControllerScroll` on the scrolled window still receives every
scroll event and still emits `::scroll` into an empty handler list. That is
below the noise floor of a compositor round trip on its own, so it was
amplified — K controllers attached, 240 real wheel detents injected
back-to-back, time to the last adjustment change, 7 rounds, median:

| controllers attached | ms for 240 detents |
| -------------------- | ------------------ |
| 0                    | 8.5                |
| 40                   | 10.7               |
| 160                  | 20.3               |

Slope: **0.31 µs per controller per scroll event**. That is what one
scrollable pays while a phase handler is attached to it — about 4% of the
7.17 µs the scroll event already costs — and **zero while none is**.

It is not reachable from here. GTK will not emit `::scroll-begin` without an
axis flag (§1), and an axis flag is what makes it process the event; the only
way to have the phases without the per-event hop would be for
`GtkScrolledWindow` to expose the phases of the controller it already owns.
Noted in [upstream-gtkx.md](../upstream-gtkx.md).

### Being untracked is free

`useScrollOffset` connects two signal handlers to the scrollable it is
pointed at, and disconnects them when the component unmounts or the ref moves
to a different scrollable. A scrollable nobody tracks is the widget it always
was — there is no registry, no observer and nothing per-scrollable that exists
before a hook asks for it.

## 5. Proof

[`tests/gtk/components/scroll-phases.gtk.test.tsx`](../../packages/react-native-gtkx/tests/gtk/components/scroll-phases.gtk.test.tsx),
six tests, all under a real pointer: the wheel reports no phase and the glide
reports all four in order with the content still moving after the lift; a
`ScrollView` with no phase handler carries no extra controller and gains
exactly one when a handler appears and loses it again when it goes; a
`useAnimatedScrollHandler` receives all four through one `onScroll` prop with
one shared context; `useScrollOffset` follows a real wheel in both directions
with zero renders and stops on unmount; and every phase carries the same
payload `onScroll` carries.

**Two rig facts, isolated rather than worked around.** The first glide in a
fresh worker never decelerates — a matrix over _our controller / a bare tick
callback / neither_ found the variable was none of them but the ORDER, so the
tests warm up once and say why. And a virtual pointer stamps its own event
times from zero, which is what GTK derives a kinetic velocity from, so the
file shares **one** pointer across its tests instead of opening one per test;
a device introduced mid-session produces a glide with no inertia.

## What this does not prove

A touchpad is the only device measured that has a scroll sequence. A
touchscreen has one too and could not be driven — wlroots has no virtual-touch
protocol, which is the same limit
[gestures.md](gestures.md) records for the responder system. Nothing here says
what a `GtkScrolledWindow` does under a touch, only that whatever it reports
arrives through the same two signals.
