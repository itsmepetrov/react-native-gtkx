// The `react-native-reanimated-dnd` half of the window, written against the
// REAL package (2.0.0 from npm, not `react-native-gtkx/dnd`).
//
// Nothing here is adapted for this platform: this is the library's own
// documented call pattern — a `DropProvider` around `Draggable`s and
// `Droppable`s, and a `Sortable` whose `renderItem` forwards the opaque
// plumbing props into `SortableItem`.
import { useCallback, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import {
  Draggable,
  Droppable,
  DropProvider,
  Sortable,
  SortableItem,
  type SortableRenderItemProps,
} from "react-native-reanimated-dnd"
import { theme } from "./theme"

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

export const DragAndDrop = () => {
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

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 10 },
  heading: { fontSize: 18, fontWeight: "700", color: theme.text },
  sub: { fontSize: 13, color: theme.textMuted, marginBottom: 6 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.textMuted,
    marginTop: 6,
  },
  chipRow: { flexDirection: "row", gap: 12 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  chipText: { color: "#ffffff", fontWeight: "600" },
  zoneRow: { flexDirection: "row", gap: 12 },
  zone: {
    flex: 1,
    height: 84,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.border,
    borderStyle: "dashed",
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  zoneActive: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  zoneTitle: { color: theme.textMuted, fontWeight: "600" },
  log: { fontSize: 12, color: theme.accentDeep },
  sortableBox: {
    height: ROW_HEIGHT * 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
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
    borderBottomColor: theme.surfaceAlt,
  },
  taskHandle: { color: theme.textMuted, fontSize: 16 },
  taskTitle: { color: theme.text, fontSize: 14, flex: 1 },
})
