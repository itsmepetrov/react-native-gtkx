import { defineConfig } from "@gtkx/config"

// The application id follows the same DND_IMPL flag as vite.config.ts, and it
// has to: a GApplication id is a bus name, so two builds of this app sharing
// one would make the second process a REMOTE instance of the first — it would
// activate the running window and exit, and the two could never be put side
// by side. Different ids, two independent windows.
export default defineConfig({
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId:
    process.env.DND_IMPL === "real"
      ? "dev.rngtkx.reanimateddnd.real"
      : "dev.rngtkx.reanimateddnd",
})
