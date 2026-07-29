// Sticky visual probe: the gallery demo structure with a programmatic scroll
// driven by SCROLL_Y, so a headless harness can screenshot exact offsets.
import { useEffect, useRef } from "react"
import {
  AppRegistry,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewHandle,
} from "react-native"

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#241f31", padding: 20 },
  list: { height: 260, borderRadius: 8, backgroundColor: "#1c1826" },
  listContent: { padding: 8, gap: 6, alignItems: "stretch" },
  header: {
    backgroundColor: "#613583",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  headerText: { color: "#ffffff", fontWeight: "700", fontSize: 13 },
  row: { backgroundColor: "#3d3846", borderRadius: 6, padding: 10 },
  rowText: { color: "#ffffff", fontSize: 13 },
})

const GROUPS = ["Alpha", "Beta", "Gamma"] as const

const App = () => {
  const ref = useRef<ScrollViewHandle>(null)
  useEffect(() => {
    const y = Number(process.env.SCROLL_Y ?? 0)
    const timer = setTimeout(() => {
      ref.current?.scrollTo({ y })
      console.log(`SCROLLED ${y}`)
    }, 1200)
    return () => clearTimeout(timer)
  }, [])
  return (
    <View style={styles.screen}>
      <ScrollView
        ref={ref}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        stickyHeaderIndices={[0, 6, 12]}
      >
        {GROUPS.flatMap((group) => [
          <View
            key={group}
            style={styles.header}
          >
            <Text style={styles.headerText}>{"Group " + group}</Text>
          </View>,
          ...Array.from({ length: 5 }, (_, i) => (
            <View
              key={group + String(i)}
              style={styles.row}
            >
              <Text style={styles.rowText}>
                {group + " item " + String(i + 1)}
              </Text>
            </View>
          )),
        ])}
      </ScrollView>
    </View>
  )
}

AppRegistry.registerComponent("stickyprobe", () => App)
AppRegistry.runApplication("stickyprobe", {
  title: "sticky probe",
  width: 420,
  height: 340,
})
