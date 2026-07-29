// FlatList and SectionList: separators, header/footer, empty state,
// imperative scrollTo/scrollToEnd via a ref (ScrollViewHandle).
import { useRef, useState } from "react"
import {
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ScrollViewHandle,
} from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  list: {
    height: 220,
    borderRadius: 8,
    backgroundColor: palette.window,
  },
  listContent: {
    padding: 8,
    // ScrollView content defaults to flex-start — stretch makes rows fill
    // the full width of the list.
    alignItems: "stretch",
  },
  rowItem: {
    backgroundColor: palette.purple,
    borderRadius: 6,
    padding: 10,
  },
  rowText: {
    color: palette.text,
    fontSize: 13,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.textFaint,
    marginVertical: 6,
  },
  edge: {
    backgroundColor: palette.cardAlt,
    borderRadius: 6,
    padding: 8,
    alignItems: "center",
  },
  edgeText: {
    color: palette.textDim,
    fontSize: 12,
    fontWeight: "700",
  },
  empty: {
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    color: palette.textFaint,
    fontSize: 13,
  },
  sectionHeader: {
    backgroundColor: palette.accent,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  sectionHeaderText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
  controls: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: palette.accentPressed,
  },
  buttonText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 13,
  },
})

const FRUIT = ["Apple", "Pear", "Plum", "Cherry", "Apricot"]
const VEG = ["Carrot", "Beet", "Pumpkin", "Zucchini"]

const Separator = () => <View style={styles.separator} />

const SmallButton = ({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) => (
  <Pressable
    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    onPress={onPress}
  >
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>
)

export const ListsSection = () => {
  const flatRef = useRef<ScrollViewHandle>(null)
  const [rows] = useState(() =>
    Array.from({ length: 40 }, (_, i) => `Row #${i + 1}`),
  )

  return (
    <Section
      title="Lists"
      subtitle="v1 renders all rows inside a ScrollView (virtualization is roadmap branch D); separators, header/footer, empty state and scrollTo work like in RN."
    >
      <DemoCard
        title="FlatList: 40 rows + separators + header/footer"
        hint="ItemSeparatorComponent is a hairlineWidth line; the buttons call ref.scrollTo / scrollToEnd"
      >
        <FlatList
          ref={flatRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={rows}
          keyExtractor={(item) => item}
          renderItem={({ item, index }) => (
            <View style={styles.rowItem}>
              <Text style={styles.rowText}>
                {item} (index {index})
              </Text>
            </View>
          )}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={
            <View style={styles.edge}>
              <Text style={styles.edgeText}>ListHeaderComponent</Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.edge}>
              <Text style={styles.edgeText}>ListFooterComponent</Text>
            </View>
          }
        />
        <View style={styles.controls}>
          <SmallButton
            label="scrollTo({ y: 0 })"
            onPress={() => flatRef.current?.scrollTo({ y: 0 })}
          />
          <SmallButton
            label="scrollTo({ y: 300 })"
            onPress={() => flatRef.current?.scrollTo({ y: 300 })}
          />
          <SmallButton
            label="scrollToEnd()"
            onPress={() => flatRef.current?.scrollToEnd()}
          />
        </View>
      </DemoCard>

      <DemoCard
        title="FlatList: empty data"
        hint="data: [] → ListEmptyComponent is rendered"
      >
        <FlatList
          style={{
            height: 90,
            borderRadius: 8,
            backgroundColor: palette.window,
          }}
          contentContainerStyle={{ alignItems: "stretch" }}
          data={[] as string[]}
          renderItem={() => null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Nothing here — this is ListEmptyComponent
              </Text>
            </View>
          }
        />
      </DemoCard>

      <DemoCard
        title="SectionList"
        hint="sections with headers via renderSectionHeader; under the hood it is the same FlatList over flattened rows"
      >
        <SectionList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          sections={[
            { title: "Fruits", data: FRUIT },
            { title: "Vegetables", data: VEG },
          ]}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={[styles.rowItem, { marginTop: 6 }]}>
              <Text style={styles.rowText}>{item}</Text>
            </View>
          )}
        />
        <Caption>
          Scroll the list: section headers scroll together with the rows (sticky
          headers land later in the list epic).
        </Caption>
      </DemoCard>

      <DemoCard
        title="10 000 rows, virtualized"
        hint="only the rows around the viewport exist as widgets — scroll and drag the thumb; the counter shows the mounted window"
      >
        <TenThousand />
      </DemoCard>
    </Section>
  )
}

const BIG = Array.from({ length: 10_000 }, (_, i) => "Row #" + String(i + 1))

const TenThousand = () => {
  const [firstVisible, setFirstVisible] = useState(1)
  return (
    <>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={BIG}
        keyExtractor={(item) => item}
        estimatedItemSize={34}
        onScroll={(event) =>
          setFirstVisible(
            Math.floor(event.nativeEvent.contentOffset.y / 34) + 1,
          )
        }
        renderItem={({ item }) => (
          <View style={styles.rowItem}>
            <Text style={styles.rowText}>{item}</Text>
          </View>
        )}
      />
      <Caption>
        {"top row = #" +
          String(firstVisible) +
          " of 10 000 - only the window around it exists as widgets"}
      </Caption>
    </>
  )
}
