// React Native content inside WIDGET SLOTS — AdwBottomSheet's three at once.
//
// A slot is a widget PROPERTY that takes a widget, not a child: you write
// `content={…}`, not `<AdwBottomSheet>…</AdwBottomSheet>`. A slot hands out a
// rectangle, and React Native content has to bring a layout root to lay out
// inside that rectangle. Which root is the whole lesson of this example, and
// this one widget needs both kinds:
//
//   - `content` FILLS the whole widget → `SlotContent`;
//   - `sheet` and `bottomBar` are sized by what they hold — a bottom sheet
//     rises to the height of its own contents → `IntrinsicContent`.
//
// Swap them and you can see why it cannot be guessed: `SlotContent` in the
// sheet or the bar collapses it to a sliver, `IntrinsicContent` in `content`
// stops `flex: 1` from filling the window. Three slots, one widget, and the
// answer is not the same for all three.
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { AdwBottomSheet } from "react-native-gtkx/adw"
import { IntrinsicContent, SlotContent } from "react-native-gtkx/common"

const styles = StyleSheet.create({
  // justifyContent centres this column vertically, which is only visible if
  // the content really did receive the slot's full height.
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  heading: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 14, opacity: 0.7, textAlign: "center", maxWidth: 420 },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#3584e4",
  },
  buttonHovered: { backgroundColor: "#1c71d8" },
  buttonLabel: { color: "#ffffff", fontWeight: "600" },
  // No flex: the sheet is as tall as this column, which is what an intrinsic
  // root reports up to the widget.
  sheet: { padding: 20, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 20, height: 20, borderRadius: 10 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  barLabel: { fontSize: 13, opacity: 0.7 },
})

const COLORS = [
  { name: "Blue", value: "#3584e4" },
  { name: "Green", value: "#33d17a" },
  { name: "Orange", value: "#ff7800" },
  { name: "Purple", value: "#9141ac" },
]

const App = () => {
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState(COLORS[0]!)

  return (
    <AdwBottomSheet
      // The WIDGET's own size in React Native layout, which is a separate
      // question from what its slots do: a wrapped GTK widget is a Yoga leaf
      // at its natural size until the style says otherwise.
      style={{ flex: 1 }}
      open={open}
      // The sheet closes itself too (drag, Escape, clicking the dimmed area),
      // so follow the widget rather than assume our state is the truth.
      onNotifyOpen={(_value, sheet) => setOpen(sheet.getOpen())}
      showDragHandle
      content={
        <SlotContent>
          <View style={styles.content}>
            <Text style={styles.heading}>Slots hold React Native</Text>
            <Text style={styles.body}>
              This column is centred in the window because the content slot
              handed its whole rectangle to the React Native tree inside it.
            </Text>
            <Pressable
              style={({ hovered }) => [
                styles.button,
                hovered && styles.buttonHovered,
              ]}
              onPress={() => setOpen(true)}
            >
              <Text style={styles.buttonLabel}>Open the sheet</Text>
            </Pressable>
          </View>
        </SlotContent>
      }
      sheet={
        <IntrinsicContent>
          <View style={styles.sheet}>
            <Text style={styles.heading}>Pick an accent</Text>
            {COLORS.map((entry) => (
              <Pressable
                key={entry.name}
                style={styles.row}
                onPress={() => {
                  setColor(entry)
                  setOpen(false)
                }}
              >
                <View
                  style={[styles.swatch, { backgroundColor: entry.value }]}
                />
                <Text>{entry.name}</Text>
              </Pressable>
            ))}
          </View>
        </IntrinsicContent>
      }
      bottomBar={
        <IntrinsicContent>
          <View style={styles.bottomBar}>
            <Text style={styles.barLabel}>Accent</Text>
            <View style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: color.value }]} />
              <Text style={styles.barLabel}>{color.name}</Text>
            </View>
          </View>
        </IntrinsicContent>
      }
    />
  )
}

export default App
