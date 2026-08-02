// 5 — Easing.
//
// Seven curves, one movement, fired together. The interesting part is not
// that they differ but HOW: `bounce` and `elastic` overshoot and settle
// without being springs, `linear` is the only one that arrives at a constant
// speed, and `bezier` is the factory shape — `Easing.bezier(...)` returns an
// object with a `.factory()`, which is upstream's own signature.
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
} from "react-native-reanimated"
import { Button, Caption, palette, Panel, Row } from "../ui"

const BOX = 30
const TRAVEL = 260
const DURATION = 1400

const CURVES: {
  name: string
  easing: EasingFunction | EasingFunctionFactory
}[] = [
  { name: "linear", easing: Easing.linear },
  { name: "ease", easing: Easing.ease },
  { name: "inOut(quad)", easing: Easing.inOut(Easing.quad) },
  { name: "out(cubic)", easing: Easing.out(Easing.cubic) },
  { name: "out(bounce)", easing: Easing.out(Easing.bounce) },
  { name: "elastic(1.4)", easing: Easing.elastic(1.4) },
  { name: "bezier(.25,.8,.25,1)", easing: Easing.bezier(0.25, 0.8, 0.25, 1) },
]

const styles = StyleSheet.create({
  rows: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  name: {
    width: 152,
    color: palette.textDim,
    fontSize: 12,
  },
  lane: {
    flex: 1,
    height: 38,
    backgroundColor: palette.cardAlt,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: 8,
    backgroundColor: palette.green,
  },
})

/**
 * One lane. The row owns its own shared value and reacts to the panel's
 * trigger — so all seven start on the same frame, from one press, without
 * the parent holding seven values.
 */
const EasingRow = ({
  name,
  easing,
  trigger,
}: {
  name: string
  easing: EasingFunction | EasingFunctionFactory
  trigger: SharedValue<number>
}) => {
  const x = useSharedValue(0)

  useAnimatedReaction(
    () => trigger.get(),
    (current) => {
      x.set(withTiming(current * TRAVEL, { duration: DURATION, easing }))
    },
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
  }))

  return (
    <View style={styles.row}>
      <Text style={styles.name}>{name}</Text>
      <View style={styles.lane}>
        <Animated.View style={[styles.box, animatedStyle]} />
      </View>
    </View>
  )
}

export const EasingPanel = () => {
  const trigger = useSharedValue(0)

  return (
    <Panel
      index="05"
      title="Easing"
      subtitle="The same 1400 ms, the same 260 px, seven curves — started on one frame."
    >
      <View style={styles.rows}>
        {CURVES.map((curve) => (
          <EasingRow
            key={curve.name}
            name={curve.name}
            easing={curve.easing}
            trigger={trigger}
          />
        ))}
      </View>
      <Row>
        <Button
          label="Run them all"
          onPress={() => {
            trigger.set(trigger.get() === 1 ? 0 : 1)
          }}
        />
      </Row>
      <Caption>
        Press it again and they come back. Each lane runs its own `withTiming`,
        but none of them owns the button: the panel writes one shared value and
        every row&apos;s `useAnimatedReaction` fires from it, which is why they
        leave on the same frame rather than in render order.
      </Caption>
    </Panel>
  )
}
