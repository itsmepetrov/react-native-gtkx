// plain-gtk — the probe for .claude/epics/adw-optional/001.md: does the RN
// core run at all with `libraries: ["Gtk-4.0"]` and no Adw-1 declared,
// against react-native-gtkx's own seam (src/gtkx/bridge/{core,adw}.ts)
// rather than the single Adw-importing bridge module this repo had before.
//
// Run it two ways:
//   bash spike/plain-gtk/run-headless.sh     — build + a scripted screenshot
//   npm run build && npm start               — the window, to look by hand
import { AppRegistry } from "react-native"
import App from "./App"

AppRegistry.registerComponent("plain-gtk", () => App)
AppRegistry.runApplication("plain-gtk", {
  title: "plain-gtk-probe",
  width: 480,
  height: 640,
})

console.log(
  "[plain-gtk] AppRegistry.runApplication returned — no Adw import blew up the process",
)
