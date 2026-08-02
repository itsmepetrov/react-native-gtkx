// 7 — Where the boundary is, shown rather than described.
//
// A demo that only shows what works is marketing. This panel puts a driven
// property and a refused one side by side, prints the warning the refused one
// produces ON SCREEN, and puts the measurement that justifies the boundary
// next to both.
//
// `width` is the interesting case, and it is interesting in a new way. It used
// to be refused outright, and this panel used to demonstrate that. It is now
// driven wherever the change stops at the node that owns it — so the honest
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
  const lines = useWarnings("react-native-", 400)
  return (
    <View style={styles.warningBox}>
      {lines.length === 0 ? (
        <Text style={styles.warningEmpty}>
          No warning yet — press one of the buttons above.
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
    <Panel
      index="07"
      title="Where the boundary is, and the measurement that put it there"
      subtitle="A size runs at frame rate where the change stops at the node that owns it — and is declined by name, with the reason, everywhere else."
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
        useAnimatedStyle(() =&gt; ({"{"} width: w.get() {"}"})) — DRIVEN, at 7.1
        µs a frame and the same at five siblings or three hundred. This lane is
        an ordinary column, so `width` is its cross axis: the box grows from its
        leading edge and no sibling moves, which is what &quot;the change stops
        at the node&quot; means. The number in the box is how many React renders
        have been forced — watch it not move while the box does.
      </Text>
      <View style={[styles.lane, styles.laneCentred]}>
        <Animated.View style={[styles.box, styles.refused, refusedWidth]}>
          <Text style={styles.boxLabel}>{renders}</Text>
        </Animated.View>
      </View>
      <Text style={styles.laneLabel}>
        The same shared value, the same box — and one style different, on the
        LANE: alignItems: &quot;center&quot;. A centred child grows about its
        own centre, so its x moves with its width and the change no longer stops
        at the node. Refused, by name, with that reason.
      </Text>
      <View style={[styles.lane, styles.laneTall]}>
        <Animated.View style={[styles.box, styles.refused, refusedHeight]} />
        <View style={styles.neighbour} />
      </View>
      <Text style={styles.laneLabel}>
        useAnimatedStyle(() =&gt; ({"{"} height: h.get() {"}"})) — refused for
        the other reason: `height` is this column&apos;s MAIN axis, so growing
        the box would push the purple strip below it down, and moving a sibling
        is a layout pass over the container. That is the cost in the table
        below.
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
        an APPROXIMATION rather than a replacement: a scale grows about the
        view&apos;s centre, so the box moves as it grows, and it scales the
        content with the box instead of re-laying it out — text stretches rather
        than re-wrapping. A driven `width`, in the first lane, really does
        re-lay-out what is inside the box
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
        one moves at frame rate, the red one does not move at all and prints a
        line saying which style stopped it. Then press &quot;Force a React
        render&quot; and the red box jumps to wherever the animation ended — the
        documented behaviour, that a refused value is applied on the next React
        render rather than dropped. Each warning is once per property per
        session, so a second press adds no line.
      </Caption>
      <View style={styles.factTable}>
        <Fact
          label="A DRIVEN size — the animated node's own subtree, at every container size"
          value="7.1 µs"
        />
        <Fact
          label="…the same, with wrapped text inside the box to re-lay-out"
          value="21.7 µs"
        />
        <Fact
          label="A refused size, if it were written naively — 5-child container"
          value="71 µs"
        />
        <Fact
          label="…the same value, 60-child container"
          value="129 µs"
        />
        <Fact
          label="…the same value, 300-child container"
          value="509 µs"
        />
        <Fact
          label="A transform write, at every one of those sizes"
          value="0.6 µs"
        />
        <Fact
          label="A colour write, at every one of those sizes"
          value="11.2 µs"
        />
      </View>
      <Caption>
        Those two groups are the whole decision. A naive layout write is O(the
        container): the same single animated value costs 71, 129 and 509 µs per
        frame as the container grows, because changing one child re-lays-out its
        following siblings and re-commits every rect the pass touched.
        Re-running Yoga rooted at the ANIMATED NODE instead costs the same 7.1
        µs at all three sizes — which is why the first lane is allowed and the
        other two are not. The boundary is drawn at exactly the configurations
        where the two produce the same geometry, checked configuration by
        configuration against the real layout engine rather than reasoned about.
      </Caption>
      <Caption>
        Six things put a size on the refused side: the axis is the
        container&apos;s main axis (the third lane); the resolved cross-axis
        alignment is `center` or `flex-end` (the second lane); the
        container&apos;s own size comes from its children; the node&apos;s OTHER
        axis comes from its content, so re-wrapping would change it too; an
        `aspectRatio`, or a `min`/`max` that would clamp the driven value; and a
        wrapping container. `flex`, `flexBasis`, every `margin*`/`padding*` and
        `gap` are refused outright — no carve-out applies to them at all.
      </Caption>
      <Caption>
        Two things that used to be said here were re-measured and are not true.
        Making GTK re-measure every ancestor after the resize adds nothing at
        any tree size — this platform&apos;s root reports a constant size
        request, so there is nothing up there to recompute — and for the same
        reason an animated `width` cannot resize the window: the request stayed
        at min 88 with a child driven to 3000 px wide. (An RN island mounted
        straight into GTK chrome does report its content size, and there a size
        below it really would move the window request — which is why a driven
        size is refused under one of those too.) The boundary rests on cost, and
        only on cost.
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
