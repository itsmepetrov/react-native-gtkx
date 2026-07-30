// Shared app: would render on ios/android/linux alike. Exercises the three
// platform mechanisms the spike must prove end to end through Metro:
// Platform.OS, Platform.select and the .linux.tsx file extension.
import { writeFileSync } from "node:fs"
import { useEffect, useState } from "react"
import { Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { platformLabel } from "./platform-info"

// The dev-mode spike edits this marker on a LIVE app (sed in
// run-dev-headless.sh) and asserts the change applies while `ticks` keeps
// counting — proof the hot update preserved component state.
const HMR_MARKER = "v1"

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#241f31",
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  line: {
    color: "#c0bfbc",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#3584e4",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
})

export const App = () => {
  const [count, setCount] = useState(0)
  const [ticks, setTicks] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTicks((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  // Node builtins are a platform feature — and the spike's assertion channel.
  writeFileSync(
    "/tmp/spike-hmr-state.txt",
    `marker=${HMR_MARKER} ticks=${ticks}\n`,
  )
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Metro bundle on {Platform.OS}</Text>
      <Text
        style={styles.line}
      >{`HMR marker ${HMR_MARKER} — ticks ${ticks}`}</Text>
      <Text style={styles.line}>{platformLabel()}</Text>
      <Text style={styles.line}>
        {Platform.select({
          ios: "Platform.select: ios branch",
          android: "Platform.select: android branch",
          linux: "Platform.select: linux branch",
          default: "Platform.select: default branch",
        })}
      </Text>
      <Pressable
        style={styles.button}
        onPress={() => setCount((value) => value + 1)}
      >
        <Text style={styles.buttonText}>{`pressed ${count} times`}</Text>
      </Pressable>
    </View>
  )
}
