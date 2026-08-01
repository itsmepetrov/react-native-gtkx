// Probes 1 and 4 of the gesture-detector recon: the raw questions about what
// GTK's controllers deliver on an UNCLAIMED sequence, and whether a touchpad
// pinch can be produced in this rig at all.
//
// Probe 5 — the flattened `Gesture.Pan()` + `GestureDetector` this epic grew
// out of — is gone, and that is the point: it shipped. Its nine assertions
// are now real tests against the real module
// (packages/react-native-gtkx/tests/unit/gesture-handler/recognizer.test.ts
// and tests/gtk/gesture-handler/gesture-detector.gtk.test.tsx), and
// examples/gesture-detector is the app to drag by hand. Keeping a second
// implementation of a shipped module next to it would only rot.
//
// What stays is what nothing else reproduces: probe 1's measurement of claim
// propagation (which corrected docs/research/gestures.md in both directions)
// and probe 4's finding that GTK feeds touchpad gestures properly while this
// rig cannot synthesize one.
import { runGtkProbe } from "./probe-gtk"

runGtkProbe()
