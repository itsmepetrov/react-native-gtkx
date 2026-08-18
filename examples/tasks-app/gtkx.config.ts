import { defineConfig } from "@gtkx/config"

// The workspace's examples share the root-generated store (root gtkx.config.ts
// runs codegen into the hoisted node_modules) — a per-app store would diverge
// from the store the hoisted @gtkx/react types resolve against.
export default defineConfig({
  codegen: false,
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "dev.rngtkx.tasks",
  deploy: {
    targets: ["deb", "rpm", "appimage"],
    version: process.env.GTKX_DEPLOY_VERSION,
    // Otherwise derived from package.json's "name" (tasks-app-example) —
    // this matches the namespacing the retired build-deb.ts used, so
    // install commands and any existing references to the package name
    // keep working.
    binaryName: "react-native-gtkx-tasks-app",
    name: "Tasks",
    summary: "A GNOME-style task manager with smart views and reminders",
    description: [
      "A port of Tasks, the task manager built across the gtkx tutorial, " +
        "to the React Native API — the same application and store logic, " +
        "now written against react-native-gtkx.",
      "Smart views (All Tasks, Today, Important, Trash) and colored user " +
        "lists sit in an adaptive Adw.NavigationSplitView sidebar, next to " +
        "GSettings-backed preferences, desktop notifications with reply " +
        "actions, drag-and-drop reordering and a searchable Shortcuts " +
        "window — built directly on Adwaita widgets.",
    ],
    keywords: ["tasks", "todo", "gnome", "productivity", "react-native"],
    // One main category (Office) plus one registered additional category —
    // desktop-file-validate rejects two main categories in the same entry.
    categories: ["Office", "ProjectManagement"],
    developer: { name: "Anton Petrov", email: "anton@itsmepetrov.com" },
    license: "MIT",
    homepage: "https://itsmepetrov.github.io/react-native-gtkx/",
    urls: {
      bugtracker: "https://github.com/itsmepetrov/react-native-gtkx/issues",
    },
    icons: "icon.svg",
  },
})
