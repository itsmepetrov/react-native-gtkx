/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this
   config as CommonJS. */
const { getDefaultConfig } = require("@react-native/metro-config")
const { withLinuxPlatform } = require("react-native-gtkx/metro")
const path = require("node:path")

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Linux-only app: the linux platform is a single wrap over the RN defaults.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = withLinuxPlatform(getDefaultConfig(__dirname))
// Monorepo-only: the package is a symlink into the repo, Metro must watch it.
config.watchFolders = [path.resolve(__dirname, "../..")]

module.exports = config
