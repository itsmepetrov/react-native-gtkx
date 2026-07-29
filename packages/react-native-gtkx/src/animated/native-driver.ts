// The GTK backend has no "native driver" — every animation already runs on
// the direct path (frame clock → value listeners → imperative widget
// updates), so useNativeDriver is accepted for RN source compatibility and
// ignored, with one dev warning per session.

let warned = false

export const warnNativeDriverIgnored = (): void => {
  if (warned) {
    return
  }
  warned = true
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (!isProduction) {
    console.warn(
      "Animated: useNativeDriver is ignored on react-native-gtkx — " +
        "animations always run on the direct GTK frame-clock path.",
    )
  }
}
