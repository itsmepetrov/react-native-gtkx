// Standard RN toolchain: Metro transforms every file (including
// node_modules, so react-native-gtkx TS sources too) with this preset.
module.exports = {
  presets: ["module:@react-native/babel-preset"],
  // react-native-gtkx sources use `export * as Ns from ...`, which the RN
  // preset does not transform on its own.
  plugins: ["@babel/plugin-transform-export-namespace-from"],
}
