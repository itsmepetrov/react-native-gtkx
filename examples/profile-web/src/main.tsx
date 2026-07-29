// Web entry point of the profile demo: the same AppRegistry contract as the
// GTK entry (examples/profile/src/index.tsx), but served by react-native-web.
// The App component is imported straight from the native example — one source,
// two renderers.
import { AppRegistry } from "react-native-web"
import App from "../../profile/src/App"

AppRegistry.registerComponent("profile", () => App)
AppRegistry.runApplication("profile", {
  rootTag: document.getElementById("root"),
})
