// The playground: seven panels on one scrolling screen, each one a thing the
// Reanimated surface either does or deliberately does not do.
//
// Every import in this app is a bare package name — `react-native` and
// `react-native-reanimated`. Neither package is installed in this workspace;
// the vite preset aliases the first onto react-native-gtkx and the second
// onto its Reanimated surface. Nothing under src/ mentions this platform, and
// that is the claim the example exists to make checkable.
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { AnimationsPanel } from "./panels/animations"
import { ColorsPanel } from "./panels/colors"
import { DerivedPanel } from "./panels/derived"
import { DragPanel } from "./panels/drag"
import { EasingPanel } from "./panels/easing"
import { RefusalsPanel } from "./panels/refusals"
import { RenderCounterPanel } from "./panels/renders"
import { Caption, palette } from "./ui"

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: palette.window,
  },
  scroll: {
    flex: 1,
  },
  // ScrollView's content container stretches here as RN's does, so the
  // panels fill the width instead of shrinking to their text.
  content: {
    alignItems: "stretch",
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 6,
    paddingBottom: 4,
  },
  title: {
    color: palette.text,
    fontSize: 26,
    fontWeight: "700",
  },
})

const App = () => (
  <View style={styles.canvas}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Reanimated playground</Text>
        <Caption>
          Ordinary React Native, running on GTK4. Every panel below imports
          `react-native` and `react-native-reanimated` and nothing else — the
          two names an iOS or Android app would import.
        </Caption>
      </View>
      <DragPanel />
      <RenderCounterPanel />
      <ColorsPanel />
      <AnimationsPanel />
      <EasingPanel />
      <DerivedPanel />
      <RefusalsPanel />
    </ScrollView>
  </View>
)

export default App
