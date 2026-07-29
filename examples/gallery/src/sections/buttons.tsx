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
      subtitle="Pressable is a GtkFixed with GestureClick and EventControllerMotion; TouchableOpacity is the same Pressable dimming itself with opacity while pressed."
    >
      <DemoCard
        title="Pressable: pressed and hovered"
        hint="style and children are functions of { pressed, hovered }: hover the cursor, hold the button down"
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
              {pressed ? "pressed" : hovered ? "cursor hovering" : "idle state"}
            </Text>
          )}
        </Pressable>
        <Text style={styles.status}>onPress fired: {count} times</Text>
      </DemoCard>

      <DemoCard
        title="onPressIn / onPressOut / onLongPress"
        hint="delayLongPress: 300 — hold for 0.3 s; after a long press the regular onPress does not fire"
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
          <Text style={styles.buttonText}>press and hold me</Text>
        </Pressable>
        <Text style={styles.log}>
          last phase: {phase} · long press: {longPresses}
        </Text>
      </DemoCard>

      <DemoCard
        title="onHoverIn / onHoverOut"
        hint="counts cursor entries into the button area"
      >
        <Pressable
          style={({ hovered }) => [
            styles.button,
            { backgroundColor: hovered ? palette.green : palette.purple },
          ]}
          onHoverIn={() => setHovers((n) => n + 1)}
        >
          <Text style={styles.buttonText}>hover the cursor</Text>
        </Pressable>
        <Text style={styles.status}>hover in: {hovers} times</Text>
      </DemoCard>

      <DemoCard
        title="disabled"
        hint="disabled=true: gestures are ignored, the counter does not grow"
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Pressable
              style={[styles.button, styles.buttonDisabled]}
              disabled
              onPress={() => setCount((c) => c + 100)}
            >
              <Text style={styles.buttonText}>disabled</Text>
            </Pressable>
          </View>
          <Text style={styles.status}>onPress above: {count}</Text>
        </View>
      </DemoCard>

      <DemoCard
        title="TouchableOpacity"
        hint="activeOpacity: 0.4 — the button dims with opacity while pressed"
      >
        <TouchableOpacity
          style={[styles.button, { backgroundColor: palette.orange }]}
          activeOpacity={0.4}
          onPress={() => setTouchTaps((n) => n + 1)}
        >
          <Text style={styles.buttonText}>TouchableOpacity</Text>
        </TouchableOpacity>
        <Text style={styles.status}>taps: {touchTaps}</Text>
      </DemoCard>
    </Section>
  )
}
