import { AppRegistry, Platform } from "react-native"
import { App } from "./App"
import { name as appName } from "./app.json"

AppRegistry.registerComponent(appName, () => App)

// On ios/android the OS host invokes the registered component through the
// bridge. On linux the Node host is the OS — the entry starts the app
// itself, the same pattern react-native-web uses in index.web.js.
if (Platform.OS === "linux") {
  AppRegistry.runApplication(appName, {
    title: "RN gtkx Example",
    width: 520,
    height: 420,
  })
}
