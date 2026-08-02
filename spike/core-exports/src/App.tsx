// The probe's UI: both libraries, unedited, from their published tarballs.
//
// Every import here is the library's own public entry point, and nothing in
// this file works around anything — that is the whole point. What the build
// refuses to resolve is the answer the probe exists to produce, and what the
// running window does with a real pointer is the answer after that.
//
// The only thing written FOR the probe is the zone registration: a `View`
// ref around each thing the pointer has to aim at, so coordinates come from
// `measureInWindow` on the real allocation instead of from constants in a
// script. Wrapping is deliberate — a ref onto a library's own component
// would measure whatever that library happened to render this frame.
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetView,
} from "@gorhom/bottom-sheet"
import { useCallback, useState } from "react"
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewHandle,
} from "react-native"
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { controlTouched, registerZone, report } from "./probe"

type Row = { key: string; label: string; color: string }

const ROWS: Row[] = [
  { key: "a", label: "alpha", color: "#e8f0fe" },
  { key: "b", label: "bravo", color: "#fce8e6" },
  { key: "c", label: "charlie", color: "#e6f4ea" },
  { key: "d", label: "delta", color: "#fef7e0" },
  { key: "e", label: "echo", color: "#f3e8fd" },
]

const SHEET_ROWS = ["one", "two", "three", "four", "five", "six"]

const DraggablePane = (): React.ReactNode => {
  const [rows, setRows] = useState(ROWS)

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Row>) => (
      <ScaleDecorator>
        <View
          ref={(handle: ViewHandle | null) => {
            registerZone(`row-${item.key}`, handle)
          }}
          style={[
            styles.row,
            { backgroundColor: isActive ? "#c8d8ff" : item.color },
          ]}
        >
          <Pressable
            onLongPress={drag}
            style={styles.rowPress}
          >
            <Text style={styles.rowText}>{item.label}</Text>
          </Pressable>
        </View>
      </ScaleDecorator>
    ),
    [],
  )

  return (
    <View style={styles.pane}>
      <Text style={styles.heading}>react-native-draggable-flatlist</Text>
      <DraggableFlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        onDragBegin={() => {
          report("draggable onDragBegin")
        }}
        onDragEnd={({ data }) => {
          setRows(data)
          report(`draggable order=${data.map((row) => row.key).join(",")}`)
        }}
      />
    </View>
  )
}

// gorhom's own handle slot, used as the probe's grab target. The library
// still wraps it in `BottomSheetHandleContainer`, which is where the pan
// gesture that drags the sheet lives — so this is the real handle, only
// measurable.
const ProbeHandle = (): React.ReactNode => (
  <View
    ref={(handle: ViewHandle | null) => {
      registerZone("sheet-handle", handle)
    }}
    style={styles.handle}
  >
    <View style={styles.grip} />
  </View>
)

const SheetPane = (): React.ReactNode => (
  <View style={styles.pane}>
    <Text style={styles.heading}>@gorhom/bottom-sheet</Text>
    <BottomSheet
      index={0}
      snapPoints={["25%", "70%"]}
      handleComponent={ProbeHandle}
      onChange={(index) => {
        report(`sheet index=${index}`)
      }}
    >
      <BottomSheetView style={styles.sheetHeader}>
        <Text style={styles.rowText}>sheet content</Text>
      </BottomSheetView>
      <BottomSheetFlatList
        data={SHEET_ROWS}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <View style={styles.sheetRow}>
            <Text style={styles.rowText}>{item}</Text>
          </View>
        )}
      />
    </BottomSheet>
  </View>
)

const App = (): React.ReactNode => (
  <GestureHandlerRootView style={styles.root}>
    <View
      style={styles.columns}
      ref={(handle: ViewHandle | null) => {
        registerZone("columns", handle)
      }}
    >
      <DraggablePane />
      <SheetPane />
    </View>
    {/* The negative control: a zone the pointer never visits. A Wayland
        pointer is addressed by position, so "the drag worked" means nothing
        unless something that was NOT aimed at can be shown to have stayed
        silent. */}
    <View
      style={styles.control}
      ref={(handle: ViewHandle | null) => {
        registerZone("control", handle)
      }}
      onTouchStart={controlTouched}
    >
      <Text style={styles.rowText}>control</Text>
    </View>
  </GestureHandlerRootView>
)

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  columns: { flex: 1, flexDirection: "row" },
  pane: { flex: 1, padding: 12 },
  heading: { fontSize: 14, fontWeight: "bold", marginBottom: 8 },
  row: { height: 56, marginBottom: 4 },
  rowPress: { flex: 1, justifyContent: "center", paddingHorizontal: 12 },
  rowText: { fontSize: 16, color: "#101010" },
  handle: { height: 28, alignItems: "center", justifyContent: "center" },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#8a8a8a" },
  sheetHeader: { padding: 12 },
  sheetRow: { height: 44, justifyContent: "center", paddingHorizontal: 12 },
  control: {
    height: 60,
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#f0f0f0",
  },
})

export default App
