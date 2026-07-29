// Native (GTK) entry point of the profile demo. The component itself lives in
// ./App so that examples/profile-web can mount the identical source through
// react-native-web — the portability proof from the PRD.
import { Appearance, AppRegistry } from "react-native"
import App from "./App"

// The demo is drawn in a dark palette — the dark GTK theme aligns native
// widgets (Entry, Switch) with it. Native entry only: the web entry takes
// its colors from CSS.
Appearance.setColorScheme("dark")

AppRegistry.registerComponent("profile", () => App)
AppRegistry.runApplication("profile", {
  title: "Profile — react-native-gtkx",
  width: 800,
  height: 640,
})
