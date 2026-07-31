// Placeholder root — replaced by the real window shell (sidebar + content
// pane) as the rest of the app is built. Kept as its own component so
// index.tsx never has to change again.
import { StyleSheet, Text, View } from "react-native"

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
})

export const App = () => (
  <View style={styles.screen}>
    <Text>Tasks</Text>
  </View>
)
