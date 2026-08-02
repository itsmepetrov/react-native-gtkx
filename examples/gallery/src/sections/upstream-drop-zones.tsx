// The REAL `react-native-reanimated-dnd`, dropping chips onto zones.
//
// The package here is the published npm tarball (2.0.0), not
// `react-native-gtkx/dnd`: `vite.config.ts` hands the preset
// `aliases: { "react-native-reanimated-dnd": false }`, so this one package
// resolves for real while everything it imports (`react-native`,
// `react-native-reanimated`, `react-native-worklets`,
// `react-native-gesture-handler`) is still answered by react-native-gtkx.
// There is no Linux build, no fork and no shim of it in this repo.
//
// This is the opposite of the `dnd` section and of `examples/reanimated-dnd`,
// which prove the MIRROR: the same API on GTK's own drag-and-drop, with the
// real package never loaded. What the difference measures is
// docs/research/upstream-libraries.md, screen by screen in
// docs/research/dnd-differential.md.
//
// This section does NOT scroll (see src/index.tsx): every drag here is one of
// the library's own `Gesture.Pan()`s, and an enclosing ScrollView is a
// competitor it was never meant to arbitrate against.
//
// Nothing here is styled by the library: `Draggable` and `Droppable` take a
// plain RN `style`, so the screen is in the gallery's own palette and follows
// the theme toggle like every other section. The upstream example this came
// from carried a fixed light theme of its own, which only ever read correctly
// in one of the two schemes.
import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Draggable, Droppable, DropProvider } from "react-native-reanimated-dnd"
import { Caption, DemoCard, palette, Section, Status } from "../ui"

type Chip = { id: string; label: string }

const CHIPS: Chip[] = [
  { id: "chip-design", label: "Design" },
  { id: "chip-build", label: "Build" },
  { id: "chip-ship", label: "Ship" },
]

const styles = StyleSheet.create({
  root: { flex: 1 },
  // `zIndex` on the ROW, not on the chip: a dragged chip is moved by a
  // transform and stays inside this row, and RN's zIndex orders SIBLINGS —
  // it does not create a stacking context that escapes the parent. So the
  // thing that has to rise above the zone row is this row. Exactly what the
  // same app needs on iOS and Android, and it is what `zIndex` doing nothing
  // used to hide (docs/research/z-index.md).
  chipRow: { flexDirection: "row", gap: 12, zIndex: 1 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  chipText: { color: palette.onColor, fontWeight: "600" },
  zoneRow: { flexDirection: "row", gap: 12 },
  zone: {
    flex: 1,
    height: 84,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.cardAlt,
    borderStyle: "dashed",
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
  },
  zoneActive: {
    borderColor: palette.accent,
    backgroundColor: palette.accentPressed,
  },
  zoneTitle: { color: palette.textDim, fontWeight: "600" },
})

export const UpstreamDropZonesSection = () => {
  const [log, setLog] = useState("nothing dropped yet")

  return (
    // Upstream's own quick start for this library wraps the app in this. On
    // this platform it is the one RNGH symbol that is implemented rather than
    // refused — see src/gesture-handler-compat/index.tsx.
    <GestureHandlerRootView style={styles.root}>
      <Section
        title="Upstream drop zones"
        subtitle="react-native-reanimated-dnd 2.0.0, straight from npm and un-aliased: Draggable, Droppable and DropProvider on this platform's Reanimated, worklets and gesture-handler compat surfaces."
      >
        <DemoCard
          title="Draggable → Droppable"
          hint="Hold a chip still for 200ms, then drag it onto a zone. The zone lights up while the drag is over it."
        >
          <DropProvider>
            <View style={styles.chipRow}>
              {CHIPS.map((chip) => (
                <Draggable<Chip>
                  key={chip.id}
                  data={chip}
                  draggableId={chip.id}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{chip.label}</Text>
                </Draggable>
              ))}
            </View>

            <View style={styles.zoneRow}>
              <Droppable<Chip>
                droppableId="zone-todo"
                onDrop={(data) => setLog(`${data.label} → To do`)}
                activeStyle={styles.zoneActive}
                style={styles.zone}
              >
                <Text style={styles.zoneTitle}>To do</Text>
              </Droppable>
              <Droppable<Chip>
                droppableId="zone-done"
                onDrop={(data) => setLog(`${data.label} → Done`)}
                activeStyle={styles.zoneActive}
                style={styles.zone}
              >
                <Text style={styles.zoneTitle}>Done</Text>
              </Droppable>
            </View>
          </DropProvider>
          <Status>{log}</Status>
          <Caption>
            The chip follows the pointer, because the real library moves the
            view inside the app&apos;s own tree with worklets. The mirror does
            not: GDK carries a Gtk.WidgetPaintable of it instead, which is what
            buys the real cursors and drops onto widgets React Native never
            created. That trade — and the five props it decides — is
            docs/research/upstream-libraries.md.
          </Caption>
          <Caption>
            The 200ms hold is upstream&apos;s, not this platform&apos;s: every
            one of its draggables arms
            Gesture.Pan().activateAfterLongPress(200), and
            gesture-handler&apos;s own implementations fail the pan outright if
            the pointer travels before that timer. Designed for a device that
            long-presses, met here by a mouse that does not.
          </Caption>
        </DemoCard>
      </Section>
    </GestureHandlerRootView>
  )
}
