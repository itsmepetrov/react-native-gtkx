// The HeaderBar overflow menu — ported from the gtkx tutorial
// (examples/tutorial/src/components/main-menu.tsx). GMenu/GSimpleAction
// have no react-native-gtkx wrapper of their own (they are not widgets —
// see docs/platform-layer.md "Auxiliary objects, not widgets at all"), so
// this is exactly what the platform layer looks like once you are past
// what RN or a router can model: raw action names, routed through the
// win./app. actions wired up in src/index.tsx.
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
