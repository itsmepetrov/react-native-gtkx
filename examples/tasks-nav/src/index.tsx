import { AppRegistry } from "react-native"
import { App } from "./app"

AppRegistry.registerComponent("tasks-nav", () => App)

// chrome: "content" — the sidebar navigator's own HeaderBars become the
// window chrome (see docs/api.md and docs/architecture/integration.md); the default
// "system" chrome would double up a titlebar on top of them.
//
// The actions and the global shortcut controller are NOT here. They are
// declared inside the app tree (src/components/window-chrome.tsx), under the
// store's provider, which is what lets a Ctrl+N handler read the same React
// context store the screens read. What stays is `actionAccels`: a flat
// name→keys table with no children and nothing to read from the tree. It is
// what ties the accelerator to the HeaderBar's `actionName="win.new"` button
// and the overflow menu, so the button and the shortcut can never drift
// apart.
AppRegistry.runApplication("tasks-nav", {
  title: "Tasks (nav)",
  width: 900,
  height: 600,
  chrome: "content",
  actionAccels: [
    { detailedActionName: "win.new", accels: ["<Control>n"] },
    { detailedActionName: "win.preferences", accels: ["<Control>comma"] },
    { detailedActionName: "win.shortcuts", accels: ["<Control>question"] },
  ],
})
