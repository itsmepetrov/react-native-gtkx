// plain-gtk — the probe for .claude/epics/adw-optional/001.md: does the RN
// core run at all with `libraries: ["Gtk-4.0"]` and no Adw-1 declared,
// against react-native-gtkx's own seam (src/gtkx/bridge/{core,adw}.ts)
// rather than the single Adw-importing bridge module this repo had before.
//
// chrome: "content" (rather than the default "system") is deliberate — see
// .claude/epics/adw-optional/002.md: on a store with no Adw-1, AppRegistry
// falls chrome: "content" back to the same GtkApplicationWindow chrome:
// "system" would have used, rather than throwing. breakpoints is a plain
// (non-Adw) node, just to be truthy — this store has no AdwBreakpoint to
// pass, and the fallback never renders it either way; it only exists here to
// exercise the accepted-and-ignored warning.
//
// Run it two ways:
//   bash spike/plain-gtk/run-headless.sh     — build + a scripted screenshot
//   npm run build && npm start               — the window, to look by hand
import { AppRegistry } from "react-native"
import App from "./App"

AppRegistry.registerComponent("plain-gtk", () => App)
AppRegistry.runApplication("plain-gtk", {
  title: "plain-gtk-probe",
  chrome: "content",
  width: 480,
  height: 640,
  breakpoints: true,
})

console.log(
  "[plain-gtk] AppRegistry.runApplication returned — no Adw import blew up the process",
)
