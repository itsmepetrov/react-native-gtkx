// overflow: "hidden" — clipping, including to a rounded shape, with
// hit-testing following the same clip.
//
// This is the RN style that reached Yoga and stopped there for most of this
// platform's life: a container that asked to clip was accepted and clipped
// nothing, so a transformed child drew over whatever sat under its parent.
// Both halves matter, and the second is the one a screenshot cannot show:
// the part of a child that is clipped away is also gone for the pointer.
import { useEffect, useState } from "react"
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  arena: {
    height: 120,
    borderRadius: 24,
    backgroundColor: palette.cardAlt,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  clipped: {
    overflow: "hidden",
  },
  runner: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  runnerLabel: {
    color: palette.onColor,
    fontSize: 11,
    fontWeight: "700",
  },
  underneath: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
  },
  hitHost: {
    height: 96,
    borderRadius: 16,
    backgroundColor: palette.cardAlt,
    overflow: "hidden",
    justifyContent: "center",
  },
  // Deliberately wider than its host, so half of it is clipped away. The
  // visible half counts clicks; the clipped half cannot be clicked at all.
  hitTarget: {
    width: 520,
    height: 56,
    marginLeft: 12,
    borderRadius: 10,
    backgroundColor: palette.green,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 14,
  },
  hitLabel: {
    color: palette.onColor,
    fontSize: 13,
    fontWeight: "700",
  },
})

/**
 * The same box, the same animation, twice — and the only difference between
 * the two arenas is `overflow: "hidden"`.
 */
const ClipPair = () => {
  const [progress] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 420],
  })

  return (
    <>
      <View style={[styles.arena, styles.clipped]}>
        <Animated.View style={[styles.runner, { transform: [{ translateX }] }]}>
          <Text style={styles.runnerLabel}>clipped</Text>
        </Animated.View>
      </View>
      <Text style={styles.underneath}>
        The box is cut off at the arena — rounded corners included, so it is the
        SHAPE that clips, not a rectangle around it.
      </Text>
      <View style={styles.arena}>
        <Animated.View
          style={[
            styles.runner,
            { backgroundColor: palette.orange, transform: [{ translateX }] },
          ]}
        >
          <Text style={styles.runnerLabel}>free</Text>
        </Animated.View>
      </View>
      <Text style={styles.underneath}>
        The same animation without the style: a transform is paint-only, so the
        box leaves its arena and draws over this text, exactly as it would in
        React Native.
      </Text>
    </>
  )
}

/** Hit-testing stops at the clip, which is the half a screenshot cannot show. */
const ClippedHitTarget = () => {
  const [hits, setHits] = useState(0)
  return (
    <>
      <View style={styles.hitHost}>
        <Pressable
          style={styles.hitTarget}
          onPress={() => setHits((count) => count + 1)}
        >
          <Text style={styles.hitLabel}>clicks landed: {hits}</Text>
        </Pressable>
      </View>
      <Caption>
        The green bar is 520 px wide inside a host that is not. Click the part
        you can see and the counter moves; the part beyond the rounded edge is
        not merely invisible, it is not there for the pointer either — paint and
        hit-testing stop at the same clip.
      </Caption>
    </>
  )
}

export const ClippingSection = () => (
  <Section
    title="Clipping"
    subtitle='overflow: "hidden" — to the rounded shape, with hit-testing following the same clip.'
  >
    <DemoCard
      title="Two arenas, one style apart"
      hint="the same box and the same animation; only the top arena says overflow: hidden"
    >
      <ClipPair />
    </DemoCard>

    <DemoCard
      title="The pointer stops where the paint does"
      hint="a child wider than its clipping host — only the visible part is clickable"
    >
      <ClippedHitTarget />
    </DemoCard>
  </Section>
)
