// Reanimated motion: what drives a shared value, and what shape the movement
// has. The five animation functions on one box, seven easing curves on one
// press, and `interpolateColor` in two colour spaces at the same instant.
//
// A colour is never the animated VALUE — `withTiming("#ff0000")` throws here,
// by design. The number is animated and the colour is derived from it, which
// is what Reanimated's own examples do on every platform.
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
  cancelAnimation,
  clamp,
  Easing,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
} from "react-native-reanimated"
import { Button, Caption, DemoCard, palette, Row, Section } from "../ui"

const FUNCTION_BOX = 52
const EASING_BOX = 30
const EASING_TRAVEL = 260
const EASING_DURATION = 1400
const HANDLE = 26

// Blue → red → green, the three stops the slider walks between.
const STOPS = [0, 0.5, 1]
const COLORS = ["#1c71d8", "#c01c28", "#26a269"]

// The auto pair takes the long way round the colour wheel, which is where
// RGB and HSV visibly disagree: RGB fades through mud, HSV through the hues
// in between.
const AUTO_COLORS = ["#1c71d8", "#f6d32d"]

const CURVES: {
  name: string
  easing: EasingFunction | EasingFunctionFactory
}[] = [
  { name: "linear", easing: Easing.linear },
  { name: "ease", easing: Easing.ease },
  { name: "inOut(quad)", easing: Easing.inOut(Easing.quad) },
  { name: "out(cubic)", easing: Easing.out(Easing.cubic) },
  { name: "out(bounce)", easing: Easing.out(Easing.bounce) },
  { name: "elastic(1.4)", easing: Easing.elastic(1.4) },
  { name: "bezier(.25,.8,.25,1)", easing: Easing.bezier(0.25, 0.8, 0.25, 1) },
]

const styles = StyleSheet.create({
  lane: {
    height: 76,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  functionBox: {
    width: FUNCTION_BOX,
    height: FUNCTION_BOX,
    borderRadius: 12,
    backgroundColor: palette.orange,
  },
  lastLabel: {
    color: palette.textDim,
    fontSize: 12,
  },
  easingRows: {
    gap: 6,
  },
  easingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  easingName: {
    width: 152,
    color: palette.textDim,
    fontSize: 12,
  },
  easingLane: {
    flex: 1,
    height: 38,
    backgroundColor: palette.cardAlt,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  easingBox: {
    width: EASING_BOX,
    height: EASING_BOX,
    borderRadius: 8,
    backgroundColor: palette.green,
  },
  swatch: {
    height: 96,
    borderRadius: 12,
  },
  sliderTrack: {
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.cardAlt,
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  handle: {
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: palette.text,
  },
  autoRow: {
    flexDirection: "row",
    gap: 12,
  },
  autoCell: {
    flex: 1,
    gap: 6,
  },
  autoSwatch: {
    height: 64,
    borderRadius: 10,
  },
  autoLabel: {
    color: palette.textDim,
    fontSize: 12,
  },
  flingTrack: {
    height: 76,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  flingBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: palette.purple,
  },
})

/**
 * All five animation functions on one box, one shared value, one animated
 * style. Fire them in a row and the differences are the point: timing lands
 * exactly on its target, spring overshoots it, sequence walks a script,
 * repeat bounces a fixed number of times, delay does nothing at all for most
 * of a second.
 */
const AnimationFunctions = () => {
  const x = useSharedValue(0)
  const [laneWidth, setLaneWidth] = useState(0)
  const [last, setLast] = useState("nothing yet")
  const travel = Math.max(0, laneWidth - FUNCTION_BOX - 24)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
  }))

  const fire = (label: string, run: () => number) => () => {
    setLast(label)
    x.set(run())
  }

  return (
    <>
      <View
        style={styles.lane}
        onLayout={(event) => setLaneWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.functionBox, animatedStyle]} />
      </View>
      <Row>
        <Button
          label="withTiming"
          onPress={fire("withTiming(travel, { duration: 600 })", () =>
            withTiming(travel, { duration: 600 }),
          )}
        />
        <Button
          label="withSpring"
          onPress={fire("withSpring(travel) — GentleSpringConfig", () =>
            withSpring(travel),
          )}
        />
        <Button
          label="withSequence"
          onPress={fire(
            "withSequence(timing → timing → spring back to 0)",
            () =>
              withSequence(
                withTiming(travel, { duration: 400 }),
                withTiming(travel / 2, { duration: 400 }),
                withSpring(0),
              ),
          )}
        />
        <Button
          label="withRepeat"
          onPress={fire("withRepeat(timing, 4, reverse)", () =>
            withRepeat(withTiming(travel, { duration: 700 }), 4, true),
          )}
        />
        <Button
          label="withDelay"
          onPress={fire("withDelay(800, timing) — watch it wait", () =>
            withDelay(800, withTiming(travel, { duration: 400 })),
          )}
        />
        <Button
          label="cancel + reset"
          quiet
          onPress={() => {
            setLast("cancelAnimation(x), then withTiming(0)")
            cancelAnimation(x)
            x.set(withTiming(0, { duration: 220 }))
          }}
        />
      </Row>
      <Text style={styles.lastLabel}>last fired: {last}</Text>
    </>
  )
}

