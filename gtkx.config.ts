import { defineConfig } from "@gtkx/config"

// Codegen runs from the repo root so the generated @gtkx/gi and @gtkx/jsx land in
// the root node_modules, where every hoisted @gtkx package can resolve them.
export default defineConfig({
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "dev.rngtkx.workspace",
})
