// The entry. `./warnings` comes first and is imported for its side effect:
// it wraps `console.warn` before anything else is evaluated, so panel 7 can
// show the refusal messages on screen instead of only on stderr.
import "./warnings"
import { AppRegistry } from "react-native"
import App from "./App"

AppRegistry.registerComponent("reanimated-playground", () => App)
AppRegistry.runApplication("reanimated-playground", {
  title: "Reanimated playground — react-native-gtkx",
  // Wide enough for the easing lanes to be comparable side by side, and tall
  // enough that panel 2's counters stay on screen while panel 1 is dragged.
  width: 980,
  height: 820,
})
