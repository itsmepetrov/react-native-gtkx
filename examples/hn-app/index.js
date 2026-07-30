import { AppRegistry } from "react-native"
import { name as appName } from "./app.json"
import { App } from "./src/App"

AppRegistry.registerComponent(appName, () => App)

// This example targets linux only, so the entry always starts the app
// itself — on desktop the Node host is the OS (the react-native-web
// index.web.js pattern).
AppRegistry.runApplication(appName, {
  title: "Hacker News",
  width: 560,
  height: 760,
})
