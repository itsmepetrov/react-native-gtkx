// The sidebar pane's own chrome — split out of window.tsx only so that file
// stays about the split view's structure, not its header's content.
import type { ReactNode } from "react"
import { AdwHeaderBar, AdwToolbarView } from "react-native-gtkx/adw"
import { GtkButton } from "react-native-gtkx/gtk"
import { useStore } from "../store/index"

export const SidebarHeader = ({ children }: { children: ReactNode }) => {
  const showDialog = useStore((state) => state.showDialog)

  return (
    <AdwToolbarView
      topBar={
        <AdwHeaderBar
          start={
            <GtkButton
              iconName="list-add-symbolic"
              tooltipText="New List"
              onClicked={() => showDialog("new-list")}
            />
          }
        />
      }
    >
      {children}
    </AdwToolbarView>
  )
}
