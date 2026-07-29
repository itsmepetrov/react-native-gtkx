// Out-of-tree platform declaration (the react-native-windows/macOS model).
// In the product this block ships inside react-native-gtkx's own
// react-native.config.js; the app only references the package.
module.exports = {
  platforms: {
    linux: {
      npmPackageName: "react-native-gtkx",
    },
  },
}
