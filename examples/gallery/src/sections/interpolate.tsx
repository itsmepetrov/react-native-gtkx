// Interpolate: what one Animated.Value can be turned into on the way to a
// style. Multi-stop ranges, extrapolation, and one value driving several
// outputs at once — all of it pure RN `interpolate` recipes, none of it
// anything the platform had to add.
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
  squares: {
    flexDirection: "row",
    gap: 12,
  },
  zigzag: {
    height: 80,
  },
})

const OpacityPulse = () => {
  const [progress] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 700 }),
        Animated.timing(progress, { toValue: 0, duration: 700 }),
      ]),
    )
    animation.start()
    return () => animation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // interpolate with three stops: a dip to 0.2 in the middle of the cycle.
  const opacity = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 0.2, 1],
      }),
    [progress],
  )

  return (
    <View style={styles.squares}>
      <Animated.View
        style={[styles.square, { backgroundColor: palette.accent, opacity }]}
      />
      <Animated.View
        style={[styles.square, { backgroundColor: palette.purple, opacity }]}
      />
      <Animated.View
        style={[styles.square, { backgroundColor: palette.red, opacity }]}
      />
    </View>
  )
}

// The contained variant of the Animated section's spring: identical physics
// kept inside the track by the interpolation. A plain extrapolate:"clamp"
// would pin the square to the wall while the spring value oscillates out of
// range (a visible dead pause — stock RN too, just lifeless); mirroring the
// overshoot instead turns it into a bounce off the wall. Both are pure RN
// interpolate recipes: containment is the interpolation's job, not the
// layout's.
const SpringClamped = () => {
  const [position] = useState(() => new Animated.Value(0))
  const [trackWidth, setTrackWidth] = useState(0)
  const atEnd = useRef(false)

  const translateX = useMemo(() => {
    const width = Math.max(0, trackWidth - 40)
    // Overshoot past 1 mirrors back (1.2 → 0.8 of the width): a bounce.
    return position.interpolate({
      inputRange: [-1, 0, 1, 2],
      outputRange: [width, 0, width, 0],
      extrapolate: "clamp",
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
              backgroundColor: palette.yellow,
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
        <Text style={styles.buttonText}>spring, bounces off the wall</Text>
      </Pressable>
    </>
  )
}

const DiagonalLoop = () => {
  const [progress] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
      }),
    )
    animation.start()
    return () => animation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One Animated.Value drives both axes: X linearly, Y as a triangle wave
  // (up-down), producing a zigzag.
  const translateX = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [0, 200] }),
    [progress],
  )
  const translateY = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.25, 0.5, 0.75, 1],
        outputRange: [0, 40, 0, 40, 0],
      }),
    [progress],
  )

  return (
    <View style={styles.zigzag}>
      <Animated.View
        style={[
          styles.square,
          {
            backgroundColor: palette.purple,
            transform: [{ translateX }, { translateY }],
          },
        ]}
      />
    </View>
  )
}

export const InterpolateSection = () => (
  <Section
    title="Interpolate"
    subtitle="One Animated.Value, mapped into whatever a style needs: multi-stop ranges, mirrored extrapolation, and several outputs off the same value."
  >
    <DemoCard
      title="opacity, three stops"
      hint="three squares listen to one Animated.Value; an inputRange with a middle stop dips the opacity in the middle of the cycle"
    >
      <OpacityPulse />
    </DemoCard>

    <DemoCard
      title="extrapolate: clamp, with the overshoot mirrored"
      hint="the same spring physics kept inside the track: the interpolation folds the overshoot back into a bounce (a plain clamp would pin the square to the wall while the value is out of range)"
    >
      <SpringClamped />
    </DemoCard>

    <DemoCard
      title="two interpolations of one value"
      hint="X is linear, Y is a triangle wave over five stops — one value, a zigzag"
    >
      <DiagonalLoop />
    </DemoCard>
  </Section>
)
