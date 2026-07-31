// The content HeaderBar's overflow menu. GMenu items address `win.*`
// actions by name rather than calling into React — the actions themselves
// are registered on the window in src/index.tsx, which is also what makes
// the same entries reachable by accelerator.
//
// It rides on the content header rather than the sidebar's, for the reason
// the README's "What this could not do" already records: the sidebar
// pane's own AdwHeaderBar is hard-coded by the navigator and takes nothing
// but `sidebarTitle`.
import { GMenu, GtkMenuButton } from "react-native-gtkx/gtk"

export const MainMenu = () => (
  <GtkMenuButton
    primary
    iconName="open-menu-symbolic"
    tooltipText="Main Menu"
    menuModel={
      <GMenu
        items={[
          { section: [{ label: "New Task", action: "win.new" }] },
          {
            section: [
              { label: "Preferences", action: "win.preferences" },
              { label: "Keyboard Shortcuts", action: "win.shortcuts" },
            ],
          },
          { section: [{ label: "About Tasks", action: "win.about" }] },
        ]}
      />
    }
  />
)
