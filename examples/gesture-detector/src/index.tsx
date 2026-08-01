import { AppRegistry } from "react-native"
import App from "./App"

AppRegistry.registerComponent("gesture-detector", () => App)
AppRegistry.runApplication("gesture-detector", {
  title: "GestureDetector — react-native-gtkx",
  width: 960,
  // Ten cards now that Native and the two relations have their own: the board
  // is meant to be visible in one go, and it deliberately does not scroll — a
  // `ScrollView` around the whole thing would put GTK's own scroll gestures
  // into the arbitration these cards exist to demonstrate.
  height: 1080,
})