/**
 * One lane. The row owns its own shared value and reacts to the section's
 * trigger — so all seven start on the same frame, from one press, without
 * the parent holding seven values.
 */
const EasingRow = ({
  name,
  easing,
  trigger,
}: {
  name: string
  easing: EasingFunction | EasingFunctionFactory
  trigger: SharedValue<number>
}) => {
  const x = useSharedValue(0)

  useAnimatedReaction(
    () => trigger.get(),
    (current) => {
      x.set(
        withTiming(current * EASING_TRAVEL, {
          duration: EASING_DURATION,
          easing,
        }),
      )
    },
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
  }))

  return (
    <View style={styles.easingRow}>
      <Text style={styles.easingName}>{name}</Text>
      <View style={styles.easingLane}>
        <Animated.View style={[styles.easingBox, animatedStyle]} />
      </View>
    </View>
  )
}

const EasingCurves = () => {
  const trigger = useSharedValue(0)

  return (
    <>
      <View style={styles.easingRows}>
        {CURVES.map((curve) => (
          <EasingRow
            key={curve.name}
            name={curve.name}
            easing={curve.easing}
            trigger={trigger}
          />
        ))}
      </View>
      <Row>
        <Button
          label="Run them all"
          onPress={() => {
            trigger.set(trigger.get() === 1 ? 0 : 1)
          }}
        />
      </Row>
    </>
  )
}

const HandDrivenColor = () => {
  const progress = useSharedValue(0)
  const [trackWidth, setTrackWidth] = useState(0)
  const travel = Math.max(0, trackWidth - HANDLE - 10)

  // The responder is created once; the travel distance it divides by changes
  // with the window, so it is read through a ref rather than captured.
  const spanRef = useRef(1)
  spanRef.current = Math.max(1, travel)
  const originRef = useRef(0)

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        originRef.current = progress.get()
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        progress.set(
          clamp(originRef.current + gesture.dx / spanRef.current, 0, 1),
        )
      },
    }),
  )

  const swatchStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), STOPS, COLORS),
  }))

  // The dependency array is load-bearing here and nowhere else in the
  // gallery: this updater closes over `travel`, which is React state, and a
  // mapper only re-runs when a SHARED VALUE it read changes. Passing
  // `[travel]` rebuilds it on resize; without it the handle would sit at the
  // old position until the next drag.
  const handleStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: progress.get() * travel }] }),
    [travel],
  )

  const goTo = (value: number) => () => {
    progress.set(withTiming(value, { duration: 350 }))
  }

  return (
    <>
      <Animated.View style={[styles.swatch, swatchStyle]} />
      <View
        style={styles.sliderTrack}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[styles.handle, handleStyle]}
          {...responder.panHandlers}
        />
      </View>
      <Row>
        <Button
          label="0.00"
          quiet
          onPress={goTo(0)}
        />
        <Button
          label="0.25"
          quiet
          onPress={goTo(0.25)}
        />
        <Button
          label="0.50"
          quiet
          onPress={goTo(0.5)}
        />
        <Button
          label="0.75"
          quiet
          onPress={goTo(0.75)}
        />
        <Button
          label="1.00"
          quiet
          onPress={goTo(1)}
        />
      </Row>
    </>
  )
}

