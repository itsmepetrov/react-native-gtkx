// chrome: "content" hands the window titlebar to the pages: each
// NavigationPage brings its own HeaderBar, which is how Adwaita apps are
// built. Without it you get the system titlebar AND the page's, stacked.
import { AppRegistry } from "react-native"
import App from "./App"

AppRegistry.registerComponent("adwaita-primitives", () => App)
AppRegistry.runApplication("adwaita-primitives", {
  title: "Adwaita primitives — react-native-gtkx",
  width: 720,
  height: 560,
  chrome: "content",
})
