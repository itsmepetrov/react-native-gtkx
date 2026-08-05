import reactNativeGtkxTest from "react-native-gtkx/vitest"
import { defineConfig } from "vitest/config"

// The plain-GTK profile's own GTK test project: react-native-gtkx's
// consumer-facing recipe (@gtkx/vitest's headless compositor + the
// react-native alias), run against THIS project's own install and codegen
// store — the only one in the repo with no Adw-1 declared (gtkx.config.ts).
// This is what lets tests here exercise src/apis/host.gtkx.ts's plain-profile
// branches (Alert -> Gtk.AlertDialog, Appearance -> the portal/GtkSettings
// fallback) for real, under real GTK, the same way tests/gtk/apis/*.test.tsx
// exercise the Adw branches in the main package — see
// .claude/epics/adw-optional/003.md and 004.md.
export default defineConfig(async () => reactNativeGtkxTest())
