// One App for all three platforms. Everything here is plain React Native:
// the linux target renders it as native GTK4 widgets via react-native-gtkx,
// ios/android build it the standard way. Platform mechanisms exercised:
// Platform.OS, Platform.select and the platform file extension
// (./platform-info resolves to platform-info.linux.ts on linux).
import { useState } from "react"
import {
  Alert,
  DevSettings,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native"
import { platformDescription } from "./platform-info"

// Shows up in the Dev Menu (Ctrl+Shift+D under `run-linux --dev`); a
// silent no-op in release builds — plain RN DevSettings semantics.
DevSettings.addMenuItem("Show greeting", () => {
  Alert.alert("Dev Menu", "The custom DevSettings item works!")
})

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  rootLight: {
    backgroundColor: "#fafafa",
  },
  rootDark: {
    backgroundColor: "#241f31",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  line: {
    fontSize: 14,
  },
  textLight: {
    color: "#241f31",
  },
  textDark: {
    color: "#ffffff",
  },
  textDimLight: {
    color: "#5e5c64",
  },
  textDimDark: {
    color: "#c0bfbc",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    minWidth: 220,
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
  const dark = useColorScheme() === "dark"
  const [count, setCount] = useState(0)
  const [enabled, setEnabled] = useState(true)
  const [name, setName] = useState("")
  const text = dark ? styles.textDark : styles.textLight
  const dim = dark ? styles.textDimDark : styles.textDimLight
  return (
    <View style={[styles.root, dark ? styles.rootDark : styles.rootLight]}>
      <Text style={[styles.title, text]}>
        {`Hello from ${Platform.OS}${name ? `, ${name}` : ""}`}
      </Text>
      <Text style={[styles.line, dim]}>{platformDescription()}</Text>
      <Text style={[styles.line, dim]}>
        {Platform.select({
          ios: "Platform.select picked the ios branch",
          android: "Platform.select picked the android branch",
          // The linux key typechecks thanks to env.d.ts referencing
          // react-native-gtkx/types (stock RN types augmented).
          linux: "Platform.select picked the linux branch",
          default: "Platform.select fell through to default",
        })}
      </Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="What is your name?"
      />
      <View style={styles.row}>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
        />
        <Text style={[styles.line, text]}>
          {enabled ? "counting enabled" : "counting disabled"}
        </Text>
      </View>
      <Pressable
        style={styles.button}
        onPress={() => {
          if (enabled) {
            setCount((value) => value + 1)
          }
        }}
      >
        <Text style={styles.buttonText}>{`pressed ${count} times`}</Text>
      </Pressable>
    </View>
  )
}
