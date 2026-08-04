import { defineConfig } from "@gtkx/config"

// The whole experiment: no "Adw-1" here. Its own install + its own codegen
// run (separate from the monorepo root, which does declare Adw-1) is the
// only way to get a gi store that genuinely lacks @gtkx/gi/adw — see
// .claude/epics/adw-optional/001.md.
export default defineConfig({
  libraries: ["Gtk-4.0"],
  applicationId: "dev.rngtkx.plaingtkspike",
})
