// RN app entry. On ios/android the OS host calls runApplication through the
// bridge; on linux our Node host is the OS, and the entry starts the app
// itself — the same pattern react-native-web uses in index.web.js.
import { AppRegistry, Platform } from "react-native"
import { App } from "./App"

AppRegistry.registerComponent("SpikeApp", () => App)

if (Platform.OS === "linux") {
  AppRegistry.runApplication("SpikeApp", {
    title: "RN Platform Spike",
    width: 480,
    height: 360,
  })
}
