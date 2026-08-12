import { defineConfig } from "@gtkx/config"

// The application id follows the same DND_IMPL flag as vite.config.ts, and it
// has to: a GApplication id is a bus name, so two builds of this app sharing
// one would make the second process a REMOTE instance of the first — it would
// activate the running window and exit, and the two could never be put side
// by side. Different ids, two independent windows.
// The workspace's examples share the root-generated store (root gtkx.config.ts
// runs codegen into the hoisted node_modules) — a per-app store would diverge
// from the store the hoisted @gtkx/react types resolve against.
export default defineConfig({
  codegen: false,
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId:
    process.env.DND_IMPL === "real"
      ? "dev.rngtkx.reanimateddnd.real"
      : "dev.rngtkx.reanimateddnd",
})
