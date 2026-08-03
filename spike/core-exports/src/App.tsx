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
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet"
import { useCallback, useState } from "react"
import {
  FlatList,
  Pressable,
  ScrollView,
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
import { controlTouched, registerZone, report, sheetScrolled } from "./probe"

type Row = { key: string; label: string; color: string }

const ROWS: Row[] = [
  { key: "a", label: "alpha", color: "#e8f0fe" },
  { key: "b", label: "bravo", color: "#fce8e6" },
  { key: "c", label: "charlie", color: "#e6f4ea" },
  { key: "d", label: "delta", color: "#fef7e0" },
  { key: "e", label: "echo", color: "#f3e8fd" },
]

// Long enough that the list is scrollable at BOTH snap points — a lock that
// cannot be told apart from "there was nowhere to scroll" proves nothing.
const SHEET_ROWS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
]

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
      // Exactly two snap points, so the top one IS gorhom's EXTENDED state
      // and the scroll lock releases there. With dynamic sizing on, a content
      // taller than 70% adds a THIRD snap point above it — the sheet at 70%
      // is then not extended, the list stays locked, and the probe's unlocked
      // control fails for a reason that has nothing to do with this platform.
      // (It did, once, and this comment is why.)
      enableDynamicSizing={false}
      handleComponent={ProbeHandle}
      onChange={(index) => {
        report(`sheet index=${index}`)
      }}
    >
      <BottomSheetFlatList
        data={SHEET_ROWS}
        keyExtractor={(item) => item}
        // The sheet's list gets no style, so its height is whatever the
        // sheet's content container gives it. Reporting the allocation is how
        // "the list is not a viewport" is told apart from "the wheel never
        // arrived" without guessing at gorhom's internals.
        onLayout={(e: { nativeEvent: { layout: { height: number } } }) => {
          report(`sheet list allocated height=${e.nativeEvent.layout.height}`)
        }}
        onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => {
          sheetScrolled(e.nativeEvent.contentOffset.y)
          report(`sheet list y=${e.nativeEvent.contentOffset.y.toFixed(1)}`)
        }}
        renderItem={({ item }) => (
          <View
            style={styles.sheetRow}
            // The first row is the probe's ruler for the scroll lock: while
            // the sheet is collapsed gorhom pins the list to the top, so this
            // row must not move under a scroll, and once the sheet is
            // extended it must.
            ref={(handle: ViewHandle | null) => {
              if (item === "one") {
                registerZone("sheet-row-one", handle)
              }
              // The lock probe chooses whichever row is currently mounted
              // and inside the viewport. A windowed list legitimately drops
              // rows after a scroll, so any one fixed item can disappear.
              registerZone(`sheet-row-${item}`, handle)
            }}
          >
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
      <View style={styles.pane}>
        <Text style={styles.heading}>plain FlatList (control)</Text>
        <ScrollView
          style={{ height: 130 }}
          onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => {
            report(
              `control ScrollView y=${e.nativeEvent.contentOffset.y.toFixed(1)}`,
            )
          }}
        >
          {SHEET_ROWS.map((item) => (
            <View
              key={item}
              style={styles.sheetRow}
              ref={(handle: ViewHandle | null) => {
                if (item === "one") {
                  registerZone("sv-row-one", handle)
                }
              }}
            >
              <Text style={styles.rowText}>{item}</Text>
            </View>
          ))}
        </ScrollView>
        {/* The same list with NO style of its own, inside the same bounded
            parent — the shape gorhom's scrollable arrives in. */}
        <View style={{ height: 130 }}>
          <FlatList
            data={SHEET_ROWS}
            keyExtractor={(item: string) => item}
            onScroll={(e: {
              nativeEvent: { contentOffset: { y: number } }
            }) => {
              report(
                `unstyled FlatList y=${e.nativeEvent.contentOffset.y.toFixed(1)}`,
              )
            }}
            renderItem={({ item }: { item: string }) => (
              <View
                style={styles.sheetRow}
                ref={(handle: ViewHandle | null) => {
                  if (item === "one") {
                    registerZone("unstyled-row-one", handle)
                  }
                }}
              >
                <Text style={styles.rowText}>{item}</Text>
              </View>
            )}
          />
        </View>
        <View style={{ height: 160 }}>
          <FlatList
            style={{ flex: 1 }}
            data={SHEET_ROWS}
            keyExtractor={(item: string) => item}
            onScroll={(e: {
              nativeEvent: { contentOffset: { y: number } }
            }) => {
              report(
                `control FlatList y=${e.nativeEvent.contentOffset.y.toFixed(1)}`,
              )
            }}
            renderItem={({ item }: { item: string }) => (
              <View
                style={styles.sheetRow}
                ref={(handle: ViewHandle | null) => {
                  if (item === "one") {
                    registerZone("plain-row-one", handle)
                  }
                }}
              >
                <Text style={styles.rowText}>{item}</Text>
              </View>
            )}
          />
        </View>
      </View>
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
