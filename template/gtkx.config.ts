import { defineConfig } from "@gtkx/config"

// "Adw-1" is removable: dropping it opts into the plain-GTK profile
// (AppRegistry's chrome/breakpoints, Alert and Appearance fall back to
// non-Adwaita equivalents; react-native-gtkx/adw and /navigation refuse to
// import) — see docs/api.md's "Plain GTK profile" section.
export default defineConfig({
  libraries: ["Gtk-4.0", "Adw-1"],
  applicationId: "org.example.HelloGtkx",
})
