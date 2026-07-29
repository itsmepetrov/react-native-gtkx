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
  neighbor: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  neighborText: {
    color: palette.textDim,
    fontSize: 11,
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

// The contained variant: identical spring physics kept inside the track by
// the interpolation. A plain extrapolate:"clamp" would pin the square to the
// wall while the spring value oscillates out of range (a visible dead pause —
// stock RN too, just lifeless); mirroring the overshoot instead turns it
// into a bounce off the wall. Both are pure RN interpolate recipes:
// containment is the interpolation's job, not the layout's.
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

// The RN paint-overflow showcase: the square's home track is narrow, and the
// animation slides it far past the track edge — it glides OVER the neighbor
// panel and comes back. Nothing resizes, nothing shifts: transforms are
// paint-only, ancestors and siblings keep their layout.
const PaintOverflow = () => {
  const [progress] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Negative X: the square flies LEFT over the neighbor. Sibling paint order
  // is the RN default z-order (later siblings on top), so the track — the
  // later sibling — paints its subtree over the neighbor panel.
  const translateX = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [0, -200] }),
    [progress],
  )

  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={styles.neighbor}>
        <Text style={styles.neighborText}>neighbor — never moves</Text>
      </View>
      <View style={[styles.track, { width: 160 }]}>
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
    subtitle="timing, spring, loop/sequence and interpolate; a direct path bypassing React: setOpacity on the widget and layout-manager offsets on top of the base rect."
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

    <DemoCard
      title="Animated.spring, contained"
      hint="the same physics kept inside the track: the interpolation mirrors the overshoot into a bounce (a plain extrapolate clamp would pin the square to the wall while the value is out of range)"
    >
      <SpringClamped />
    </DemoCard>

    <DemoCard
      title="paint-overflow"
      hint="the square flies out of its track and glides OVER the neighbor panel; the neighbor's layout does not move a pixel"
    >
      <PaintOverflow />
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
