// 6 — useDerivedValue and useAnimatedReaction.
//
// ONE shared value. Two `useDerivedValue`s read it and become two more shared
// values, each driving a different box; a `useAnimatedReaction` watches the
// same source for a threshold crossing and drives a third. Four widgets move
// off one write, and React is told about none of it.
//
// Dependency tracking here is dynamic — a mapper subscribes to the shared
// values it actually READ on its last run, rather than to a list a Babel
// plugin wrote into the bundle. That is why none of the hooks below is given
// a dependency array and all of them still update.
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { countCrossing, useCounters } from "../stats"
import { Button, Caption, palette, Panel, Row, Stat } from "../ui"

const TRAVEL = 220

const styles = StyleSheet.create({
  stage: {
    height: 92,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 14,
  },
  slider: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: palette.accent,
  },
  scaler: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.orange,
  },
  gate: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  legend: {
    color: palette.textFaint,
    fontSize: 12,
  },
})

export const DerivedPanel = () => {
  const source = useSharedValue(0)

  // Two derived values off the one source. Each is itself a shared value, so
  // it can be read by a style, by another derived value, or by a reaction.
  const offset = useDerivedValue(() => source.get() * TRAVEL)
  const scale = useDerivedValue(() => 0.6 + source.get() * 0.9)

  // The third consumer: not a mapping but a reaction to a threshold. `gate`
  // is a shared value this writes to, which is how a reaction reaches a
  // widget — it never touches one directly.
  const gate = useSharedValue(0)
  useAnimatedReaction(
    () => source.get() > 0.5,
    (isPast, was) => {
      // The tally lives in a module counter, not in state, for the same
      // reason panel 2's do: a `setState` here would be a render per
      // crossing, in a panel whose point is that there are none.
      if (was !== null && isPast !== was) {
        countCrossing()
      }
      gate.set(withTiming(isPast ? 1 : 0, { duration: 200 }))
    },
  )

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }))
  const scalerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }))
  const gateStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      gate.get(),
      [0, 1],
      [palette.red, palette.green],
    ),
  }))

  // Only so the crossings tally below refreshes; nothing else here renders.
  const counts = useCounters(250)

  return (
    <Panel
      index="06"
      title="One value, three consumers"
      subtitle="useDerivedValue twice, useAnimatedReaction once — off a single shared value."
    >
      <View style={styles.stage}>
        <Animated.View style={[styles.slider, sliderStyle]} />
      </View>
      <View style={styles.stage}>
        <Animated.View style={[styles.scaler, scalerStyle]} />
        <Animated.View style={[styles.gate, gateStyle]} />
        <Text style={styles.legend}>
          scale = 0.6 + source × 0.9 (derived) · colour flips when source
          crosses 0.5 (reaction)
        </Text>
      </View>
      <Row>
        <Button
          label="source → 0"
          quiet
          onPress={() => {
            source.set(withTiming(0, { duration: 900 }))
          }}
        />
        <Button
          label="source → 0.5"
          quiet
          onPress={() => {
            source.set(withTiming(0.5, { duration: 900 }))
          }}
        />
        <Button
          label="source → 1"
          onPress={() => {
            source.set(withTiming(1, { duration: 900 }))
          }}
        />
      </Row>
      <Row>
        <Stat
          label="Threshold crossings"
          value={String(counts.crossings)}
        />
      </Row>
      <Caption>
        The blue square&apos;s position and the orange circle&apos;s size are
        two separate derived values off `source`; the square next to the circle
        is driven by a reaction to `source.get() &gt; 0.5`, not by its magnitude
        — which is why it flips rather than fades with the rest. Send the source
        to 0.5 exactly and it stays red: the predicate is strictly greater than.
      </Caption>
      <Caption>
        No hook here is given a dependency array, and everything still updates:
        dependencies are recorded from the reads a mapper performs, which is
        more precise than a static scan (a conditional read is tracked
        correctly) and needs no build step. `dependencies` is still accepted —
        panel 3 passes one, because that updater closes over React state rather
        than over a shared value.
      </Caption>
    </Panel>
  )
}
