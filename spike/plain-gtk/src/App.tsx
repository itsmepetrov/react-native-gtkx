// The RN core the probe exercises: a few Views/Text, a ScrollView with
// enough rows to actually scroll, and a Modal — the acceptance bar from
// .claude/epics/adw-optional/001.md ("spike/plain-gtk runs the RN core with
// no Adw-1 declared"). Nothing here reaches for react-native-gtkx/adw,
// /navigation or any AdwXxx widget — those still require Adw-1 and are
// exercised by the OTHER spikes and the gallery, unchanged.
//
// index.tsx now runs this under chrome: "content" — .claude/epics/adw-optional/
// 002.md's window fallback: on a store with no Adw-1, AppRegistry falls
// chrome: "content" back to the same GtkApplicationWindow chrome: "system"
// uses. ApplicationActions/WindowActions/WindowControllers below are the
// modern (non-deprecated) way to reach that window's action maps and
// controller list — self-triggered here (no ydotool in this private headless
// sway) so the probe log proves they actually fire, not just that they
// mount without crashing.
import { useEffect, useState } from "react"
import {
  Alert,
  Appearance,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
} from "react-native"
import {
  ApplicationActions,
  Gio,
  GSimpleAction,
  Gtk,
  GtkShortcut,
  GtkShortcutController,
  quit,
  useParentWindow,
  WindowActions,
  WindowControllers,
} from "react-native-gtkx/gtk"

const ROWS = Array.from({ length: 24 }, (_, index) => `row ${index + 1}`)

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1e1e2e",
    padding: 16,
    gap: 12,
  },
  heading: {
    color: "#cdd6f4",
    fontSize: 20,
    fontWeight: "700",
  },
  subheading: {
    color: "#a6adc8",
    fontSize: 13,
  },
  row: {
    backgroundColor: "#313244",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowText: {
    color: "#cdd6f4",
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 8,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  button: {
    backgroundColor: "#89b4fa",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: "#74a8f8",
  },
  buttonText: {
    color: "#1e1e2e",
    fontWeight: "700",
  },
  modalBody: {
    flex: 1,
    padding: 20,
    gap: 12,
    backgroundColor: "#1e1e2e",
    justifyContent: "center",
  },
  modalText: {
    color: "#cdd6f4",
    fontSize: 14,
    textAlign: "center",
  },
})

const App = () => {
  const [modalVisible, setModalVisible] = useState(false)
  const [switchOn, setSwitchOn] = useState(false)
  const [appActionFired, setAppActionFired] = useState(false)
  const [winActionFired, setWinActionFired] = useState(false)
  const window = useParentWindow()
  const colorScheme = useColorScheme()

  // Headless-proof convenience only: auto-opens the modal so the screenshot
  // script (run-headless.sh) can capture it without a scripted pointer.
  useEffect(() => {
    if (process.env.PLAIN_GTK_AUTO_OPEN_MODAL === "1") {
      const timer = setTimeout(() => setModalVisible(true), 1500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [])

  // Headless-proof convenience only, same idea: self-activates the app- and
  // window-level actions declared below (no ydotool in this private headless
  // sway to press a real key), and then closes the window through the same
  // quit() the window's own onCloseRequest wires up — proving the fallback
  // GtkApplicationWindow's action maps and shutdown path both work when
  // reached through chrome: "content" with no Adw-1 declared, not just
  // through chrome: "system". See .claude/epics/adw-optional/002.md.
  useEffect(() => {
    if (process.env.PLAIN_GTK_AUTO_PROBE !== "1" || !window) {
      return undefined
    }
    const probeTimer = setTimeout(() => {
      const app = Gio.Application.getDefault()
      app?.activateAction("plain-gtk-app-ping", null)
      const winResult = window.activateAction("win.plain-gtk-win-ping", null)
      console.log(
        `[plain-gtk] window.activateAction("plain-gtk-win-ping") -> ${winResult}`,
      )
    }, 700)
    const closeTimer = setTimeout(() => {
      console.log("[plain-gtk] closing via quit()")
      quit()
    }, 7000)
    return () => {
      clearTimeout(probeTimer)
      clearTimeout(closeTimer)
    }
  }, [window])
  // Same idea, for Alert — .claude/epics/adw-optional/003.md's manual proof:
  // shows the Gtk.AlertDialog fallback and logs which button resolved it.
  useEffect(() => {
    if (process.env.PLAIN_GTK_AUTO_SHOW_ALERT === "1") {
      const timer = setTimeout(() => {
        Alert.alert("Delete file?", "This cannot be undone.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => console.log("[plain-gtk] alert resolved: Delete"),
          },
        ])
      }, 1500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [])

  useEffect(() => {
    console.log(`[plain-gtk] color scheme: ${colorScheme}`)
  }, [colorScheme])

  return (
    <View style={styles.root}>
      <ApplicationActions>
        <GSimpleAction
          name="plain-gtk-app-ping"
          onActivate={() => {
            setAppActionFired(true)
            console.log("[plain-gtk] applicationActions GSimpleAction fired")
          }}
        />
      </ApplicationActions>
      <WindowActions>
        <GSimpleAction
          name="plain-gtk-win-ping"
          onActivate={() => {
            setWinActionFired(true)
            console.log("[plain-gtk] windowActions GSimpleAction fired")
          }}
        />
      </WindowActions>
      <WindowControllers>
        <GtkShortcutController
          shortcuts={
            <GtkShortcut
              trigger={Gtk.ShortcutTrigger.parseString("<Control>p")}
              action={Gtk.CallbackAction.new(() => {
                console.log("[plain-gtk] windowControllers shortcut fired")
                return true
              })}
            />
          }
        />
      </WindowControllers>

      <Text style={styles.heading}>plain-gtk probe</Text>
      <Text style={styles.subheading}>
        Gtk-4.0 only — no Adw-1 in gtkx.config.ts, no libadwaita import anywhere
        in this process. chrome: &ldquo;content&rdquo; falls back to
        GtkApplicationWindow here (see .claude/epics/adw-optional/002.md).
      </Text>

      <View style={styles.toggleRow}>
        <Switch
          value={switchOn}
          onValueChange={setSwitchOn}
        />
        <Text style={styles.rowText}>
          GtkSwitch is {switchOn ? "on" : "off"}
        </Text>
      </View>

      <Text style={styles.rowText}>
        actions fired — app: {String(appActionFired)}, window:{" "}
        {String(winActionFired)}
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {ROWS.map((label) => (
          <View
            key={label}
            style={styles.row}
          >
            <Text style={styles.rowText}>{label}</Text>
          </View>
        ))}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.buttonText}>open modal</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
        onPress={() =>
          Alert.alert("Delete file?", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => console.log("[plain-gtk] alert resolved: Delete"),
            },
          ])
        }
      >
        <Text style={styles.buttonText}>show alert (Gtk.AlertDialog)</Text>
      </Pressable>

      <View style={styles.toggleRow}>
        <Text style={styles.rowText}>color scheme: {colorScheme}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={() =>
            Appearance.setColorScheme(colorScheme === "dark" ? "light" : "dark")
          }
        >
          <Text style={styles.buttonText}>toggle scheme</Text>
        </Pressable>
      </View>

      <Modal
        visible={modalVisible}
        title="Modal — GtkWindow"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBody}>
          <Text style={styles.modalText}>
            A modal GtkWindow, transient for the parent — same as under the Adw
            profile, no AdwApplicationWindow involved either way.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => setModalVisible(false)}
          >
            <Text style={styles.buttonText}>close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}

export default App
