import { defineConfig } from "@gtkx/config"

// The workspace's examples share the root-generated store (root gtkx.config.ts
// runs codegen into the hoisted node_modules) — a per-app store would diverge
// from the store the hoisted @gtkx/react types resolve against.
export default defineConfig({
  codegen: false,
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "dev.rngtkx.tasksnav",
  deploy: {
    targets: ["deb", "rpm", "appimage"],
    version: process.env.GTKX_DEPLOY_VERSION,
    // Otherwise derived from package.json's "name" (tasks-nav-example) —
    // this matches the namespacing build-deb.ts used, so install commands
    // and any existing references to the package name keep working.
    binaryName: "react-native-gtkx-tasks-nav",
    name: "Tasks (nav)",
    summary:
      "The same task manager, built entirely through the sidebar navigator",
    description: [
      "The same task manager as Tasks, this time built entirely through " +
        "react-native-gtkx's createSidebarNavigator — smart views and " +
        "colored lists in a sidebar, drag-and-drop reorder, dialogs, " +
        "notifications and shortcuts, with no direct " +
        "Adw.NavigationSplitView/Adw.NavigationPage in the app code.",
      "A proof that the sidebar navigator alone can carry an app of this " +
        "navigational complexity: dynamic sidebar rows added at runtime, " +
        "a content header that changes shape with the current selection, " +
        "and a native collapse below a breakpoint.",
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
