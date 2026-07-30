# Touch simulation spike — verified, the gestures epic is unblocked

Task gestures/000. Question: touch-only GTK gestures (the class
`GtkScrolledWindow` uses internally for kinetic scrolling and pan/swipe
arbitration) ignore mouse input by construction — can we drive them
without touch hardware, so the epic's work is testable at all?

**Answer: yes, with a purpose-built uinput device.** Verified end to end.

## What works

A uinput device declaring **`INPUT_PROP_DIRECT`** plus multitouch axes
(`ABS_MT_SLOT`, `ABS_MT_TRACKING_ID`, `ABS_MT_POSITION_X/Y`, `BTN_TOUCH`)
is classified by udev as a real touchscreen:

```
ID_INPUT=1
ID_INPUT_TOUCHSCREEN=1
```

Created with `python3-evdev` (apt, was not installed):

```python
from evdev import UInput, AbsInfo, ecodes as e
ui = UInput(caps, name="…", input_props=[e.INPUT_PROP_DIRECT])
```

The probe app (`src/index.tsx`) attaches three overlapping controllers to
one widget — a `GtkGestureClick` with `touchOnly(true)`, a plain click
gesture, and a touch-only `GtkGestureDrag` — and logs every signal.
Injecting a tap and a drag produced:

```
[gesture-spike] drag begin
[gesture-spike] any-source pressed
[gesture-spike] touch-only pressed
[gesture-spike] drag update ×13
[gesture-spike] drag end
[gesture-spike] touch-only released
```

Both the touch-only click AND the touch-only drag fire — the events carry
a real `GDK_SOURCE_TOUCHSCREEN` device. Note the ordering: the drag
gesture sees the sequence before the click gestures, which is the
arbitration surface (ScrollView vs child pan) the gesture work has to
reckon with.

## What does not work, and why

- **`ydotoold -T`**: enables `EV_ABS` but never sets `INPUT_PROP_DIRECT`,
  so the device is not classified as a touchscreen. Not usable for
  touch-only gestures (it stays fine for the Alt+Print screenshot flow).
- **Headless sway cannot consume real input devices over SSH.** The
  libinput backend needs an active seat/VT: `WLR_BACKENDS=headless,libinput`
  fails with "Timeout waiting session to become active" — an SSH session
  has no VT. Under a nested/headless compositor the virtual touchscreen is
  therefore invisible.
- Consequence: **touch verification needs a seated session** (the VM's
  GNOME session, or a compositor started on a real VT). The probe above
  ran fullscreen in the desktop session; automated touch tests will need
  the same, or a compositor launched on a VT from a systemd unit.

## Recipe for the epic's tasks

1. `sudo apt-get install -y python3-evdev` (once).
2. Create the device with `INPUT_PROP_DIRECT` + MT axes (as above), sleep
   ~3 s so the compositor picks it up.
3. Emit `ABS_MT_SLOT`/`ABS_MT_TRACKING_ID`/positions + `BTN_TOUCH`, `syn()`
   per event; release with `TRACKING_ID = -1`, `BTN_TOUCH 0`.
4. Coordinates are the declared `ABS` range mapped proportionally onto the
   output — a fullscreen probe window makes aiming trivial.
5. Read results from the app's journal (`journalctl --user -u <unit>`).

`/tmp/touch-session.sh` in the VM is the working driver script this spike
used; keep it as the seed for the epic's test harness.

## Verdict

GO for the gestures epic. Touch-only paths — GtkScrolledWindow's own
kinetic/pan/swipe gestures, and any `touchOnly` gesture we add for
PanResponder — are now reproducibly drivable, so the epic can be verified
rather than assumed. The only real constraint is the seated
session (documented above), not the absence of hardware.
