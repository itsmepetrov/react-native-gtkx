// 7 — The refusals, shown rather than hidden.
//
// A demo that only shows what works is marketing. This panel animates the
// things this platform declines to animate at frame rate, prints the warning
// each one produces ON SCREEN, and puts the measurement that justifies the
// refusal next to it.
//
// `width` is the interesting case, because upstream really does animate it on
// iOS and Android. It is refused here for a reason with a number: a layout
// write costs what the TREE costs, not what the animated value costs.
import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { Button, Caption, palette, Panel, Row } from "../ui"
import { useWarnings } from "../warnings"

const styles = StyleSheet.create({
  lane: {
    height: 64,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  refused: {
    width: 90,
    height: 40,
    borderRadius: 10,
    backgroundColor: palette.red,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: palette.green,
    alignItems: "center",
    justifyContent: "center",
  },
  laneLabel: {
    color: palette.textFaint,
    fontSize: 12,
  },
  warningBox: {
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  warningText: {
    color: palette.yellow,
    fontSize: 12,
  },
  warningEmpty: {
    color: palette.textFaint,
    fontSize: 12,
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
  const lines = useWarnings("react-native-reanimated:", 400)
  return (
    <View style={styles.warningBox}>
      {lines.length === 0 ? (
        <Text style={styles.warningEmpty}>
          No warning yet — press one of the refused buttons above.
        </Text>
      ) : (
        lines.map((line, index) => (
          <Text
            key={index}
            style={styles.warningText}
          >
            {line}
          </Text>
        ))
      )}
    </View>
  )
}

export const RefusalsPanel = () => {
  const width = useSharedValue(90)
  const radius = useSharedValue(10)
  const scaleX = useSharedValue(1)
  // Forces a React render on demand, which is how the refused value lands.
  const [renders, setRenders] = useState(0)

  const widthStyle = useAnimatedStyle(() => ({ width: width.get() }))
  const radiusStyle = useAnimatedStyle(() => ({
    borderRadius: radius.get(),
  }))
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scaleX.get() }],
  }))

  return (
    <Panel
      index="07"
      title="What it refuses, and the measurement that says so"
      subtitle="Layout properties are declined by name — with the transform to use instead."
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
        <Animated.View style={[styles.refused, widthStyle]}>
          <Text style={styles.boxLabel}>{renders}</Text>
        </Animated.View>
      </View>
      <Text style={styles.laneLabel}>
        useAnimatedStyle(() =&gt; ({"{"} width: w.get() {"}"})) — refused. The
        number in the box is how many React renders have been forced.
      </Text>
      <Row>
        <Button
          label="Animate width"
          onPress={() => {
            width.set(
              withTiming(width.get() > 150 ? 90 : 280, {
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
        forced render the width does
      </Text>
      <View style={styles.lane}>
        <Animated.View style={[styles.accepted, scaleStyle]} />
      </View>
      <Text style={styles.laneLabel}>
        transform: [{"{"} scaleX {"}"}] — the alternative the warning names, and
        the one that runs
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
        Press &quot;Animate width&quot; and nothing moves — then press
        &quot;Force a React render&quot; and the box jumps to wherever the
        animation ended. That is the documented behaviour: the value is applied
        on the next React render rather than dropped. The warning above is once
        per property per session, so the second press adds no line.
      </Caption>
      <View style={styles.factTable}>
        <Fact
          label="Yoga pass + commit for one animated width, 5-child tree"
          value="64 µs"
        />
        <Fact
          label="…the same value, 60-child tree"
          value="128 µs"
        />
        <Fact
          label="…the same value, 300-child tree"
          value="496 µs"
        />
        <Fact
          label="A transform write, at every one of those sizes"
          value="0.7 µs"
        />
        <Fact
          label="A colour write, at every one of those sizes"
          value="11.2 µs"
        />
      </View>
      <Caption>
        That first column is the whole decision. A layout write is O(the tree):
        the same single animated value costs 64, 128 and 496 µs per frame as the
        tree grows, because changing one child&apos;s width re-lays-out its
        following siblings and every ancestor whose size follows. The two
        imperative paths are O(1) — flat at every size. At 300 children an
        animated `width` spends 3 % of a frame budget in Yoga alone, before GTK
        has re-measured anything.
      </Caption>
      <Caption>
        And it is the one write that is not paint-only: `queueResize` propagates
        to the toplevel, so an animated `width` can resize the window it is in.
        There is no version of that which is safe to run at 60 Hz. Two numbers
        would change the decision — an incremental layout that made the Yoga
        column flat, and a `queueResize` that could be scoped below the toplevel
        — and neither is a small change.
      </Caption>
      <Caption>
        Not everything refused is a layout property. `borderRadius` gets the
        other message: it can be written, but only as a CSS class computed
        during render, so it too lands on the next render. `Animated.FlatList`
        does not warn at all — it throws, naming itself, because a list that
        mounted without animating is worse than one that failed. Layout
        animations are no longer on this list: `FadeIn`, `FadeOut`,
        `LinearTransition` and `Keyframe` are implemented, and the ~90 preset
        builders around them are still refusals.
      </Caption>
    </Panel>
  )
}
