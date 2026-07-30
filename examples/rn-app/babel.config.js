module.exports = {
  presets: ["module:@react-native/babel-preset"],
  // react-native-gtkx uses `export * as Ns from ...`, which the RN preset
  // does not transform on its own.
  plugins: ["@babel/plugin-transform-export-namespace-from"],
}
