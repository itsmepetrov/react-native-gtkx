import { AppRegistry } from "react-native"
import { Adw, AdwBreakpoint } from "react-native-gtkx/adw"
import { App } from "./app"
import { useStore } from "./store/index"

AppRegistry.registerComponent("tasks-app", () => App)

// chrome: "content" — the window's own HeaderBars (inside the sidebar and
// content panes) become the titlebar; see docs/api.md and
// docs/platform-layer.md. breakpoints reaches AppRegistry's own
// AdwApplicationWindow (react-native-gtkx epic tasks-app #003) with a real
// Adw.Breakpoint — the same condition upstream's tutorial uses to collapse
// the split view into one column on a narrow window.
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
})
