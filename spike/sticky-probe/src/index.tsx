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
import type { Gtk as GtkNS } from "../../../packages/react-native-gtkx/src/gtkx-bridge/index"
import { Gtk } from "../../../packages/react-native-gtkx/src/gtkx-bridge/index"

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
      if (process.env.TELEMETRY === "1") {
        startTelemetry()
      }
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

// Frame-by-frame truth: drive a slow fractional scroll and log, per frame,
// the pinned header's bounds RELATIVE to the scrolled window — the exact
// quantity the eye perceives. A perfectly pinned header keeps relY constant.
const startTelemetry = (): void => {
  try {
    startTelemetryInner()
  } catch (error) {
    console.log("TELEMETRY-ERROR " + String(error))
  }
}

const startTelemetryInner = (): void => {
  const toplevels = Gtk.Window.getToplevels()
  const window = toplevels.getItem(0) as unknown as GtkNS.Window
  const findScrolled = (widget: GtkNS.Widget): GtkNS.ScrolledWindow | null => {
    // Class names are minified in the bundle — detect by capability.
    if (
      typeof (widget as unknown as { getVadjustment?: unknown })
        .getVadjustment === "function"
    ) {
      return widget as GtkNS.ScrolledWindow
    }
    let child = widget.getFirstChild()
    while (child) {
      const found = findScrolled(child)
      if (found) {
        return found
      }
      child = child.getNextSibling()
    }
    return null
  }
  const scrolled = findScrolled(window)!
  const adjustment = scrolled.getVadjustment()!
  const content = scrolled.getChild()!.getFirstChild()!

  let frame = 0
  window.addTickCallback(() => {
    frame += 1
    // Slow fractional drag: +0.7px per frame.
    adjustment.setValue(adjustment.getValue() + 0.7)
    const header = content.getLastChild()!
    const [ok, bounds] = header.computeBounds(scrolled) as unknown as [
      boolean,
      { getY(): number },
    ]
    if (ok && frame <= 120) {
      console.log(
        `F ${frame} value=${adjustment.getValue().toFixed(2)} relY=${bounds.getY().toFixed(2)}`,
      )
    }
    if (frame === 120) {
      console.log("TELEMETRY-DONE")
      if (process.env.SPIKE_EXIT === "1") {
        process.exit(0)
      }
    }
    return frame < 130
  })
}

AppRegistry.registerComponent("stickyprobe", () => App)
AppRegistry.runApplication("stickyprobe", {
  title: "sticky probe",
  width: 420,
  height: 340,
})
