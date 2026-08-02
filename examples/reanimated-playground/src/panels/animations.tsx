// 4 — The animation functions.
//
// All five on one box, one shared value, one animated style. Fire them in a
// row and the differences are the point: timing lands exactly on its target,
// spring overshoots it, sequence walks a script, repeat bounces a fixed
// number of times, delay does nothing at all for most of a second.
import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import { Button, Caption, palette, Panel, Row } from "../ui"

const BOX = 52

const styles = StyleSheet.create({
  lane: {
    height: 76,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: 12,
    backgroundColor: palette.orange,
  },
  lastLabel: {
    color: palette.textDim,
    fontSize: 12,
  },
})

export const AnimationsPanel = () => {
  const x = useSharedValue(0)
  const [laneWidth, setLaneWidth] = useState(0)
  const [last, setLast] = useState("nothing yet")
  const travel = Math.max(0, laneWidth - BOX - 24)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
  }))

  const fire = (label: string, run: () => number) => () => {
    setLast(label)
    x.set(run())
  }

  return (
    <Panel
      index="04"
      title="The five animation functions"
      subtitle="One box, one shared value — press them next to each other and compare."
    >
      <View
        style={styles.lane}
        onLayout={(event) => setLaneWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.box, animatedStyle]} />
      </View>
      <Row>
        <Button
          label="withTiming"
          onPress={fire("withTiming(travel, { duration: 600 })", () =>
            withTiming(travel, { duration: 600 }),
          )}
        />
        <Button
          label="withSpring"
          onPress={fire("withSpring(travel) — GentleSpringConfig", () =>
            withSpring(travel),
          )}
        />
        <Button
          label="withSequence"
          onPress={fire(
            "withSequence(timing → timing → spring back to 0)",
            () =>
              withSequence(
                withTiming(travel, { duration: 400 }),
                withTiming(travel / 2, { duration: 400 }),
                withSpring(0),
              ),
          )}
        />
        <Button
          label="withRepeat"
          onPress={fire("withRepeat(timing, 4, reverse)", () =>
            withRepeat(withTiming(travel, { duration: 700 }), 4, true),
          )}
        />
        <Button
          label="withDelay"
          onPress={fire("withDelay(800, timing) — watch it wait", () =>
            withDelay(800, withTiming(travel, { duration: 400 })),
          )}
        />
        <Button
          label="cancel + reset"
          quiet
          onPress={() => {
            setLast("cancelAnimation(x), then withTiming(0)")
            cancelAnimation(x)
            x.set(withTiming(0, { duration: 220 }))
          }}
        />
      </Row>
      <Text style={styles.lastLabel}>last fired: {last}</Text>
      <Caption>
        Defaults are upstream&apos;s: 300 ms on `inOut(quad)` for timing,
        `GentleSpringConfig` for spring. `withRepeat` takes a count — pass -1
        for endless, as panel 2 does — and `cancelAnimation` leaves the value
        where it stood, so press it mid-repeat.
      </Caption>
    </Panel>
  )
}
