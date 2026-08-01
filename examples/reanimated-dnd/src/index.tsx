// Upstream's entry is `registerRootComponent(App)` from `expo`, which is
// `AppRegistry.registerComponent("main", () => App)` plus Expo Go's
// environment setup. There is no Expo here, so this is the AppRegistry call
// it wraps, plus the window the desktop needs and a phone does not.
//
// The default "system" chrome: this is an ordinary React Native app with its
// own in-app header on every screen (upstream's `ExampleHeader`), exactly as
// it renders on iOS — so the window brings its own titlebar above it rather
// than the app's headers becoming the chrome.
import { AppRegistry } from "react-native"
import App from "./App"

AppRegistry.registerComponent("reanimated-dnd", () => App)
AppRegistry.runApplication("reanimated-dnd", {
  title: "reanimated-dnd — react-native-gtkx",
  // Upstream's own web container caps itself at 350×750 to look like a
  // phone. This is a desktop window, so it is wider than that — which is
  // itself worth seeing: the screens are upstream's, laid out by the same
  // Yoga rules, at a size their author never ran them at.
  width: 900,
  height: 780,
})
