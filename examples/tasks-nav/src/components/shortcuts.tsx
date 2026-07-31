// The shortcuts window. Every accelerator listed here is really registered
// — Ctrl+N/Ctrl+, /Ctrl+? through `actionAccels` and Ctrl+F/Escape/Delete
// through the window's own GtkShortcutController (src/index.tsx and
// app-shortcuts.tsx).
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
        title="Move task to trash"
        accelerator="Delete"
      />
      <AdwShortcutsItem
        title="Close task or leave search"
        accelerator="Escape"
      />
    </AdwShortcutsSection>
  </AdwShortcutsDialog>
)
