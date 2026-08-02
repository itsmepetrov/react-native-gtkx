// React Native inside a GTK widget — AdwBottomSheet's three content areas at
// once, and the one rule that governs all of them.
//
// A widget hands out rectangles. Some it takes as ordinary CHILDREN (the
// content area here), some as SLOTS — properties that take a widget
// (`sheet`, `bottomBar`). That difference is gtkx's and it moves between
// releases: rc.3 took the `content` prop off single-child widgets and made
// that content a child instead. It has never had anything to do with layout,
// and neither kind gets a layout root for free: React Native content must
// bring one, or it lays itself out against the enclosing window instead of
// the rectangle it was actually given.
//
// WHICH root is the whole lesson, and this one widget needs both kinds:
//
//   - the content child FILLS the widget → `SlotContent`;
//   - `sheet` and `bottomBar` are sized by what they hold — a bottom sheet
//     rises to the height of its own contents → `IntrinsicContent`.
//
// Swap them and you can see why it cannot be guessed: `SlotContent` in the
// sheet or the bar collapses it to a sliver, `IntrinsicContent` around the
// content child stops `flex: 1` from filling the section.
//
// This section does NOT scroll (see src/index.tsx): the widget takes the
// whole canvas exactly as it took the whole window as a standalone app, and
// the sheet is dragged rather than scrolled.
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { AdwBottomSheet } from "react-native-gtkx/adw"
import { IntrinsicContent, SlotContent } from "react-native-gtkx/common"
import { palette } from "../ui"

const styles = StyleSheet.create({
  // justifyContent centres this column vertically, which is only visible if
  // the content really did receive the widget's full height.
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  // The headings and the sheet rows deliberately name no colour: inside the
  // widget the Adwaita theme's own foreground is already the right one, and
  // naming a hex here is the hand-picked-hue bug in miniature.
  heading: { fontSize: 20, fontWeight: "600" },
  body: {
    fontSize: 14,
    color: palette.textDim,
    textAlign: "center",
    maxWidth: 420,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: palette.accent,
  },
  buttonHovered: { backgroundColor: palette.accentPressed },
  buttonLabel: { color: palette.onColor, fontWeight: "600" },
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
  barLabel: { fontSize: 13, color: palette.textDim },
})

const COLORS = [
  { name: "Blue", value: "#3584e4" },
  { name: "Green", value: "#33d17a" },
  { name: "Orange", value: "#ff7800" },
  { name: "Purple", value: "#9141ac" },
]

export const WidgetHostingSection = () => {
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState(COLORS[0]!)

  return (
    <AdwBottomSheet
      // The WIDGET's own size in React Native layout, which is a separate
      // question from what it does inside: a wrapped GTK widget is a Yoga
      // leaf at its natural size until the style says otherwise.
      style={{ flex: 1 }}
      open={open}
      // The sheet closes itself too (drag, Escape, clicking the dimmed area),
      // so follow the widget rather than assume our state is the truth.
      onNotifyOpen={(_value, sheet) => setOpen(sheet.getOpen())}
      showDragHandle
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
    >
      {/* The content area is the widget's CHILD under gtkx rc.3, and needs a
          root exactly as the two slots above do — the boundary does not care
          which syntax the content arrived through. */}
      <SlotContent>
        <View style={styles.content}>
          <Text style={styles.heading}>Widgets hold React Native</Text>
          <Text style={styles.body}>
            This column is centred because the content area handed its whole
            rectangle to the React Native tree inside it.
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
    </AdwBottomSheet>
  )
}
