// Probes 1, 4 and 6 of the gesture-detector recon: the raw questions about
// what GTK's controllers deliver on an UNCLAIMED sequence, whether a touchpad
// pinch can be produced in this rig at all, and — since slice 5 — what one
// carries once it can.
//
// Probe 5 — the flattened `Gesture.Pan()` + `GestureDetector` this epic grew
// out of — is gone, and that is the point: it shipped. Its nine assertions
// are now real tests against the real module
// (packages/react-native-gtkx/tests/unit/gesture-handler/recognizer.test.ts
// and tests/gtk/gesture-handler/gesture-detector.gtk.test.tsx), and
// The gallery's "Gesture detector" section is the screen to drag by hand.
// Keeping a second
// implementation of a shipped module next to it would only rot.
//
// What stays is what nothing else reproduces: probe 1's measurement of claim
// propagation (which corrected docs/research/gestures.md in both directions),
// probe 4's finding that GTK feeds touchpad gestures properly, and probe 6's
// measurement of the whole uinput -> libinput -> compositor -> GDK chain,
// which no test in the suite can reach — the headless compositor the suite
// runs under enumerates no input devices at all.
//
// Which one runs is `GD_PROBE`; run-headless.sh and run-session.sh set it.
import { runGtkProbe } from "./probe-gtk"
import { runTouchpadProbe } from "./probe-touchpad"

if (process.env.GD_PROBE === "touchpad") {
  runTouchpadProbe()
} else {
  runGtkProbe()
}
