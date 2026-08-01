// 2 — The render counter.
//
// The structural claim of this whole surface is "a running animation costs
// zero React renders". This panel is the version of that claim a person can
// check without a profiler: a box that never stops moving, next to the number
// of times React rendered it.
//
// The box below is animated by an endless `withRepeat` from the moment the
// app starts. Its render count reaches 1 at mount and stays there.
import { useEffect } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"
import {
  countWrite,
  useCounters,
  useReadoutRenderCount,
  useRenderCount,
} from "../stats"
import { Caption, palette, Panel, Row, Stat } from "../ui"

const TRAVEL = 200

const styles = StyleSheet.create({
  lane: {
    height: 84,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  box: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: palette.purple,
  },
})

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
      { translateX: progress.get() * TRAVEL },
      { rotate: `${progress.get() * 180}deg` },
    ],
  }))

  return (
    <View style={styles.lane}>
      <Animated.View style={[styles.box, animatedStyle]} />
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
        label="Frames driven — looping box"
        value={String(counts.loop.writes)}
      />
      <Stat
        label="Frames driven — dragged box"
        value={String(counts.drag.writes)}
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

export const RenderCounterPanel = () => (
  <Panel
    index="02"
    title="Zero renders per frame"
    subtitle="The box has not stopped moving since the app opened. Watch the two green numbers."
  >
    <LoopBox />
    <Readout />
    <Caption>
      The green counters are React renders of the animated components — the
      looping box above and the dragged box in panel 1. They reach 1 at mount
      and stay there while the frame counters next to them climb at ~60 a
      second. A shared value is not React state: writing it runs the mapper,
      which writes the widget, and React is never told.
    </Caption>
    <Caption>
      The last number is the only thing here on a timer. This readout cannot
      show a count without re-rendering itself, so it polls the counters four
      times a second — which is why it climbs by four while the others do not
      move. The counts live in a plain module object, not in state, precisely so
      that reading them does not cause the renders they are counting.
    </Caption>
    <Caption>
      Drag the box in panel 1 and come back: its frame counter will have jumped
      by several hundred and its render counter will still say 1.
    </Caption>
  </Panel>
)
