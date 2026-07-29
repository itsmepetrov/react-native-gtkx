import { defineConfig } from "@gtkx/config"

// For GTK tests: @gtkx/vitest resolves gtkx.config.ts from the workspace cwd
// (c12 does not walk up to the repo root), and without an applicationId the
// harness fails when creating the GtkApplication.
export default defineConfig({
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "dev.rngtkx.tests",
})
