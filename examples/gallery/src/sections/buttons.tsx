// Pressable and TouchableOpacity: pressed/hovered states via style/children
// functions, onPress/In/Out, long press with a delay, hover events,
// disabled.
import { useState } from "react"
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import { DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  button: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: palette.accentPressed,
  },
  buttonHovered: {
    backgroundColor: "#3584e4",
  },
  buttonDisabled: {
    backgroundColor: palette.cardAlt,
    opacity: 0.6,
  },
  buttonText: {
    color: palette.text,
    fontWeight: "700",
  },
  status: {
    color: palette.textDim,
    fontSize: 12,
  },
  log: {
    color: "#8ff0a4",
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
})

export const ButtonsSection = () => {
  const [count, setCount] = useState(0)
  const [phase, setPhase] = useState("idle")
  const [longPresses, setLongPresses] = useState(0)
  const [hovers, setHovers] = useState(0)
  const [touchTaps, setTouchTaps] = useState(0)

  return (
    <Section
      title="Buttons"
      subtitle="Pressable — GtkFixed с GestureClick и EventControllerMotion; TouchableOpacity — тот же Pressable, приглушающий себя opacity в pressed."
    >
      <DemoCard
        title="Pressable: pressed и hovered"
        hint="style и children — функции от { pressed, hovered }: наведите курсор, зажмите кнопку"
      >
        <Pressable
          style={({ pressed, hovered }) => [
            styles.button,
            hovered && styles.buttonHovered,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => setCount((c) => c + 1)}
        >
          {({ pressed, hovered }) => (
            <Text style={styles.buttonText}>
              {pressed
                ? "нажата"
                : hovered
                  ? "курсор наведён"
                  : "обычное состояние"}
            </Text>
          )}
        </Pressable>
        <Text style={styles.status}>onPress сработал: {count} раз</Text>
      </DemoCard>

      <DemoCard
        title="onPressIn / onPressOut / onLongPress"
        hint="delayLongPress: 300 — удержите 0.3 с; после long press обычный onPress не срабатывает"
      >
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          delayLongPress={300}
          onPressIn={() => setPhase("pressIn")}
          onPressOut={() => setPhase("pressOut")}
          onPress={() => setPhase("press")}
          onLongPress={() => {
            setPhase("longPress")
            setLongPresses((n) => n + 1)
          }}
        >
          <Text style={styles.buttonText}>зажмите меня</Text>
        </Pressable>
        <Text style={styles.log}>
          последняя фаза: {phase} · long press: {longPresses}
        </Text>
      </DemoCard>

      <DemoCard
        title="onHoverIn / onHoverOut"
        hint="счётчик входов курсора в область кнопки"
      >
        <Pressable
          style={({ hovered }) => [
            styles.button,
            { backgroundColor: hovered ? palette.green : palette.purple },
          ]}
          onHoverIn={() => setHovers((n) => n + 1)}
        >
          <Text style={styles.buttonText}>наведите курсор</Text>
        </Pressable>
        <Text style={styles.status}>hover in: {hovers} раз</Text>
      </DemoCard>

      <DemoCard
        title="disabled"
        hint="disabled=true: жесты игнорируются, счётчик не растёт"
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Pressable
              style={[styles.button, styles.buttonDisabled]}
              disabled
              onPress={() => setCount((c) => c + 100)}
            >
              <Text style={styles.buttonText}>выключена</Text>
            </Pressable>
          </View>
          <Text style={styles.status}>onPress выше: {count}</Text>
        </View>
      </DemoCard>

      <DemoCard
        title="TouchableOpacity"
        hint="activeOpacity: 0.4 — при нажатии кнопка приглушается прозрачностью"
      >
        <TouchableOpacity
          style={[styles.button, { backgroundColor: palette.orange }]}
          activeOpacity={0.4}
          onPress={() => setTouchTaps((n) => n + 1)}
        >
          <Text style={styles.buttonText}>TouchableOpacity</Text>
        </TouchableOpacity>
        <Text style={styles.status}>тапов: {touchTaps}</Text>
      </DemoCard>
    </Section>
  )
}
