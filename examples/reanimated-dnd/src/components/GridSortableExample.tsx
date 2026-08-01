// PORTED from react-native-reanimated-dnd's example app (MIT) — the second
// of the two screens the port could not keep, and the one that could not be
// kept for the most reasons at once.
//
// Missing surface, in the order tsc reported it:
//   SortableGrid, SortableGridItem, SortableGridRenderItemProps,
//   GridOrientation, GridStrategy   — deliberately not implemented
//                                     (docs/research/drag-and-drop.md)
//   react-native-reanimated          — the jiggle animation
//   react-native-worklets            — scheduleOnRN in the drag callbacks
//   @react-native-community/slider   — the column-count control
//   expo-blur                        — the iOS home-screen backdrop
//   ImageBackground                  — not implemented on this platform
//   event.stopPropagation()          — not on this platform's PressEvent
//
// Only the first line of that list is drag-and-drop. The rest is an iOS
// home-screen pastiche, which is upstream's right and is not what this
// example is for.
//
// The route and the shape stay: the same eleven apps in the same grid, laid
// out by Yoga, with a notice saying what is absent. Upstream's icons are
// PNG assets under its own licence, so the tiles carry the app initials
// rather than copies of them.
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { ExampleHeader } from "./ExampleHeader"
import { Footer } from "./Footer"
import { NotImplementedNotice } from "./NotImplementedNotice"

interface AppItem {
  id: string
  name: string
}

const APP_DATA: AppItem[] = [
  { id: "1", name: "Numbers" },
  { id: "2", name: "Pages" },
  { id: "3", name: "Keynote" },
  { id: "4", name: "TestFlight" },
  { id: "5", name: "Books" },
  { id: "6", name: "Calculator" },
  { id: "7", name: "Calendar" },
  { id: "8", name: "Camera" },
  { id: "9", name: "Music" },
  { id: "10", name: "Clock" },
  { id: "11", name: "Compass" },
]

interface GridSortableExampleProps {
  onBack: () => void
}

export function GridSortableExample({ onBack }: GridSortableExampleProps) {
  return (
    <View style={styles.container}>
      <ExampleHeader
        title="Grid Sortable"
        onBack={onBack}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <NotImplementedNotice
          what="SortableGrid and its hooks"
          detail="Importing SortableGrid, SortableGridItem or useGridSortable* fails at build time — which is the intended outcome, not an oversight. They are a large surface (148 lines of grid types alone) serving a layout GNOME apps rarely use, and none of the mechanism they need differs from the vertical list."
        />
        <View style={styles.grid}>
          {APP_DATA.map((app) => (
            <View
              key={app.id}
              style={styles.cell}
            >
              <View style={styles.icon}>
                <Text style={styles.iconText}>{app.name.slice(0, 2)}</Text>
              </View>
              <Text
                style={styles.name}
                numberOfLines={1}
              >
                {app.name}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <Footer />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#08090E",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: "stretch",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  cell: {
    width: 84,
    alignItems: "center",
    gap: 8,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#1E2030",
    borderWidth: 1,
    borderColor: "#2A2D3A",
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#94A3B8",
  },
  name: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: "#F1F5F9",
  },
})
