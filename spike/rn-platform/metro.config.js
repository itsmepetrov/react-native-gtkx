/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this
   config as CommonJS. */
// The whole linux story for a consumer app is this wrap (the platform
// mechanics live in react-native-gtkx/metro — see the preset for details).
const { getDefaultConfig } = require("@react-native/metro-config")
const { withLinuxPlatform } = require("react-native-gtkx/metro")
const path = require("node:path")

const config = withLinuxPlatform(getDefaultConfig(__dirname))
// Monorepo-only: the package is a symlink into the repo, Metro must watch it.
config.watchFolders = [path.resolve(__dirname, "../..")]

module.exports = config
