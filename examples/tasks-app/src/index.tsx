import { AppRegistry } from "react-native"
import { App } from "./app"

AppRegistry.registerComponent("tasks-app", () => App)

// chrome: "system" for now — the real window shell (AdwNavigationSplitView,
// breakpoint collapse, actions) switches this to "content" once it exists;
// see src/app.tsx and README.md.
AppRegistry.runApplication("tasks-app", {
  title: "Tasks",
  width: 900,
  height: 600,
})
