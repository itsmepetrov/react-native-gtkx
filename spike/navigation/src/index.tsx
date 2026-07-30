// Navigation spike — probes the three risks of the navigation epic live:
// 1. Nested Root: our Yoga subtree mounted INSIDE an Adw.NavigationPage,
//    with the page's content allocation as the layout viewport
//    (Root followAllocation — one LayoutEngine per page).
// 2. Adw.NavigationView push/pop driven from React via a widget ref
//    (pushByTag / pop), triggered by RN Pressables inside the pages.
// 3. AdwHeaderBar inside AdwToolbarView: the Adwaita back button appears
//    on pushed pages for free.
// The @react-navigation/native import probe is a separate artifact.
//
// NAV_SPIKE_AUTO=1 drives push (t+2s) and pop (t+5s) for headless shots;
// NAV_SPIKE_W/H override the window size (allocation-driven reflow proof).
import type * as Adw from "@gtkx/gi/adw"
import {
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationView,
  AdwToolbarView,
} from "@gtkx/jsx/adw"
import { GtkApplication, GtkApplicationWindow } from "@gtkx/jsx/gtk"
import { createRoot, quit } from "@gtkx/react"
import { useEffect, useRef, useState } from "react"
import { Pressable, Root, StyleSheet, Text, View } from "react-native-gtkx"

const WIDTH = Number(process.env.NAV_SPIKE_W ?? 720)
const HEIGHT = Number(process.env.NAV_SPIKE_H ?? 520)

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    gap: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#ffffff", fontSize: 26, fontWeight: "700" },
  meta: { color: "#c0bfbc", fontSize: 13 },
  row: {
    flexDirection: "row",
    gap: 10,
    alignSelf: "stretch",
  },
  cell: {
    flex: 1,
    height: 64,
    borderRadius: 10,
    backgroundColor: "#ffffff22",
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { color: "#ffffff", fontSize: 12 },
  button: {
    backgroundColor: "#3584e4",
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
})

// The viewport read-back is the nested-Root proof: onLayout of the flex:1
// screen reports the allocation Yoga actually laid out against — it must
// match the page content area (window minus headerbar) and track resizes.
const Screen = ({
  label,
  color,
  actionLabel,
  onAction,
}: {
  label: string
  color: string
  actionLabel: string
  onAction: () => void
}) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  return (
    <View
      style={[styles.screen, { backgroundColor: color }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout
        setSize({ width, height })
        console.log(`[nav-spike] ${label} viewport ${width}x${height}`)
      }}
    >
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.meta}>
        {`root viewport: ${Math.round(size.width)} × ${Math.round(size.height)}`}
      </Text>
      <View style={styles.row}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={styles.cell}
          >
            <Text style={styles.cellText}>{`cell ${n}`}</Text>
          </View>
        ))}
      </View>
      <Pressable
        style={styles.button}
        onPress={onAction}
      >
        <Text style={styles.buttonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  )
}

const App = () => {
  const nav = useRef<Adw.NavigationView | null>(null)

  useEffect(() => {
    if (!process.env.NAV_SPIKE_AUTO) {
      return
    }
    const push = setTimeout(() => {
      console.log("[nav-spike] auto push")
      nav.current?.pushByTag("details")
    }, 2000)
    const pop = setTimeout(() => {
      console.log("[nav-spike] auto pop")
      nav.current?.pop()
    }, 5000)
    return () => {
      clearTimeout(push)
      clearTimeout(pop)
    }
  }, [])

  return (
    <GtkApplicationWindow
      title="navigation spike"
      defaultWidth={WIDTH}
      defaultHeight={HEIGHT}
      onCloseRequest={quit}
    >
      <AdwNavigationView ref={nav}>
        <AdwNavigationPage
          title="Home"
          tag="home"
        >
          <AdwToolbarView topBar={<AdwHeaderBar />}>
            <Root
              width={WIDTH}
              height={HEIGHT}
              followAllocation
            >
              <Screen
                label="Home"
                color="#241f31"
                actionLabel="push details →"
                onAction={() => nav.current?.pushByTag("details")}
              />
            </Root>
          </AdwToolbarView>
        </AdwNavigationPage>
        <AdwNavigationPage
          title="Details"
          tag="details"
        >
          <AdwToolbarView topBar={<AdwHeaderBar />}>
            <Root
              width={WIDTH}
              height={HEIGHT}
              followAllocation
            >
              <Screen
                label="Details"
                color="#1a5fb4"
                actionLabel="← pop (or the HeaderBar back button)"
                onAction={() => nav.current?.pop()}
              />
            </Root>
          </AdwToolbarView>
        </AdwNavigationPage>
      </AdwNavigationView>
    </GtkApplicationWindow>
  )
}

createRoot().render(
  <GtkApplication>
    <App />
  </GtkApplication>,
)
