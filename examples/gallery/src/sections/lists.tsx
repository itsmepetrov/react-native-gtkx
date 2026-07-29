// FlatList and SectionList on the windowed core: virtualization, sticky
// headers, scrollToIndex, viewability, inverted (chat) and refresh parity.
import { useCallback, useRef, useState } from "react"
import {
  FlatList,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type FlatListHandle,
  type ViewToken,
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
  chatInput: {
    flex: 3,
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
  const flatRef = useRef<FlatListHandle>(null)
  const [rows] = useState(() =>
    Array.from({ length: 40 }, (_, i) => `Row #${i + 1}`),
  )

  return (
    <Section
      title="Lists"
      subtitle="FlatList/SectionList run on a windowed (virtualized) core: sticky headers, scrollToIndex, viewability, inverted and refresh work like in RN."
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
        hint="sections with headers via renderSectionHeader; under the hood it is the same windowed FlatList over flattened rows"
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
          Scroll the list: section headers pin to the top by default
          (stickySectionHeadersEnabled) and the next header pushes the previous
          one out, like RN on iOS.
        </Caption>
      </DemoCard>

      <DemoCard
        title="10 000 rows, virtualized"
        hint="only the rows around the viewport exist as widgets; the counter is driven by onViewableItemsChanged and the buttons jump with scrollToIndex"
      >
        <TenThousand />
      </DemoCard>

      <DemoCard
        title="sticky headers"
        hint="ScrollView.stickyHeaderIndices: group headers pin to the top while their group scrolls, and the next header pushes the previous one out"
      >
        <StickyDemo />
      </DemoCard>

      <DemoCard
        title="inverted: chat"
        hint="FlatList.inverted opens at data[0] (the newest message, at the bottom) and stays pinned to it when a new message is prepended — the RN chat pattern"
      >
        <ChatDemo />
      </DemoCard>

      <DemoCard
        title="refreshing / onRefresh"
        hint="RefreshControl parity: `refreshing` shows a spinner row above the content; desktop has no pull gesture, so app chrome (this button) triggers onRefresh"
      >
        <RefreshDemo />
      </DemoCard>
    </Section>
  )
}

const BIG = Array.from({ length: 10_000 }, (_, i) => "Row #" + String(i + 1))

const TenThousand = () => {
  const bigRef = useRef<FlatListHandle>(null)
  const [firstVisible, setFirstVisible] = useState(1)
  // RN requires a stable identity for the viewability callback — never
  // recreated across renders.
  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<string>[] }) => {
      const first = viewableItems[0]
      if (first) {
        setFirstVisible(first.index + 1)
      }
    },
    [],
  )
  return (
    <>
      <FlatList
        ref={bigRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={BIG}
        keyExtractor={(item) => item}
        estimatedItemSize={34}
        onViewableItemsChanged={onViewable}
        renderItem={({ item }) => (
          <View style={styles.rowItem}>
            <Text style={styles.rowText}>{item}</Text>
          </View>
        )}
      />
      <View style={styles.controls}>
        <SmallButton
          label="index 0"
          onPress={() => bigRef.current?.scrollToIndex({ index: 0 })}
        />
        <SmallButton
          label="5 000 centered"
          onPress={() =>
            bigRef.current?.scrollToIndex({ index: 4999, viewPosition: 0.5 })
          }
        />
        <SmallButton
          label="scrollToEnd()"
          onPress={() => bigRef.current?.scrollToEnd()}
        />
      </View>
      <Caption>
        {"first viewable row = #" +
          String(firstVisible) +
          " of 10 000 (onViewableItemsChanged) - only the window around it exists as widgets"}
      </Caption>
    </>
  )
}

type ChatMessage = { id: number; text: string }

const ChatDemo = () => {
  // Chat convention, exactly as in RN: data[0] is the NEWEST message.
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: 30 - i,
      text: "Message #" + String(30 - i),
    })),
  )
  const [draft, setDraft] = useState("")
  const send = () => {
    const text = draft.trim()
    if (!text) {
      return
    }
    setDraft("")
    setMessages((current) => [
      { id: (current[0]?.id ?? 0) + 1, text },
      ...current,
    ])
  }
  return (
    <>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        inverted
        keyExtractor={(message) => String(message.id)}
        estimatedItemSize={40}
        renderItem={({ item }) => (
          <View style={[styles.rowItem, { marginTop: 6 }]}>
            <Text style={styles.rowText}>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.controls}>
        <TextInput
          style={styles.chatInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message…"
          onSubmitEditing={send}
        />
        <SmallButton
          label="Send"
          onPress={send}
        />
      </View>
    </>
  )
}

const RefreshDemo = () => {
  const [rows, setRows] = useState(() =>
    Array.from({ length: 8 }, (_, i) => "Fetched row #" + String(i + 1)),
  )
  const [refreshing, setRefreshing] = useState(false)
  const refresh = () => {
    if (refreshing) {
      return
    }
    setRefreshing(true)
    setTimeout(() => {
      setRows((current) => [
        "Fetched row #" + String(current.length + 1),
        ...current,
      ])
      setRefreshing(false)
    }, 1200)
  }
  return (
    <>
      <FlatList
        style={[styles.list, { height: 160 }]}
        contentContainerStyle={styles.listContent}
        data={rows}
        keyExtractor={(item) => item}
        refreshing={refreshing}
        onRefresh={refresh}
        renderItem={({ item }) => (
          <View style={[styles.rowItem, { marginTop: 6 }]}>
            <Text style={styles.rowText}>{item}</Text>
          </View>
        )}
      />
      <SmallButton
        label={refreshing ? "Refreshing…" : "Refresh"}
        onPress={refresh}
      />
    </>
  )
}

const GROUPS = ["Alpha", "Beta", "Gamma"] as const

const StickyDemo = () => (
  <ScrollView
    style={styles.list}
    contentContainerStyle={styles.listContent}
    stickyHeaderIndices={[0, 6, 12]}
  >
    {GROUPS.flatMap((group) => [
      <View
        key={group}
        style={styles.sectionHeader}
      >
        <Text style={styles.sectionHeaderText}>{"Group " + group}</Text>
      </View>,
      ...Array.from({ length: 5 }, (_, i) => (
        <View
          key={group + String(i)}
          style={[styles.rowItem, { marginTop: 6 }]}
        >
          <Text style={styles.rowText}>{group + " item " + String(i + 1)}</Text>
        </View>
      )),
    ])}
  </ScrollView>
)
