// ported from the gtkx tutorial (examples/tutorial/src/components/shortcuts.tsx).
import {
  AdwShortcutsDialog,
  AdwShortcutsItem,
  AdwShortcutsSection,
} from "react-native-gtkx/adw"

export const Shortcuts = ({ onClose }: { onClose: () => void }) => (
  <AdwShortcutsDialog onClosed={onClose}>
    <AdwShortcutsSection title="General">
      <AdwShortcutsItem
        title="New task"
        accelerator="<Control>n"
      />
      <AdwShortcutsItem
        title="Search tasks"
        accelerator="<Control>f"
      />
      <AdwShortcutsItem
        title="Preferences"
        accelerator="<Control>comma"
      />
      <AdwShortcutsItem
        title="Keyboard shortcuts"
        accelerator="<Control>question"
      />
    </AdwShortcutsSection>
    <AdwShortcutsSection title="Tasks">
      <AdwShortcutsItem
        title="Delete task"
        accelerator="Delete"
      />
      <AdwShortcutsItem
        title="Close task"
        accelerator="Escape"
      />
    </AdwShortcutsSection>
  </AdwShortcutsDialog>
)
