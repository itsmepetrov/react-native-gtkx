// Entry: two probes share the bundle, NAV_SPIKE_MODE picks one at startup.
// Static imports keep the gtkx build a single file (dynamic import() makes
// vite emit split chunks, which breaks the one-bundle contract).
import { run as runAdwSpike } from "./adw-spike"
import { run as runRnProbe } from "./rn-probe"

if (process.env.NAV_SPIKE_MODE === "rn") {
  runRnProbe()
} else {
  runAdwSpike()
}
