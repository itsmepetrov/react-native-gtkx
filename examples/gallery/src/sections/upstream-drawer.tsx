// The REAL `react-native-drawer-layout` (4.2.9), dragged in from the left
// edge by a pointer.
//
// A different library from the two sections next door, and here for a
// different reason. It has no Linux build, no fork and no shim in this repo —
// it is the published npm tarball, and everything it imports
// (`react-native`, `react-native-reanimated`, `react-native-worklets`,
// `react-native-gesture-handler`) is answered by react-native-gtkx.
//
// It also needs one thing no other section does: a ten-line vite plugin, in
// `vite.config.ts`. The package picks its gesture implementation with a
// platform file and ships `.ios`, `.android` and a plain fallback with no
// `.native` — so Metro-style resolution for ANY out-of-tree platform (linux
// here, equally win32 or macos) lands on the fallback, whose `Gesture` is
// literally `undefined`. `Drawer.native.tsx` guards that with
// `Gesture?.Pan()`, so the drawer renders, still animates from the `open`
// prop, and cannot be dragged — silently. That is the failure mode this repo
// cares most about, so the plugin points that import at
// `GestureHandlerNative` instead. Deleting it does not break this screen; it
// makes the screen stop proving anything. See
// docs/research/upstream-libraries.md.
//
// This section does NOT scroll (see src/index.tsx): the drawer is opened by
// dragging from the left edge, and an enclosing ScrollView would be
// arbitrating against that drag.
//
// Nothing here is styled by the library: `Drawer` takes plain RN styles, so
// the screen is in the gallery's own palette and follows the theme toggle.
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Drawer } from "react-native-drawer-layout"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Caption, DemoCard, palette, Section, Status } from "../ui"

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, backgroundColor: palette.window },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: palette.cardAlt,
    borderBottomWidth: 1,
    borderBottomColor: palette.cardAlt,
  },
  barButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardAlt,
  },
  barButtonText: { fontSize: 15, color: palette.text },
  barTitle: { fontSize: 13, color: palette.textDim },
  drawerSurface: { backgroundColor: palette.card, width: 280 },
  drawer: { flex: 1, padding: 20, gap: 10 },
  drawerTitle: { fontSize: 16, fontWeight: "700", color: palette.text },
  drawerItem: { fontSize: 13, color: palette.textDim },
  drawerNote: {
    fontSize: 12,
    color: palette.accent,
    marginTop: 8,
    lineHeight: 18,
  },
  drawerButton: {
    marginTop: "auto",
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: palette.accent,
  },
  drawerButtonText: { color: palette.onColor, fontWeight: "600" },
})

const DrawerContent = ({ onClose }: { onClose: () => void }) => (
  <View style={styles.drawer}>
    <Text style={styles.drawerTitle}>Upstream, un-aliased</Text>
    <Text style={styles.drawerItem}>react-native-drawer-layout 4.2.9</Text>
    <Text style={styles.drawerItem}>
      react-native-reanimated-dnd 2.0.0 — next door, in Upstream drop zones and
      Upstream sortables
    </Text>
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

export const UpstreamDrawerSection = () => {
  const [open, setOpen] = useState(false)
  return (
    // Upstream's own quick start for this library wraps the app in this. On
    // this platform it is the one RNGH symbol that is implemented rather than
    // refused — see src/gesture-handler-compat/index.tsx.
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

          <Section
            title="Upstream drawer"
            subtitle="react-native-drawer-layout 4.2.9, straight from npm: a real edge-swipe drawer over this platform's Reanimated, worklets and gesture-handler compat surfaces."
          >
            <DemoCard
              title="Drag it in from the left edge"
              hint="Press just inside the left edge of this pane and pull right. The ☰ button opens the same drawer from a prop, for the comparison."
            >
              <Status>{open ? "open" : "closed"}</Status>
              <Caption>
                Half-open frames are the proof: the panel and its dimming
                overlay follow the pointer rather than snapping when a prop
                changes. The library&apos;s own Gesture.Pan() chain is honoured
                whole — activeOffsetX(±5), failOffsetY(±5), hitSlop({"{"} left:
                0, width: 32 {"}"}) and enabled() — and the edge hit-slop is
                what keeps the drag from stealing presses meant for the app.
              </Caption>
            </DemoCard>

            <DemoCard
              title="Why this one screen needs a vite plugin"
              hint="The package ships GestureHandler.ios.js and .android.js, and no .native.js."
            >
              <Caption>
                Every out-of-tree platform therefore resolves the web fallback,
                where Gesture is undefined and Drawer.native.tsx&apos;s
                Gesture?.Pan() quietly becomes no gesture at all: the drawer
                renders, animates from the open prop, and cannot be dragged.
                Nothing throws and nothing warns. vite.config.ts points that
                import at GestureHandlerNative, scoped to importers inside the
                package. The upstream fix is a one-line rename to
                GestureHandler.native.js.
              </Caption>
            </DemoCard>
          </Section>
        </View>
      </Drawer>
    </GestureHandlerRootView>
  )
}
