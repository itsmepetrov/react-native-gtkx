// Animated: timing/loop, spring, interpolate. Values bypass React —
// listeners write directly to the widget (opacity) and to the parent GtkFixed
// (translate). v1 limitation: Animated.View only animates
// translateX/translateY and opacity; rotate/scale are not applied to widgets.
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
    color: palette.text,
    fontWeight: "700",
    fontSize: 13,
  },
  limitation: {
    color: "#f8e45c",
    fontSize: 12,
  },
})

// The motion range is tied to the actual track width via onLayout — the
// playground trick: on window resize the square stays inside the card.
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

// An underdamped spring OVERSHOOTS its target — that is its physics (at
// damping 9 the overshoot is ~24% of the distance; no fixed margin would
// help). So the spring drives a NORMALIZED 0↔1 value that is projected into
// pixels by interpolate with extrapolate:"clamp" — overshoot pins the square
// to the edge (pressed against the wall), it mathematically cannot leave the
// track. Escaping past the right edge would inflate the natural size of the
// GtkFixed (PRD branch B).
const SpringToggle = () => {
  const [position] = useState(() => new Animated.Value(0))
  const [trackWidth, setTrackWidth] = useState(0)
  const atEnd = useRef(false)

  // Reflecting interpolation instead of a clamp: overshoot past 1 mirrors
  // back (x=1.2 → 0.8 of the width), so the square BOUNCES off the wall
  // instead of sticking to it while the value comes back. Leaving the track
  // is mathematically impossible for overshoot up to 100% of the distance.
  const translateX = useMemo(() => {
    const width = Math.max(0, trackWidth - 40)
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
    <View style={{ flexDirection: "row", gap: 12 }}>
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
    <View style={{ height: 80 }}>
      <Animated.View
        style={[
          styles.square,
          {
            backgroundColor: "#dc8add",
            transform: [{ translateX }, { translateY }],
          },
        ]}
      />
    </View>
  )
}

export const AnimatedSection = () => (
  <Section
    title="Animated"
    subtitle="timing, spring, loop/sequence and interpolate; a direct path bypassing React: setOpacity on the widget and move in the parent GtkFixed on top of the base rect."
  >
    <DemoCard
      title="Animated.timing + loop"
      hint="translateX interpolated from the track width (onLayout) — adapts to window resizes"
    >
      <TimingLoop />
    </DemoCard>

    <DemoCard
      title="Animated.spring"
      hint="stiffness/damping physics: the square jumps between the edges with overshoot"
    >
      <SpringToggle />
    </DemoCard>

    <DemoCard
      title="opacity + interpolate"
      hint="three squares listen to one Animated.Value; interpolate with three stops dips in the middle of the cycle"
    >
      <OpacityPulse />
    </DemoCard>

    <DemoCard
      title="translateX + translateY together"
      hint="two interpolations of one value: X is linear, Y is a triangle wave — a zigzag"
    >
      <DiagonalLoop />
      <Text style={styles.limitation}>
        v1 limitation: Animated.View only animates translateX/translateY and
        opacity; rotate/scale are not applied to GTK widgets.
      </Text>
    </DemoCard>
  </Section>
)
