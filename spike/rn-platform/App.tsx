// Shared app: would render on ios/android/linux alike. Exercises the three
// platform mechanisms the spike must prove end to end through Metro:
// Platform.OS, Platform.select and the .linux.tsx file extension.
import { useState } from "react"
import { Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { platformLabel } from "./platform-info"

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
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Metro bundle on {Platform.OS}</Text>
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
