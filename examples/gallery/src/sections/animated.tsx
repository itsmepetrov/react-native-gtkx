// Animated: the drivers — timing, spring, loop and sequence. Values bypass
// React entirely: listeners write directly to the widget (opacity) and to the
// rect store the parent's layout manager allocates from (transforms).
//
// What a value is INTERPOLATED into has a section of its own, and so does
// what a transform does to the widget's box.
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  track: {
    height: 40,
    borderRadius: 8,
    backgroundColor: palette.cardAlt,
  },
  square: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: palette.accentPressed,
  },
  buttonText: {
    color: palette.onColor,
    fontWeight: "700",
    fontSize: 13,
  },
})

// The motion range is tied to the actual track width via onLayout — on window
// resize the square stays inside the card.
const TimingLoop = () => {
  const [progress] = useState(() => new Animated.Value(0))
  const [trackWidth, setTrackWidth] = useState(0)

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const translateX = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, Math.max(0, trackWidth - 40)],
      }),
    [progress, trackWidth],
  )

  return (
    <View
      style={styles.track}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.square,
          {
            backgroundColor: palette.orange,
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  )
}

// An underdamped spring OVERSHOOTS its target — that is its physics. Since
// the custom layout manager landed, transforms are paint-only exactly like
// in RN: the square honestly flies PAST the track edge over whatever sits
// there and springs back, moving nothing. This is the canonical RN code —
// a plain 0↔1 → pixels interpolation, no defensive math.
const SpringToggle = () => {
  const [position] = useState(() => new Animated.Value(0))
  const [trackWidth, setTrackWidth] = useState(0)
  const atEnd = useRef(false)

  const translateX = useMemo(() => {
    const width = Math.max(0, trackWidth - 40)
    return position.interpolate({
      inputRange: [0, 1],
      outputRange: [0, width],
    })
  }, [position, trackWidth])

  const toggle = (): void => {
    atEnd.current = !atEnd.current
    Animated.spring(position, {
      toValue: atEnd.current ? 1 : 0,
      stiffness: 120,
      damping: 9,
    }).start()
  }

  return (
    <>
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.square,
            {
              backgroundColor: palette.green,
              transform: [{ translateX }],
            },
          ]}
        />
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
        onPress={toggle}
      >
        <Text style={styles.buttonText}>spring to the other edge</Text>
      </Pressable>
    </>
  )
}

export const AnimatedSection = () => (
  <Section
    title="Animated"
    subtitle="timing, spring, loop and sequence on a direct path bypassing React: setOpacity on the widget, and the layout manager placing the base rect under the style's transform."
  >
    <DemoCard
      title="Animated.timing + loop"
      hint="translateX interpolated from the track width (onLayout) — adapts to window resizes"
    >
      <TimingLoop />
    </DemoCard>

    <DemoCard
      title="Animated.spring"
      hint="stiffness/damping physics: the overshoot honestly flies past the edge and springs back — transforms are paint-only, like in RN"
    >
      <SpringToggle />
    </DemoCard>
  </Section>
)
