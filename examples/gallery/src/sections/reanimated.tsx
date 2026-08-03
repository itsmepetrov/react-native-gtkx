// Reanimated values: the model, and the claim that rests on it.
//
// A shared value is not React state. Writing one runs the mappers that read
// it, writes the widget, and never tells React — so a running animation costs
// zero renders. This section is that claim in the form a person can check:
// a box dragged by hand, a box that has not stopped moving since the app
// opened, and the render counters next to both.
//
// Every import here is a bare package name — `react-native` and
// `react-native-reanimated`. Neither is installed in this workspace; the vite
// preset aliases the first onto react-native-gtkx and the second onto its
// Reanimated surface, so nothing below mentions this platform.
import { useEffect, useRef, useState } from "react"
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native"
import Animated, {
  createAnimatedComponent,
  Easing,
  interpolateColor,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import Svg, { Circle } from "react-native-svg"
import {
  countCrossing,
  countWrite,
  useCounters,
  useReadoutRenderCount,
  useRenderCount,
} from "../stats"
import { Button, Caption, DemoCard, palette, Row, Section, Stat } from "../ui"

const BOX = 72
const LOOP_TRAVEL = 200
const DERIVED_TRAVEL = 220
const PROPS_RING_RADIUS = 28
const PROPS_RING_CIRCUMFERENCE = 2 * Math.PI * PROPS_RING_RADIUS

const styles = StyleSheet.create({
  arena: {
    height: 200,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    // The box is a transform away from wherever the pointer takes it, and a
    // transform is paint-only — without this it draws over the caption under
    // the arena, exactly as it would in RN. `overflow: "hidden"` is the
    // portable answer and it is the one this platform used to accept and
    // ignore; it clips to the rounded shape above, corners included.
    overflow: "hidden",
  },
  dragBox: {
    width: BOX,
    height: BOX,
    borderRadius: 14,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  boxLabel: {
    color: palette.onColor,
    fontSize: 12,
    fontWeight: "700",
  },
  lane: {
    height: 84,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  loopBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: palette.purple,
  },
  stage: {
    height: 92,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 14,
  },
  slider: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: palette.accent,
  },
  scaler: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.orange,
  },
  gate: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  legend: {
    color: palette.textDim,
    fontSize: 12,
  },
  svgRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  svgCanvas: {
    backgroundColor: palette.cardAlt,
    borderRadius: 8,
  },
})

/**
 * A shared value per axis, written straight from PanResponder's gesture state,
 * read back by `useAnimatedStyle` into a transform. On release the same shared
 * values are handed a `withSpring`, so the box flies home under physics rather
 * than being set back.
 *
 * The box holds NO React state, which is the point: nothing here can cause a
 * render while the pointer moves. The grab feedback is a third leaf of the
 * same transform (`scale`), not a `setState`.
 */
const DragBox = () => {
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const scale = useSharedValue(1)

  // Counted for the readout below. Stays at 1 for the life of the app:
  // nothing here sets state, and the animated style's SHAPE never changes, so
  // there is nothing to make React look at this component again.
  useRenderCount("drag")
  useAnimatedReaction(
    () => x.get() + y.get(),
    () => countWrite("drag"),
  )

  // PanResponder reports dx/dy relative to the grant, so the position the
  // gesture started from has to be remembered — including mid-spring, which
  // is why it is read off the shared value rather than assumed to be zero.
  const origin = useRef({ x: 0, y: 0 })

  const home = () => {
    x.set(withSpring(0))
    y.set(withSpring(0))
    scale.set(withTiming(1, { duration: 160 }))
  }

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        origin.current = { x: x.get(), y: y.get() }
        scale.set(withSpring(1.15))
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        x.set(origin.current.x + gesture.dx)
        y.set(origin.current.y + gesture.dy)
      },
      onPanResponderRelease: home,
      onPanResponderTerminate: home,
    }),
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { scale: scale.get() },
    ],
  }))

  return (
    <View style={styles.arena}>
      <Animated.View
        style={[styles.dragBox, animatedStyle]}
        {...responder.panHandlers}
      >
        <Text style={styles.boxLabel}>drag me</Text>
      </Animated.View>
    </View>
  )
}

const LoopBox = () => {
  const progress = useSharedValue(0)

  useRenderCount("loop")
  useAnimatedReaction(
    () => progress.get(),
    () => countWrite("loop"),
  )

  useEffect(() => {
    // -1 repetitions is upstream's "forever"; `reverse` plays every other
    // pass backwards, so the box shuttles instead of jumping back.
    progress.set(
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    )
  }, [progress])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + progress.get() * 0.45,
    transform: [
      { translateX: progress.get() * LOOP_TRAVEL },
      { rotate: `${progress.get() * 180}deg` },
    ],
  }))

  return (
    <View style={styles.lane}>
      <Animated.View style={[styles.loopBox, animatedStyle]} />
    </View>
  )
}

