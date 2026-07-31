// The window shell — ported from the gtkx tutorial
// (examples/tutorial/src/components/window.tsx), with one structural
// difference: upstream builds its own AdwApplicationWindow (raw gtkx has no
// concept of an app-registry entry point); here AppRegistry.runApplication
// already built the window (chrome: "content", see src/index.tsx), and this
// component is everything INSIDE it.
//
// Why this is not createSidebarNavigator: the navigator's
// SidebarNavigationOptions is `{ title }` only — no per-row icon, colored
// dot or count (the sidebar below needs all three), no collapsed/breakpoint
// wiring, and a single static content header shared by every screen (the
// content pane needs a header that changes shape by selection — search bar,
// filter toggle group, a back button when a task is open). None of that
// fits the adapter today; see docs/research/navigation-extensibility.md and
// examples/tasks-app/README.md. This is built the same way the adapter
// itself is: directly on AdwNavigationSplitView/AdwNavigationPage.
import schema from "#data/dev.rngtkx.tasks.gschema.xml"
import { useEffect } from "react"
import {
  AdwNavigationPage,
  AdwNavigationSplitView,
  AdwToastOverlay,
} from "react-native-gtkx/adw"
import {
  useBindSetting,
  useParentWindow,
  useSetting,
} from "react-native-gtkx/gtk"
import { useStore } from "../store/index"
import { selectionTitle } from "../store/selectors"
import { applyColorScheme } from "../theme"
import { ContentPane } from "./content-pane"
import { Sidebar } from "./sidebar"
import { SidebarHeader } from "./sidebar-header"

export const Window = () => {
  const lists = useStore((state) => state.lists)
  const selection = useStore((state) => state.selection)
  const collapsed = useStore((state) => state.collapsed)
  const showContent = useStore((state) => state.showContent)
  const setShowContent = useStore((state) => state.setShowContent)

  const [colorScheme] = useSetting(schema, "color-scheme")
  // RefProp accepts the object itself, not only a ref wrapper — no need to
  // box the window useParentWindow() already returns.
  const window = useParentWindow()

  useBindSetting({
    schema,
    key: "window-width",
    object: window,
    property: "defaultWidth",
  })
  useBindSetting({
    schema,
    key: "window-height",
    object: window,
    property: "defaultHeight",
  })

  useEffect(() => {
    applyColorScheme(colorScheme)
  }, [colorScheme])

  return (
    <AdwToastOverlay>
      <AdwNavigationSplitView
        collapsed={collapsed}
        showContent={showContent}
        onNotifyShowContent={(value) => setShowContent(value ?? false)}
        sidebarWidthFraction={0.25}
        minSidebarWidth={220}
        maxSidebarWidth={300}
        sidebar={
          <AdwNavigationPage title="Tasks">
            <SidebarHeader>
              <Sidebar />
            </SidebarHeader>
          </AdwNavigationPage>
        }
      >
        <AdwNavigationPage title={selectionTitle(selection, lists)}>
          <ContentPane />
        </AdwNavigationPage>
      </AdwNavigationSplitView>
    </AdwToastOverlay>
  )
}
