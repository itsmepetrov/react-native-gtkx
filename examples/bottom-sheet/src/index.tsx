// The default "system" chrome on purpose: this is an ordinary React Native
// app that reaches for ONE Adwaita widget, so the window brings its own
// titlebar and AppRegistry mounts a window-level layout root. That root is
// what puts the widget into React Native layout in the first place — and it
// is the case where a slot's content has an enclosing Yoga tree it must NOT
// join. See the README.
import { AppRegistry } from "react-native"
import App from "./App"

AppRegistry.registerComponent("bottom-sheet", () => App)
AppRegistry.runApplication("bottom-sheet", {
  title: "AdwBottomSheet — react-native-gtkx",
  width: 720,
  height: 560,
})
