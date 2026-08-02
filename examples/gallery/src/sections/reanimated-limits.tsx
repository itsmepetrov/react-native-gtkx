// Where the boundary is, shown rather than described.
//
// A demo that only shows what works is marketing. This section puts a driven
// property and a refused one side by side, prints the warning the refused one
// produces ON SCREEN, and puts the measurement that justifies the boundary
// next to both.
//
// `width` is the interesting case, and it is interesting in a new way. It used
// to be refused outright, and this demo used to show that. It is now driven
// wherever the change stops at the node that owns it — so the honest
// demonstration is not a wall but a LINE: the first two lanes below animate the
// same shared value, with the same box, and differ by one style on the
// CONTAINER. One moves at 7.1 µs a frame; the other says why it will not.
import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { Button, Caption, DemoCard, palette, Row, Section } from "../ui"
import { useWarnings } from "../warnings"

const styles = StyleSheet.create({
  lane: {
    height: 64,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  // The ONE difference between the first two lanes. A centred child grows
  // about its own centre, so its x moves with its width — which is not a
  // change that stops at the node, and is refused for exactly that reason.
  laneCentred: {
    alignItems: "center",
  },
  laneTall: {
    height: 128,
    justifyContent: "flex-start",
    paddingVertical: 12,
    gap: 8,
  },
  box: {
    width: 90,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  driven: {
    backgroundColor: palette.green,
  },
  refused: {
    backgroundColor: palette.red,
  },
  neighbour: {
    width: 220,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.purple,
  },
  boxLabel: {
    color: palette.onColor,
    fontSize: 13,
    fontWeight: "700",
  },
  accepted: {
    width: 90,
    height: 40,
    borderRadius: 10,
    backgroundColor: palette.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  laneLabel: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
  },
  // The warning is the longest thing on the screen and the thing a reader is
  // most likely to have come here for, so it is set as PROSE: foreground
  // colour, 13 px, a line height. The amber survives as the tint behind it and
  // as the label above it — signalling is what a hue is good for, and body
  // text is what it is bad at.
  warningBox: {
    backgroundColor: palette.warningTint,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  warningLabel: {
    color: palette.warning,
    fontSize: 11,
    fontWeight: "700",
  },
  warningText: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
  },
  warningEmpty: {
    color: palette.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
  factTable: {
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  factRow: {
    flexDirection: "row",
    gap: 10,
  },
  factLabel: {
    flex: 1,
    color: palette.textDim,
    fontSize: 12,
  },
  factValue: {
    width: 92,
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
})

const Fact = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.factRow}>
    <Text style={styles.factLabel}>{label}</Text>
    <Text style={styles.factValue}>{value}</Text>
  </View>
)

const Warnings = () => {
  const lines = useWarnings("react-native-", 400)
  if (lines.length === 0) {
    return (
      <View style={styles.warningBox}>
        <Text style={styles.warningEmpty}>
          No warning yet — press one of the buttons above.
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.warningBox}>
      <Text style={styles.warningLabel}>CONSOLE.WARN</Text>
      {lines.map((line, index) => (
        <Text
          key={index}
          style={styles.warningText}
        >
          {line}
        </Text>
      ))}
    </View>
  )
}

export const ReanimatedLimitsSection = () => {
  const width = useSharedValue(90)
  const height = useSharedValue(40)
  const radius = useSharedValue(10)
  const scaleX = useSharedValue(1)
  // Forces a React render on demand, which is how a refused value lands.
  const [renders, setRenders] = useState(0)

  // The SAME source value behind the next two styles. Two `useAnimatedStyle`
  // calls rather than one shared object, because each animated view binds its
  // own leaves — but the number in them is the same number, which is the
  // whole point of the pair.
  const drivenWidth = useAnimatedStyle(() => ({ width: width.get() }))
  const refusedWidth = useAnimatedStyle(() => ({ width: width.get() }))
  const refusedHeight = useAnimatedStyle(() => ({ height: height.get() }))
  const radiusStyle = useAnimatedStyle(() => ({
    borderRadius: radius.get(),
  }))
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scaleX.get() }],
  }))

  return (
    <Section
      title="Reanimated limits"
      subtitle="A size runs at frame rate where the change stops at the node that owns it — and is declined by name, with the reason, everywhere else."
    >
      <DemoCard
        title="The same value, one style apart"
        hint="Two lanes, one shared value, one box. The lane's own style decides whether it moves."
      >
        <View style={styles.lane}>
          {/*
            The render count is printed INSIDE the box on purpose. With the
            React Compiler on (which `gtkx build` always runs), an element
            whose props are all stable is memoised, so a parent's state change
            alone would not re-render this view — and "applied on the next
            React render" would never be demonstrable. A child that changes is
            what makes the next render reach this component.
          */}
          <Animated.View style={[styles.box, styles.driven, drivenWidth]}>
            <Text style={styles.boxLabel}>{renders}</Text>
          </Animated.View>
        </View>
        <Text style={styles.laneLabel}>
          `width: w.get()` — DRIVEN, at 7.1 µs a frame whether the container
          holds five children or three hundred. An ordinary column, so `width`
          is the cross axis: the box grows from its leading edge and no sibling
          moves. The number in the box counts forced React renders — watch it
          not move.
        </Text>
        <View style={[styles.lane, styles.laneCentred]}>
          <Animated.View style={[styles.box, styles.refused, refusedWidth]}>
            <Text style={styles.boxLabel}>{renders}</Text>
          </Animated.View>
        </View>
        <Text style={styles.laneLabel}>
          The same shared value, the same box, one style different — on the
          LANE: alignItems: &quot;center&quot;. A centred child grows about its
          own centre, so its x moves with its width. Refused, by name, for that
          reason.
        </Text>
        <View style={[styles.lane, styles.laneTall]}>
          <Animated.View style={[styles.box, styles.refused, refusedHeight]} />
          <View style={styles.neighbour} />
        </View>
        <Text style={styles.laneLabel}>
          `height: h.get()` — refused for the other reason: `height` is this
          column&apos;s MAIN axis, so growing the box would push the purple
          strip down, and moving a sibling is a layout pass over the container.
        </Text>
        <Row>
          <Button
            label="Animate width (both boxes)"
            onPress={() => {
              width.set(
                withTiming(width.get() > 150 ? 90 : 280, {
                  duration: 900,
                }),
              )
            }}
          />
          <Button
            label="Animate height"
            onPress={() => {
              height.set(
                withTiming(height.get() > 50 ? 40 : 76, {
                  duration: 900,
                }),
              )
            }}
          />
          <Button
            label="Animate borderRadius"
            onPress={() => {
              radius.set(
                withTiming(radius.get() > 12 ? 10 : 20, {
                  duration: 600,
                }),
              )
            }}
          />
          <Button
            label={`Force a React render (${renders})`}
            quiet
            onPress={() => setRenders((count) => count + 1)}
          />
        </Row>
        <View style={styles.lane}>
          <Animated.View style={[styles.accepted, radiusStyle]}>
            <Text style={styles.boxLabel}>{renders}</Text>
          </Animated.View>
        </View>
        <Text style={styles.laneLabel}>
          borderRadius — not a layout property, still not driveable: it reaches
          GTK as a CSS class computed during render, so it lands on the same
          forced render the refused boxes do
        </Text>
        <View style={styles.lane}>
          <Animated.View style={[styles.accepted, scaleStyle]} />
        </View>
        <Text style={styles.laneLabel}>
          transform: [{"{"} scaleX {"}"}] — the transform the refusals name, and
          an APPROXIMATION rather than a replacement: it grows about the
          view&apos;s centre and stretches the content instead of re-laying it
          out. A driven `width`, in the first lane, really does re-wrap what is
          inside the box.
        </Text>
        <Row>
          <Button
            label="Animate scaleX instead"
            onPress={() => {
              scaleX.set(
                withTiming(scaleX.get() > 1.5 ? 1 : 3, {
                  duration: 900,
                }),
              )
            }}
          />
        </Row>
        <Warnings />
        <Caption>
          Press &quot;Animate width&quot; and the two boxes disagree: the green
          one moves at frame rate, the red one does not move at all and prints
          the line above saying which style stopped it. Then press &quot;Force a
          React render&quot; and the red box jumps to where the animation ended
          — a refused value is applied on the next render rather than dropped.
        </Caption>
      </DemoCard>

      <DemoCard
        title="The measurement that put the boundary there"
        hint="Flat in the container versus proportional to it."
      >
        <View style={styles.factTable}>
          <Fact
            label="A DRIVEN size — flat at 5, 60 and 300 children"
            value="7.1 µs"
          />
          <Fact
            label="…the same, with wrapped text inside the box to re-lay-out"
            value="21.7 µs"
          />
          <Fact
            label="The naive write, over that same 5 → 300 children"
            value="52 → 496 µs"
          />
          <Fact
            label="A transform write, at every one of those sizes"
            value="1.5 µs"
          />
          <Fact
            label="A colour write, at every one of those sizes"
            value="11.2 µs"
          />
        </View>
        <Caption>
          Flat in the container versus proportional to it: that is the whole
          decision, and it is why the first lane is allowed and the other two
          are not. The boundary sits at exactly the configurations where
          re-running Yoga at the animated node gives the same geometry as a full
          pass — checked configuration by configuration against the real layout
          engine. The gallery README lists the six that fall outside it.
        </Caption>
        <Caption>
          The table follows the shipped path&apos;s own re-measurement, in
          docs/api.md. The warning above still quotes the earlier recon run (71
          and 509 µs, 0.6 µs for a transform) — same shape, older numbers.
        </Caption>
      </DemoCard>
    </Section>
  )
}
