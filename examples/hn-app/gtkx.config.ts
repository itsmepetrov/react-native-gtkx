import { defineConfig } from "@gtkx/config"

// The workspace's examples share the root-generated store (root gtkx.config.ts
// runs codegen into the hoisted node_modules) — a per-app store would diverge
// from the store the hoisted @gtkx/react types resolve against.
//
// The `deploy` block below is read by both toolchains: the vite path's
// `gtkx deploy` reads it directly, and the Metro path's `deploy-linux`
// (react-native-gtkx epic task 002) forwards it to `gtkx deploy
// --skip-build` over the app's own production build output.
export default defineConfig({
  codegen: false,
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "dev.rngtkx.hackernews",
  deploy: {
    targets: ["deb", "rpm", "appimage"],
    version: process.env.GTKX_DEPLOY_VERSION,
    // Otherwise derived from package.json's "name" (hn-app) — set
    // explicitly anyway, matching the namespacing the retired build-deb.ts
    // used for the other four apps' packages.
    binaryName: "react-native-gtkx-hn-app",
    name: "Hacker News",
    summary: "A two-screen Hacker News reader for the Linux desktop",
    description: [
      "A Hacker News client built on the standard React Native Metro " +
        "toolchain: top stories with infinite scroll, a native navigation " +
        "stack and a lazily loaded comment tree, all reading the live HN " +
        "Firebase API over plain Node fetch — no networking module, no " +
        "native code.",
      "Demonstrates react-native-gtkx/navigation (react-navigation on " +
        "Adw.NavigationView), desktop integrations such as " +
        "Linking.openURL, and HN's HTML comments flattened for React " +
        "Native's Text.",
    ],
    keywords: ["hacker-news", "news", "reader", "react-native"],
    categories: ["Network"],
    developer: { name: "Anton Petrov", email: "anton@itsmepetrov.com" },
    license: "MIT",
    homepage: "https://itsmepetrov.github.io/react-native-gtkx/",
    urls: {
      bugtracker: "https://github.com/itsmepetrov/react-native-gtkx/issues",
    },
    icons: "icon.svg",
  },
})
