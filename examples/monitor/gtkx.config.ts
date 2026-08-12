import { defineConfig } from "@gtkx/config"

// The workspace's examples share the root-generated store (root gtkx.config.ts
// runs codegen into the hoisted node_modules) — a per-app store would diverge
// from the store the hoisted @gtkx/react types resolve against.
export default defineConfig({
  codegen: false,
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "dev.rngtkx.monitor",
})
