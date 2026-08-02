// Transforms: what they do to the widget's box, which is nothing.
//
// translate is applied positionally; rotate/scale go through the allocation's
// GskTransform. Either way the node keeps the rectangle Yoga gave it — only
// its paint (and its hit area) moves — which is exactly RN's rule and is what
// makes a transform cheap enough to drive every frame.
import { useEffect, useMemo, useState } from "react"
import { Animated, Easing, StyleSheet, Text, View } from "react-native"
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
  overflowRow: {
    flexDirection: "row",
    gap: 12,
  },
  limitation: {
    color: palette.warning,
    fontSize: 12,
  },
  transformRow: {
    height: 96,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
})

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
    <View style={styles.overflowRow}>
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

// rotate and scale do not move the widget's box: they reach GTK as the
// GskTransform of the child's allocation, so the square keeps the 40x40 Yoga
// gave it and only its paint (and its hit area) turns and grows.
const SpinAndPulse = () => {
  const [progress] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
      }),
    )
    animation.start()
    return () => animation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // interpolate's suffixed outputRange is what produces an angle: the numeric
  // part is interpolated, "deg" is carried through.
  const rotate = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
      }),
    [progress],
  )
  const scale = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 1.8, 1],
      }),
    [progress],
  )

  return (
    <View style={styles.transformRow}>
      <Animated.View
        style={[
          styles.square,
          { backgroundColor: palette.accent, transform: [{ rotate }] },
        ]}
      />
      <Animated.View
        style={[
          styles.square,
          { backgroundColor: palette.green, transform: [{ scale }] },
        ]}
      />
      <Animated.View
        style={[
          styles.square,
          {
            backgroundColor: palette.purple,
            transform: [{ rotate }, { scale }],
          },
        ]}
      />
    </View>
  )
}

// Nothing here is Animated: a transform in a plain style works on any
// component that takes one, exactly like in RN.
const StaticTransforms = () => (
  <View style={styles.transformRow}>
    <View
      style={[
        styles.square,
        { backgroundColor: palette.orange, transform: [{ rotate: "45deg" }] },
      ]}
    />
    <View
      style={[
        styles.square,
        { backgroundColor: palette.yellow, transform: [{ scale: 1.6 }] },
      ]}
    />
    <View
      style={[
        styles.square,
        {
          backgroundColor: palette.red,
          transform: [{ rotate: "20deg" }, { scaleX: 2 }],
        },
      ]}
    />
  </View>
)

export const TransformsSection = () => (
  <Section
    title="Transforms"
    subtitle="translate, rotate and scale — paint-only, on the allocation's GskTransform. The node keeps the box Yoga gave it."
  >
    <DemoCard
      title="paint-overflow"
      hint="the square flies out of its track and glides OVER the neighbor panel; the neighbor's layout does not move a pixel"
    >
      <PaintOverflow />
    </DemoCard>

    <DemoCard
      title="rotate + scale"
      hint="one value drives an angle (interpolate to a 'deg' outputRange) and a scale; the third square takes both — the array composes left to right, like in RN and CSS"
    >
      <SpinAndPulse />
    </DemoCard>

    <DemoCard
      title="transforms in a plain style"
      hint="no Animated involved: rotate 45deg, scale 1.6, and rotate+scaleX — the boxes still occupy their untransformed 40x40 in the layout"
    >
      <StaticTransforms />
      <Text style={styles.limitation}>
        Not supported: rotateX/rotateY/perspective (3D), skewX/skewY, matrix,
        and transformOrigin — the origin is always the centre of the view.
      </Text>
    </DemoCard>
  </Section>
)