const Readout = () => {
  // This component IS on a clock — four re-renders a second, its own — and
  // the last stat says so. Nothing it reports is on that clock.
  const counts = useCounters(250)
  const ownRenders = useReadoutRenderCount()

  return (
    <Row>
      <Stat
        label="React renders — looping box"
        value={String(counts.loop.renders)}
        loud
      />
      <Stat
        label="React renders — dragged box"
        value={String(counts.drag.renders)}
        loud
      />
      <Stat
        label="React renders — animated props"
        value={String(counts.props.renders)}
        loud
      />
      <Stat
        label="Frames driven — looping box"
        value={String(counts.loop.writes)}
      />
      <Stat
        label="Frames driven — dragged box"
        value={String(counts.drag.writes)}
      />
      <Stat
        label="Frames driven — animated props"
        value={String(counts.props.writes)}
      />
      <Stat
        label="Frames per second, now"
        value={String(counts.perSecond)}
      />
      <Stat
        label="Renders of this readout"
        value={String(ownRenders)}
      />
    </Row>
  )
}

/**
 * ONE shared value. Two `useDerivedValue`s read it and become two more shared
 * values, each driving a different box; a `useAnimatedReaction` watches the
 * same source for a threshold crossing and drives a third. Four widgets move
 * off one write, and React is told about none of it.
 */
const Derived = () => {
  const source = useSharedValue(0)

  const offset = useDerivedValue(() => source.get() * DERIVED_TRAVEL)
  const scale = useDerivedValue(() => 0.6 + source.get() * 0.9)

  // The third consumer: not a mapping but a reaction to a threshold. `gate`
  // is a shared value this writes to, which is how a reaction reaches a
  // widget — it never touches one directly.
  const gate = useSharedValue(0)
  useAnimatedReaction(
    () => source.get() > 0.5,
    (isPast, was) => {
      // The tally lives in a module counter, not in state, for the same
      // reason the render counters do: a `setState` here would be a render
      // per crossing, in a demo whose point is that there are none.
      if (was !== null && isPast !== was) {
        countCrossing()
      }
      gate.set(withTiming(isPast ? 1 : 0, { duration: 200 }))
    },
  )

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }))
  const scalerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }))
  const gateStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      gate.get(),
      [0, 1],
      [palette.red, palette.green],
    ),
  }))

  // Only so the crossings tally below refreshes; nothing else here renders.
  const counts = useCounters(250)

  return (
    <>
      <View style={styles.stage}>
        <Animated.View style={[styles.slider, sliderStyle]} />
      </View>
      <View style={styles.stage}>
        <Animated.View style={[styles.scaler, scalerStyle]} />
        <Animated.View style={[styles.gate, gateStyle]} />
        <Text style={styles.legend}>
          scale = 0.6 + source × 0.9 (derived) · colour flips when source
          crosses 0.5 (reaction)
        </Text>
      </View>
      <Row>
        <Button
          label="source → 0"
          quiet
          onPress={() => {
            source.set(withTiming(0, { duration: 900 }))
          }}
        />
        <Button
          label="source → 0.5"
          quiet
          onPress={() => {
            source.set(withTiming(0.5, { duration: 900 }))
          }}
        />
        <Button
          label="source → 1"
          onPress={() => {
            source.set(withTiming(1, { duration: 900 }))
          }}
        />
      </Row>
      <Row>
        <Stat
          label="Threshold crossings"
          value={String(counts.crossings)}
        />
      </Row>
    </>
  )
}

// Wrapped once at module scope, like the SVG shapes it wraps: the wrapper
// adds no widget, so there is nothing here that benefits from being rebuilt
// per render.
const AnimatedCircle = createAnimatedComponent(Circle)

/**
 * `useAnimatedProps` instead of `useAnimatedStyle` — the same mapper, aimed at
 * a component's PROPS rather than its style. One shared value, two numeric
 * leaves on two SVG shapes (`r` on the dot, `strokeDashoffset` on the ring),
 * both reaching GTK through the shape's own subscription to an animated node
 * (svg/animated-support.ts's `queueDraw` channel — see props.ts). Counted the
 * same way the boxes above are, into the same readout.
 */
