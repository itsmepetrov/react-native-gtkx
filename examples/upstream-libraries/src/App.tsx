// One window, two upstream libraries, both installed for real.
//
// `react-native-drawer-layout` wraps everything: the drawer is what you drag
// in from the left edge, and its content is the `react-native-reanimated-dnd`
// screen. Neither package has a Linux build, a Linux fork or a shim in this
// repo — they are the published npm tarballs, and everything they import
// (`react-native`, `react-native-reanimated`, `react-native-worklets`,
// `react-native-gesture-handler`) is answered by react-native-gtkx.
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Drawer } from "react-native-drawer-layout"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { DragAndDrop } from "./drag-and-drop"
import { theme } from "./theme"

const DrawerContent = ({ onClose }: { onClose: () => void }) => (
  <View style={styles.drawer}>
    <Text style={styles.drawerTitle}>Upstream libraries</Text>
    <Text style={styles.drawerItem}>react-native-drawer-layout 4.2.9</Text>
    <Text style={styles.drawerItem}>react-native-reanimated-dnd 2.0.0</Text>
    <Text style={styles.drawerNote}>
      This panel is the upstream drawer. It slid in because a pointer dragged
      it, not because a prop changed.
    </Text>
    <Pressable
      style={styles.drawerButton}
      onPress={onClose}
    >
      <Text style={styles.drawerButtonText}>Close</Text>
    </Pressable>
  </View>
)

const App = () => {
  const [open, setOpen] = useState(false)
  return (
    // Upstream's own quick start for BOTH libraries wraps the app in this.
    // On this platform it is the one RNGH symbol that is implemented rather
    // than refused — see src/gesture-handler-compat/index.tsx.
    <GestureHandlerRootView style={styles.root}>
      <Drawer
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        drawerType="front"
        drawerStyle={styles.drawerSurface}
        renderDrawerContent={() => (
          <DrawerContent onClose={() => setOpen(false)} />
        )}
      >
        <View style={styles.content}>
          <View style={styles.bar}>
            <Pressable
              style={styles.barButton}
              onPress={() => setOpen(true)}
            >
              <Text style={styles.barButtonText}>☰</Text>
            </Pressable>
            <Text style={styles.barTitle}>
              {open ? "Drawer open" : "Drag from the left edge to open"}
            </Text>
          </View>
          <DragAndDrop />
        </View>
      </Drawer>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, backgroundColor: theme.background },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: theme.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  barButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  barButtonText: { fontSize: 15, color: theme.text },
  barTitle: { fontSize: 13, color: theme.textMuted },
  drawerSurface: { backgroundColor: theme.surface, width: 280 },
  drawer: { flex: 1, padding: 20, gap: 10 },
  drawerTitle: { fontSize: 16, fontWeight: "700", color: theme.text },
  drawerItem: { fontSize: 13, color: theme.textMuted },
  drawerNote: {
    fontSize: 12,
    color: theme.accentDeep,
    marginTop: 8,
    lineHeight: 18,
  },
  drawerButton: {
    marginTop: "auto",
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.accent,
  },
  drawerButtonText: { color: "#ffffff", fontWeight: "600" },
})

export default App
