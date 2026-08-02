// One section, two upstream libraries, both installed for real.
//
// `react-native-drawer-layout` wraps the section: the drawer is what you drag
// in from the left edge, and its content is the `react-native-reanimated-dnd`
// screen. Neither package has a Linux build, a Linux fork or a shim in this
// repo — they are the published npm tarballs, and everything they import
// (`react-native`, `react-native-reanimated`, `react-native-worklets`,
// `react-native-gesture-handler`) is answered by react-native-gtkx.
//
// This is the opposite of `examples/reanimated-dnd`. That one proves the
// MIRROR: unedited upstream source, with the presets rewriting
// `react-native-reanimated-dnd` onto `react-native-gtkx/dnd` so the real
// package never loads. This proves what happens when it DOES load — see
// vite.config.ts for the two opt-outs that make it (the preset's own
// `aliases: { "react-native-reanimated-dnd": false }`, plus a scoped plugin
// for react-native-drawer-layout), and docs/research/upstream-libraries.md
// for what that measured.
//
// This section does NOT scroll (see src/index.tsx): the drawer is opened by
// dragging from the left edge and the sortable list is dragged vertically,
// and both would be arbitrating against an enclosing ScrollView.
//
// Nothing here is styled by the libraries: `Draggable`, `Droppable`,
// `Sortable` and `Drawer` all take a plain RN `style`, so the whole screen is
// in the gallery's own palette and follows the theme toggle like every other
// section. The upstream example this came from carried a fixed light theme of
// its own, which only ever read correctly in one of the two schemes.
import { useCallback, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Drawer } from "react-native-drawer-layout"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import {
  Draggable,
  Droppable,
  DropProvider,
  Sortable,
  SortableItem,
  type SortableRenderItemProps,
} from "react-native-reanimated-dnd"
import { palette } from "../ui"

type Chip = { id: string; label: string }

const CHIPS: Chip[] = [
  { id: "chip-design", label: "Design" },
  { id: "chip-build", label: "Build" },
  { id: "chip-ship", label: "Ship" },
]

type Task = { id: string; title: string }

const TASKS: Task[] = [
  { id: "task-1", title: "Measure the real package" },
  { id: "task-2", title: "Run it in a real window" },
  { id: "task-3", title: "Drag it with a real pointer" },
  { id: "task-4", title: "Write down what broke" },
]

const ROW_HEIGHT = 56

/**
 * The `react-native-reanimated-dnd` half, written against the REAL package
 * (2.0.0 from npm, not `react-native-gtkx/dnd`).
 *
 * Nothing here is adapted for this platform: this is the library's own
 * documented call pattern — a `DropProvider` around `Draggable`s and
 * `Droppable`s, and a `Sortable` whose `renderItem` forwards the opaque
 * plumbing props into `SortableItem`.
 */
const DragAndDrop = () => {
  const [log, setLog] = useState("nothing dropped yet")
  const [moved, setMoved] = useState("no rows reordered yet")

  // Upstream's contract is that `Sortable` owns the order and the app must
  // NOT write it back from `onMove`; the callback is a notification. So this
  // only renders what it was told, which is also the cheapest way to see
  // whether the worklet that computes the target index ran at all.
  const onMove = useCallback((id: string, from: number, to: number) => {
    setMoved(`${id}: ${from} → ${to}`)
  }, [])

  const renderTask = useCallback(
    (props: SortableRenderItemProps<Task>) => {
      const { item, id, positions, ...rest } = props
      return (
        <SortableItem<Task>
          key={id}
          id={id}
          data={item}
          positions={positions}
          onMove={onMove}
          {...rest}
        >
          <View style={styles.taskRow}>
            <Text style={styles.taskHandle}>⠿</Text>
            <Text style={styles.taskTitle}>{item.title}</Text>
          </View>
        </SortableItem>
      )
    },
    [onMove],
  )

  return (
    <DropProvider>
      <View style={styles.screen}>
        <Text style={styles.heading}>react-native-reanimated-dnd 2.0.0</Text>
        <Text style={styles.sub}>
          The real npm package, running on this platform&apos;s Reanimated,
          worklets and gesture-handler compat surfaces.
        </Text>

        <Text style={styles.sectionLabel}>Draggable → Droppable</Text>
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
        <Text style={styles.log}>{log}</Text>

        <Text style={styles.sectionLabel}>Sortable</Text>
        <View style={styles.sortableBox}>
          <Sortable
            data={TASKS}
            renderItem={renderTask}
            itemHeight={ROW_HEIGHT}
            itemKeyExtractor={(task) => task.id}
            useFlatList={false}
            style={styles.sortable}
          />
        </View>
        <Text style={styles.log}>{moved}</Text>
      </View>
    </DropProvider>
  )
}

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

export const UpstreamSection = () => {
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
  screen: { flex: 1, padding: 20, gap: 10 },
  heading: { fontSize: 18, fontWeight: "700", color: palette.text },
  sub: { fontSize: 13, color: palette.textDim, marginBottom: 6 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.textDim,
    marginTop: 6,
  },
  chipRow: { flexDirection: "row", gap: 12 },
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
  log: { fontSize: 12, color: palette.accent },
  sortableBox: {
    height: ROW_HEIGHT * 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.cardAlt,
    backgroundColor: palette.card,
    overflow: "hidden",
  },
  sortable: { flex: 1 },
  taskRow: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.cardAlt,
  },
  taskHandle: { color: palette.textDim, fontSize: 16 },
  taskTitle: { color: palette.text, fontSize: 14, flex: 1 },
})
