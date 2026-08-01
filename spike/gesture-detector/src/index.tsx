// One bundle, two probes — `GD_PROBE=gtk` asks GTK the raw questions
// (probes 1 and 4), `GD_PROBE=spike` runs the GestureDetector spike
// (probe 5). Both need the same window, the same headless compositor and
// the same pointer injection, so they share a build rather than a runtime.
import { runGtkProbe } from "./probe-gtk"
import { runSpike } from "./spike"

if (process.env.GD_PROBE === "gtk") {
  runGtkProbe()
} else {
  runSpike()
}
