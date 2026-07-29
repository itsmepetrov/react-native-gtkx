import { Platform, StyleSheet, Text, View } from "react-native"

export const App = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Hello, react-native-gtkx!</Text>
    <Text style={styles.hint}>
      Running on {Platform.OS} — edit src/App.tsx and Fast Refresh will apply
      the change without restarting the app.
    </Text>
  </View>
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  hint: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: "center",
  },
})