const PropsRing = () => {
  const progress = useSharedValue(0)

  useRenderCount("props")
  useAnimatedReaction(
    () => progress.get(),
    () => countWrite("props"),
  )

  useEffect(() => {
    progress.set(
      withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    )
  }, [progress])

  const dotProps = useAnimatedProps(() => ({
    r: 8 + progress.get() * 14,
  }))
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: PROPS_RING_CIRCUMFERENCE * (1 - progress.get()),
  }))

  return (
    <View style={styles.svgRow}>
      <Svg
        width={72}
        height={72}
        style={styles.svgCanvas}
      >
        <AnimatedCircle
          cx={36}
          cy={36}
          fill={palette.accent}
          animatedProps={dotProps}
        />
      </Svg>
      <Svg
        width={72}
        height={72}
        style={styles.svgCanvas}
      >
        <Circle
          cx={36}
          cy={36}
          r={PROPS_RING_RADIUS}
          fill="none"
          stroke={palette.card}
          strokeWidth={6}
        />
        <AnimatedCircle
          cx={36}
          cy={36}
          r={PROPS_RING_RADIUS}
          fill="none"
          stroke={palette.green}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${PROPS_RING_CIRCUMFERENCE}`}
          animatedProps={ringProps}
        />
      </Svg>
    </View>
  )
}

export const ReanimatedSection = () => (
  <Section
    title="Reanimated values"
    subtitle="Shared values, useAnimatedStyle, useAnimatedProps, useDerivedValue and useAnimatedReaction — and the render counters that show what they cost."
  >
    <DemoCard
      title="Drag me"
      hint="A shared value per axis, driven by the pointer, sprung back on release."
    >
      <DragBox />
      <Caption>
        Grab the box and throw it around. Let go and `withSpring` returns it —
        an underdamped spring, so it overshoots home and settles.
      </Caption>
      <Caption>
        Drag it past an edge and it is CUT OFF at the arena, rounded corners and
        all, instead of sliding over this caption: the platform honouring the
        arena&apos;s `overflow: &quot;hidden&quot;`, with paint and hit-testing
        stopping at the same clip.
      </Caption>
      <Caption>
        The drag is `PanResponder`, not `GestureDetector`, on purpose — the
        Gesture API has two sections of its own.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Zero renders per frame"
      hint="The box has not stopped moving since the app opened. Watch the three green numbers."
    >
      <LoopBox />
      <Readout />
      <Caption>
        The green counters are React renders of the animated components — this
        box, the dragged one above, and the `useAnimatedProps` ring further
        down. They reach 1 at mount and stay there while the frame counters
        climb at ~60 a second: a shared value is not React state, so writing it
        runs the mapper, writes the widget, and never tells React.
      </Caption>
      <Caption>
        The last number is the only thing here on a timer — this readout polls
        four times a second, which is why it alone climbs. Drag the box above
        and come back: several hundred more frames, still one render.
      </Caption>
    </DemoCard>

    <DemoCard
      title="One value, three consumers"
      hint="useDerivedValue twice, useAnimatedReaction once — off a single shared value."
    >
      <Derived />
      <Caption>
        The blue square&apos;s position and the orange circle&apos;s size are
        two derived values off `source`; the third box follows a reaction to
        `source.get() &gt; 0.5`, not its magnitude, which is why it flips rather
        than fades. Send the source to 0.5 exactly and it stays red.
      </Caption>
      <Caption>
        No hook here has a dependency array and everything still updates:
        dependencies are recorded from the reads a mapper performs, not from a
        build-time scan. `dependencies` is still accepted — the colour slider in
        &quot;Reanimated motion&quot; passes one.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Aimed at a prop, not a style"
      hint="useAnimatedProps: the dot's radius and the ring's strokeDashoffset, both off one shared value — its render/frame counters live in the readout above."
    >
      <PropsRing />
      <Caption>
        `useAnimatedProps` is the same mapper as `useAnimatedStyle`, pointed at
        a component&apos;s props instead of its style — here
        `createAnimatedComponent(Circle)` from `react-native-svg`. Only a
        NUMERIC prop is driven this way: the SVG shapes already accept a number
        or an animated node on every geometry and paint leaf and subscribe to it
        themselves, so this hook hands them a node rather than opening a second
        write path.
      </Caption>
      <Caption>
        Look at the readout in &quot;Zero renders per frame&quot; above: its
        third pair — &quot;animated props&quot; — is this card&apos;s render
        count and frame count, climbing at the same ~60 a second while staying
        at one render, for the reason every other counter here does.
      </Caption>
    </DemoCard>
  </Section>
)
