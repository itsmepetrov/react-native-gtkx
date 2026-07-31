import { AppRegistry } from "react-native"
import { App } from "./app"

AppRegistry.registerComponent("tasks-nav", () => App)

// chrome: "content" — the sidebar navigator's own HeaderBars become the
// window chrome (see docs/api.md and docs/platform-layer.md); the default
// "system" chrome would double up a titlebar on top of them.
AppRegistry.runApplication("tasks-nav", {
  title: "Tasks (nav)",
  width: 900,
  height: 600,
  chrome: "content",
})
