import { defineConfig } from "@gtkx/config"

// The workspace's examples share the root-generated store (root gtkx.config.ts
// runs codegen into the hoisted node_modules) — a per-app store would diverge
// from the store the hoisted @gtkx/react types resolve against.
export default defineConfig({
  codegen: false,
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "dev.rngtkx.gallery",
  deploy: {
    // deb+rpm+AppImage ship in releases; flatpak is built separately
    // (--target flatpak) as a build-only artifact, not attached to a
    // release, so it stays out of the default target list here.
    targets: ["deb", "rpm", "appimage"],
    // No per-release tag at config-eval time yet (release.yml still calls
    // build-deb.ts) — falls back to package.json's version. The release
    // switchover (epic task 003) sets this from the git tag.
    version: process.env.GTKX_DEPLOY_VERSION,
    // Otherwise derived from package.json's "name" (gallery-example) — this
    // matches the namespacing build-deb.ts used, so install commands and
    // any existing references to the package name keep working.
    binaryName: "react-native-gtkx-gallery",
    name: "RN Gallery",
    summary: "Every capability of react-native-gtkx, one app you can poke at",
    description: [
      "A tour of every capability react-native-gtkx claims: React Native " +
        "views, text, lists, animations and gestures rendered as native " +
        "GTK4/Adwaita widgets, next to the Adwaita-specific escape hatches " +
        "and the third-party ecosystem reached through the platform's " +
        "aliases.",
      "The sidebar is the navigation itself — a native " +
        "Adw.NavigationSplitView grouped into React Native, gtkx and " +
        "Modules sections — so the app doubles as a map of what the " +
        "platform can do, in the order a reader meets it.",
    ],
    keywords: ["react-native", "gtk", "gtkx", "adwaita", "showcase"],
    categories: ["Development"],
    developer: { name: "Anton Petrov", email: "anton@itsmepetrov.com" },
    license: "MIT",
    homepage: "https://itsmepetrov.github.io/react-native-gtkx/",
    urls: {
      bugtracker: "https://github.com/itsmepetrov/react-native-gtkx/issues",
    },
    icons: "icon.svg",
  },
})
