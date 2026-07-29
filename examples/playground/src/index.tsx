// Interactive playground — pure react-native API. Poke everything by hand.
// Responsive without a single measurement: flexWrap + flexBasis collapse the
// columns into one as the window narrows; ScrollView provides vertical
// scrolling (as in real RN, flexbox itself does not scroll).
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  Appearance,
  AppRegistry,
  Easing,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ScrollViewHandle,
} from "react-native"

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#241f31",
  },
  screenContent: {
    padding: 16,
    gap: 16,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  column: {
    // Pure flexbox responsiveness: while two >=380px columns fit, they sit
    // in a row; once narrower, the second wraps below and both stretch.
    flexBasis: 380,
    flexGrow: 1,
    gap: 12,
  },
  card: {
    backgroundColor: "#3d3846",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  hint: {
    color: "#9a9996",
    fontSize: 12,
  },
  button: {
    backgroundColor: "#1c71d8",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: "#1a5fb4",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  counterValue: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  input: {},
  echo: {
    color: "#8ff0a4",
    fontSize: 13,
  },
  list: {
    height: 260,
    borderRadius: 8,
    backgroundColor: "#241f31",
  },
  listContent: {
    padding: 8,
    gap: 6,
  },
  listItem: {
    backgroundColor: "#613583",
    borderRadius: 6,
    padding: 10,
  },
  listItemText: {
    color: "#ffffff",
    fontSize: 13,
  },
  modalBody: {
    flex: 1,
    padding: 20,
    gap: 12,
    backgroundColor: "#241f31",
    justifyContent: "center",
  },
  modalText: {
    color: "#ffffff",
    fontSize: 15,
    textAlign: "center",
  },
})

const Button = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable
    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    onPress={onPress}
  >
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>
)

const Card = ({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    {children}
  </View>
)

const AnimatedDemo = () => {
  const [progress] = useState(() => new Animated.Value(0))
  const [trackWidth, setTrackWidth] = useState(0)
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The range is tied to the actual track width (onLayout) — on window
  // resize the square stays inside the card.
  const translateX = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, Math.max(0, trackWidth - 40)],
      }),
    [progress, trackWidth],
  )
  const opacity = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 0.35, 1],
      }),
    [progress],
  )

  return (
    <View
      style={{ height: 40 }}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          backgroundColor: "#e66100",
          opacity,
          transform: [{ translateX }],
        }}
      />
    </View>
  )
}

const App = () => {
  const [count, setCount] = useState(0)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [items, setItems] = useState(() =>
    Array.from({ length: 30 }, (_, i) => `Row #${i + 1}`),
  )
  const listRef = useRef<ScrollViewHandle>(null)

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
    >
      <View style={styles.column}>
        <Card
          title="Pressable"
          hint="клик и долгое нажатие; фон темнеет в pressed-состоянии"
        >
          <Text style={styles.counterValue}>{count}</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button
                label="+1"
                onPress={() => setCount((c) => c + 1)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="reset"
                onPress={() => setCount(0)}
              />
            </View>
          </View>
        </Card>

        <Card
          title="TextInput"
          hint="контролируемый ввод, echo ниже; Enter — submit"
        >
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="напишите что-нибудь…"
            onSubmitEditing={({ nativeEvent }) =>
              setItems((prev) => [`Введено: ${nativeEvent.text}`, ...prev])
            }
          />
          <Text style={styles.echo}>echo: {text || "(пусто)"}</Text>
        </Card>

        <Card
          title="Switch + ActivityIndicator"
          hint="переключатель управляет спиннером"
        >
          <View style={styles.row}>
            <Switch
              value={busy}
              onValueChange={setBusy}
            />
            <ActivityIndicator
              animating={busy}
              size="large"
            />
            <Text style={styles.hint}>{busy ? "крутится" : "стоит"}</Text>
          </View>
        </Card>

        <Card
          title="Animated"
          hint="loop-тайминг двигает и растворяет квадрат — мимо React, прямыми move/opacity"
        >
          <AnimatedDemo />
        </Card>

        <Card title="Modal">
          <Button
            label="открыть модалку"
            onPress={() => setModalVisible(true)}
          />
        </Card>
      </View>

      <View style={styles.column}>
        <Card
          title="FlatList в ScrollView"
          hint="колёсико мыши / перетаскивание ползунка; Enter в инпуте добавляет строку"
        >
          <FlatList
            ref={listRef}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={items}
            keyExtractor={(item, index) => `${index}-${item}`}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <Text style={styles.listItemText}>{item}</Text>
              </View>
            )}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button
                label="в конец"
                onPress={() => listRef.current?.scrollToEnd()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="в начало"
                onPress={() => listRef.current?.scrollTo({ y: 0 })}
              />
            </View>
          </View>
        </Card>
      </View>

      <Modal
        visible={modalVisible}
        title="RN Modal → GtkWindow"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBody}>
          <Text style={styles.modalText}>
            Это модальное окно — настоящий GtkWindow (modal, transient for
            родительского окна), а внутри — обычное RN-дерево. Его тоже можно
            ресайзить.
          </Text>
          <Button
            label="закрыть"
            onPress={() => setModalVisible(false)}
          />
        </View>
      </Modal>
    </ScrollView>
  )
}

// The playground is drawn in a dark palette — the dark theme aligns native
// widgets (Entry, Switch) with it. Exactly like RN on Android.
Appearance.setColorScheme("dark")

AppRegistry.registerComponent("playground", () => App)
AppRegistry.runApplication("playground", {
  title: "Playground — react-native-gtkx",
  width: 900,
  height: 640,
})
