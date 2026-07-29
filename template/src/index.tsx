import { AppRegistry } from "react-native"
import { App } from "./App"

AppRegistry.registerComponent("HelloGtkx", () => App)
AppRegistry.runApplication("HelloGtkx", {
  title: "Hello react-native-gtkx",
  width: 800,
  height: 600,
})
