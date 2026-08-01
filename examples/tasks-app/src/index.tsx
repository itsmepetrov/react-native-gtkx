import { AppRegistry } from "react-native"
import { Adw, AdwBreakpoint } from "react-native-gtkx/adw"
import { App } from "./app"
import { useStore } from "./store/index"

AppRegistry.registerComponent("tasks-app", () => App)

// chrome: "content" — the window's own HeaderBars (inside the sidebar and
// content panes) become the titlebar; see docs/api.md and
// docs/platform-layer.md.
//
// The actions and the shortcut controller are NOT here: they are declared
// inside the app tree (src/components/window-chrome.tsx), where they can
// read the app's own React context. What stays are the two options with
// nothing to read from the tree — `breakpoints`, a property of the window
// itself, and `actionAccels`, a flat name→keys table (an accelerator naming
// an action that is not currently registered simply does nothing, so it
// composes with actions that come and go).
AppRegistry.runApplication("tasks-app", {
  title: "Tasks",
  width: 900,
  height: 600,
  chrome: "content",
  breakpoints: (
    <AdwBreakpoint
      condition={Adw.BreakpointCondition.parse("max-width: 500sp")}
      onApply={() => useStore.getState().setCollapsed(true)}
      onUnapply={() => useStore.getState().setCollapsed(false)}
    />
  ),
  actionAccels: [
    { detailedActionName: "win.new", accels: ["<Control>n"] },
    { detailedActionName: "win.preferences", accels: ["<Control>comma"] },
    { detailedActionName: "win.shortcuts", accels: ["<Control>question"] },
  ],
})
