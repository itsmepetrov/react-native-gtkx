// PORTED from react-native-reanimated-dnd's example app (MIT) — and this is
// one of the two screens the port could not keep.
//
// `SortableDirection.Horizontal` is not implemented
// (docs/research/drag-and-drop.md: "deferred, not a research question"), and
// upstream's screen leans on the whole horizontal surface — `leftBound`,
// `autoScrollHorizontalDirection`, `itemWidth`, `gap`, `paddingHorizontal`
// on both `Sortable` and `SortableItem`, plus `onDraggingHorizontal`. None
// of those exist here, so there is nothing to edit into place; the drag half
// is genuinely absent.
//
// The route and the content stay anyway. Upstream's own tag data is below,
// rendered in the same horizontal strip, with the drag removed and a notice
// saying so — the omission is visible in the app, not only in the docs.
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { ExampleHeader } from "./ExampleHeader"
import { Footer } from "./Footer"
import { NotImplementedNotice } from "./NotImplementedNotice"

interface TagItem {
  id: string
  label: string
  color: string
  category: string
  count: number
}

const TAG_ICONS: Record<string, string> = {
  React: "Re",
  TypeScript: "TS",
  JavaScript: "JS",
  "React Native": "RN",
  "Node.js": "No",
  Vue: "Vu",
  Angular: "Ng",
  Python: "Py",
  Swift: "Sw",
  Kotlin: "Kt",
  Flutter: "Fl",
  Go: "Go",
  Rust: "Rs",
  Docker: "Dk",
  GraphQL: "GQ",
}

const MOCK_TAGS: TagItem[] = [
  {
    id: "1",
    label: "React",
    color: "#61DAFB",
    category: "Library",
    count: 1250,
  },
  {
    id: "2",
    label: "TypeScript",
    color: "#3178C6",
    category: "Language",
    count: 980,
  },
  {
    id: "3",
    label: "JavaScript",
    color: "#F7DF1E",
    category: "Language",
    count: 2100,
  },
  {
    id: "4",
    label: "React Native",
    color: "#0FA5E9",
    category: "Framework",
    count: 750,
  },
  {
    id: "5",
    label: "Node.js",
    color: "#68A063",
    category: "Runtime",
    count: 1400,
  },
  {
    id: "6",
    label: "Vue",
    color: "#4FC08D",
    category: "Framework",
    count: 650,
  },
  {
    id: "7",
    label: "Angular",
    color: "#DD0031",
    category: "Framework",
    count: 580,
  },
  {
    id: "8",
    label: "Python",
    color: "#3776AB",
    category: "Language",
    count: 1800,
  },
  {
    id: "9",
    label: "Swift",
    color: "#FA7343",
    category: "Language",
    count: 420,
  },
  {
    id: "10",
    label: "Kotlin",
    color: "#7F52FF",
    category: "Language",
    count: 380,
  },
  {
    id: "11",
    label: "Flutter",
    color: "#02569B",
    category: "Framework",
    count: 320,
  },
  { id: "12", label: "Go", color: "#00ADD8", category: "Language", count: 290 },
  {
    id: "13",
    label: "Rust",
    color: "#b7410e",
    category: "Language",
    count: 150,
  },
  { id: "14", label: "Docker", color: "#2496ED", category: "Tool", count: 890 },
  {
    id: "15",
    label: "GraphQL",
    color: "#E10098",
    category: "Query Language",
    count: 340,
  },
]

interface HorizontalSortableExampleProps {
  onBack: () => void
}

export function HorizontalSortableExample({
  onBack,
}: HorizontalSortableExampleProps) {
  return (
    <View style={styles.container}>
      <ExampleHeader
        title="Horizontal Tags"
        onBack={onBack}
      />
      <ScrollView style={styles.scrollView}>
        <NotImplementedNotice
          what="SortableDirection.Horizontal"
          detail="Passing it throws rather than laying the list out vertically, and the horizontal-only props (itemWidth, gap, leftBound, autoScrollHorizontalDirection, onDraggingHorizontal) are not part of the mirrored surface. Nothing about the mechanism differs from the vertical list — GtkDragSource and GtkDropTarget do not care which way a row moves — so this is a later increment, not a limitation of the platform."
        />
        <ScrollView
          horizontal
          style={styles.strip}
          contentContainerStyle={styles.stripContent}
        >
          {MOCK_TAGS.map((tag) => (
            <View
              key={tag.id}
              style={[styles.tag, { borderColor: `${tag.color}59` }]}
            >
              <View style={[styles.tagIcon, { backgroundColor: tag.color }]}>
                <Text style={styles.tagIconText}>{TAG_ICONS[tag.label]}</Text>
              </View>
              <View>
                <Text style={styles.tagLabel}>{tag.label}</Text>
                <Text style={styles.tagMeta}>
                  {tag.category} · {tag.count}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
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
  strip: {
    marginBottom: 24,
  },
  stripContent: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: "#151823",
  },
  tagIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tagIconText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#08090E",
  },
  tagLabel: {
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
    color: "#F1F5F9",
  },
  tagMeta: {
    fontSize: 11,
    fontFamily: "Outfit_400Regular",
    color: "#64748B",
    marginTop: 2,
  },
})
