// The core-exports probe: `react-native-draggable-flatlist` 4.0.3 and
// `@gorhom/bottom-sheet` 5.2.14, from their published tarballs, built by the
// real `gtkx build` with the presets' aliases in place.
//
// It exists because reading a library's imports predicts the wrong answer.
// Twice in this epic a list of blockers was derived from sources and twice it
// was wrong — `react-native-gesture-handler`'s scrollable re-exports were
// named as the wall and were not, because `createAnimatedComponent` reads only
// `displayName` and `name` and a refusing stand-in answers both. A build
// resolves every specifier for real and stops at the first thing that is
// genuinely missing, in the order the module graph reaches it.
//
// Run it two ways:
//   bash spike/core-exports/run-headless.sh   — build + a scripted pointer
//   npm run build && npm start                — the window, to drag by hand
import { AppRegistry } from "react-native"
import App from "./App"
import { runPointerProbe } from "./probe"

AppRegistry.registerComponent("core-exports", () => App)
AppRegistry.runApplication("core-exports", {
  title: "core-exports-probe",
  width: 1024,
  height: 768,
})

if (process.env.CORE_EXPORTS_PROBE === "1") {
  runPointerProbe()
}
