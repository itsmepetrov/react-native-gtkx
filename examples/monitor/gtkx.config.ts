import { defineConfig } from "@gtkx/config"

// The workspace's examples share the root-generated store (root gtkx.config.ts
// runs codegen into the hoisted node_modules) — a per-app store would diverge
// from the store the hoisted @gtkx/react types resolve against.
export default defineConfig({
  codegen: false,
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "dev.rngtkx.monitor",
  deploy: {
    targets: ["deb", "rpm", "appimage"],
    version: process.env.GTKX_DEPLOY_VERSION,
    // Otherwise derived from package.json's "name" (monitor-example) — this
    // matches the namespacing the retired build-deb.ts used, so install
    // commands and any existing references to the package name keep working.
    binaryName: "react-native-gtkx-monitor",
    name: "System Monitor",
    summary: "Live CPU, memory, uptime and load averages, one file deep",
    description: [
      "A system monitor built entirely on React Native components and the " +
        "plain Node.js runtime: node:os, node:fs and timers read live " +
        "per-core CPU usage, memory, uptime and load averages, rendered " +
        "natively as a GTK4/Adwaita window.",
      "No bindings, no bridge modules, no native code beyond what the " +
        "platform already provides — on react-native-gtkx, native modules " +
        "are just Node.",
    ],
    keywords: ["system", "monitor", "cpu", "memory", "react-native"],
    // Exactly one freedesktop "main category" per desktop entry — System is
    // it; Monitor is a registered additional category under it, not a main
    // one, so the pair passes desktop-file-validate (two main categories,
    // e.g. System + Utility, does not).
    categories: ["System", "Monitor"],
    developer: { name: "Anton Petrov", email: "anton@itsmepetrov.com" },
    license: "MIT",
    homepage: "https://itsmepetrov.github.io/react-native-gtkx/",
    urls: {
      bugtracker: "https://github.com/itsmepetrov/react-native-gtkx/issues",
    },
    icons: "icon.svg",
  },
})