/**
 * `withDecay` — the one animation with no target. It takes the velocity the
 * gesture ended with and coasts to a stop under friction, which is why it is
 * the only one here that has to be driven by a real fling rather than a
 * button.
 */
const Fling = () => {
  const x = useSharedValue(0)
  const [trackWidth, setTrackWidth] = useState(0)
  const spanRef = useRef(0)
  spanRef.current = Math.max(0, trackWidth - 56)
  const originRef = useRef(0)

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        cancelAnimation(x)
        originRef.current = x.get()
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        x.set(clamp(originRef.current + gesture.dx, 0, spanRef.current))
      },
      onPanResponderRelease: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        // `velocity` is units per SECOND, as upstream — PanResponder's `vx`
        // is per millisecond, hence the x1000.
        x.set(
          withDecay({
            velocity: gesture.vx * 1000,
            clamp: [0, spanRef.current],
          }),
        )
      },
    }),
  )

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
  }))

  return (
    <View
      style={styles.flingTrack}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[styles.flingBox, style]}
        {...responder.panHandlers}
      />
    </View>
  )
}

const AutoColorPair = () => {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.set(withRepeat(withTiming(1, { duration: 2200 }), -1, true))
  }, [progress])

  const rgb = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], AUTO_COLORS),
  }))
  const hsv = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 1],
      AUTO_COLORS,
      "HSV",
    ),
  }))

  return (
    <View style={styles.autoRow}>
      <View style={styles.autoCell}>
        <Animated.View style={[styles.autoSwatch, rgb]} />
        <Text style={styles.autoLabel}>
          &apos;RGB&apos; — upstream&apos;s 2.2 gamma
        </Text>
      </View>
      <View style={styles.autoCell}>
        <Animated.View style={[styles.autoSwatch, hsv]} />
        <Text style={styles.autoLabel}>
          &apos;HSV&apos; — upstream&apos;s hue-wrap correction
        </Text>
      </View>
    </View>
  )
}

export const ReanimatedMotionSection = () => (
  <Section
    title="Reanimated motion"
    subtitle="The five animation functions, seven easing curves and interpolateColor — everything that decides how a shared value gets from one number to the next."
  >
    <DemoCard
      title="The five animation functions"
      hint="One box, one shared value — press them next to each other and compare."
    >
      <AnimationFunctions />
      <Caption>
        Defaults are upstream&apos;s: 300 ms on `inOut(quad)` for timing,
        `GentleSpringConfig` for spring. `withRepeat` takes a count — pass -1
        for endless, as the looping box in &quot;Reanimated values&quot; does —
        and `cancelAnimation` leaves the value where it stood, so press it
        mid-repeat.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Easing"
      hint="The same 1400 ms, the same 260 px, seven curves — started on one frame."
    >
      <EasingCurves />
      <Caption>
        Press it again and they come back. Each lane runs its own `withTiming`,
        but none of them owns the button: the card writes one shared value and
        every row&apos;s `useAnimatedReaction` fires from it, which is why they
        leave on the same frame rather than in render order.
      </Caption>
    </DemoCard>

    <DemoCard
      title="withDecay"
      hint="throw the box and let go — the only animation here with no target"
    >
      <Fling />
      <Caption>
        `withDecay` takes the velocity the gesture ended with and coasts to a
        stop under friction, clamped to the track. Grab it mid-coast and it
        stops dead: `cancelAnimation` on grant, so the fling never fights the
        pointer. Throw it hard at a wall and it stays there rather than bouncing
        — `clamp` truncates, it does not reflect.
      </Caption>
    </DemoCard>

    <DemoCard
      title="Colours"
      hint="interpolateColor into backgroundColor — by hand, and on a loop."
    >
      <HandDrivenColor />
      <Caption>
        Drag the pill or press a stop. One shared value walks 0 → 1;
        `interpolateColor` turns it into blue → red → green. The colour reaches
        GTK through a `GtkCssProvider` private to that one widget, reloaded in
        place — 11.2 µs a frame, flat in the size of the tree, and no React
        render.
      </Caption>
      <AutoColorPair />
      <Caption>
        One loop, two colour spaces: RGB crosses the desaturated middle, HSV
        takes the hue path and stays saturated. &apos;LAB&apos; throws here, by
        name.
      </Caption>
    </DemoCard>
  </Section>
)
